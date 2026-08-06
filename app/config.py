import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

ROOT = Path(__file__).resolve().parent.parent


def _resolve_path(value: str) -> Path:
    p = Path(value)
    return p if p.is_absolute() else ROOT / p


class Settings:
    DB_PATH: Path = _resolve_path(os.environ.get("DB_PATH", "./data/live_event.db"))
    UPLOADS_DIR: Path = _resolve_path(os.environ.get("UPLOADS_DIR", "./data/uploads"))
    SESSION_SECRET: str = os.environ.get("SESSION_SECRET", "dev-insecure-secret-change-me")
    ADMIN_PASSWORD: str = os.environ.get("ADMIN_PASSWORD", "changeme")
    PUBLIC_BASE_URL: str = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8000")

    WHATSAPP_NUMBER: str = os.environ.get("WHATSAPP_NUMBER", "+6598566543")
    LINKEDIN_URL: str = os.environ.get("LINKEDIN_URL", "https://www.linkedin.com/in/juliancheungjunyan/")
    PORTFOLIO_URL: str = os.environ.get("PORTFOLIO_URL", "https://accurova.com/")
    GOOGLE_REVIEWS_URL: str = os.environ.get("GOOGLE_REVIEWS_URL", "https://maps.app.goo.gl/JzfsHqPG3uGUjCFB6")
    SME_AWARD_URL: str = os.environ.get("SME_AWARD_URL", "https://www.instagram.com/p/DVtb4MpD5HH/")

    EMAIL_PROVIDER: str = os.environ.get("EMAIL_PROVIDER", "none").lower()
    EMAIL_FROM: str = os.environ.get("EMAIL_FROM", "Accurova <juliancheung@accurova.com>")

    RESEND_API_KEY: str = os.environ.get("RESEND_API_KEY", "")
    POSTMARK_SERVER_TOKEN: str = os.environ.get("POSTMARK_SERVER_TOKEN", "")

    SMTP_HOST: str = os.environ.get("SMTP_HOST", "")
    SMTP_PORT: int = int(os.environ.get("SMTP_PORT", "587"))
    SMTP_USERNAME: str = os.environ.get("SMTP_USERNAME", "")
    SMTP_PASSWORD: str = os.environ.get("SMTP_PASSWORD", "")
    SMTP_USE_TLS: bool = os.environ.get("SMTP_USE_TLS", "true").lower() == "true"

    RATE_LIMIT_WINDOW_SECONDS: int = int(os.environ.get("RATE_LIMIT_WINDOW_SECONDS", "60"))
    RATE_LIMIT_MAX_REQUESTS: int = int(os.environ.get("RATE_LIMIT_MAX_REQUESTS", "5"))

    ENV: str = os.environ.get("ENV", "development")
    PORT: int = int(os.environ.get("PORT", "8000"))


settings = Settings()
