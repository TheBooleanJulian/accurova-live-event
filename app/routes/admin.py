import csv
import io
import re
from pathlib import Path
from urllib.parse import urljoin, quote

import httpx
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


def _save_thumbnail(event_id: int, content_type: str, data: bytes) -> str:
    """Writes a thumbnail to UPLOADS_DIR and returns its public web path. Filename is
    derived from event_id (not any client/remote-supplied name) so there's no
    path-traversal surface, and any previous thumbnail for this event is overwritten."""
    ext = THUMBNAIL_CONTENT_TYPES[content_type]
    settings.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    dest = settings.UPLOADS_DIR / f"event_{event_id}{ext}"
    dest.write_bytes(data)
    return f"/uploads/event_{event_id}{ext}"


OG_IMAGE_RE = re.compile(
    r'<meta[^>]+(?:property|name)=["\'](?:og:image|twitter:image)["\'][^>]+content=["\']([^"\']+)["\']',
    re.IGNORECASE,
)
OG_IMAGE_RE_ALT = re.compile(
    r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\'](?:og:image|twitter:image)["\']',
    re.IGNORECASE,
)


def _extract_preview_image_url(html: str) -> str | None:
    match = OG_IMAGE_RE.search(html) or OG_IMAGE_RE_ALT.search(html)
    return match.group(1) if match else None


def _fetch_gallery_thumbnail(event_id: int, gallery_url: str) -> str:
    """Fetches the gallery page, pulls its og:image/twitter:image preview, downloads
    it, and saves it as this event's thumbnail. Raises ValueError with a
    user-facing message on any failure (no preview tag, unsupported type, too big)."""
    with httpx.Client(timeout=10, follow_redirects=True) as client:
        try:
            page_resp = client.get(gallery_url)
            page_resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise ValueError(f"Couldn't reach the gallery URL ({exc}).") from exc

        image_url = _extract_preview_image_url(page_resp.text)
        if not image_url:
            raise ValueError("No preview image found on that gallery page.")
        image_url = urljoin(str(page_resp.url), image_url)

        try:
            img_resp = client.get(image_url)
            img_resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise ValueError(f"Couldn't download the gallery preview image ({exc}).") from exc

    content_type = img_resp.headers.get("content-type", "").split(";")[0].strip()
    if content_type not in THUMBNAIL_CONTENT_TYPES:
        raise ValueError(f"Gallery preview image type ({content_type or 'unknown'}) isn't supported.")
    if len(img_resp.content) > THUMBNAIL_MAX_BYTES:
        raise ValueError("Gallery preview image is too large.")

    return _save_thumbnail(event_id, content_type, img_resp.content)


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
def event_detail(request: Request, event_id: int, message: str = "", error: str = ""):
    if not _is_logged_in(request):
        return RedirectResponse("/admin/login", status_code=303)

    event = query_one("SELECT * FROM events WHERE id = ?", (event_id,))
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    return templates.TemplateResponse(
        "admin/event_detail.html",
        {
            "request": request,
            "event": event,
            "message": message,
            "error": error,
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
    gallery_password: str = Form(""),
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
    gallery_password = gallery_password.strip() or None

    slug = _slugify(slug) if slug.strip() else event["slug"]
    slug = _unique_slug(slug, exclude_event_id=event_id)

    thumbnail_path = event["thumbnail_path"]
    if thumbnail is not None and thumbnail.filename:
        if thumbnail.content_type not in THUMBNAIL_CONTENT_TYPES:
            raise HTTPException(status_code=400, detail="Thumbnail must be a JPEG, PNG, or WebP image.")
        data = thumbnail.file.read(THUMBNAIL_MAX_BYTES + 1)
        if len(data) > THUMBNAIL_MAX_BYTES:
            raise HTTPException(status_code=400, detail="Thumbnail must be 25MB or smaller.")
        thumbnail_path = _save_thumbnail(event_id, thumbnail.content_type, data)
    elif remove_thumbnail == "on":
        if thumbnail_path:
            old = settings.UPLOADS_DIR / Path(thumbnail_path).name
            old.unlink(missing_ok=True)
        thumbnail_path = None

    with db_cursor() as cur:
        cur.execute(
            """UPDATE events SET name = ?, client_name = ?, event_date = ?, gallery_url = ?,
               gallery_password = ?, slug = ?, status = ?, thumbnail_path = ? WHERE id = ?""",
            (
                name.strip(),
                client_name.strip() or None,
                event_date.strip() or None,
                gallery_url,
                gallery_password,
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
                    photos_ready_email_html(name.strip(), gallery_url, gallery_password),
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

    return RedirectResponse(f"/admin/events/{event_id}?message={quote(message)}", status_code=303)


@router.post("/events/{event_id}/fetch-thumbnail")
def fetch_thumbnail(request: Request, event_id: int):
    if not _is_logged_in(request):
        return RedirectResponse("/admin/login", status_code=303)

    event = query_one("SELECT * FROM events WHERE id = ?", (event_id,))
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    if not event["gallery_url"]:
        return RedirectResponse(
            f"/admin/events/{event_id}?error={quote('Set and save a gallery URL first.')}", status_code=303
        )

    try:
        thumbnail_path = _fetch_gallery_thumbnail(event_id, event["gallery_url"])
        with db_cursor() as cur:
            cur.execute("UPDATE events SET thumbnail_path = ? WHERE id = ?", (thumbnail_path, event_id))
        return RedirectResponse(
            f"/admin/events/{event_id}?message={quote('Thumbnail pulled from the gallery.')}", status_code=303
        )
    except ValueError as exc:
        return RedirectResponse(f"/admin/events/{event_id}?error={quote(str(exc))}", status_code=303)


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


@router.get("/signups", response_class=HTMLResponse)
def all_signups(request: Request):
    if not _is_logged_in(request):
        return RedirectResponse("/admin/login", status_code=303)
    rows = query_all(
        """SELECT s.name, s.email, s.created_at, s.notified_at, e.name AS event_name
           FROM email_signups s
           JOIN events e ON e.id = s.event_id
           ORDER BY s.created_at DESC"""
    )
    return templates.TemplateResponse("admin/signups.html", {"request": request, "signups": rows})


@router.get("/signups.csv")
def export_all_signups_csv(request: Request):
    if not _is_logged_in(request):
        return RedirectResponse("/admin/login", status_code=303)
    rows = query_all(
        """SELECT e.name AS event_name, s.name, s.email, s.created_at, s.notified_at
           FROM email_signups s
           JOIN events e ON e.id = s.event_id
           ORDER BY s.created_at DESC"""
    )
    return _csv_response(
        rows, ["event_name", "name", "email", "created_at", "notified_at"], "signups.csv"
    )


@router.get("/enquiries", response_class=HTMLResponse)
def all_enquiries(request: Request):
    if not _is_logged_in(request):
        return RedirectResponse("/admin/login", status_code=303)
    rows = query_all(
        """SELECT q.name, q.company, q.email, q.event_type, q.message, q.created_at,
                  COALESCE(e.name, 'Unassigned') AS event_name
           FROM enquiries q
           LEFT JOIN events e ON e.id = q.event_id
           ORDER BY q.created_at DESC"""
    )
    return templates.TemplateResponse("admin/enquiries.html", {"request": request, "enquiries": rows})


@router.get("/enquiries.csv")
def export_all_enquiries_csv(request: Request):
    if not _is_logged_in(request):
        return RedirectResponse("/admin/login", status_code=303)
    rows = query_all(
        """SELECT COALESCE(e.name, 'Unassigned') AS event_name, q.name, q.company, q.email,
                  q.event_type, q.message, q.created_at
           FROM enquiries q
           LEFT JOIN events e ON e.id = q.event_id
           ORDER BY q.created_at DESC"""
    )
    return _csv_response(
        rows,
        ["event_name", "name", "company", "email", "event_type", "message", "created_at"],
        "enquiries.csv",
    )
