// HTML views for the Worker: app/templates/*.html (Jinja) as JS functions. Markup is unchanged; every interpolated
// value goes through esc(), the equivalent of Jinja's autoescape. The two inline <script> blocks now live in
// app/static/js/{event,home}.js (the event slug is passed with a data- attribute), so nothing here is a template
// literal inside a template literal.

export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&#34;').replace(/'/g, '&#39;');
}

const or = (v, fallback) => (v === null || v === undefined || v === '' ? fallback : v);
const head = (title, assetV, extra = '', viewport = 'width=device-width, initial-scale=1.0') => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="${viewport}" />
<title>${title}</title>${extra}
<link rel="stylesheet" href="/static/css/style.css?v=${esc(assetV)}" />
</head>`;

const LOGO = '<a href="/"><img src="/static/img/accurova-live-event.png" alt="Accurova Live Event" class="brand-logo" /></a>';
const ADMIN_LOGO = '<a href="/"><img src="/static/img/accurova-live-event.png" alt="Accurova Live Event" class="brand-logo" style="max-width:220px;" /></a>';
const ICON_CAMERA = '<span class="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.6-2.2h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.2" r="3.3"/></svg></span>';
const ICON_LOCK = '<span class="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></span>';
const ICON_SEARCH = '<span class="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4.3-4.3"/></svg></span>';
const ICON_MAIL = '<span class="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="13" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/></svg></span>';

const HERO = `  <div class="brand-header">
    ${LOGO}
  </div>
  <p class="hero-tagline">Corporate Event Photography</p>
  <p class="hero-rating"><span class="stars">★★★★★</span> 5.0 Google &middot; Trusted by leading companies in Singapore</p>

  <hr class="hairline" />`;

// Badges, soft-sell card, contact grid, enquiry form and footer: shared by the event page and the homepage.
const bottom = (c) => `
  <div class="badge-row">
    <a class="badge" href="${esc(c.sme_award_url)}" target="_blank" rel="noopener">SME500 AWARD 2026</a>
    <a class="badge" href="${esc(c.google_reviews_url)}" target="_blank" rel="noopener">★ 5.0 GOOGLE</a>
    <span class="badge">FEATURED IN STRAITS TIMES + LHZB</span>
  </div>

  <div class="card">
    <p class="section-title">Planning your next corporate event?</p>
    <p class="card-desc">Accurova helps companies photograph:</p>
    <ul class="soft-sell-list">
      <li>Conferences</li>
      <li>Networking events</li>
      <li>Product launches</li>
      <li>Awards ceremonies</li>
      <li>Executive events</li>
    </ul>
    <p class="card-desc">Fast turnaround. Professional editing. Corporate-focused.</p>
    <button class="btn btn-primary" id="open-enquiry">Request a Quote</button>
  </div>

  <div class="contact-grid">
    <a class="card contact-card" href="${esc(c.whatsapp_url)}" target="_blank" rel="noopener">
      <span class="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 11.9a8.4 8.4 0 0 1-12.2 7.5L4 20.5l1.2-4.2a8.4 8.4 0 1 1 15.3-4.4z"/><path d="M8.7 10.6c.3 2.5 2.2 4.4 4.7 4.7.7.1 1.2-.5.9-1.1l-.5-1a.6.6 0 0 0-.7-.3l-.9.3a4 4 0 0 1-2.1-2.1l.3-.9a.6.6 0 0 0-.3-.7l-1-.5c-.6-.3-1.2.2-1.1.9z"/></svg></span>
      <p class="card-title">WhatsApp</p>
    </a>
    <a class="card contact-card" href="${esc(c.portfolio_url)}" target="_blank" rel="noopener">
      <span class="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M8 7.5v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12.5h18"/></svg></span>
      <p class="card-title">Portfolio</p>
    </a>
    <a class="card contact-card" href="${esc(c.linkedin_url)}" target="_blank" rel="noopener">
      <span class="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 10.5v6M8 7.5v.01"/><path d="M11.5 16.5v-3.6a2.4 2.4 0 0 1 4.8 0v3.6M11.5 16.5v-6"/></svg></span>
      <p class="card-title">LinkedIn</p>
    </a>
    <a class="card contact-card" href="/contact.vcf">
      <span class="card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.1"/><path d="M6 16c.5-1.7 1.9-2.6 3-2.6s2.5.9 3 2.6"/><path d="M14.5 9.5h4M14.5 13h4"/></svg></span>
      <p class="card-title">Save Contact</p>
    </a>
  </div>

  <!-- Enquiry form (hidden until opened) -->
  <div class="card" id="enquiry-card" style="display:none;">
    ${ICON_MAIL}
    <p class="card-title">Tell us about your event</p>
    <form id="enquiry-form">
      <input type="text" name="name" placeholder="Your name" required />
      <input type="text" name="company" placeholder="Company" />
      <input type="email" name="email" placeholder="Email" required />
      <select name="event_type">
        <option value="">Event type</option>
        <option value="corporate_conference">Corporate conference</option>
        <option value="product_launch">Product launch</option>
        <option value="gala_dinner">Gala / dinner</option>
        <option value="branding_shoot">Branding shoot</option>
        <option value="other">Other</option>
      </select>
      <textarea name="message" placeholder="A little about your event"></textarea>
      <button type="submit" class="btn btn-primary">Send Enquiry</button>
    </form>
    <div id="enquiry-status" class="status-msg"></div>
  </div>

  <footer>
    ACCUROVA &middot; CORPORATE PHOTOGRAPHY &amp; DIGITAL MEDIA<br />
    Built by <a href="https://github.com/TheBooleanJulian">@TheBooleanJulian</a>
  </footer>
</div>`;

const isLive = (e, today) => e.event_date === today || e.status === 'live';
const thumbSrc = (c, path) => `${esc(path)}?v=${esc(c.thumb_v(path))}`;
const PUBLIC_VIEWPORT = 'width=device-width, initial-scale=1.0, maximum-scale=1';

// public/generic.html — the bare-domain homepage.
export function genericPage(c) {
  const latest = c.latest_event;
  let carousel = '';
  if (latest) {
    const latestLive = isLive(latest, c.today);
    const past = c.past_events.map((e) => {
      const live = isLive(e, c.today);
      return `
      <a class="carousel-card${live ? ' is-live' : ''}" href="/e/${esc(e.slug)}">
        <img src="${thumbSrc(c, e.thumbnail_path)}" alt="${esc(e.name)}" class="carousel-card-thumb" loading="lazy" />
        <div class="carousel-card-body">
          <p class="card-title" style="margin:0;">${esc(e.name)}</p>
          ${live ? '<p class="live-badge" style="margin:6px 0 0;"><span class="live-dot">🔴</span> LIVE NOW</p>' : ''}
        </div>
      </a>`;
    }).join('');
    carousel = `
  <div class="event-carousel-wrap">
    <div class="event-carousel" id="event-carousel">
      <a class="carousel-card carousel-card-featured${latestLive ? ' is-live' : ''}" href="/e/${esc(latest.slug)}">
        ${latest.thumbnail_path ? `<img src="${thumbSrc(c, latest.thumbnail_path)}" alt="${esc(latest.name)}" class="carousel-card-thumb" />` : ''}
        <div class="carousel-card-body">
          <p class="section-title" style="margin:0 0 4px;">Latest event</p>
          <p class="card-title" style="margin:0 0 2px;">${esc(latest.name)}</p>
          ${latest.event_date ? `<p class="card-desc" style="margin:0;">${esc(latest.event_date)}</p>` : ''}
          ${latestLive ? '<p class="live-badge" style="margin:0;"><span class="live-dot">🔴</span> LIVE NOW</p>' : ''}
        </div>
      </a>${past}
    </div>
    ${c.past_events.length ? `<button type="button" class="carousel-arrow carousel-arrow-prev" id="carousel-prev" aria-label="Previous">&larr;</button>
    <button type="button" class="carousel-arrow carousel-arrow-next" id="carousel-next" aria-label="Next">&rarr;</button>` : ''}
  </div>`;
  }
  return `${head('Accurova · Photography &amp; Digital Media', c.asset_v,
    '\n<meta name="description" content="Accurova — premium photography and digital media studio, Singapore." />', PUBLIC_VIEWPORT)}
<body>
<div class="wrap">

${HERO}
${carousel}
${bottom(c)}

<script src="/static/js/home.js?v=${esc(c.asset_v)}"></script>
</body>
</html>`;
}

// public/index.html — one event's landing page (/e/:slug).
export function eventPage(c) {
  const e = c.event;
  const live = isLive(e, c.today);
  const ready = e.status === 'photos_ready' && e.gallery_url;
  const primary = ready ? `
  <div class="card card-primary${live ? ' is-live' : ''}">
    ${ICON_CAMERA}
    <p class="card-title">Your photos are ready</p>
    <p class="card-desc">The full gallery from today's event has been processed and is ready to view and download.</p>
    ${e.gallery_password ? `<div class="gallery-password">
      <span class="gallery-password-label">Gallery password — copied automatically when you tap below</span>
      <div class="gallery-password-row">
        <code id="gallery-password-value">${esc(e.gallery_password)}</code>
        <button type="button" class="btn-copy" id="copy-password-btn">Copy</button>
      </div>
    </div>` : ''}
    <a class="btn btn-gold" href="${esc(e.gallery_url)}" target="_blank" rel="noopener" id="view-gallery-link">View &amp; Download Photos</a>
    <p id="gallery-password-copied-note" class="form-note" style="display:none;">Password copied — paste it if the gallery site asks.</p>
  </div>` : `
  <div class="card card-primary${live ? ' is-live' : ''}">
    ${ICON_CAMERA}
    <p class="card-title">Get today's event photos</p>
    <p class="card-desc">Photos are still being processed. Leave your email and we'll notify you the moment they're ready.</p>
    <form id="signup-form">
      <input type="text" id="signup-name" name="name" placeholder="Your name" required autocomplete="name" />
      <input type="email" id="signup-email" name="email" placeholder="you@company.com" required autocomplete="email" />
      <button type="submit" class="btn btn-gold">Notify Me</button>
    </form>
    <div id="signup-status" class="status-msg"></div>
    <p class="form-note">We'll only use this to send your event photo link. No spam.</p>
  </div>`;
  const passwordCard = e.gallery_password && !ready ? `
  <div class="card">
    ${ICON_LOCK}
    <p class="card-title">Gallery password</p>
    <div class="gallery-password-row">
      <code id="gallery-password-value">${esc(e.gallery_password)}</code>
      <button type="button" class="btn-copy" id="copy-password-btn">Copy</button>
    </div>
  </div>` : '';
  return `${head(`${esc(e.name)} · Accurova`, c.asset_v,
    `\n<meta name="description" content="Official photography partner for ${esc(e.name)}. Get your event photos, connect with Accurova." />`, PUBLIC_VIEWPORT)}
<body>
<div class="wrap">

${HERO}

  <p class="eyebrow">Official Photography Partner</p>
  <h1 class="event-name">${esc(e.name)}</h1>
  <p class="event-meta">${e.client_name ? `${esc(e.client_name)} &middot; ` : ''}${esc(or(e.event_date, ''))}</p>
  ${live ? '<div class="live-badge"><span class="live-dot">🔴</span> LIVE NOW</div>' : ''}

  ${e.thumbnail_path ? `<img src="${thumbSrc(c, e.thumbnail_path)}" alt="${esc(e.name)}" class="event-thumb" />` : ''}
${primary}
${passwordCard}
${bottom(c)}

<script src="/static/js/event.js?v=${esc(c.asset_v)}" data-slug="${esc(e.slug)}"></script>
</body>
</html>`;
}

// public/not_found.html
export function notFoundPage(c) {
  return `${head('Event not found · Accurova', c.asset_v)}
<body>
<div class="wrap">
  <div class="brand-header">
    ${LOGO}
  </div>
  <hr class="hairline" />
  <div class="card">
    ${ICON_SEARCH}
    <p class="card-title">Event not found</p>
    <p class="card-desc">This link doesn't match a live event. Please check the QR code or contact the Accurova team.</p>
    <a class="btn btn-primary" href="${esc(c.whatsapp_url)}" target="_blank" rel="noopener">Message us at ${esc(c.whatsapp_display_number)}</a>
  </div>
</div>
</body>
</html>`;
}

// admin/login.html
export function loginPage(c) {
  return `${head('Admin Login · Accurova', c.asset_v)}
<body>
<div class="wrap">
  <div class="brand-header">
    ${LOGO}
  </div>
  <p class="eyebrow">Admin</p>
  <hr class="hairline" />
  <div class="card card-primary">
    <p class="card-title">Admin login</p>
    ${c.error ? `<div class="status-msg show err">${esc(c.error)}</div>` : ''}
    <form method="post" action="/admin/login">
      <input type="password" name="password" placeholder="Admin password" required autofocus />
      <button type="submit" class="btn btn-primary">Log in</button>
    </form>
  </div>
</div>
</body>
</html>`;
}

const adminTop = (crumb, linkHref, linkText, marginTop = 4) => `  <div class="top-bar">
    <div>
      ${ADMIN_LOGO}
      <p class="eyebrow" style="margin-top:${marginTop}px;">${crumb}</p>
    </div>
    <a class="link-btn" href="${linkHref}">${linkText}</a>
  </div>
  <hr class="hairline" />`;

// admin/dashboard.html
export function dashboardPage(c) {
  const rows = c.events.length ? c.events.map((e) => `
        <tr>
          <td>${esc(e.name)}<br /><span style="color:var(--ink-faint); font-family:var(--font-mono); font-size:10px;">/e/${esc(e.slug)}</span></td>
          <td><span class="status-pill status-${esc(e.status)}">${esc(e.status)}</span></td>
          <td>${esc(or(e.event_date, '—'))}</td>
          <td>${esc(e.signup_count)}</td>
          <td>
            <form method="post" action="/admin/events/${esc(e.id)}/toggle-homepage">
              <input type="checkbox" name="show_on_homepage" value="on" style="width:auto;" ${e.show_on_homepage ? 'checked' : ''} onchange="this.form.requestSubmit()" />
            </form>
          </td>
          <td class="row-actions">
            <a href="/admin/events/${esc(e.id)}">Manage</a>
            <a href="/e/${esc(e.slug)}" target="_blank">View public page</a>
          </td>
        </tr>`).join('') : `
        <tr><td colspan="6" style="color:var(--ink-faint);">No events yet.</td></tr>`;
  return `${head('Admin · Accurova', c.asset_v)}
<body>
<div class="admin-wrap">
${adminTop('Admin / Events', '/admin/logout', 'Log out')}

  <div class="card card-primary">
    <p class="card-title">Create event</p>
    <form method="post" action="/admin/events">
      <input type="text" name="name" placeholder="Event name" required />
      <input type="text" name="client_name" placeholder="Client name" />
      <input type="text" name="event_date" placeholder="Event date (YYYY-MM-DD)" />
      <input type="text" name="slug" placeholder="Slug (leave blank to auto-generate)" />
      <button type="submit" class="btn btn-primary">Create Event</button>
    </form>
  </div>

  <div class="card">
    <p class="card-title">Data</p>
    <p class="card-desc">All signups and enquiries across every event, in one place.</p>
    <a class="btn btn-outline" href="/admin/signups">View Email Signups</a>
    <a class="btn btn-outline" href="/admin/enquiries">View Enquiries</a>
  </div>

  <div class="card">
    <p class="card-title">All events</p>
    <div class="table-scroll">
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Status</th>
          <th>Date</th>
          <th>Signups</th>
          <th>On homepage</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}
      </tbody>
    </table>
    </div>
  </div>
</div>
</body>
</html>`;
}

// admin/event_detail.html
export function eventDetailPage(c) {
  const e = c.event;
  const opt = (v) => `<option value="${v}" ${e.status === v ? 'selected' : ''}>${v}</option>`;
  // Jinja's `{{ event.name|tojson }}` inside onsubmit="…" emitted raw double quotes, which ended the attribute early, so
  // the confirm() never ran. Here the JSON string is attribute-escaped (&#34;), which the browser decodes back to quotes.
  const confirmName = esc(JSON.stringify(String(e.name)));
  return `${head(`${esc(e.name)} · Admin · Accurova`, c.asset_v)}
<body>
<div class="admin-wrap">
${adminTop(`Admin / ${esc(e.name)}`, '/admin', '&larr; All events')}

  ${c.message ? `<div class="status-msg show ok">${esc(c.message)}</div>` : ''}
  ${c.error ? `<div class="status-msg show err">${esc(c.error)}</div>` : ''}

  <div class="card card-primary">
    <p class="card-title">Event settings</p>
    <form method="post" action="/admin/events/${esc(e.id)}" enctype="multipart/form-data">
      <input type="text" name="name" value="${esc(e.name)}" placeholder="Event name" required />
      <input type="text" name="client_name" value="${esc(or(e.client_name, ''))}" placeholder="Client name" />
      <input type="text" name="event_date" value="${esc(or(e.event_date, ''))}" placeholder="Event date (YYYY-MM-DD)" />
      <input type="text" name="gallery_url" value="${esc(or(e.gallery_url, ''))}" placeholder="LuxSync gallery URL" />
      <input type="text" name="gallery_password" value="${esc(or(e.gallery_password, ''))}" placeholder="Gallery password (optional)" />
      <label class="form-note" style="display:block; margin-bottom:6px;">Slug — public page is at /e/${esc(e.slug)}</label>
      <input type="text" name="slug" value="${esc(e.slug)}" placeholder="event-slug" />
      <select name="status">
        ${opt('upcoming')}
        ${opt('live')}
        ${opt('photos_ready')}
      </select>

      <label class="form-note" style="display:block; margin-bottom:6px;">Thumbnail (shown in the "past events" showcase on the homepage)</label>
      ${e.thumbnail_path ? `<div style="margin-bottom:10px;">
        <img src="${thumbSrc(c, e.thumbnail_path)}" alt="" style="max-width:160px; border-radius:6px; border:1px solid var(--hairline); display:block; margin-bottom:6px;" />
        <label style="font-size:12px; color:var(--ink-dim);"><input type="checkbox" name="remove_thumbnail" style="width:auto; margin-right:6px;" /> Remove thumbnail</label>
      </div>` : ''}
      <p class="form-note">Upload manually, or save a gallery URL above and pull its preview image automatically:</p>
      <input type="file" name="thumbnail" accept="image/jpeg,image/png,image/webp" />

      <p class="form-note">Setting status to <strong>photos_ready</strong> (with a gallery URL) swaps the public page to the direct download button and emails everyone on the signup list for this event.</p>
      <button type="submit" class="btn btn-primary">Save Changes</button>
    </form>
    ${e.gallery_url ? `<form method="post" action="/admin/events/${esc(e.id)}/fetch-thumbnail" style="margin-top:10px;">
      <button type="submit" class="btn btn-outline">Pull thumbnail from gallery</button>
    </form>` : ''}
  </div>

  <div class="card">
    <p class="card-title">Signups &amp; enquiries</p>
    <p class="card-desc">Now tracked centrally, across all events, from the dashboard.</p>
    <a class="btn btn-outline" href="/admin/signups">View Email Signups</a>
    <a class="btn btn-outline" href="/admin/enquiries">View Enquiries</a>
  </div>

  <div class="card" style="border-color: rgba(200,60,60,0.35); background: rgba(200,60,60,0.04);">
    <p class="card-title">Delete event</p>
    <p class="card-desc">Permanently deletes this event, its thumbnail, and all email signups. Enquiries are kept but unlinked from this event. This cannot be undone.</p>
    <form method="post" action="/admin/events/${esc(e.id)}/delete" onsubmit="return confirm('Delete ' + ${confirmName} + '? This cannot be undone.');">
      <button type="submit" class="btn" style="background:#c83c3c; color:#fff;">Delete Event</button>
    </form>
  </div>
</div>
</body>
</html>`;
}

// admin/signups.html
export function signupsPage(c) {
  const rows = c.signups.length ? c.signups.map((s) => `
        <tr>
          <td>${esc(or(s.name, '—'))}</td>
          <td>${esc(s.email)}</td>
          <td>${esc(s.event_name)}</td>
          <td>${esc(s.created_at)}</td>
          <td>${esc(or(s.notified_at, '—'))}</td>
        </tr>`).join('') : `
        <tr><td colspan="5" style="color:var(--ink-faint);">No signups yet.</td></tr>`;
  return `${head('Email Signups · Admin · Accurova', c.asset_v)}
<body>
<div class="admin-wrap">
${adminTop('Admin / Email Signups', '/admin', '&larr; Dashboard', 8)}

  <div class="card">
    <p class="card-title">All email signups (${c.signups.length})</p>
    <a class="link-btn" href="/admin/signups.csv">Export CSV</a>
    <div class="table-scroll">
    <table>
      <thead><tr><th>Name</th><th>Email</th><th>Event</th><th>Signed up</th><th>Notified</th></tr></thead>
      <tbody>${rows}
      </tbody>
    </table>
    </div>
  </div>
</div>
</body>
</html>`;
}

// admin/enquiries.html
export function enquiriesPage(c) {
  const rows = c.enquiries.length ? c.enquiries.map((q) => `
        <tr>
          <td>${esc(q.name)}</td>
          <td>${esc(or(q.company, '—'))}</td>
          <td>${esc(q.email)}</td>
          <td>${esc(or(q.event_type, '—'))}</td>
          <td>${esc(or(q.message, '—'))}</td>
          <td>${esc(q.event_name)}</td>
          <td>${esc(q.created_at)}</td>
        </tr>`).join('') : `
        <tr><td colspan="7" style="color:var(--ink-faint);">No enquiries yet.</td></tr>`;
  return `${head('Enquiries · Admin · Accurova', c.asset_v)}
<body>
<div class="admin-wrap">
${adminTop('Admin / Enquiries', '/admin', '&larr; Dashboard', 8)}

  <div class="card">
    <p class="card-title">All enquiries (${c.enquiries.length})</p>
    <a class="link-btn" href="/admin/enquiries.csv">Export CSV</a>
    <div class="table-scroll">
    <table>
      <thead><tr><th>Name</th><th>Company</th><th>Email</th><th>Type</th><th>Message</th><th>Event</th><th>Date</th></tr></thead>
      <tbody>${rows}
      </tbody>
    </table>
    </div>
  </div>
</div>
</body>
</html>`;
}
