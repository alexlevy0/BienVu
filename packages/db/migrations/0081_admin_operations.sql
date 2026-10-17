-- Private operational history. No push endpoints, subscription keys or credentials.
CREATE TABLE admin_operation_entries (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE, actor_id TEXT NOT NULL REFERENCES auth_user(id),
 kind TEXT NOT NULL CHECK(kind IN ('note','incident','change')),
 target TEXT NOT NULL CHECK(length(target) BETWEEN 1 AND 200),
 body TEXT NOT NULL CHECK(length(body) BETWEEN 3 AND 2000),
 state TEXT CHECK(state IN ('open','reviewing','resolved')),
 created_at TEXT NOT NULL
);
CREATE INDEX admin_operations_target ON admin_operation_entries(kind,target,created_at DESC,id DESC);
CREATE INDEX admin_operations_created ON admin_operation_entries(created_at DESC,id DESC);
CREATE TRIGGER admin_operations_rate BEFORE INSERT ON admin_operation_entries BEGIN
 SELECT RAISE(ABORT,'ADMIN_OPERATIONS_RATE_LIMIT') WHERE (SELECT count(*) FROM admin_operation_entries WHERE actor_id=NEW.actor_id AND created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 minute'))>=20;
END;
CREATE TRIGGER admin_operations_immutable BEFORE UPDATE ON admin_operation_entries BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER admin_operations_no_delete BEFORE DELETE ON admin_operation_entries BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;

CREATE TABLE browser_push_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL REFERENCES generation_runs(job_id) ON DELETE CASCADE,
 event TEXT NOT NULL CHECK(event IN ('watch','attempt','accepted','failed','device_disabled')),
 attempt INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX browser_push_events_job ON browser_push_events(job_id,created_at,id);
CREATE TABLE generation_stage_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
 stage TEXT NOT NULL,status TEXT NOT NULL,error_code TEXT,created_at TEXT NOT NULL
);
CREATE INDEX generation_stage_events_job ON generation_stage_events(job_id,created_at,id);
CREATE TRIGGER generation_stage_observe_create AFTER INSERT ON jobs BEGIN
 INSERT INTO generation_stage_events(job_id,stage,status,error_code,created_at) VALUES(NEW.id,NEW.stage,NEW.status,NEW.error_code,NEW.created_at);
END;
CREATE TRIGGER generation_stage_observe_change AFTER UPDATE OF stage,status ON jobs
WHEN OLD.stage!=NEW.stage OR OLD.status!=NEW.status BEGIN
 INSERT INTO generation_stage_events(job_id,stage,status,error_code,created_at) VALUES(NEW.id,NEW.stage,NEW.status,NEW.error_code,NEW.updated_at);
END;
-- Triggers also cover already deployed dispatchers, without changing their delivery semantics.
CREATE TRIGGER browser_push_observe_watch AFTER INSERT ON browser_push_deliveries BEGIN
 INSERT INTO browser_push_events(job_id,event,attempt,created_at) VALUES(NEW.job_id,'watch',NEW.attempts,NEW.created_at);
END;
CREATE TRIGGER browser_push_observe_status AFTER UPDATE OF status ON browser_push_deliveries
WHEN NEW.status IN ('sending','sent','failed') AND (OLD.status!=NEW.status OR OLD.attempts!=NEW.attempts) BEGIN
 INSERT INTO browser_push_events(job_id,event,attempt,created_at) VALUES(NEW.job_id,CASE NEW.status WHEN 'sending' THEN 'attempt' WHEN 'sent' THEN 'accepted' ELSE 'failed' END,NEW.attempts,coalesce(NEW.sent_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')));
END;
CREATE TRIGGER browser_push_observe_disable BEFORE UPDATE OF enabled ON browser_push_devices
WHEN OLD.enabled=1 AND NEW.enabled=0 BEGIN
 INSERT INTO browser_push_events(job_id,event,attempt,created_at) SELECT job_id,'device_disabled',attempts,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM browser_push_deliveries WHERE endpoint_hash=OLD.endpoint_hash;
END;
