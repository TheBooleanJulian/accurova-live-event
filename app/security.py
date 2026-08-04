import hashlib
import hmac
import time
from collections import defaultdict, deque

from fastapi import Request, HTTPException, status
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from app.config import settings

SESSION_COOKIE_NAME = "accurova_admin_session"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 12  # 12 hours

_serializer = URLSafeTimedSerializer(settings.SESSION_SECRET, salt="admin-session")


def check_admin_password(password: str) -> bool:
    return hmac.compare_digest(password, settings.ADMIN_PASSWORD)


def create_session_token() -> str:
    return _serializer.dumps({"role": "admin"})


def verify_session_token(token: str | None) -> bool:
    if not token:
        return False
    try:
        data = _serializer.loads(token, max_age=SESSION_MAX_AGE_SECONDS)
        return data.get("role") == "admin"
    except (BadSignature, SignatureExpired):
        return False


def require_admin(request: Request) -> None:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not verify_session_token(token):
        raise HTTPException(status_code=status.HTTP_303_SEE_OTHER, headers={"Location": "/admin/login"})


# --- Simple in-memory IP rate limiter (fine for a single-operator, single-instance deploy) ---

class RateLimiter:
    def __init__(self, window_seconds: int, max_requests: int):
        self.window_seconds = window_seconds
        self.max_requests = max_requests
        self._hits: dict[str, deque] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.time()
        bucket = self._hits[key]
        while bucket and now - bucket[0] > self.window_seconds:
            bucket.popleft()
        if len(bucket) >= self.max_requests:
            return False
        bucket.append(now)
        return True


rate_limiter = RateLimiter(
    window_seconds=settings.RATE_LIMIT_WINDOW_SECONDS,
    max_requests=settings.RATE_LIMIT_MAX_REQUESTS,
)


def enforce_rate_limit(request: Request, bucket_prefix: str) -> None:
    client_ip = request.client.host if request.client else "unknown"
    key = f"{bucket_prefix}:{client_ip}"
    if not rate_limiter.allow(key):
        raise HTTPException(status_code=429, detail="Too many requests. Please try again shortly.")


def hash_placeholder(value: str) -> str:
    # Not currently used for storage (password kept simple for single-operator),
    # but available if you later want to hash ADMIN_PASSWORD at rest.
    return hashlib.sha256(value.encode()).hexdigest()
