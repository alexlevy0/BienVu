-- Retained animations are tenant scoped. Old pricing and hashes are unchanged.
CREATE TABLE animation_library (
 id TEXT PRIMARY KEY, agency_id TEXT NOT NULL REFERENCES agencies(id), source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
 aspect_ratio TEXT NOT NULL CHECK(aspect_ratio IN ('9:16','16:9')), model TEXT NOT NULL CHECK(model='gen4_turbo'),
 mode TEXT NOT NULL CHECK(mode IN ('real','mock')), origin_job_id TEXT NOT NULL REFERENCES generation_runs(job_id),
 asset_json TEXT NOT NULL CHECK(json_valid(asset_json)), created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'available' CHECK(state IN ('available','expiring')),
 UNIQUE(agency_id,source_sha256,aspect_ratio,model,mode)
);
CREATE INDEX animation_library_expiry ON animation_library(expires_at);
ALTER TABLE generation_runs ADD COLUMN reuse_pricing INTEGER NOT NULL DEFAULT 0 CHECK(reuse_pricing IN (0,1));
ALTER TABLE generation_runs ADD COLUMN animations_reused INTEGER NOT NULL DEFAULT 0 CHECK(animations_reused BETWEEN 0 AND 12);
ALTER TABLE generation_runs ADD COLUMN animation_reuses_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(animation_reuses_json));
CREATE TRIGGER generation_reuse_immutable BEFORE UPDATE OF reuse_pricing,animations_reused,animation_reuses_json ON generation_runs
BEGIN SELECT RAISE(ABORT,'CREDIT_PRICING_IMMUTABLE'); END;
DROP TRIGGER generation_credit_admit;
DROP TRIGGER generation_settle;
CREATE TRIGGER generation_credit_admit BEFORE INSERT ON generation_runs
BEGIN

  SELECT RAISE(ABORT,'VALIDATION_ERROR') WHERE NEW.animations_reused!=json_array_length(NEW.animation_reuses_json)
    OR NEW.animations_reused>NEW.animations_requested OR NEW.animations_reused>0 AND NEW.reuse_pricing!=1
    OR EXISTS(SELECT 1 FROM json_each(NEW.animation_reuses_json) reuse WHERE NOT EXISTS(
      SELECT 1 FROM animation_library l WHERE l.id=json_extract(reuse.value,'$.libraryId') AND l.agency_id=NEW.agency_id
      AND l.source_sha256=json_extract(reuse.value,'$.sha256') AND l.expires_at>NEW.created_at
      AND l.state='available' AND l.aspect_ratio=coalesce(json_extract(NEW.input_json,'$.aspectRatio'),'9:16') AND l.mode='real'));
  SELECT RAISE(ABORT,'VALIDATION_ERROR') WHERE NEW.credit_version=1 AND
    (NEW.animations_requested!=coalesce(json_array_length(NEW.input_json,'$.customization.runwayPhotos'),json_extract(NEW.input_json,'$.customization.runwayClips'),0)
      OR NEW.credits_total!=1+NEW.animations_requested-NEW.animations_reused);
  SELECT RAISE(ABORT,'RUNWAY_LOGIN_REQUIRED') WHERE NEW.anonymous_session_id IS NOT NULL AND
    coalesce(json_array_length(NEW.input_json,'$.customization.runwayPhotos'),json_extract(NEW.input_json,'$.customization.runwayClips'),0)>0;
  SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NEW.anonymous_session_id IS NULL AND NOT EXISTS(
    SELECT 1 FROM allocations WHERE id=NEW.allocation_id AND agency_id=NEW.agency_id AND reserved+consumed+NEW.credits_total<=quota_limit);
  SELECT RAISE(ABORT,'TRIAL_USED') WHERE NEW.anonymous_session_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM anonymous_sessions WHERE id=NEW.anonymous_session_id AND credits_reserved+credits_consumed+NEW.credits_total<=credits_granted);
END;
CREATE TRIGGER generation_settle AFTER UPDATE OF status ON jobs
WHEN OLD.status NOT IN ('ready','failed') AND NEW.status IN ('ready','failed') AND EXISTS(SELECT 1 FROM generation_runs WHERE job_id=NEW.id)
BEGIN
  UPDATE allocations SET reserved=reserved-(SELECT credit_amount FROM reservations WHERE job_id=NEW.id),consumed=consumed+(SELECT CASE WHEN g.credit_version=0 THEN IIF(NEW.status='ready',1,0) WHEN g.reuse_pricing=0 THEN IIF(NEW.status='ready',1+min(g.animations_requested,coalesce(json_array_length(v.manifest_json,'$.photoAnimations'),0)),0) ELSE IIF(NEW.status='ready',1,0)+min(g.animations_requested-g.animations_reused,(SELECT count(*) FROM photo_animations p WHERE p.job_id=g.job_id AND p.state='ready')) END FROM generation_runs g LEFT JOIN video_manifests v ON v.job_id=g.job_id WHERE g.job_id=NEW.id)
    WHERE id=(SELECT allocation_id FROM reservations WHERE job_id=NEW.id AND status='reserved');
  UPDATE reservations SET status=IIF(NEW.status='ready' OR (SELECT reuse_pricing FROM generation_runs WHERE job_id=NEW.id)=1 AND EXISTS(SELECT 1 FROM photo_animations WHERE job_id=NEW.id AND state='ready'),'consumed','released'),credit_used=(SELECT CASE WHEN g.credit_version=0 THEN IIF(NEW.status='ready',1,0) WHEN g.reuse_pricing=0 THEN IIF(NEW.status='ready',1+min(g.animations_requested,coalesce(json_array_length(v.manifest_json,'$.photoAnimations'),0)),0) ELSE IIF(NEW.status='ready',1,0)+min(g.animations_requested-g.animations_reused,(SELECT count(*) FROM photo_animations p WHERE p.job_id=g.job_id AND p.state='ready')) END FROM generation_runs g LEFT JOIN video_manifests v ON v.job_id=g.job_id WHERE g.job_id=NEW.id),updated_at=NEW.updated_at WHERE job_id=NEW.id AND status='reserved';
  UPDATE job_launch_intents SET status='cancelled',updated_at=NEW.updated_at WHERE job_id=NEW.id AND status='pending';
  UPDATE anonymous_sessions SET credits_reserved=credits_reserved-(SELECT credits_total FROM generation_runs WHERE job_id=NEW.id),credits_consumed=credits_consumed+(NEW.status='ready') WHERE id=(SELECT anonymous_session_id FROM generation_runs WHERE job_id=NEW.id);
  UPDATE anonymous_sessions SET successes=successes+1 WHERE NEW.status='ready' AND id=(SELECT anonymous_session_id FROM generation_runs WHERE job_id=NEW.id);
  UPDATE generation_runs SET expires_at=strftime('%Y-%m-%dT%H:%M:%fZ',NEW.updated_at,'+'||(SELECT retention_hours FROM trial_policy WHERE id=1)||' hours')
    WHERE job_id=NEW.id AND owner_agency_id IS NULL AND retention='available';
  INSERT OR IGNORE INTO generation_events VALUES(NEW.id,NEW.status,NEW.updated_at);
END;
