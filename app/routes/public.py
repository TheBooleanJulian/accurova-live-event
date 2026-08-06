import re
import sqlite3

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, EmailStr, field_validator

from app.config import settings
from app.db import db_cursor, query_one
from app.security import enforce_rate_limit

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def whatsapp_link(prefill: str) -> str:
    from urllib.parse import quote
    number = settings.WHATSAPP_NUMBER
    return f"https://wa.me/{number}?text={quote(prefill)}"


# kept for internal call sites within this module
_whatsapp_link = whatsapp_link


@router.get("/e/{slug}", response_class=HTMLResponse)
def event_landing(request: Request, slug: str):
    event = query_one("SELECT * FROM events WHERE slug = ?", (slug,))
    whatsapp_link = _whatsapp_link("Hi Accurova, I'd like to enquire about photography for my event.")

    if not event:
        return templates.TemplateResponse(
            "public/not_found.html",
            {"request": request, "whatsapp_link": whatsapp_link},
            status_code=404,
        )

    return templates.TemplateResponse(
        "public/index.html",
        {
            "request": request,
            "event": event,
            "linkedin_url": settings.LINKEDIN_URL,
            "portfolio_url": settings.PORTFOLIO_URL,
            "google_reviews_url": settings.GOOGLE_REVIEWS_URL,
            "sme_award_url": settings.SME_AWARD_URL,
            "whatsapp_link": whatsapp_link,
        },
    )


class SignupPayload(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def normalize(cls, v):
        return v.strip().lower()


@router.post("/e/{slug}/signup")
def event_signup(slug: str, payload: SignupPayload, request: Request):
    enforce_rate_limit(request, "signup")

    event = query_one("SELECT id FROM events WHERE slug = ?", (slug,))
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    try:
        with db_cursor() as cur:
            cur.execute(
                "INSERT INTO email_signups (event_id, email) VALUES (?, ?)",
                (event["id"], payload.email),
            )
    except sqlite3.IntegrityError:
        # Already signed up for this event — treat as success, no need to error.
        pass

    return JSONResponse({"ok": True})


class EnquiryPayload(BaseModel):
    name: str
    company: str | None = None
    email: EmailStr
    event_type: str | None = None
    message: str | None = None

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("Name is required")
        return v[:200]

    @field_validator("company", "event_type", "message")
    @classmethod
    def trim_optional(cls, v):
        return v.strip()[:2000] if v else v


@router.post("/e/{slug}/enquiry")
def event_enquiry(slug: str, payload: EnquiryPayload, request: Request):
    enforce_rate_limit(request, "enquiry")

    event = query_one("SELECT id FROM events WHERE slug = ?", (slug,))
    event_id = event["id"] if event else None

    with db_cursor() as cur:
        cur.execute(
            """INSERT INTO enquiries (event_id, name, company, email, event_type, message)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (event_id, payload.name, payload.company, payload.email.lower(), payload.event_type, payload.message),
        )

    return JSONResponse({"ok": True})


@router.post("/enquiry")
def general_enquiry(payload: EnquiryPayload, request: Request):
    """Enquiry endpoint for contexts with no event slug (e.g. general site embed)."""
    enforce_rate_limit(request, "enquiry")

    with db_cursor() as cur:
        cur.execute(
            """INSERT INTO enquiries (event_id, name, company, email, event_type, message)
               VALUES (NULL, ?, ?, ?, ?, ?)""",
            (payload.name, payload.company, payload.email.lower(), payload.event_type, payload.message),
        )

    return JSONResponse({"ok": True})
