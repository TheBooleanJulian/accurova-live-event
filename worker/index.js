// Accurova Live Event on Cloudflare Workers — port of app/ (FastAPI + Jinja + SQLite on Zeabur).
//
// Same routes, forms, JSON shapes and redirects as app/main.py + app/routes/{public,admin}.py:
//   public   GET /  ·  GET /e/:slug  ·  POST /e/:slug/signup  ·  POST /e/:slug/enquiry  ·  POST /enquiry  ·  GET /contact.vcf
//   admin    /admin/login · /admin/logout · /admin · /admin/events[/:id[/toggle-homepage|/fetch-thumbnail|/delete]]
//            /admin/signups[.csv] · /admin/enquiries[.csv]
//   assets   /static/* (app/static)  ·  /uploads/* (event thumbnails, R2 bucket "accurova-live-event")
//   health   GET /healthz (fails until the DB answers)
//
// Data: schema accurova_live_event in the shared Supabase project (thebooleanjulian-db) via Hyperdrive.
// Secrets: ADMIN_PASSWORD, SESSION_SECRET; RESEND_API_KEY or POSTMARK_SERVER_TOKEN if EMAIL_PROVIDER is set.
// Vars: the contact/link settings from app/config.py, EMAIL_PROVIDER, EMAIL_FROM.
// Differences, on purpose: no default admin password or session secret (unset = admin locked); EMAIL_PROVIDER=smtp
// isn't available on Workers (treated as "none"); the delete confirmation in the admin works (see views.js).
import { withDb, dbCheck } from 'thebooleanjulian-bot-core/db';
import * as views from './views.js';

const SESSION_COOKIE = 'accurova_admin_session';
const SESSION_MAX_AGE = 60 * 60 * 12; // 12 h
const THUMBNAIL_MAX_BYTES = 25 * 1024 * 1024;
const THUMBNAIL_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, private', Pragma: 'no-cache' };

const DEFAULTS = {
  WHATSAPP_URL: 'https://wa.link/6y9sbx',
  WHATSAPP_DISPLAY_NUMBER: '+65 9856 6543',
  CONTACT_NAME: 'Julian Cheung (Photographer Accurova)',
  LINKEDIN_URL: 'https://www.linkedin.com/in/juliancheungjunyan/',
  PORTFOLIO_URL: 'https://accurova.com/',
  GOOGLE_REVIEWS_URL: 'https://maps.app.goo.gl/JzfsHqPG3uGUjCFB6',
  SME_AWARD_URL: 'https://www.instagram.com/p/DVtb4MpD5HH/',
  EMAIL_PROVIDER: 'none',
  EMAIL_FROM: 'Accurova <juliancheung@accurova.com>'
};
const setting = (env, k) => env[k] || DEFAULTS[k];

class HttpError extends Error {
  constructor(status, detail) { super(detail); this.status = status; }
}

// ── responses ────────────────────────────────────────────────────────────────
const html = (body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE } });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...NO_STORE } });
const redirect = (location, extra = {}) => new Response(null, { status: 303, headers: { Location: location, ...NO_STORE, ...extra } });

function links(env) {
  return {
    whatsapp_url: setting(env, 'WHATSAPP_URL'),
    whatsapp_display_number: setting(env, 'WHATSAPP_DISPLAY_NUMBER'),
    linkedin_url: setting(env, 'LINKEDIN_URL'),
    portfolio_url: setting(env, 'PORTFOLIO_URL'),
    google_reviews_url: setting(env, 'GOOGLE_REVIEWS_URL'),
    sme_award_url: setting(env, 'SME_AWARD_URL'),
    contact_name: setting(env, 'CONTACT_NAME')
  };
}

// Cache-busting: one value per deploy for /static, and the R2 upload time for each thumbnail (thumb_v in config.py).
async function viewContext(env, thumbnailPaths = []) {
  const versions = {};
  await Promise.all([...new Set(thumbnailPaths.filter(Boolean))].map(async (p) => {
    const obj = env.UPLOADS ? await env.UPLOADS.head(uploadKey(p)) : null;
    versions[p] = obj ? Math.floor(obj.uploaded.getTime() / 1000) : 0;
  }));
  return {
    asset_v: env.CF_VERSION_METADATA?.id?.slice(0, 8) || '1',
    thumb_v: (p) => (p ? versions[p] ?? 0 : 0),
    today: new Date().toISOString().slice(0, 10)
  };
}

// ── admin session (replaces itsdangerous; same cookie name, lifetime and flags) ─
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))));
}

function timingSafeEqual(a, b) {
  const x = new TextEncoder().encode(String(a)), y = new TextEncoder().encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

export async function createSessionToken(env, now = Date.now()) {
  const payload = `admin.${Math.floor(now / 1000) + SESSION_MAX_AGE}`;
  return `${payload}.${await hmac(env.SESSION_SECRET, payload)}`;
}

export async function isLoggedIn(request, env) {
  if (!env.SESSION_SECRET) return false;
  const cookie = (request.headers.get('Cookie') || '').split(/;\s*/).find((c) => c.startsWith(SESSION_COOKIE + '='));
  if (!cookie) return false;
  const [role, exp, sig] = cookie.slice(SESSION_COOKIE.length + 1).split('.');
  if (role !== 'admin' || !(Number(exp) > Date.now() / 1000) || !sig) return false;
  return timingSafeEqual(sig, await hmac(env.SESSION_SECRET, `${role}.${exp}`));
}

// ── helpers carried over from routes/admin.py ────────────────────────────────
export function slugify(value) {
  const s = String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'event';
}

async function uniqueSlug(sql, base, excludeId = null) {
  let slug = base, n = 2;
  for (;;) {
    const [row] = await sql`select id from accurova_live_event.events where slug = ${slug}`;
    if (!row || row.id === excludeId) return slug;
    slug = `${base}-${n++}`;
  }
}

const uploadKey = (webPath) => String(webPath).split('/').pop();

// Thumbnails are named from the event id (no client-supplied names); a different old extension is removed.
async function saveThumbnail(env, eventId, contentType, data, oldPath) {
  const name = `event_${eventId}${THUMBNAIL_TYPES[contentType]}`;
  await env.UPLOADS.put(name, data, { httpMetadata: { contentType } });
  if (oldPath && uploadKey(oldPath) !== name) await env.UPLOADS.delete(uploadKey(oldPath));
  return `/uploads/${name}`;
}

const OG_IMAGE_RE = /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i;
const OG_IMAGE_RE_ALT = /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i;
export function extractPreviewImageUrl(page) {
  const m = OG_IMAGE_RE.exec(page) || OG_IMAGE_RE_ALT.exec(page);
  return m ? m[1] : null;
}

// Gallery hosts (e.g. Pixieset) 403 requests without a browser-like User-Agent.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchGalleryThumbnail(env, eventId, galleryUrl, oldPath) {
  const get = async (url, what) => {
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA }, redirect: 'follow', signal: AbortSignal.timeout(10000) });
    } catch (err) {
      throw new Error(`Couldn't ${what} (${err.message}).`);
    }
    if (!res.ok) throw new Error(`Couldn't ${what} (HTTP ${res.status}).`);
    return res;
  };
  const page = await get(galleryUrl, 'reach the gallery URL');
  const found = extractPreviewImageUrl(await page.text());
  if (!found) throw new Error('No preview image found on that gallery page.');
  const img = await get(new URL(found, page.url).toString(), 'download the gallery preview image');
  const contentType = (img.headers.get('content-type') || '').split(';')[0].trim();
  if (!THUMBNAIL_TYPES[contentType]) throw new Error(`Gallery preview image type (${contentType || 'unknown'}) isn't supported.`);
  const data = await img.arrayBuffer();
  if (data.byteLength > THUMBNAIL_MAX_BYTES) throw new Error('Gallery preview image is too large.');
  return saveThumbnail(env, eventId, contentType, data, oldPath);
}

// ── email (app/email_client.py) ──────────────────────────────────────────────
export function photosReadyEmailHtml(eventName, galleryUrl, galleryPassword) {
  const e = views.esc;
  const passwordBlock = galleryPassword
    ? `<p style="color:#cfd3da; margin:0 0 24px;">Gallery password: <strong style="font-family: monospace;">${e(galleryPassword)}</strong></p>`
    : '';
  return `
    <div style="font-family: Arial, sans-serif; background:#050508; color:#f5f5f5; padding:32px;">
      <h2 style="color:#00D4C8; margin-bottom:8px;">Your photos are ready</h2>
      <p style="color:#cfd3da;">Photos from <strong>${e(eventName)}</strong> have just been processed and are ready to view.</p>
      <p style="margin:24px 0;">
        <a href="${e(galleryUrl)}" style="background:#00D4C8; color:#050508; padding:12px 20px; text-decoration:none; font-weight:bold; border-radius:4px;">
          View &amp; Download Photos
        </a>
      </p>
      ${passwordBlock}
      <p style="color:#8a8f98; font-size:12px;">Sent by Accurova &mdash; premium photography &amp; digital media.</p>
    </div>`;
}

// Returns true if sent; false when no provider is configured (the FastAPI app's "none" no-op).
async function sendEmail(env, to, subject, body) {
  const provider = String(setting(env, 'EMAIL_PROVIDER')).toLowerCase();
  const from = setting(env, 'EMAIL_FROM');
  let res;
  if (provider === 'resend') {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html: body }),
      signal: AbortSignal.timeout(10000)
    });
  } else if (provider === 'postmark') {
    res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { 'X-Postmark-Server-Token': env.POSTMARK_SERVER_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ From: from, To: to, Subject: subject, HtmlBody: body, MessageStream: 'outbound' }),
      signal: AbortSignal.timeout(10000)
    });
  } else {
    console.log(`[email] EMAIL_PROVIDER=${provider} — not sending "${subject}"`);
    return false;
  }
  if (!res.ok) throw new Error(`${provider} ${res.status}`);
  return true;
}

// ── CSV (Python's csv.DictWriter: minimal quoting, \r\n line ends) ───────────
export function toCsv(rows, fields) {
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [fields.join(','), ...rows.map((r) => fields.map((f) => cell(r[f])).join(','))].join('\r\n') + '\r\n';
}

const csvResponse = (rows, fields, filename) =>
  new Response(toCsv(rows, fields), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, ...NO_STORE } });

// ── public routes ────────────────────────────────────────────────────────────
async function rateLimited(request, env, bucket) {
  if (!env.FORM_LIMIT) return false;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  return !(await env.FORM_LIMIT.limit({ key: `${bucket}:${ip}` })).success;
}

const trimOpt = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 2000) : null);

function parseSignup(body) {
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 200) : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!name) throw new HttpError(422, 'Name is required');
  if (!EMAIL_RE.test(email)) throw new HttpError(422, 'Please enter a valid email address.');
  return { name, email };
}

function parseEnquiry(body) {
  const { name, email } = parseSignup(body);
  return { name, email, company: trimOpt(body.company), event_type: trimOpt(body.event_type), message: trimOpt(body.message) };
}

async function home(request, env, ctx) {
  const { latest, past } = await withDb(env, ctx, async (sql) => {
    const [latest] = await sql`
      select id, slug, name, event_date, thumbnail_path, status from accurova_live_event.events
      where show_on_homepage = 1 order by coalesce(event_date, created_at) desc limit 1`;
    const past = await sql`
      select slug, name, event_date, thumbnail_path, status from accurova_live_event.events
      where show_on_homepage = 1 and thumbnail_path is not null and id != ${latest ? latest.id : -1}
      order by coalesce(event_date, created_at) desc limit 7`;
    return { latest, past };
  });
  const c = await viewContext(env, [latest?.thumbnail_path, ...past.map((e) => e.thumbnail_path)]);
  return html(views.genericPage({ ...c, ...links(env), latest_event: latest || null, past_events: past }));
}

async function eventLanding(env, ctx, slug) {
  const [event] = await withDb(env, ctx, (sql) => sql`select * from accurova_live_event.events where slug = ${slug}`);
  if (!event) return html(views.notFoundPage({ ...(await viewContext(env)), ...links(env) }), 404);
  const c = await viewContext(env, [event.thumbnail_path]);
  return html(views.eventPage({ ...c, ...links(env), event }));
}

function vcard(env) {
  const number = [...setting(env, 'WHATSAPP_DISPLAY_NUMBER')].filter((ch) => /[0-9+]/.test(ch)).join('');
  const name = setting(env, 'CONTACT_NAME');
  const body = `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:${name}\r\nN:Cheung;Julian;;;\r\nORG:Accurova\r\nTEL;TYPE=CELL,VOICE:${number}\r\nURL:${setting(env, 'PORTFOLIO_URL')}\r\nEND:VCARD\r\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/vcard', 'Content-Disposition': `attachment; filename="${name}.vcf"`, ...NO_STORE } });
}

async function publicApi(request, env, ctx, kind, slug) {
  if (await rateLimited(request, env, kind)) throw new HttpError(429, 'Too many requests. Please try again shortly.');
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') throw new HttpError(422, 'Invalid request.');

  if (kind === 'signup') {
    const s = parseSignup(body);
    await withDb(env, ctx, async (sql) => {
      const [event] = await sql`select id from accurova_live_event.events where slug = ${slug}`;
      if (!event) throw new HttpError(404, 'Event not found');
      // Already signed up for this event — treat as success.
      await sql`insert into accurova_live_event.email_signups (event_id, name, email) values (${event.id}, ${s.name}, ${s.email})
                on conflict (event_id, email) do nothing`;
    });
    return json({ ok: true });
  }

  const q = parseEnquiry(body);
  await withDb(env, ctx, async (sql) => {
    let eventId = null;
    if (slug !== null) {
      const [event] = await sql`select id from accurova_live_event.events where slug = ${slug}`;
      eventId = event ? event.id : null;
    }
    await sql`insert into accurova_live_event.enquiries (event_id, name, company, email, event_type, message)
              values (${eventId}, ${q.name}, ${q.company}, ${q.email}, ${q.event_type}, ${q.message})`;
  });
  return json({ ok: true });
}

// ── admin routes ─────────────────────────────────────────────────────────────
const formText = (form, k) => {
  const v = form.get(k);
  return typeof v === 'string' ? v : '';
};

async function admin(request, env, ctx, path) {
  const method = request.method;

  if (path === '/admin/login') {
    if (method === 'GET') {
      if (await isLoggedIn(request, env)) return redirect('/admin');
      return html(views.loginPage({ ...(await viewContext(env)), error: null }));
    }
    if (method === 'POST') {
      const form = await request.formData();
      const ok = env.ADMIN_PASSWORD && env.SESSION_SECRET && timingSafeEqual(formText(form, 'password'), env.ADMIN_PASSWORD);
      if (!ok) return html(views.loginPage({ ...(await viewContext(env)), error: 'Incorrect password.' }), 401);
      return redirect('/admin', { 'Set-Cookie': `${SESSION_COOKIE}=${await createSessionToken(env)}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; Secure; SameSite=Lax` });
    }
  }
  if (path === '/admin/logout' && method === 'GET') {
    return redirect('/admin/login', { 'Set-Cookie': `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });
  }

  if (!(await isLoggedIn(request, env))) return redirect('/admin/login');

  if (path === '/admin' && method === 'GET') {
    const events = await withDb(env, ctx, (sql) => sql`
      select e.*, count(s.id)::int as signup_count from accurova_live_event.events e
      left join accurova_live_event.email_signups s on s.event_id = e.id
      group by e.id order by e.created_at desc`);
    return html(views.dashboardPage({ ...(await viewContext(env)), events }));
  }

  if (path === '/admin/events' && method === 'POST') {
    const form = await request.formData();
    const name = formText(form, 'name').trim();
    if (!name) throw new HttpError(422, 'Event name is required.');
    const base = formText(form, 'slug').trim() ? slugify(formText(form, 'slug')) : slugify(name);
    await withDb(env, ctx, async (sql) => {
      const slug = await uniqueSlug(sql, base);
      await sql`insert into accurova_live_event.events (slug, name, client_name, event_date)
                values (${slug}, ${name}, ${formText(form, 'client_name').trim() || null}, ${formText(form, 'event_date').trim() || null})`;
    });
    return redirect('/admin');
  }

  if (path === '/admin/signups' || path === '/admin/signups.csv') {
    const rows = await withDb(env, ctx, (sql) => sql`
      select e.name as event_name, s.name, s.email, s.created_at, s.notified_at
      from accurova_live_event.email_signups s join accurova_live_event.events e on e.id = s.event_id
      order by s.created_at desc`);
    if (path.endsWith('.csv')) return csvResponse(rows, ['event_name', 'name', 'email', 'created_at', 'notified_at'], 'signups.csv');
    return html(views.signupsPage({ ...(await viewContext(env)), signups: rows }));
  }

  if (path === '/admin/enquiries' || path === '/admin/enquiries.csv') {
    const rows = await withDb(env, ctx, (sql) => sql`
      select coalesce(e.name, 'Unassigned') as event_name, q.name, q.company, q.email, q.event_type, q.message, q.created_at
      from accurova_live_event.enquiries q left join accurova_live_event.events e on e.id = q.event_id
      order by q.created_at desc`);
    if (path.endsWith('.csv')) return csvResponse(rows, ['event_name', 'name', 'company', 'email', 'event_type', 'message', 'created_at'], 'enquiries.csv');
    return html(views.enquiriesPage({ ...(await viewContext(env)), enquiries: rows }));
  }

  const m = /^\/admin\/events\/(\d+)(?:\/(toggle-homepage|fetch-thumbnail|delete))?$/.exec(path);
  if (!m) throw new HttpError(404, 'Not Found');
  const eventId = Number(m[1]);
  const action = m[2] || null;
  const [event] = await withDb(env, ctx, (sql) => sql`select * from accurova_live_event.events where id = ${eventId}`);

  if (action === 'toggle-homepage' && method === 'POST') {
    const form = await request.formData();
    await withDb(env, ctx, (sql) => sql`update accurova_live_event.events set show_on_homepage = ${formText(form, 'show_on_homepage') === 'on' ? 1 : 0} where id = ${eventId}`);
    return redirect('/admin');
  }
  if (!event) throw new HttpError(404, 'Event not found');

  if (!action && method === 'GET') {
    const params = new URL(request.url).searchParams;
    const c = await viewContext(env, [event.thumbnail_path]);
    return html(views.eventDetailPage({ ...c, event, message: params.get('message') || '', error: params.get('error') || '' }));
  }

  if (!action && method === 'POST') return updateEvent(request, env, ctx, event);

  if (action === 'fetch-thumbnail' && method === 'POST') {
    if (!event.gallery_url) return redirect(`/admin/events/${eventId}?error=${encodeURIComponent('Set and save a gallery URL first.')}`);
    try {
      const thumbnailPath = await fetchGalleryThumbnail(env, eventId, event.gallery_url, event.thumbnail_path);
      await withDb(env, ctx, (sql) => sql`update accurova_live_event.events set thumbnail_path = ${thumbnailPath} where id = ${eventId}`);
      return redirect(`/admin/events/${eventId}?message=${encodeURIComponent('Thumbnail pulled from the gallery.')}`);
    } catch (err) {
      return redirect(`/admin/events/${eventId}?error=${encodeURIComponent(err.message)}`);
    }
  }

  if (action === 'delete' && method === 'POST') {
    if (event.thumbnail_path) await env.UPLOADS.delete(uploadKey(event.thumbnail_path));
    await withDb(env, ctx, (sql) => sql`delete from accurova_live_event.events where id = ${eventId}`);
    return redirect('/admin');
  }

  throw new HttpError(405, 'Method Not Allowed');
}

async function updateEvent(request, env, ctx, event) {
  const form = await request.formData();
  const name = formText(form, 'name').trim();
  if (!name) throw new HttpError(422, 'Event name is required.');
  const status = formText(form, 'status') || 'upcoming';
  if (!['upcoming', 'live', 'photos_ready'].includes(status)) throw new HttpError(422, 'Invalid status.');
  const wasPhotosReady = event.status === 'photos_ready';
  const galleryUrl = formText(form, 'gallery_url').trim() || null;
  const galleryPassword = formText(form, 'gallery_password').trim() || null;

  let thumbnailPath = event.thumbnail_path;
  const file = form.get('thumbnail');
  if (file && typeof file !== 'string' && file.name) {
    if (!THUMBNAIL_TYPES[file.type]) throw new HttpError(400, 'Thumbnail must be a JPEG, PNG, or WebP image.');
    if (file.size > THUMBNAIL_MAX_BYTES) throw new HttpError(400, 'Thumbnail must be 25MB or smaller.');
    thumbnailPath = await saveThumbnail(env, event.id, file.type, await file.arrayBuffer(), thumbnailPath);
  } else if (formText(form, 'remove_thumbnail') === 'on') {
    if (thumbnailPath) await env.UPLOADS.delete(uploadKey(thumbnailPath));
    thumbnailPath = null;
  }

  const signups = await withDb(env, ctx, async (sql) => {
    const slug = await uniqueSlug(sql, formText(form, 'slug').trim() ? slugify(formText(form, 'slug')) : event.slug, event.id);
    await sql`update accurova_live_event.events set name = ${name}, client_name = ${formText(form, 'client_name').trim() || null},
              event_date = ${formText(form, 'event_date').trim() || null}, gallery_url = ${galleryUrl},
              gallery_password = ${galleryPassword}, slug = ${slug}, status = ${status}, thumbnail_path = ${thumbnailPath}
              where id = ${event.id}`;
    // Notify exactly on the transition into photos_ready.
    if (status === 'photos_ready' && !wasPhotosReady && galleryUrl) {
      return sql`select * from accurova_live_event.email_signups where event_id = ${event.id} and notified_at is null`;
    }
    return null;
  });

  let message = 'Event updated.';
  if (signups) {
    let sent = 0;
    for (const s of signups) {
      try {
        if (await sendEmail(env, s.email, `Your photos from ${name} are ready`, photosReadyEmailHtml(name, galleryUrl, galleryPassword))) {
          await withDb(env, ctx, (sql) => sql`update accurova_live_event.email_signups
            set notified_at = to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS') where id = ${s.id}`);
          sent++;
        }
      } catch (err) {
        console.log(`[admin] failed to notify signup ${s.id}: ${err.message}`); // keep looping through remaining recipients
      }
    }
    message = `Event updated. Notified ${sent}/${signups.length} signups.`;
  }
  return redirect(`/admin/events/${event.id}?message=${encodeURIComponent(message)}`);
}

// ── entry ────────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    try {
      if (path.startsWith('/static/')) return env.ASSETS.fetch(request);
      if (path.startsWith('/uploads/') && method === 'GET') {
        const obj = env.UPLOADS ? await env.UPLOADS.get(uploadKey(path)) : null;
        if (!obj) return json({ detail: 'Not Found' }, 404);
        const headers = new Headers();
        obj.writeHttpMetadata(headers);
        headers.set('ETag', obj.httpEtag);
        return new Response(obj.body, { headers });
      }
      if (path === '/healthz') {
        const db = await dbCheck(env, ctx);
        return db === 'ok' ? json({ status: 'ok', env: 'production' }) : json({ status: 'error', detail: db }, 503);
      }
      if (path === '/' && method === 'GET') return await home(request, env, ctx);
      if (path === '/contact.vcf' && method === 'GET') return vcard(env);
      if (path === '/enquiry' && method === 'POST') return await publicApi(request, env, ctx, 'enquiry', null);
      const ev = /^\/e\/([^/]+)(?:\/(signup|enquiry))?$/.exec(path);
      if (ev) {
        const slug = decodeURIComponent(ev[1]);
        if (!ev[2] && method === 'GET') return await eventLanding(env, ctx, slug);
        if (ev[2] && method === 'POST') return await publicApi(request, env, ctx, ev[2], slug);
      }
      if (path === '/admin' || path.startsWith('/admin/')) return await admin(request, env, ctx, path);
      return json({ detail: 'Not Found' }, 404);
    } catch (err) {
      if (err instanceof HttpError) return json({ detail: err.message }, err.status);
      console.log(JSON.stringify({ svc: 'accurova-live-event', path, error: String(err?.message) }));
      return json({ detail: 'Internal Server Error' }, 500);
    }
  }
};
