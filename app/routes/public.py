import re
import sqlite3

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, EmailStr, field_validator

from app.config import settings
from app.db import db_cursor, query_one
from app.security import enforce_rate_limit

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@router.get("/e/{slug}", response_class=HTMLResponse)
def event_landing(request: Request, slug: str):
    event = query_one("SELECT * FROM events WHERE slug = ?", (slug,))

    if not event:
        return templates.TemplateResponse(
            "public/not_found.html",
            {
                "request": request,
                "whatsapp_url": settings.WHATSAPP_URL,
                "whatsapp_display_number": settings.WHATSAPP_DISPLAY_NUMBER,
            },
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
            "whatsapp_url": settings.WHATSAPP_URL,
            "whatsapp_display_number": settings.WHATSAPP_DISPLAY_NUMBER,
            "contact_name": settings.CONTACT_NAME,
        },
    )


@router.get("/contact.vcf")
def contact_vcard():
    """One-click 'save to contacts' — vCard for the primary contact, shared across pages."""
    digits = "".join(ch for ch in settings.WHATSAPP_DISPLAY_NUMBER if ch.isdigit() or ch == "+")
    vcard = (
        "BEGIN:VCARD\r\n"
        "VERSION:3.0\r\n"
        f"FN:{settings.CONTACT_NAME}\r\n"
        "N:Cheung;Julian;;;\r\n"
        "ORG:Accurova\r\n"
        f"TEL;TYPE=CELL,VOICE:{digits}\r\n"
        "END:VCARD\r\n"
    )
    return Response(
        content=vcard,
        media_type="text/vcard",
        headers={"Content-Disposition": f'attachment; filename="{settings.CONTACT_NAME}.vcf"'},
    )


class SignupPayload(BaseModel):
    name: str
    email: EmailStr

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("Name is required")
        return v[:200]

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
                "INSERT INTO email_signups (event_id, name, email) VALUES (?, ?, ?)",
                (event["id"], payload.name, payload.email),
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
