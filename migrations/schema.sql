-- live-event.accurova.com schema
-- Raw SQL, no ORM. Safe to run repeatedly (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    client_name TEXT,
    event_date TEXT,                 -- ISO date string (YYYY-MM-DD)
    gallery_url TEXT,                -- nullable; set by admin once LuxSync gallery is ready
    thumbnail_path TEXT,             -- nullable; web path to an uploaded thumbnail (e.g. /uploads/event_3.jpg)
    status TEXT NOT NULL DEFAULT 'upcoming'  -- upcoming | live | photos_ready
        CHECK (status IN ('upcoming', 'live', 'photos_ready')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_signups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    notified_at TEXT,
    UNIQUE(event_id, email)
);

CREATE TABLE IF NOT EXISTS enquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    company TEXT,
    email TEXT NOT NULL,
    event_type TEXT,
    message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_email_signups_event_id ON email_signups(event_id);
CREATE INDEX IF NOT EXISTS idx_enquiries_event_id ON enquiries(event_id);
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
