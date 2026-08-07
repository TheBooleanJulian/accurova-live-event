<div align="center">

# accurova-live-event

**Mobile-first event landing page + admin dashboard — one deployment serves every live event via a unique QR-code URL.**

![Accurova Live Event](assets/accurova-live-event-card.png)

![Version](https://img.shields.io/badge/version-1.35.0-00D4C8)
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
- Admin dashboard: event CRUD, status management, gallery URL + password, thumbnail upload (manual or auto-pulled from the gallery's preview image)
- Unified signups/enquiries views in admin — every event's data in one sortable table each, with an event-name column ("Unassigned" for enquiries submitted from the homepage), each with its own CSV export
- Gallery password shown with a copy-to-clipboard button on the public page and included in the "photos ready" notification email
- Homepage leads with a swipeable carousel — latest event first (gold accent), then up to 7 past events with thumbnails (teal accent), arrow-navigable, full-width cards matching the rest of the page; visitors click in themselves, no auto-redirect
- Per-event "show on homepage" toggle in the admin dashboard — instantly include/exclude an event from the carousel
- Live-now indicator (red border + pulsing "LIVE NOW" badge) triggers from either a matching event date or an admin-set `live` status
- Themed icon on every card plus CTA buttons filled with their card's accent color, for quick visual scanning
- One-click "save to contacts" button generates a vCard (.vcf) for the primary contact, including phone and website
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
| `WHATSAPP_URL` | No | Single destination every "Message on WhatsApp" CTA site-wide links to |
| `WHATSAPP_DISPLAY_NUMBER` | No | Number shown in the WhatsApp button text (display-only) |
| `LINKEDIN_URL` | No | Personal LinkedIn link shown on the public page |
| `LINKEDIN_COMPANY_URL` | No | Company LinkedIn URL — kept in config but not currently linked anywhere (button hidden) |
| `PORTFOLIO_URL` | No | Outbound portfolio link shown on the public event page |
| `GOOGLE_REVIEWS_URL` / `SME_AWARD_URL` | No | Destinations for the "★ 5.0 GOOGLE" and "SME500 AWARD" badges |
| `CONTACT_NAME` | No | Name used for the "save to contacts" button, vCard FN, and .vcf filename |
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
- [x] Light-mode design system with gold/teal accent cards
- [x] Event thumbnails — manual upload or auto-pulled from the gallery's preview image
- [x] Homepage carousel — looping, arrow-navigable, latest event + up to 7 past events, with a live-now badge
- [x] Gallery password with copy-to-clipboard, shown on the public page and in the notification email
- [x] Save-to-contacts vCard button (name, phone, website)
- [x] Unified signups/enquiries admin views with per-event CSV export
- [x] CDN caching disabled for all dynamic routes (prevents stale/authenticated pages being served to the wrong visitor)
- [x] Themed per-card icons and accent-matched CTA button colors across every public page
- [x] Live status can be set manually in admin, independent of the event date

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

Have another idea? Open an issue or use the feedback form below.

## Changelog

Versions follow [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`).

Summarised from commit history, most recent first.

Every distinct feature or fix gets its own `MINOR` bump for full traceability — versions increment `+0.1` per change rather than batching multiple changes under one release.

- **2026-08-07 (1.35.0)** — README hero image added
- **2026-08-07 (1.34.0)** — Save-to-contacts vCard now includes the website URL
- **2026-08-07 (1.33.0)** — Remaining outline CTA buttons (LinkedIn, portfolio, save-contact, WhatsApp) filled with their card's accent color, matching the rest
- **2026-08-07 (1.32.0)** — Every card gets a themed icon
- **2026-08-07 (1.31.0)** — Fixed gallery-thumbnail fetch 403ing on Cloudflare-fronted hosts like Pixieset by spoofing a browser User-Agent
- **2026-08-07 (1.30.0)** — "LIVE NOW" badge now blinks/pulses instead of sitting static
- **2026-08-07 (1.29.0)** — Homepage carousel cards widened to match every other card's width (they were previously narrower to hint at horizontal scroll)
- **2026-08-07 (1.28.0)** — Footer credit line ("Built by @TheBooleanJulian") added
- **2026-08-07 (1.27.0)** — CTA button colors matched to their card instead of a mismatched teal/gold mix
- **2026-08-07 (1.26.0)** — Removed the redundant "scan the QR code" homepage card
- **2026-08-07 (1.25.0)** — Live badge/border now also triggers from an admin-set "live" status, not only a matching event date
- **2026-08-07 (1.24.0)** — Third badge now reads "Featured in Straits Times + LHZB" (was "900+ SHOOTS")
- **2026-08-07 (1.23.0)** — Badges get a border + underline to read as clickable
- **2026-08-07 (1.22.0)** — Wordmark scaled to full width to match the cards
- **2026-08-07 (1.21.0)** — New "Accurova Live Event" banner replaces the old logo + separate text title site-wide, now clickable straight to the homepage
- **2026-08-07 (1.20.0)** — Static assets (`style.css`, etc.) now cache-busted with a version query param, so a redeploy's fixes aren't stuck behind a stale CDN/browser cache — the /static exemption from the no-store middleware had let this happen silently
- **2026-08-07 (1.19.0)** — Homepage carousel now loops seamlessly (clones + silent snap-back instead of a hard stop); live events get a "LIVE NOW" badge wherever they appear; event thumbnails and gallery password added to the individual event subpage; header reordered banner-first
- **2026-08-07 (1.18.0)** — Gold/teal accent card system across the site; WhatsApp button copy updated; save-to-contacts vCard button; per-event "show on homepage" toggle in admin
- **2026-08-07 (1.17.0)** — Signups and enquiries unified into single admin-wide views (one sortable table per type, event-name column, per-view CSV export); homepage rebuilt around a swipeable event carousel
- **2026-08-07 (1.16.0)** — Site-title home link added to every page; event thumbnail now auto-pulled from the gallery URL's preview image when not manually uploaded
- **2026-08-07 (1.15.0)** — All WhatsApp CTAs unified to a single configurable `WHATSAPP_URL`; consultation enquiry form added to the homepage
- **2026-08-07 (1.14.0)** — `/admin/*` no-store caching extended to all dynamic routes, not just admin — closes a gap where an intermediate CDN could still cache a signed-in response
- **2026-08-07 (1.13.0)** — Gallery password field with copy-to-clipboard added to the public event page
- **2026-08-07 (1.12.0)** — Photo-notify signup form now collects the attendee's name
- **2026-08-07 (1.11.0)** — "Book a Consultation" WhatsApp card added to the homepage
- **2026-08-07 (1.10.0)** — Homepage now highlights the latest event; LinkedIn split into separate personal/company buttons
- **2026-08-07 (1.9.0)** — Admin can now edit an event's slug and delete events
- **2026-08-07 (1.8.0)** — SME award and Google review badges made clickable; thumbnail upload limit raised from 5MB to 25MB
- **2026-08-07 (1.7.0)** — Prevented CDN caching of `/admin/*` — closed an auth-bypass where a cached dashboard response could be served to an unauthenticated visitor
- **2026-08-07 (1.6.0)** — Event thumbnail upload added, with a "past events" showcase on the homepage
- **2026-08-07 (1.5.0)** — Switched to a light-mode design system with the Accurova banner logo
- **2026-08-04 (1.4.0)** — Docs updated: `WHATSAPP_NUMBER` format clarified, default contact info (WhatsApp, LinkedIn, portfolio, email-from) updated; changelog and roadmap added to README
- **2026-08-04 (1.3.0)** — DB schema now auto-applied on startup; removes the need to run `init_db.py` manually before first launch
- **2026-08-04 (1.2.0)** — Fixed root route incorrectly redirecting public visitors to the admin login page
- **2026-08-04 (1.1.0)** — Dual license added (`LICENSE` + `COMMERCIAL-LICENSE.md`)
- **2026-08-04 (1.0.0)** — Initial build: event landing page at `/e/{slug}`, email-capture and photo-ready flow, admin dashboard with event CRUD and CSV export, pluggable email providers, IP rate limiting

## Feedback & Bug Reports

Found a bug or have feedback? Submit it via [this form](https://forms.gle/qRCimSyoosWyNwXdA).

## License

Dual-licensed. See [`LICENSE`](LICENSE) (open-source terms) and [`COMMERCIAL-LICENSE.md`](COMMERCIAL-LICENSE.md) (commercial terms).

---

<div align="center">
<sub>Built by <a href="https://github.com/TheBooleanJulian">@TheBooleanJulian</a></sub>
</div>