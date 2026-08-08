-- live-event.accurova.com schema (Postgres variant)
-- Raw SQL, no ORM. Safe to run repeatedly (IF NOT EXISTS).
-- Mirrors schema.sql (SQLite) — keep both in sync when the shape changes.
-- created_at/notified_at stay TEXT with the same "YYYY-MM-DD HH:MM:SS" format
-- SQLite's datetime('now') produces, so templates/admin views don't need to
-- change formatting per backend.

CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    client_name TEXT,
    event_date TEXT,                 -- ISO date string (YYYY-MM-DD)
    gallery_url TEXT,                -- nullable; set by admin once LuxSync gallery is ready
    gallery_password TEXT,           -- nullable; shown with a copy-to-clipboard button on the public page
    thumbnail_path TEXT,             -- nullable; web path to an uploaded thumbnail (e.g. /uploads/event_3.jpg)
    show_on_homepage INTEGER NOT NULL DEFAULT 1,  -- 0/1; admin-controlled visibility in the homepage carousel
    status TEXT NOT NULL DEFAULT 'upcoming'  -- upcoming | live | photos_ready
        CHECK (status IN ('upcoming', 'live', 'photos_ready')),
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS email_signups (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name TEXT,                       -- nullable for rows created before the name field existed
    email TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS'),
    notified_at TEXT,
    UNIQUE(event_id, email)
);

CREATE TABLE IF NOT EXISTS enquiries (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    company TEXT,
    email TEXT NOT NULL,
    event_type TEXT,
    message TEXT,
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE INDEX IF NOT EXISTS idx_email_signups_event_id ON email_signups(event_id);
CREATE INDEX IF NOT EXISTS idx_enquiries_event_id ON enquiries(event_id);
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
