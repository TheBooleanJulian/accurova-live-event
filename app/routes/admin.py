import csv
import io
import re
from pathlib import Path

from fastapi import APIRouter, Request, Form, File, UploadFile, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates

from app.db import db_cursor, query_all, query_one
from app.security import (
    SESSION_COOKIE_NAME,
    check_admin_password,
    create_session_token,
    verify_session_token,
    require_admin,
)
from app.email_client import send_email, photos_ready_email_html
from app.config import settings

router = APIRouter(prefix="/admin")
templates = Jinja2Templates(directory="app/templates")


def _slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "event"


def _unique_slug(base: str, exclude_event_id: int | None = None) -> str:
    slug = base
    n = 2
    while True:
        row = query_one("SELECT id FROM events WHERE slug = ?", (slug,))
        if not row or row["id"] == exclude_event_id:
            return slug
        slug = f"{base}-{n}"
        n += 1


def _is_logged_in(request: Request) -> bool:
    return verify_session_token(request.cookies.get(SESSION_COOKIE_NAME))


THUMBNAIL_MAX_BYTES = 25 * 1024 * 1024  # 25 MB
THUMBNAIL_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def _save_thumbnail(event_id: int, upload: UploadFile, data: bytes) -> str:
    """Writes the uploaded thumbnail to UPLOADS_DIR and returns its public web path.
    Filename is derived from event_id (not the client-supplied name) so there's no
    path-traversal surface, and any previous thumbnail for this event is overwritten."""
    ext = THUMBNAIL_CONTENT_TYPES[upload.content_type]
    settings.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    dest = settings.UPLOADS_DIR / f"event_{event_id}{ext}"
    dest.write_bytes(data)
    return f"/uploads/event_{event_id}{ext}"


# --- Auth ---

@router.get("/login", response_class=HTMLResponse)
def login_form(request: Request):
    if _is_logged_in(request):
        return RedirectResponse("/admin", status_code=303)
    return templates.TemplateResponse("admin/login.html", {"request": request, "error": None})


@router.post("/login")
def login_submit(request: Request, password: str = Form(...)):
    if not check_admin_password(password):
        return templates.TemplateResponse(
            "admin/login.html",
            {"request": request, "error": "Incorrect password."},
            status_code=401,
        )
    resp = RedirectResponse("/admin", status_code=303)
    resp.set_cookie(
        SESSION_COOKIE_NAME,
        create_session_token(),
        httponly=True,
        secure=settings.ENV == "production",
        samesite="lax",
        max_age=60 * 60 * 12,
    )
    return resp


@router.get("/logout")
def logout():
    resp = RedirectResponse("/admin/login", status_code=303)
    resp.delete_cookie(SESSION_COOKIE_NAME)
    return resp


# --- Dashboard ---

@router.get("", response_class=HTMLResponse)
def dashboard(request: Request):
    if not _is_logged_in(request):
        return RedirectResponse("/admin/login", status_code=303)

    events = query_all(
        """SELECT e.*, COUNT(s.id) AS signup_count
           FROM events e
           LEFT JOIN email_signups s ON s.event_id = e.id
           GROUP BY e.id
           ORDER BY e.created_at DESC"""
    )
    return templates.TemplateResponse("admin/dashboard.html", {"request": request, "events": events})


@router.post("/events")
def create_event(
    request: Request,
    name: str = Form(...),
    client_name: str = Form(""),
    event_date: str = Form(""),
    slug: str = Form(""),
):
    if not _is_logged_in(request):
        return RedirectResponse("/admin/login", status_code=303)

    base_slug = _slugify(slug) if slug.strip() else _slugify(name)
    unique_slug = _unique_slug(base_slug)

    with db_cursor() as cur:
        cur.execute(
            "INSERT INTO events (slug, name, client_name, event_date) VALUES (?, ?, ?, ?)",
            (unique_slug, name.strip(), client_name.strip() or None, event_date.strip() or None),
        )
    return RedirectResponse("/admin", status_code=303)


# --- Event detail / edit ---

@router.get("/events/{event_id}", response_class=HTMLResponse)
def event_detail(request: Request, event_id: int, message: str = ""):
    if not _is_logged_in(request):
        return RedirectResponse("/admin/login", status_code=303)

    event = query_one("SELECT * FROM events WHERE id = ?", (event_id,))
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    signups = query_all(
        "SELECT * FROM email_signups WHERE event_id = ? ORDER BY created_at DESC", (event_id,)
    )
    enquiries = query_all(
        "SELECT * FROM enquiries WHERE event_id = ? ORDER BY created_at DESC", (event_id,)
    )

    return templates.TemplateResponse(
        "admin/event_detail.html",
        {
            "request": request,
            "event": event,
            "signups": signups,
            "enquiries": enquiries,
            "message": message,
        },
    )


@router.post("/events/{event_id}")
def update_event(
    request: Request,
    event_id: int,
    name: str = Form(...),
    client_name: str = Form(""),
    event_date: str = Form(""),
    gallery_url: str = Form(""),
    slug: str = Form(""),
    status: str = Form("upcoming"),
    remove_thumbnail: str = Form(""),
    thumbnail: UploadFile | None = File(None),
):
    if not _is_logged_in(request):
        return RedirectResponse("/admin/login", status_code=303)

    event = query_one("SELECT * FROM events WHERE id = ?", (event_id,))
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    was_photos_ready = event["status"] == "photos_ready"
    gallery_url = gallery_url.strip() or None

    slug = _slugify(slug) if slug.strip() else event["slug"]
    slug = _unique_slug(slug, exclude_event_id=event_id)

    thumbnail_path = event["thumbnail_path"]
    if thumbnail is not None and thumbnail.filename:
        if thumbnail.content_type not in THUMBNAIL_CONTENT_TYPES:
            raise HTTPException(status_code=400, detail="Thumbnail must be a JPEG, PNG, or WebP image.")
        data = thumbnail.file.read(THUMBNAIL_MAX_BYTES + 1)
        if len(data) > THUMBNAIL_MAX_BYTES:
            raise HTTPException(status_code=400, detail="Thumbnail must be 25MB or smaller.")
        thumbnail_path = _save_thumbnail(event_id, thumbnail, data)
    elif remove_thumbnail == "on":
        if thumbnail_path:
            old = settings.UPLOADS_DIR / Path(thumbnail_path).name
            old.unlink(missing_ok=True)
        thumbnail_path = None

    with db_cursor() as cur:
        cur.execute(
            """UPDATE events SET name = ?, client_name = ?, event_date = ?, gallery_url = ?,
               slug = ?, status = ?, thumbnail_path = ? WHERE id = ?""",
            (
                name.strip(),
                client_name.strip() or None,
                event_date.strip() or None,
                gallery_url,
                slug,
                status,
                thumbnail_path,
                event_id,
            ),
        )

    message = "Event updated."

    # Trigger notification emails exactly on the transition into photos_ready.
    if status == "photos_ready" and not was_photos_ready and gallery_url:
        signups = query_all(
            "SELECT * FROM email_signups WHERE event_id = ? AND notified_at IS NULL", (event_id,)
        )
        sent_count = 0
        for s in signups:
            try:
                sent = send_email(
                    s["email"],
                    f"Your photos from {name.strip()} are ready",
                    photos_ready_email_html(name.strip(), gallery_url),
                )
                if sent:
                    with db_cursor() as cur:
                        cur.execute(
                            "UPDATE email_signups SET notified_at = datetime('now') WHERE id = ?",
                            (s["id"],),
                        )
                    sent_count += 1
            except Exception as exc:  # noqa: BLE001 — keep looping through remaining recipients
                print(f"[admin] failed to notify {s['email']}: {exc}")
        message = f"Event updated. Notified {sent_count}/{len(signups)} signups."

    return RedirectResponse(f"/admin/events/{event_id}?message={message}", status_code=303)


@router.post("/events/{event_id}/delete")
def delete_event(request: Request, event_id: int):
    if not _is_logged_in(request):
        return RedirectResponse("/admin/login", status_code=303)

    event = query_one("SELECT * FROM events WHERE id = ?", (event_id,))
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    if event["thumbnail_path"]:
        (settings.UPLOADS_DIR / Path(event["thumbnail_path"]).name).unlink(missing_ok=True)

    with db_cursor() as cur:
        cur.execute("DELETE FROM events WHERE id = ?", (event_id,))

    return RedirectResponse("/admin", status_code=303)


# --- CSV exports ---

def _csv_response(rows, fieldnames, filename):
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow({k: row[k] for k in fieldnames})
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/events/{event_id}/signups.csv")
def export_signups_csv(request: Request, event_id: int):
    if not _is_logged_in(request):
        return RedirectResponse("/admin/login", status_code=303)
    rows = query_all(
        "SELECT email, created_at, notified_at FROM email_signups WHERE event_id = ? ORDER BY created_at",
        (event_id,),
    )
    return _csv_response(rows, ["email", "created_at", "notified_at"], f"signups_event_{event_id}.csv")


@router.get("/events/{event_id}/enquiries.csv")
def export_enquiries_csv(request: Request, event_id: int):
    if not _is_logged_in(request):
        return RedirectResponse("/admin/login", status_code=303)
    rows = query_all(
        """SELECT name, company, email, event_type, message, created_at
           FROM enquiries WHERE event_id = ? ORDER BY created_at""",
        (event_id,),
    )
    return _csv_response(
        rows,
        ["name", "company", "email", "event_type", "message", "created_at"],
        f"enquiries_event_{event_id}.csv",
    )
