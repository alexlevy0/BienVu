-- Sondes isolées ; ni comptes clients ni quotas commerciaux au sprint 00.
CREATE TABLE IF NOT EXISTS probe_sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  object_key TEXT NOT NULL UNIQUE
);
