<div align="center">

# accurova-live-event

**Mobile-first event landing page + admin dashboard — one deployment serves every live event via a unique QR-code URL.**

![Version](https://img.shields.io/badge/version-1.0.1-00D4C8)
![Python](https://img.shields.io/badge/-Python-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/-FastAPI-009688?logo=fastapi&logoColor=white)
![SQLite](https://img.shields.io/badge/-SQLite-003B57?logo=sqlite&logoColor=white)
![Zeabur](https://img.shields.io/badge/-Zeabur-6C5CE7)
![License](https://img.shields.io/badge/license-Dual-00D4C8.svg)

</div>

---

## What it does

Attendees scan a QR code at a live corporate event and land on a mobile-first page where they can grab their photos, connect on LinkedIn/WhatsApp, view a portfolio, or book a consultation. Each event is a distinct database record — the same deployment serves every event; create a new one in the admin dashboard and point the QR code at `/e/{slug}`. When photos are ready, the app automatically emails everyone who signed up and updates the public page to show a direct download link.

## Features

- Per-event landing pages served at `/e/{slug}` — unlimited events from a single deployment
- Email-capture form while photos are processing; auto-swaps to a gallery link when status flips to `photos_ready`
- Targeted photo-ready email blast to signed-up attendees (Resend, Postmark, SMTP, or stdout/none for local dev)
- Admin dashboard: event CRUD, status management, gallery URL, thumbnail upload, CSV export of signups
- "Past events" showcase on the homepage — any event with a thumbnail set appears there, linking to its public page
- IP rate limiting on signup and enquiry endpoints
- Auto-applies DB schema on startup — no manual migration step needed
- Server-rendered Jinja2 templates, no frontend build step

## Tech Stack

| Layer | Choice |
|---|---|
| Backend | FastAPI + SQLite (raw SQL, no ORM) |
| Frontend | Server-rendered Jinja2 + vanilla JS |
| Hosting | Zeabur (GitHub CI/CD, feature → dev → main) |

## Quick Start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# edit .env — at minimum set SESSION_SECRET and ADMIN_PASSWORD

uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/admin`, log in with `ADMIN_PASSWORD`, create an event, then visit `http://localhost:8000/e/{slug}` to see the public page.

> Schema is applied automatically on startup. To run it manually: `python migrations/init_db.py`

## Configuration

| Variable | Required | Description |
|---|---|---|
| `SESSION_SECRET` | Yes | Signs the admin session cookie — generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ADMIN_PASSWORD` | Yes | Single-operator admin password |
| `DB_PATH` | Yes | Path to the SQLite file (e.g. `./data/live_event.db`) |
| `UPLOADS_DIR` | No | Directory for uploaded event thumbnails, served at `/uploads/*` (default: `./data/uploads`) |
| `PUBLIC_BASE_URL` | Yes | Base URL of the deployment |
| `WHATSAPP_NUMBER` | No | Full international number for `wa.me` links, e.g. `6580001234` or `+6580001234` |
| `LINKEDIN_URL` / `LINKEDIN_COMPANY_URL` | No | Personal and company LinkedIn links shown as two buttons on the public page |
| `PORTFOLIO_URL` | No | Outbound portfolio link shown on the public event page |
| `GOOGLE_REVIEWS_URL` / `SME_AWARD_URL` | No | Destinations for the "★ 5.0 GOOGLE" and "SME500 AWARD" badges |
| `EMAIL_PROVIDER` | No | `resend` \| `postmark` \| `smtp` \| `none` (default: `none`) |
| `EMAIL_FROM` | No | From header used for notification emails |
| `RESEND_API_KEY` | No | Required if `EMAIL_PROVIDER=resend` |
| `POSTMARK_SERVER_TOKEN` | No | Required if `EMAIL_PROVIDER=postmark` |
| `SMTP_*` | No | Required if `EMAIL_PROVIDER=smtp` |
| `RATE_LIMIT_WINDOW_SECONDS` / `RATE_LIMIT_MAX_REQUESTS` | No | IP throttle on signup/enquiry endpoints |

Set `EMAIL_PROVIDER=none` for local dev — signups and enquiries are still stored, notification emails log to stdout, and `notified_at` stays null until a real provider is configured.

## Project Structure

```
app/
  main.py              # FastAPI app entrypoint
  config.py            # env-driven settings
  db.py                # SQLite connection helpers
  security.py          # admin session auth + IP rate limiter
  email_client.py      # pluggable email sender (Resend/Postmark/SMTP)
  routes/
    public.py          # /e/{slug}, signup, enquiry endpoints
    admin.py           # /admin — login, dashboard, event CRUD, CSV export
  templates/
    public/            # event landing page, 404
    admin/             # login, dashboard, event detail
  static/css/style.css # design system
migrations/
  schema.sql           # CREATE TABLE ... IF NOT EXISTS
  init_db.py           # idempotent schema runner
.github/workflows/     # CI: lint/build check on push
.env.example
requirements.txt
```

## Deployment

Deployed on Zeabur via GitHub CI/CD. Push to `main` triggers deploy. Branch flow: `feature → dev → main`.

Mount a persistent volume covering both `DB_PATH` and `UPLOADS_DIR` (e.g. `/app/data`) — without it, every redeploy wipes events, signups, enquiries, and uploaded thumbnails.

## Status / Roadmap

**Done**

- [x] Per-event landing pages at `/e/{slug}`
- [x] Admin dashboard with event CRUD, status management, and CSV export
- [x] Photo-ready email blast with de-duplication (already-notified signups not re-emailed)
- [x] Pluggable email provider (Resend, Postmark, SMTP, none)
- [x] IP rate limiting on public endpoints
- [x] Auto-applied DB schema on startup
- [x] Root route fixed — no longer redirects visitors to admin login

**Future Roadmap / Suggestions**

- Automated test suite — no test files exist yet; add at minimum smoke tests for the signup/enquiry endpoints and the `photos_ready` status-transition/notification logic
- Multi-admin / role-based access — move off the single shared `ADMIN_PASSWORD` toward per-operator accounts with scoped permissions
- Event templates & duplication — clone a past event's settings (branding, links, email copy) instead of re-entering them each time
- In-app QR code generation — generate and download the `/e/{slug}` QR code straight from the admin dashboard instead of a separate tool
- Signup analytics — scan counts, signup conversion rate, and time-to-notify per event, surfaced on the event detail page
- Native photo gallery hosting — optional built-in gallery instead of always linking out to an external `gallery_url` (e.g. LuxSync)
- SMS notifications — alongside email, for attendees who prefer text when photos are ready
- Shared-store rate limiting — swap the in-memory limiter for Redis (or edge-level throttling) to support multi-instance deployments
- Admin audit log — track who changed event status/gallery URLs and when, useful once multi-admin access lands
- CRM/webhook integration — push new signups and enquiries to Zapier/Make or a webhook endpoint in real time
- "Past 7 events" showcase — surface the 7 most recent completed events (name, date, thumbnail/link) on the generic bare-domain landing page as social proof for visitors with no live event to land on

Have another idea? Open an issue or use the feedback form below.

## Changelog

Versions follow [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`) going forward:

- **MAJOR** — breaking changes (schema changes requiring migration, removed routes/env vars, incompatible API changes)
- **MINOR** — backwards-compatible features (new admin capability, new public-page flow, new env var with a safe default)
- **PATCH** — backwards-compatible fixes and small tweaks

Summarised from commit history, most recent first.

- **2026-08-04 (1.0.1)** — Docs updated: `WHATSAPP_NUMBER` format clarified, default contact info (WhatsApp, LinkedIn, portfolio, email-from) updated; changelog and roadmap added to README
- **2026-08-04** — DB schema now auto-applied on startup; removes the need to run `init_db.py` manually before first launch
- **2026-08-04** — Fixed root route incorrectly redirecting public visitors to the admin login page
- **2026-08-04** — Dual license added (`LICENSE` + `COMMERCIAL-LICENSE.md`)
- **2026-08-04 (1.0.0)** — Initial build: event landing page at `/e/{slug}`, email-capture and photo-ready flow, admin dashboard with event CRUD and CSV export, pluggable email providers, IP rate limiting

## Feedback & Bug Reports

Found a bug or have feedback? Submit it via [this form](https://forms.gle/qRCimSyoosWyNwXdA).

## License

Dual-licensed. See [`LICENSE`](LICENSE) (open-source terms) and [`COMMERCIAL-LICENSE.md`](COMMERCIAL-LICENSE.md) (commercial terms).

---

<div align="center">
<sub>Built by <a href="https://github.com/TheBooleanJulian">@TheBooleanJulian</a></sub>
</div>