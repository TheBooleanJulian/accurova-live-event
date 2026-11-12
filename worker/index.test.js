// node --test   The Worker against a real (embedded) Postgres: PGlite runs the thebooleanjulian-db migration for
// accurova_live_event, and a small adapter gives it the postgres.js tagged-template shape (env.SQL, as bot-core/db allows).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import worker, { slugify, toCsv, extractPreviewImageUrl, createSessionToken } from './index.js';
import { esc } from './views.js';

const MIGRATION = process.env.SCHEMA_FALLBACK
  ? new URL('file:///nonexistent.sql')
  : new URL('../../thebooleanjulian-db/supabase/migrations/20261112090000_accurova_live_event.sql', import.meta.url);

let db;
function sqlAdapter(pg) {
  const sql = async (strings, ...values) => {
    const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ''), '');
    const res = await pg.query(text, values);
    return Object.assign(res.rows, { count: res.affectedRows ?? res.rows.length });
  };
  return sql;
}

// In-memory R2 stand-in.
function bucket() {
  const objects = new Map();
  return {
    objects,
    async put(k, v, opts) { objects.set(k, { body: v, type: opts?.httpMetadata?.contentType, uploaded: new Date() }); },
    async get(k) { const o = objects.get(k); return o && { body: o.body, httpEtag: '"x"', writeHttpMetadata: (h) => h.set('Content-Type', o.type) }; },
    async head(k) { const o = objects.get(k); return o && { uploaded: o.uploaded }; },
    async delete(k) { objects.delete(k); }
  };
}

let env;
before(async () => {
  db = new PGlite();
  if (existsSync(MIGRATION)) {
    await db.exec(readFileSync(MIGRATION, 'utf8')); // the exact migration file, role creation and grants included
  } else {
    // No sibling thebooleanjulian-db clone (e.g. CI): the repo's own Postgres schema has the same tables.
    await db.exec('create schema accurova_live_event; set search_path = accurova_live_event;');
    await db.exec(readFileSync(new URL('../migrations/schema_postgres.sql', import.meta.url), 'utf8'));
    await db.exec('set search_path = public;');
  }
  env = {
    SQL: sqlAdapter(db),
    UPLOADS: bucket(),
    ADMIN_PASSWORD: 'pw',
    SESSION_SECRET: 's'.repeat(40),
    ASSETS: { fetch: async () => new Response('asset') },
    FORM_LIMIT: { limit: async () => ({ success: true }) }
  };
});

const ctx = { waitUntil() {} };
const call = (path, init = {}, e = env) => worker.fetch(new Request('https://live-event.accurova.com' + path, init), e, ctx);
const jsonPost = (path, body, e) => call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, e);
const form = (fields) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v); return f; };
let cookie;
async function login() {
  if (cookie) return cookie;
  const res = await call('/admin/login', { method: 'POST', body: form({ password: 'pw' }) });
  assert.equal(res.status, 303);
  cookie = res.headers.get('Set-Cookie').split(';')[0];
  return cookie;
}
const adminCall = async (path, init = {}) => call(path, { ...init, headers: { ...(init.headers || {}), Cookie: await login() } });

test('helpers: slugify, CSV quoting, og:image extraction, escaping', () => {
  assert.equal(slugify('  Tech Summit 2026! '), 'tech-summit-2026');
  assert.equal(slugify('***'), 'event');
  assert.equal(toCsv([{ a: 'x,y', b: 'say "hi"', c: null }], ['a', 'b', 'c']), 'a,b,c\r\n"x,y","say ""hi""",\r\n');
  assert.equal(extractPreviewImageUrl('<meta property="og:image" content="https://g/p.jpg">'), 'https://g/p.jpg');
  assert.equal(extractPreviewImageUrl('<meta content="/x.png" name="twitter:image" />'), '/x.png');
  assert.equal(esc('<a href="x">\'&'), '&lt;a href=&#34;x&#34;&gt;&#39;&amp;');
});

test('admin is locked without credentials and without ADMIN_PASSWORD/SESSION_SECRET', async () => {
  assert.equal((await call('/admin')).headers.get('Location'), '/admin/login');
  const bad = await call('/admin/login', { method: 'POST', body: form({ password: 'nope' }) });
  assert.equal(bad.status, 401);
  assert.match(await bad.text(), /Incorrect password\./);
  const noSecrets = { ...env, ADMIN_PASSWORD: undefined, SESSION_SECRET: undefined };
  assert.equal((await call('/admin/login', { method: 'POST', body: form({ password: 'changeme' }) }, noSecrets)).status, 401);
  const forged = await createSessionToken({ SESSION_SECRET: 'other' });
  assert.equal((await call('/admin', { headers: { Cookie: `accurova_admin_session=${forged}` } })).headers.get('Location'), '/admin/login');
});

test('create event → public page → signup (dedup) → enquiry → admin lists + CSV', async () => {
  let res = await adminCall('/admin/events', { method: 'POST', body: form({ name: 'Tech Summit <2026>', client_name: 'Acme', event_date: '2026-12-01', slug: '' }) });
  assert.equal(res.headers.get('Location'), '/admin');
  res = await adminCall('/admin/events', { method: 'POST', body: form({ name: 'Tech Summit <2026>' }) });
  const slugs = (await db.query('select slug from accurova_live_event.events order by id')).rows.map((r) => r.slug);
  assert.deepEqual(slugs, ['tech-summit-2026', 'tech-summit-2026-2']);

  const page = await call('/e/tech-summit-2026');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('Cache-Control'), /no-store/);
  const body = await page.text();
  assert.match(body, /<h1 class="event-name">Tech Summit &lt;2026&gt;<\/h1>/);
  assert.match(body, /Acme &middot; 2026-12-01/);
  assert.match(body, /id="signup-form"/);
  assert.match(body, /data-slug="tech-summit-2026"/);

  assert.deepEqual(await (await jsonPost('/e/tech-summit-2026/signup', { name: ' Ann ', email: ' ANN@X.COM ' })).json(), { ok: true });
  assert.deepEqual(await (await jsonPost('/e/tech-summit-2026/signup', { name: 'Ann', email: 'ann@x.com' })).json(), { ok: true });
  const bad = await jsonPost('/e/tech-summit-2026/signup', { name: 'Ann', email: 'nope' });
  assert.equal(bad.status, 422);
  assert.equal(typeof (await bad.json()).detail, 'string'); // the page shows data.detail as text
  assert.equal((await jsonPost('/e/missing/signup', { name: 'A', email: 'a@b.co' })).status, 404);
  await jsonPost('/e/tech-summit-2026/enquiry', { name: 'Bob', email: 'BOB@Y.COM', company: ' Y Co ', message: 'Need, "quote"' });
  await jsonPost('/enquiry', { name: 'Cy', email: 'cy@z.co' });

  const signups = (await db.query('select name, email from accurova_live_event.email_signups')).rows;
  assert.deepEqual(signups, [{ name: 'Ann', email: 'ann@x.com' }]);

  const dash = await (await adminCall('/admin')).text();
  assert.match(dash, /Tech Summit &lt;2026&gt;/);
  assert.match(dash, /<td>1<\/td>/); // signup count
  const csv = await (await adminCall('/admin/enquiries.csv')).text();
  assert.match(csv, /^event_name,name,company,email,event_type,message,created_at\r\n/);
  assert.match(csv, /Tech Summit <2026>,Bob,Y Co,bob@y.com,,"Need, ""quote""",/);
  assert.match(csv, /Unassigned,Cy,,cy@z.co,,,/);
  assert.match(await (await adminCall('/admin/signups')).text(), /All email signups \(1\)/);
});

test('photos_ready: public page swaps to the gallery card; delete confirmation is a valid attribute', async () => {
  const [{ id }] = (await db.query("select id from accurova_live_event.events where slug = 'tech-summit-2026'")).rows;
  const res = await adminCall(`/admin/events/${id}`, { method: 'POST', body: form({ name: 'Tech "Summit"', slug: 'tech-summit-2026', status: 'photos_ready', gallery_url: 'https://gallery.example/x', gallery_password: 'p@ss' }) });
  assert.match(decodeURIComponent(res.headers.get('Location')), /Event updated\. Notified 0\/1 signups\./); // no email provider configured
  const page = await (await call('/e/tech-summit-2026')).text();
  assert.match(page, /Your photos are ready/);
  assert.match(page, /<code id="gallery-password-value">p@ss<\/code>/);
  assert.doesNotMatch(page, /id="signup-form"/);

  const detail = await (await adminCall(`/admin/events/${id}`)).text();
  const onsubmit = /onsubmit="([^"]*)"/.exec(detail)[1];
  assert.equal(onsubmit, "return confirm('Delete ' + &#34;Tech \\&#34;Summit\\&#34;&#34; + '? This cannot be undone.');");
  assert.match(detail, /<option value="photos_ready" selected>/);
});

test('thumbnail upload goes to R2, is served at /uploads, and is cache-busted on the homepage', async () => {
  const [{ id }] = (await db.query("select id from accurova_live_event.events where slug = 'tech-summit-2026-2'")).rows;
  const f = form({ name: 'Second', slug: 'tech-summit-2026-2', status: 'upcoming' });
  f.append('thumbnail', new File([new Uint8Array([1, 2, 3])], 'pic.png', { type: 'image/png' }));
  await adminCall(`/admin/events/${id}`, { method: 'POST', body: f });
  assert.ok(env.UPLOADS.objects.has(`event_${id}.png`));
  const img = await call(`/uploads/event_${id}.png`);
  assert.equal(img.headers.get('Content-Type'), 'image/png');
  const home = await (await call('/')).text();
  assert.match(home, new RegExp(`/uploads/event_${id}\\.png\\?v=\\d{10}`));

  const bad = form({ name: 'Second', status: 'upcoming' });
  bad.append('thumbnail', new File(['x'], 'a.gif', { type: 'image/gif' }));
  assert.equal((await adminCall(`/admin/events/${id}`, { method: 'POST', body: bad })).status, 400);

  await adminCall(`/admin/events/${id}/delete`, { method: 'POST' });
  assert.equal(env.UPLOADS.objects.has(`event_${id}.png`), false);
  assert.equal((await call('/e/tech-summit-2026-2')).status, 404);
});

test('rate limit, vCard, healthz, 404s', async () => {
  const limited = { ...env, FORM_LIMIT: { limit: async () => ({ success: false }) } };
  assert.equal((await jsonPost('/enquiry', { name: 'x', email: 'x@y.co' }, limited)).status, 429);
  const v = await call('/contact.vcf');
  assert.equal(await v.text(), 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Julian Cheung (Photographer Accurova)\r\nN:Cheung;Julian;;;\r\nORG:Accurova\r\nTEL;TYPE=CELL,VOICE:+6598566543\r\nURL:https://accurova.com/\r\nEND:VCARD\r\n');
  assert.deepEqual(await (await call('/healthz')).json(), { status: 'ok', env: 'production' });
  assert.equal((await call('/nope')).status, 404);
  assert.match(await (await call('/e/nope')).text(), /Event not found/);
});

test('every static file the views reference exists in app/static', () => {
  for (const p of ['css/style.css', 'img/accurova-live-event.png', 'js/event.js', 'js/home.js']) {
    assert.ok(existsSync(new URL(`../app/static/${p}`, import.meta.url)), p);
  }
});
