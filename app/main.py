from datetime import date

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates

from migrations.init_db import init_db
from app.routes import public, admin
from app.config import settings, thumb_v
from app.db import query_all, query_one

app = FastAPI(title="Accurova Live Event", docs_url=None, redoc_url=None)


@app.middleware("http")
async def _no_store_dynamic(request: Request, call_next):
    """
    Every route here is server-rendered from live DB state (event status,
    admin session data, signups/enquiries) — an intermediate CDN (e.g.
    Cloudflare in front of Zeabur) must never cache these responses.
    Confirmed live: Cloudflare cached "/" for 4h and kept serving a stale
    homepage after a redeploy, and separately cached an authenticated
    /admin dashboard and served it to unauthenticated visitors. Only the
    genuinely static /static and /uploads assets are exempt.
    """
    response = await call_next(request)
    path = request.url.path
    if not (path.startswith("/static") or path.startswith("/uploads")):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
        response.headers["Pragma"] = "no-cache"
    return response


@app.on_event("startup")
def _apply_schema() -> None:
    """
    Run unconditionally so a Zeabur (or any) deploy that skips the build-step
    migration doesn't leave the DB without tables — CREATE ... IF NOT EXISTS
    makes this a no-op once the schema already exists.
    """
    init_db(settings.DB_PATH)

templates = Jinja2Templates(directory="app/templates")
templates.env.globals["asset_v"] = settings.ASSET_V
templates.env.globals["thumb_v"] = thumb_v

settings.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory="app/static"), name="static")
app.mount("/uploads", StaticFiles(directory=settings.UPLOADS_DIR), name="uploads")

app.include_router(public.router)
app.include_router(admin.router)


@app.get("/", response_class=HTMLResponse)
def root(request: Request):
    """
    Bare-domain visits (no event slug) must never land clients on the admin
    login, and must never auto-redirect into an event page either — visitors
    land on a generic branded page and choose to click into an event
    themselves via the latest-event/past-events cards. Operators use /admin
    directly — it's never linked from here.
    """
    latest_event = query_one(
        """SELECT id, slug, name, event_date, thumbnail_path, status FROM events
           WHERE show_on_homepage = 1
           ORDER BY COALESCE(event_date, created_at) DESC LIMIT 1"""
    )

    past_events = query_all(
        """SELECT slug, name, event_date, thumbnail_path, status FROM events
           WHERE show_on_homepage = 1 AND thumbnail_path IS NOT NULL AND id != ?
           ORDER BY COALESCE(event_date, created_at) DESC LIMIT 7""",
        (latest_event["id"] if latest_event else -1,),
    )

    return templates.TemplateResponse(
        "public/generic.html",
        {
            "request": request,
            "whatsapp_url": settings.WHATSAPP_URL,
            "whatsapp_display_number": settings.WHATSAPP_DISPLAY_NUMBER,
            "linkedin_url": settings.LINKEDIN_URL,
            "portfolio_url": settings.PORTFOLIO_URL,
            "google_reviews_url": settings.GOOGLE_REVIEWS_URL,
            "sme_award_url": settings.SME_AWARD_URL,
            "contact_name": settings.CONTACT_NAME,
            "latest_event": latest_event,
            "past_events": past_events,
            "today": date.today().isoformat(),
        },
    )


@app.get("/healthz")
def healthz():
    """
    Zeabur (or any platform doing a health-checked rolling deploy) hits this
    before swapping traffic to a new instance — it must fail until the DB is
    actually reachable, not just report the process booted.
    """
    try:
        query_one("SELECT 1")
    except Exception as exc:  # noqa: BLE001 — any DB failure means "not ready"
        return JSONResponse({"status": "error", "detail": str(exc)}, status_code=503)
    return {"status": "ok", "env": settings.ENV}
