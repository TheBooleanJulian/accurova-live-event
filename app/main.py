from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse

from app.routes import public, admin
from app.config import settings

app = FastAPI(title="Accurova Live Event", docs_url=None, redoc_url=None)

app.mount("/static", StaticFiles(directory="app/static"), name="static")

app.include_router(public.router)
app.include_router(admin.router)


@app.get("/")
def root():
    return RedirectResponse("/admin", status_code=303)


@app.get("/healthz")
def healthz():
    return {"status": "ok", "env": settings.ENV}
