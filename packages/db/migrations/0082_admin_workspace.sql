-- Shared operational workspace. Events are immutable; projections use a CAS revision.
CREATE TABLE admin_workspace_documents (
 key TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('preferences','view','task','audience','rules')),
 owner_id TEXT REFERENCES auth_user(id), body_json TEXT NOT NULL CHECK(json_valid(body_json)),
 revision INTEGER NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL REFERENCES auth_user(id)
);
CREATE INDEX admin_workspace_kind ON admin_workspace_documents(kind,updated_at DESC);
CREATE TABLE admin_workspace_events (
 id TEXT PRIMARY KEY, key TEXT NOT NULL, kind TEXT NOT NULL, owner_id TEXT REFERENCES auth_user(id),
 actor_id TEXT NOT NULL REFERENCES auth_user(id), body_json TEXT NOT NULL CHECK(json_valid(body_json) AND length(body_json)<=16000),
 expected_revision INTEGER NOT NULL CHECK(expected_revision>=0), created_at TEXT NOT NULL
);
CREATE INDEX admin_workspace_history ON admin_workspace_events(key,created_at DESC);
-- The first change must also be reversible, including settings that predate history.
CREATE TABLE admin_configuration_baselines(kind TEXT PRIMARY KEY,body_json TEXT NOT NULL CHECK(json_valid(body_json)),created_at TEXT NOT NULL);
INSERT INTO admin_configuration_baselines SELECT 'features',features_json,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM site_feature_settings WHERE id=1;
INSERT INTO admin_configuration_baselines SELECT 'queue',settings_json,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM generation_queue_settings WHERE id=1;
INSERT INTO admin_configuration_baselines SELECT 'map',settings_json,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM video_map_settings WHERE id=1;
INSERT INTO admin_configuration_baselines SELECT 'avatars',settings_json,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM avatar_settings WHERE id=1;
CREATE TRIGGER admin_configuration_baseline_immutable BEFORE UPDATE ON admin_configuration_baselines BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER admin_configuration_baseline_no_delete BEFORE DELETE ON admin_configuration_baselines BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER admin_workspace_cas BEFORE INSERT ON admin_workspace_events BEGIN
 SELECT RAISE(ABORT,'ADMIN_WORKSPACE_CONFLICT') WHERE NEW.expected_revision!=coalesce((SELECT revision FROM admin_workspace_documents WHERE key=NEW.key),0);
 SELECT RAISE(ABORT,'ADMIN_WORKSPACE_RATE_LIMIT') WHERE (SELECT count(*) FROM admin_workspace_events WHERE actor_id=NEW.actor_id AND created_at>=strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at,'-1 minute'))>=40;
 SELECT RAISE(ABORT,'ADMIN_WORKSPACE_OWNER') WHERE EXISTS(SELECT 1 FROM admin_workspace_documents WHERE key=NEW.key AND (kind!=NEW.kind OR owner_id IS NOT NEW.owner_id));
END;
CREATE TRIGGER admin_workspace_apply AFTER INSERT ON admin_workspace_events BEGIN
 INSERT INTO admin_workspace_documents VALUES(NEW.key,NEW.kind,NEW.owner_id,NEW.body_json,NEW.expected_revision+1,NEW.created_at,NEW.actor_id)
 ON CONFLICT(key) DO UPDATE SET body_json=excluded.body_json,revision=excluded.revision,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
END;
CREATE TRIGGER admin_workspace_immutable BEFORE UPDATE ON admin_workspace_events BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER admin_workspace_no_delete BEFORE DELETE ON admin_workspace_events BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;

CREATE TABLE admin_alerts (
 id TEXT PRIMARY KEY, rule TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, href TEXT NOT NULL,
 opened_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, resolved_at TEXT
);
CREATE UNIQUE INDEX admin_alert_open ON admin_alerts(rule) WHERE resolved_at IS NULL;
CREATE INDEX admin_alert_recent ON admin_alerts(opened_at DESC);
CREATE TABLE admin_alert_deliveries (
 alert_id TEXT NOT NULL REFERENCES admin_alerts(id) ON DELETE CASCADE,
 endpoint_hash TEXT NOT NULL REFERENCES browser_push_devices(endpoint_hash) ON DELETE CASCADE,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','failed')),
 attempts INTEGER NOT NULL DEFAULT 0, lease TEXT, lease_until TEXT, retry_at TEXT NOT NULL, sent_at TEXT,
 PRIMARY KEY(alert_id,endpoint_hash)
);
CREATE TABLE admin_recovery_requests (
 id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES generation_runs(job_id), actor_id TEXT NOT NULL REFERENCES auth_user(id),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 5 AND 1000), state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','working','done','failed')),
 result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX admin_recovery_active ON admin_recovery_requests(job_id) WHERE state IN ('pending','working');
CREATE INDEX admin_recovery_pending ON admin_recovery_requests(state,created_at);
CREATE TRIGGER admin_recovery_rate BEFORE INSERT ON admin_recovery_requests BEGIN
 SELECT RAISE(ABORT,'ADMIN_WORKSPACE_RATE_LIMIT') WHERE (SELECT count(*) FROM admin_recovery_requests WHERE actor_id=NEW.actor_id AND created_at>=strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at,'-1 minute'))>=5;
END;
CREATE TABLE admin_recovered_animations (
 animation_id TEXT PRIMARY KEY REFERENCES photo_animations(id), request_id TEXT NOT NULL REFERENCES admin_recovery_requests(id),
 asset_json TEXT NOT NULL CHECK(json_valid(asset_json)), created_at TEXT NOT NULL
);
