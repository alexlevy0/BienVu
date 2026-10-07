CREATE TABLE map_images (
  id TEXT PRIMARY KEY CHECK(length(id)=64),
  state TEXT NOT NULL CHECK(state IN ('preparing','ready','failed')),
  owner TEXT NOT NULL,
  lease_until INTEGER NOT NULL,
  object_key TEXT,
  sha256 TEXT,
  mime TEXT CHECK(mime IN ('image/jpeg','image/png')),
  size_bytes INTEGER,
  captured_at TEXT
);
CREATE TABLE map_request_limits (
  bucket TEXT PRIMARY KEY,
  used INTEGER NOT NULL DEFAULT 0 CHECK(used>=0),
  expires_at INTEGER NOT NULL
);
CREATE INDEX map_request_limits_expiry ON map_request_limits(expires_at);
