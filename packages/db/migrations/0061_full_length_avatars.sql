-- Continuous optional avatar: one credit per started ten seconds (20/30/40 s).
-- Existing jobs, credits, tasks, caches and financial views keep their values.
PRAGMA defer_foreign_keys=ON;
PRAGMA legacy_alter_table=ON;
ALTER TABLE generation_runs ADD COLUMN avatar_extra_credits INTEGER NOT NULL DEFAULT 0 CHECK(avatar_extra_credits BETWEEN 0 AND 3);
CREATE TRIGGER generation_avatar_extra_immutable BEFORE UPDATE OF avatar_extra_credits ON generation_runs BEGIN SELECT RAISE(ABORT,'CREDIT_PRICING_IMMUTABLE'); END;
DROP TRIGGER generation_avatar_admit;
DROP TRIGGER generation_create;
DROP TRIGGER generation_avatar_settle;
CREATE TABLE avatar_credit_parts_v2(job_id TEXT NOT NULL REFERENCES generation_runs(job_id),agency_id TEXT NOT NULL REFERENCES agencies(id),allocation_id TEXT NOT NULL,
 priority INTEGER NOT NULL CHECK(priority IN (0,1)),amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 4),consumed INTEGER NOT NULL DEFAULT 0 CHECK(consumed BETWEEN 0 AND amount),settled INTEGER NOT NULL DEFAULT 0 CHECK(settled IN (0,1)),
 PRIMARY KEY(job_id,allocation_id),FOREIGN KEY(agency_id,allocation_id) REFERENCES allocations(agency_id,id));
INSERT INTO avatar_credit_parts_v2 SELECT * FROM avatar_credit_parts;
DROP TABLE avatar_credit_parts;
ALTER TABLE avatar_credit_parts_v2 RENAME TO avatar_credit_parts;
CREATE TRIGGER avatar_credit_guard BEFORE INSERT ON avatar_credit_parts BEGIN
 SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NOT EXISTS(SELECT 1 FROM spendable_credit_sources WHERE id=NEW.allocation_id AND agency_id=NEW.agency_id AND available>=NEW.amount AND enabled=1);
END;
CREATE TRIGGER avatar_credit_reserve AFTER INSERT ON avatar_credit_parts BEGIN UPDATE allocations SET reserved=reserved+NEW.amount WHERE id=NEW.allocation_id AND agency_id=NEW.agency_id; END;
CREATE TRIGGER avatar_credit_settle AFTER UPDATE OF settled ON avatar_credit_parts WHEN OLD.settled=0 AND NEW.settled=1 BEGIN
 UPDATE allocations SET reserved=reserved-NEW.amount,consumed=consumed+NEW.consumed WHERE id=NEW.allocation_id AND agency_id=NEW.agency_id;
END;
CREATE TRIGGER avatar_credit_immutable BEFORE UPDATE ON avatar_credit_parts WHEN OLD.settled=1 OR NEW.job_id!=OLD.job_id OR NEW.agency_id!=OLD.agency_id OR NEW.allocation_id!=OLD.allocation_id OR NEW.amount!=OLD.amount OR NEW.priority!=OLD.priority OR NEW.settled!=1 BEGIN SELECT RAISE(ABORT,'CREDIT_PRICING_IMMUTABLE'); END;
CREATE TABLE avatar_tasks_v2(id TEXT PRIMARY KEY,agency_id TEXT NOT NULL,job_id TEXT NOT NULL REFERENCES generation_runs(job_id),moment TEXT NOT NULL CHECK(moment IN ('intro','outro','full')),
 cache_key TEXT NOT NULL CHECK(length(cache_key)=64),audio_json TEXT NOT NULL CHECK(json_valid(audio_json)),start_frame INTEGER NOT NULL CHECK(start_frame BETWEEN 0 AND 1199),
 state TEXT NOT NULL CHECK(state IN ('claimed','submitting','submitted','ready','failed','uncertain')),provider_id TEXT UNIQUE,audio_asset_id TEXT,
 engine TEXT NOT NULL CHECK(engine IN ('avatar_iii','avatar_iv')),mode TEXT NOT NULL CHECK(mode IN ('real','mock')),reused INTEGER NOT NULL DEFAULT 0 CHECK(reused IN (0,1)),
 reserved_micros INTEGER NOT NULL CHECK(reserved_micros>=0),result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),error_code TEXT,
 poll_after TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(job_id,moment),FOREIGN KEY(agency_id,job_id) REFERENCES jobs(agency_id,id));
INSERT INTO avatar_tasks_v2 SELECT * FROM avatar_tasks;
DROP TABLE avatar_tasks;
ALTER TABLE avatar_tasks_v2 RENAME TO avatar_tasks;
CREATE INDEX avatar_tasks_poll ON avatar_tasks(state,poll_after);
CREATE INDEX avatar_tasks_budget ON avatar_tasks(created_at,mode);
CREATE TRIGGER avatar_task_guard BEFORE INSERT ON avatar_tasks BEGIN
 SELECT RAISE(ABORT,'AVATAR_UNAVAILABLE') WHERE NEW.mode='real' AND NEW.reused=0 AND NEW.state NOT IN ('failed','ready') AND NOT EXISTS(SELECT 1 FROM avatar_settings WHERE id=1 AND json_extract(settings_json,'$.enabled')=1);
 SELECT RAISE(ABORT,'AVATAR_JOB_INACTIVE') WHERE NOT EXISTS(SELECT 1 FROM generation_runs g JOIN jobs j ON j.id=g.job_id WHERE g.job_id=NEW.job_id AND g.agency_id=NEW.agency_id AND g.avatar_credits>0 AND g.retention='available' AND g.deadline>NEW.created_at AND j.status NOT IN ('ready','failed'));
 SELECT RAISE(ABORT,'AVATAR_BUDGET_LIMIT') WHERE NEW.mode='real' AND NEW.reused=0 AND NEW.state NOT IN ('failed','ready') AND (
  (SELECT coalesce(sum(reserved_micros),0) FROM avatar_tasks WHERE mode='real' AND substr(created_at,1,7)=substr(NEW.created_at,1,7))+NEW.reserved_micros>1000000*(SELECT json_extract(settings_json,'$.monthlyUsd') FROM avatar_settings WHERE id=1)
  OR (SELECT coalesce(sum(reserved_micros),0) FROM avatar_tasks WHERE job_id=NEW.job_id)+NEW.reserved_micros>1000000*(SELECT json_extract(avatar_config_json,'$.settings.perVideoUsd') FROM generation_runs WHERE job_id=NEW.job_id));
 SELECT RAISE(ABORT,'AVATAR_BUSY') WHERE NEW.mode='real' AND NEW.reused=0 AND NEW.state NOT IN ('failed','ready') AND (SELECT count(*) FROM avatar_tasks t JOIN generation_runs g ON g.job_id=t.job_id WHERE t.mode='real' AND t.reused=0 AND t.state IN ('claimed','submitting','submitted') AND g.deadline>NEW.created_at)>=(SELECT json_extract(settings_json,'$.concurrent') FROM avatar_settings WHERE id=1);
END;
CREATE TRIGGER generation_avatar_admit BEFORE INSERT ON generation_runs BEGIN
 SELECT RAISE(ABORT,'AVATAR_LOGIN_REQUIRED') WHERE NEW.avatar_credits>0 AND NEW.anonymous_session_id IS NOT NULL;
 SELECT RAISE(ABORT,'VALIDATION_ERROR') WHERE NEW.avatar_credits!=IIF(json_type(NEW.input_json,'$.customization.avatar')='object' AND coalesce(json_extract(NEW.input_json,'$.customization.avatar.hidden'),0)=0,1,0);
 SELECT RAISE(ABORT,'VALIDATION_ERROR') WHERE NEW.avatar_extra_credits!=IIF(NEW.avatar_credits=1 AND json_extract(NEW.input_json,'$.customization.avatar.moments')='full',coalesce(CAST((json_extract(NEW.input_json,'$.durationSeconds')+9)/10 AS INTEGER)-1,-1),0);
 SELECT RAISE(ABORT,'AVATAR_UNAVAILABLE') WHERE NEW.avatar_credits>0 AND (NEW.funding_version!=1 OR NEW.credit_version!=1 OR NEW.avatar_config_json IS NULL OR coalesce(json_extract(NEW.input_json,'$.voiceEnabled'),1)=0 OR NOT EXISTS(SELECT 1 FROM avatar_settings WHERE id=1 AND json_extract(settings_json,'$.enabled')=1));
 SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NEW.avatar_credits>0 AND (SELECT coalesce(sum(available),0) FROM spendable_credit_sources WHERE agency_id=NEW.agency_id AND enabled=1 AND valid_from<=NEW.created_at AND valid_until>NEW.created_at AND (id=NEW.allocation_id OR purchased=1))<NEW.credits_total+NEW.avatar_credits+NEW.avatar_extra_credits;
END;
CREATE TRIGGER generation_create AFTER INSERT ON generation_runs
BEGIN
  UPDATE generation_runs SET owner_agency_id=NEW.agency_id WHERE job_id=NEW.job_id AND anonymous_session_id IS NULL;
  UPDATE hosted_import_budget SET baseline_cents=baseline_cents+NEW.provision_cents+NEW.preview_provision_cents WHERE month=NEW.month;
  UPDATE allocations SET reserved=reserved+NEW.credits_total WHERE id=NEW.allocation_id AND agency_id=NEW.agency_id AND NEW.funding_version=0;
  INSERT INTO jobs(id,agency_id,listing_id,source_url,idempotency_key,status,stage,lease_until,workflow_id,reservation_id,created_at,updated_at)
    VALUES(NEW.job_id,NEW.agency_id,json_extract(NEW.input_json,'$.listingId'),coalesce(json_extract(NEW.input_json,'$.url'),''),
    NEW.idempotency_key,'queued','importing',NEW.deadline,'generation-'||NEW.job_id,NEW.reservation_id,NEW.created_at,NEW.created_at);
  INSERT INTO reservations(id,agency_id,job_id,allocation_id,status,created_at,updated_at,credit_amount)
    VALUES(NEW.reservation_id,NEW.agency_id,NEW.job_id,IIF(NEW.anonymous_session_id IS NULL,NEW.allocation_id,NULL),
    IIF(NEW.anonymous_session_id IS NULL,'reserved','unfunded'),NEW.created_at,NEW.created_at,NEW.credits_total);
  INSERT INTO generation_credit_parts(job_id,agency_id,allocation_id,priority,amount)
    SELECT NEW.job_id,NEW.agency_id,id,purchased,min(available,max(0,NEW.credits_total-before_amount)) FROM (
     SELECT id,purchased,available,coalesce(sum(available) OVER (ORDER BY purchased,valid_from,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS before_amount
     FROM spendable_credit_sources WHERE agency_id=NEW.agency_id AND enabled=1 AND available>0
     AND valid_from<=NEW.created_at AND valid_until>NEW.created_at AND (id=NEW.allocation_id OR purchased=1))
    WHERE NEW.funding_version=1 AND NEW.anonymous_session_id IS NULL AND before_amount<NEW.credits_total;
  SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NEW.funding_version=1 AND NEW.anonymous_session_id IS NULL
    AND (SELECT coalesce(sum(amount),0) FROM generation_credit_parts WHERE job_id=NEW.job_id)!=NEW.credits_total;
  UPDATE anonymous_sessions SET credits_reserved=credits_reserved+NEW.credits_total WHERE id=NEW.anonymous_session_id;
  INSERT INTO job_launch_intents(job_id,agency_id,workflow_id,status,created_at,updated_at)
    VALUES(NEW.job_id,NEW.agency_id,'generation-'||NEW.job_id,'pending',NEW.created_at,NEW.created_at);
  INSERT INTO generation_events VALUES(NEW.job_id,'requested',NEW.created_at);
  INSERT INTO avatar_credit_parts(job_id,agency_id,allocation_id,priority,amount)
    SELECT NEW.job_id,NEW.agency_id,id,purchased,min(available,max(0,NEW.avatar_credits+NEW.avatar_extra_credits-before_amount)) FROM (
      SELECT id,purchased,available,coalesce(sum(available) OVER (ORDER BY purchased,valid_from,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS before_amount
      FROM spendable_credit_sources WHERE agency_id=NEW.agency_id AND enabled=1 AND valid_from<=NEW.created_at AND valid_until>NEW.created_at AND (id=NEW.allocation_id OR purchased=1))
    WHERE NEW.avatar_credits>0 AND before_amount<NEW.avatar_credits+NEW.avatar_extra_credits AND available>0;
  SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NEW.avatar_credits+NEW.avatar_extra_credits!=(SELECT coalesce(sum(amount),0) FROM avatar_credit_parts WHERE job_id=NEW.job_id);
END;
CREATE TRIGGER generation_avatar_settle AFTER UPDATE OF status ON jobs WHEN OLD.status NOT IN ('ready','failed') AND NEW.status IN ('ready','failed') BEGIN
 UPDATE avatar_credit_parts SET settled=1,consumed=min(amount,max(0,
  (SELECT IIF(EXISTS(SELECT 1 FROM avatar_tasks t WHERE t.job_id=NEW.id AND t.state='ready' AND t.reused=0),g.avatar_credits+g.avatar_extra_credits,0) FROM generation_runs g WHERE g.job_id=NEW.id)
  -coalesce((SELECT sum(p.amount) FROM avatar_credit_parts p JOIN allocations a ON a.id=p.allocation_id JOIN allocations c ON c.id=avatar_credit_parts.allocation_id WHERE p.job_id=NEW.id AND (p.priority<avatar_credit_parts.priority OR p.priority=avatar_credit_parts.priority AND (a.valid_from<c.valid_from OR a.valid_from=c.valid_from AND a.id<c.id))),0))) WHERE job_id=NEW.id AND settled=0;
END;
PRAGMA legacy_alter_table=OFF;
PRAGMA defer_foreign_keys=OFF;
