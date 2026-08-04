# live-event.accurova.com

Single-purpose event landing page for Accurova. Attendees scan a QR code at a
live corporate event and land on a mobile-first page to grab their photos,
connect on LinkedIn/WhatsApp, view the portfolio, or book a consultation.
Each event is a distinct DB record — the same deployment serves every event,
you just create a new one in the admin dashboard and point the QR code at
`/e/{slug}`.

## Stack

- **Backend**: Python + FastAPI + SQLite (raw SQL, no ORM)
- **Frontend**: server-rendered Jinja2 templates, vanilla JS (no build step)
- **Deployment**: Zeabur via GitHub CI/CD, `feature → dev → main` branching
- **Design system**: deep void (`#050508`/`#0A0E14`), teal `#00D4C8`, gold
  `#F5C842`, Space Grotesk / JetBrains Mono / Inter

## Project structure

```
app/
  main.py            # FastAPI app entrypoint
  config.py          # env-driven settings
  db.py              # sqlite connection helpers
  security.py        # admin session auth + IP rate limiter
  email_client.py     # pluggable email sender (Resend/Postmark/SMTP)
  routes/
    public.py         # /e/{slug}, signup, enquiry endpoints
    admin.py           # /admin — login, dashboard, event CRUD, CSV export
  templates/
    public/            # event landing page, 404
    admin/              # login, dashboard, event detail
  static/css/style.css # design system
migrations/
  schema.sql          # CREATE TABLE ... IF NOT EXISTS
  init_db.py          # idempotent schema runner
.github/workflows/     # CI: lint/build check on push
.env.example
requirements.txt
```

## Local development

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# edit .env — at minimum set SESSION_SECRET and ADMIN_PASSWORD

python migrations/init_db.py     # creates ./data/live_event.db
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/admin`, log in with `ADMIN_PASSWORD`, create an
event, then visit `http://localhost:8000/e/{slug}` to see the public page.

## Environment variables

All variables are documented in `.env.example`. The important ones:

| Variable | Purpose |
|---|---|
| `DB_PATH` | Path to the SQLite file (e.g. `./data/live_event.db`) |
| `SESSION_SECRET` | Signs the admin session cookie — generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ADMIN_PASSWORD` | Single-operator admin password |
| `PUBLIC_BASE_URL` | Base URL of the deployment |
| `WHATSAPP_NUMBER` | Digits only, no `+`, e.g. `6580001234` |
| `LINKEDIN_URL` / `PORTFOLIO_URL` | Outbound links on the public page |
| `EMAIL_PROVIDER` | `resend` \| `postmark` \| `smtp` \| `none` |
| `EMAIL_FROM` | From header used for notification emails |
| `RESEND_API_KEY` / `POSTMARK_SERVER_TOKEN` / `SMTP_*` | Credentials for whichever provider you pick |
| `RATE_LIMIT_WINDOW_SECONDS` / `RATE_LIMIT_MAX_REQUESTS` | IP throttle on signup/enquiry endpoints |

Set `EMAIL_PROVIDER=none` for local dev if you don't want to wire up a real
provider — signups/enquiries still get stored, notification emails just log
to stdout instead of sending, and `notified_at` stays null until you switch
to a real provider.

## How the "photos ready" flow works

1. Public page defaults to an email-capture form ("Photos are being
   processed — leave your email...").
2. In `/admin/events/{id}`, set `gallery_url` (your LuxSync gallery link) and
   change `status` to `photos_ready`, then save.
3. On that exact transition (not already `photos_ready` → now `photos_ready`,
   with a gallery URL set), the app emails everyone who signed up for that
   event and hasn't been notified yet, then marks each as notified.
4. The public page immediately swaps to a "View & Download Photos" button
   linking straight to `gallery_url`.

If you flip status back and forth, only genuinely-new transitions into
`photos_ready` trigger a fresh send — already-notified signups aren't
re-emailed.

## Deploying to Zeabur

1. Push this repo to GitHub with the `feature → dev → main` branch structure
   (a minimal check workflow lives in `.github/workflows/ci.yml`).
2. In Zeabur, create a new service from the GitHub repo, tracking `main`.
3. Zeabur auto-detects Python; if it doesn't pick up the start command, set:
   - **Build**: `pip install -r requirements.txt && python migrations/init_db.py`
   - **Start**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Add a **persistent volume** mounted at wherever `DB_PATH` points (e.g.
   `/app/data`) — SQLite needs the underlying disk to survive redeploys.
   Without a volume, every deploy wipes your events/signups/enquiries.
5. Set all environment variables from `.env.example` in the Zeabur service
   settings (Variables tab). At minimum: `DB_PATH`, `SESSION_SECRET`,
   `ADMIN_PASSWORD`, `WHATSAPP_NUMBER`, `LINKEDIN_URL`, `PORTFOLIO_URL`,
   `EMAIL_PROVIDER` + its credentials, `PUBLIC_BASE_URL`, `ENV=production`.
6. Point your domain (`live-event.accurova.com`) at the Zeabur service and
   set `PUBLIC_BASE_URL` to match.
7. Generate a QR code per event pointing at
   `https://live-event.accurova.com/e/{slug}` — you can reuse the same
   domain for every future event, just create a new event record and a new
   QR code each time.

## Notes / operational tips

- The admin auth is intentionally simple (one shared password, signed
  cookie, 12h session) — this matches the single-operator pattern used
  across your other tools, not a multi-user system.
- The rate limiter is in-memory and per-process. Fine for a single Zeabur
  instance; if you ever scale to multiple instances behind a load balancer,
  swap it for a shared store (Redis) or move throttling to the edge.
- CSV exports are available per-event from the event detail page
  (`/admin/events/{id}/signups.csv` and `.../enquiries.csv`).
