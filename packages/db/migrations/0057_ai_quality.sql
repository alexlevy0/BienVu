-- Independent of generation admission: analytics failures must not change billing or job states.
CREATE TABLE ai_quality_settings(id INTEGER PRIMARY KEY CHECK(id=1),settings_json TEXT NOT NULL CHECK(json_valid(settings_json)),revision INTEGER NOT NULL DEFAULT 1,
 activated_at TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT);
INSERT INTO ai_quality_settings(id,settings_json,activated_at,updated_at) VALUES(1,
 '{"enabled":true,"retentionDays":90,"reviewSamplePercent":10}',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE ai_quality_audit(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,action TEXT NOT NULL,target_id TEXT,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),created_at TEXT NOT NULL);
CREATE TABLE ai_quality_runs(id TEXT PRIMARY KEY,job_id TEXT NOT NULL,agency_id TEXT NOT NULL,attempt INTEGER NOT NULL,
 trace_id TEXT NOT NULL UNIQUE,payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),checks_json TEXT NOT NULL CHECK(json_valid(checks_json)),
 flagged INTEGER NOT NULL CHECK(flagged IN(0,1)),audience TEXT NOT NULL,source_host TEXT,job_status TEXT NOT NULL,
 review_sampled INTEGER NOT NULL DEFAULT 0 CHECK(review_sampled IN(0,1)),
 review TEXT CHECK(review IN('problem','false_positive','intentional','accepted')),review_note TEXT,review_by TEXT,review_at TEXT,
 created_at TEXT NOT NULL,completed_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(job_id,attempt));
ALTER TABLE ai_quality_runs ADD COLUMN telemetry_complete INTEGER NOT NULL DEFAULT 0 CHECK(telemetry_complete IN(0,1));
CREATE INDEX ai_quality_runs_review ON ai_quality_runs(flagged,review,completed_at DESC);
CREATE TABLE ai_telemetry_outbox(id TEXT PRIMARY KEY,event_key TEXT NOT NULL UNIQUE,trace_id TEXT NOT NULL,
 event TEXT NOT NULL,payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),event_at TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','sending','sent','dead')),attempts INTEGER NOT NULL DEFAULT 0,
 next_at TEXT NOT NULL,lease_id TEXT,lease_until TEXT,error_code TEXT,created_at TEXT NOT NULL,sent_at TEXT);
CREATE INDEX ai_telemetry_due ON ai_telemetry_outbox(state,next_at);
CREATE TABLE ai_quality_dataset(id TEXT PRIMARY KEY,run_id TEXT UNIQUE REFERENCES ai_quality_runs(id) ON DELETE SET NULL,
 label TEXT NOT NULL,version TEXT NOT NULL,payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 expected_json TEXT NOT NULL CHECK(json_valid(expected_json)),created_by TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE ai_quality_contexts(operation_id TEXT PRIMARY KEY,session_id TEXT NOT NULL,distinct_id TEXT NOT NULL,
 consent_version INTEGER NOT NULL CHECK(consent_version=2),created_at TEXT NOT NULL);
