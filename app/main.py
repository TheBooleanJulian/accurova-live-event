from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates

from migrations.init_db import init_db
from app.routes import public, admin
from app.routes.public import whatsapp_link
from app.config import settings
from app.db import query_all, query_one

app = FastAPI(title="Accurova Live Event", docs_url=None, redoc_url=None)


@app.middleware("http")
async def _no_store_admin(request: Request, call_next):
    """
    /admin/* responses carry a session-gated dashboard and PII (signups,
    enquiries) — an intermediate CDN (e.g. Cloudflare in front of Zeabur)
    must never cache them, or an unauthenticated visitor can be served a
    stale, already-authenticated response straight from cache, bypassing
    the app's own login check entirely.
    """
    response = await call_next(request)
    if request.url.path.startswith("/admin"):
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

settings.UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory="app/static"), name="static")
app.mount("/uploads", StaticFiles(directory=settings.UPLOADS_DIR), name="uploads")

app.include_router(public.router)
app.include_router(admin.router)


@app.get("/", response_class=HTMLResponse)
def root(request: Request):
    """
    Bare-domain visits (no event slug) must never land clients on the admin
    login. If exactly one event is currently 'live', send visitors straight
    there; otherwise show a generic branded page with WhatsApp/LinkedIn/
    portfolio links so they can still reach the team. Operators use /admin
    directly — it's never linked from here.
    """
    live_events = query_one(
        "SELECT slug FROM events WHERE status = 'live' ORDER BY created_at DESC LIMIT 2"
    )
    live_count = query_one("SELECT COUNT(*) AS c FROM events WHERE status = 'live'")
    if live_count and live_count["c"] == 1 and live_events:
        return RedirectResponse(f"/e/{live_events['slug']}", status_code=303)

    latest_event = query_one(
        "SELECT id, slug, name, event_date, thumbnail_path FROM events ORDER BY COALESCE(event_date, created_at) DESC LIMIT 1"
    )

    past_events = query_all(
        """SELECT slug, name, event_date, thumbnail_path FROM events
           WHERE thumbnail_path IS NOT NULL AND id != ?
           ORDER BY COALESCE(event_date, created_at) DESC LIMIT 7""",
        (latest_event["id"] if latest_event else -1,),
    )

    return templates.TemplateResponse(
        "public/generic.html",
        {
            "request": request,
            "whatsapp_link": whatsapp_link("Hi Accurova, I'd like to enquire about photography for my event."),
            "linkedin_url": settings.LINKEDIN_URL,
            "linkedin_company_url": settings.LINKEDIN_COMPANY_URL,
            "portfolio_url": settings.PORTFOLIO_URL,
            "google_reviews_url": settings.GOOGLE_REVIEWS_URL,
            "sme_award_url": settings.SME_AWARD_URL,
            "latest_event": latest_event,
            "past_events": past_events,
        },
    )


@app.get("/healthz")
def healthz():
    return {"status": "ok", "env": settings.ENV}
