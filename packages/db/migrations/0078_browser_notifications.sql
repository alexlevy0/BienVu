-- Private Web Push devices. Only explicit generation watches can produce a push.
CREATE TABLE browser_push_devices (
  endpoint_hash TEXT PRIMARY KEY CHECK(length(endpoint_hash)=64),
  token_hash TEXT NOT NULL CHECK(length(token_hash)=64),
  principal_kind TEXT NOT NULL CHECK(principal_kind IN ('user','trial')),
  principal_id TEXT NOT NULL,
  subscription_json TEXT NOT NULL CHECK(json_valid(subscription_json)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX browser_push_principal ON browser_push_devices(principal_kind,principal_id,enabled,expires_at);
CREATE TABLE browser_push_deliveries (
  endpoint_hash TEXT NOT NULL REFERENCES browser_push_devices(endpoint_hash) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES generation_runs(job_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
  lease_token TEXT, lease_until TEXT, retry_at TEXT NOT NULL,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, sent_at TEXT,
  PRIMARY KEY(endpoint_hash,job_id)
);
CREATE INDEX browser_push_pending ON browser_push_deliveries(status,retry_at,lease_until);
CREATE TRIGGER browser_push_rebound AFTER UPDATE OF principal_kind,principal_id,enabled ON browser_push_devices
WHEN OLD.principal_kind!=NEW.principal_kind OR OLD.principal_id!=NEW.principal_id OR NEW.enabled=0
BEGIN
  DELETE FROM browser_push_deliveries WHERE endpoint_hash=NEW.endpoint_hash;
END;
