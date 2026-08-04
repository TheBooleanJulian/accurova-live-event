import smtplib
from email.mime.text import MIMEText

import httpx

from app.config import settings


def _send_via_resend(to_email: str, subject: str, html: str) -> None:
    resp = httpx.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
        json={"from": settings.EMAIL_FROM, "to": [to_email], "subject": subject, "html": html},
        timeout=10,
    )
    resp.raise_for_status()


def _send_via_postmark(to_email: str, subject: str, html: str) -> None:
    resp = httpx.post(
        "https://api.postmarkapp.com/email",
        headers={
            "X-Postmark-Server-Token": settings.POSTMARK_SERVER_TOKEN,
            "Content-Type": "application/json",
        },
        json={
            "From": settings.EMAIL_FROM,
            "To": to_email,
            "Subject": subject,
            "HtmlBody": html,
            "MessageStream": "outbound",
        },
        timeout=10,
    )
    resp.raise_for_status()


def _send_via_smtp(to_email: str, subject: str, html: str) -> None:
    msg = MIMEText(html, "html")
    msg["Subject"] = subject
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = to_email

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
        if settings.SMTP_USE_TLS:
            server.starttls()
        if settings.SMTP_USERNAME:
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.sendmail(settings.EMAIL_FROM, [to_email], msg.as_string())


def send_email(to_email: str, subject: str, html: str) -> bool:
    """Returns True if sent (or provider is 'none' and we no-op silently in dev)."""
    provider = settings.EMAIL_PROVIDER

    if provider == "resend":
        _send_via_resend(to_email, subject, html)
    elif provider == "postmark":
        _send_via_postmark(to_email, subject, html)
    elif provider == "smtp":
        _send_via_smtp(to_email, subject, html)
    else:
        # provider == "none": no-op, useful for local dev without email creds
        print(f"[email_client] EMAIL_PROVIDER=none — would have sent to {to_email}: {subject}")
        return False

    return True


def photos_ready_email_html(event_name: str, gallery_url: str) -> str:
    return f"""
    <div style="font-family: Arial, sans-serif; background:#050508; color:#f5f5f5; padding:32px;">
      <h2 style="color:#00D4C8; margin-bottom:8px;">Your photos are ready</h2>
      <p style="color:#cfd3da;">Photos from <strong>{event_name}</strong> have just been processed and are ready to view.</p>
      <p style="margin:24px 0;">
        <a href="{gallery_url}" style="background:#00D4C8; color:#050508; padding:12px 20px; text-decoration:none; font-weight:bold; border-radius:4px;">
          View &amp; Download Photos
        </a>
      </p>
      <p style="color:#8a8f98; font-size:12px;">Sent by Accurova &mdash; premium photography &amp; digital media.</p>
    </div>
    """
