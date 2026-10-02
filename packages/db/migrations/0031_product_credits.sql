-- Product credits; additive migration. Existing counters, paid periods, request
-- hashes, media and pricing promises remain intact. Provider budget is separate.
ALTER TABLE generation_runs ADD COLUMN credit_version INTEGER NOT NULL DEFAULT 0 CHECK(credit_version IN (0,1));
ALTER TABLE generation_runs ADD COLUMN credits_total INTEGER NOT NULL DEFAULT 1 CHECK(credits_total BETWEEN 1 AND 13);
ALTER TABLE generation_runs ADD COLUMN animations_requested INTEGER NOT NULL DEFAULT 0 CHECK(animations_requested BETWEEN 0 AND 12);
ALTER TABLE reservations ADD COLUMN credit_amount INTEGER NOT NULL DEFAULT 1 CHECK(credit_amount BETWEEN 1 AND 13);
ALTER TABLE reservations ADD COLUMN credit_used INTEGER NOT NULL DEFAULT 0 CHECK(credit_used BETWEEN 0 AND credit_amount);
UPDATE reservations SET credit_used=1 WHERE status='consumed';
ALTER TABLE anonymous_sessions ADD COLUMN credits_granted INTEGER NOT NULL DEFAULT 1 CHECK(credits_granted=1);
ALTER TABLE anonymous_sessions ADD COLUMN credits_reserved INTEGER NOT NULL DEFAULT 0 CHECK(credits_reserved>=0);
ALTER TABLE anonymous_sessions ADD COLUMN credits_consumed INTEGER NOT NULL DEFAULT 0 CHECK(credits_consumed>=0);
UPDATE anonymous_sessions SET credits_consumed=successes,credits_reserved=(SELECT count(*) FROM generation_runs g JOIN jobs j ON j.id=g.job_id WHERE g.anonymous_session_id=anonymous_sessions.id AND j.status NOT IN ('ready','failed'));

CREATE TRIGGER generation_credit_admit BEFORE INSERT ON generation_runs
BEGIN
  SELECT RAISE(ABORT,'VALIDATION_ERROR') WHERE NEW.credit_version=1 AND
    (NEW.animations_requested!=coalesce(json_array_length(NEW.input_json,'$.customization.runwayPhotos'),json_extract(NEW.input_json,'$.customization.runwayClips'),0)
      OR NEW.credits_total!=1+NEW.animations_requested);
  SELECT RAISE(ABORT,'RUNWAY_LOGIN_REQUIRED') WHERE NEW.anonymous_session_id IS NOT NULL AND
    coalesce(json_array_length(NEW.input_json,'$.customization.runwayPhotos'),json_extract(NEW.input_json,'$.customization.runwayClips'),0)>0;
  SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NEW.anonymous_session_id IS NULL AND NOT EXISTS(
    SELECT 1 FROM allocations WHERE id=NEW.allocation_id AND agency_id=NEW.agency_id AND reserved+consumed+NEW.credits_total<=quota_limit);
  SELECT RAISE(ABORT,'TRIAL_USED') WHERE NEW.anonymous_session_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM anonymous_sessions WHERE id=NEW.anonymous_session_id AND credits_reserved+credits_consumed+NEW.credits_total<=credits_granted);
END;
DROP TRIGGER generation_create;
DROP TRIGGER generation_settle;
DROP TRIGGER generation_claim_fund;
CREATE TRIGGER generation_create AFTER INSERT ON generation_runs
BEGIN
  UPDATE generation_runs SET owner_agency_id=NEW.agency_id WHERE job_id=NEW.job_id AND anonymous_session_id IS NULL;
  UPDATE hosted_import_budget SET baseline_cents=baseline_cents+NEW.provision_cents+NEW.preview_provision_cents WHERE month=NEW.month;
  UPDATE allocations SET reserved=reserved+NEW.credits_total WHERE id=NEW.allocation_id AND agency_id=NEW.agency_id;
  INSERT INTO jobs(id,agency_id,listing_id,source_url,idempotency_key,status,stage,lease_until,workflow_id,reservation_id,created_at,updated_at)
    VALUES(NEW.job_id,NEW.agency_id,json_extract(NEW.input_json,'$.listingId'),coalesce(json_extract(NEW.input_json,'$.url'),''),
    NEW.idempotency_key,'queued','importing',NEW.deadline,'generation-'||NEW.job_id,NEW.reservation_id,NEW.created_at,NEW.created_at);
  INSERT INTO reservations(id,agency_id,job_id,allocation_id,status,created_at,updated_at,credit_amount)
    VALUES(NEW.reservation_id,NEW.agency_id,NEW.job_id,IIF(NEW.anonymous_session_id IS NULL,NEW.allocation_id,NULL),
    IIF(NEW.anonymous_session_id IS NULL,'reserved','unfunded'),NEW.created_at,NEW.created_at,NEW.credits_total);
  UPDATE anonymous_sessions SET credits_reserved=credits_reserved+NEW.credits_total WHERE id=NEW.anonymous_session_id;
  INSERT INTO job_launch_intents(job_id,agency_id,workflow_id,status,created_at,updated_at)
    VALUES(NEW.job_id,NEW.agency_id,'generation-'||NEW.job_id,'pending',NEW.created_at,NEW.created_at);
  INSERT INTO generation_events VALUES(NEW.job_id,'requested',NEW.created_at);
END;
CREATE TRIGGER generation_settle AFTER UPDATE OF status ON jobs
WHEN OLD.status NOT IN ('ready','failed') AND NEW.status IN ('ready','failed') AND EXISTS(SELECT 1 FROM generation_runs WHERE job_id=NEW.id)
BEGIN
  UPDATE allocations SET reserved=reserved-(SELECT credit_amount FROM reservations WHERE job_id=NEW.id),consumed=consumed+(SELECT CASE WHEN NEW.status!='ready' THEN 0 WHEN g.credit_version=0 THEN 1 ELSE 1+min(g.animations_requested,coalesce(json_array_length(v.manifest_json,'$.photoAnimations'),0)) END FROM generation_runs g LEFT JOIN video_manifests v ON v.job_id=g.job_id WHERE g.job_id=NEW.id)
    WHERE id=(SELECT allocation_id FROM reservations WHERE job_id=NEW.id AND status='reserved');
  UPDATE reservations SET status=IIF(NEW.status='ready','consumed','released'),credit_used=(SELECT CASE WHEN NEW.status!='ready' THEN 0 WHEN g.credit_version=0 THEN 1 ELSE 1+min(g.animations_requested,coalesce(json_array_length(v.manifest_json,'$.photoAnimations'),0)) END FROM generation_runs g LEFT JOIN video_manifests v ON v.job_id=g.job_id WHERE g.job_id=NEW.id),updated_at=NEW.updated_at WHERE job_id=NEW.id AND status='reserved';
  UPDATE job_launch_intents SET status='cancelled',updated_at=NEW.updated_at WHERE job_id=NEW.id AND status='pending';
  UPDATE anonymous_sessions SET credits_reserved=credits_reserved-(SELECT credits_total FROM generation_runs WHERE job_id=NEW.id),credits_consumed=credits_consumed+(NEW.status='ready') WHERE id=(SELECT anonymous_session_id FROM generation_runs WHERE job_id=NEW.id);
  UPDATE anonymous_sessions SET successes=successes+1 WHERE NEW.status='ready' AND id=(SELECT anonymous_session_id FROM generation_runs WHERE job_id=NEW.id);
  UPDATE generation_runs SET expires_at=strftime('%Y-%m-%dT%H:%M:%fZ',NEW.updated_at,'+'||(SELECT retention_hours FROM trial_policy WHERE id=1)||' hours')
    WHERE job_id=NEW.id AND owner_agency_id IS NULL AND retention='available';
  INSERT OR IGNORE INTO generation_events VALUES(NEW.id,NEW.status,NEW.updated_at);
END;
CREATE TRIGGER generation_claim_fund AFTER UPDATE OF owner_agency_id,funding_candidate ON generation_runs
WHEN NEW.owner_agency_id IS NOT NULL AND NEW.anonymous_session_id IS NOT NULL AND NEW.credit_version=0
BEGIN
  UPDATE reservations SET allocation_id=NEW.funding_candidate,
    status=IIF((SELECT status FROM jobs WHERE id=NEW.job_id)='ready','consumed','reserved'),updated_at=NEW.claimed_at
    WHERE job_id=NEW.job_id AND status='unfunded' AND NEW.retention='available'
    AND (SELECT status FROM jobs WHERE id=NEW.job_id)!='failed' AND EXISTS(SELECT 1 FROM allocations a
      WHERE a.id=NEW.funding_candidate AND a.agency_id=NEW.owner_agency_id AND a.valid_from<=NEW.claimed_at AND a.valid_until>NEW.claimed_at
      AND a.reserved+a.consumed<a.quota_limit AND (a.kind!='free' OR NOT EXISTS(SELECT 1 FROM subscriptions s WHERE s.agency_id=a.agency_id AND s.status NOT IN ('canceled','incomplete_expired'))));
  INSERT OR IGNORE INTO generation_events VALUES(NEW.job_id,'claimed',NEW.claimed_at);
END;
-- The anonymous creation already used its gift. Claiming it never debits the
-- new account or changes ownership rights of a previously funded legacy trial.
CREATE TRIGGER generation_claim_gift AFTER UPDATE OF owner_agency_id ON generation_runs
WHEN NEW.owner_agency_id IS NOT NULL AND NEW.anonymous_session_id IS NOT NULL AND NEW.credit_version=1
BEGIN INSERT OR IGNORE INTO generation_events VALUES(NEW.job_id,'claimed',NEW.claimed_at); END;
-- Extend the slot constraint while preserving every provider journal row.
-- Recreate dependent triggers around the table replacement.
DROP TRIGGER runway_clip_admit;
DROP TRIGGER runway_external_admit;
CREATE TABLE photo_animations_new (
  id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, job_id TEXT NOT NULL REFERENCES generation_runs(job_id),
  photo_id TEXT NOT NULL, source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
  slot INTEGER NOT NULL CHECK(slot BETWEEN 0 AND 11), month TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('real','mock')), model TEXT NOT NULL CHECK(model='gen4_turbo'),
  credits INTEGER NOT NULL CHECK(credits=25), reserved_cents INTEGER NOT NULL CHECK(reserved_cents IN (0,35)),
  state TEXT NOT NULL CHECK(state IN ('submitting','submitted','ready','failed','uncertain')),
  task_id TEXT, error_code TEXT, animation_json TEXT CHECK(animation_json IS NULL OR json_valid(animation_json)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(job_id,slot), UNIQUE(job_id,photo_id), FOREIGN KEY(agency_id,job_id) REFERENCES jobs(agency_id,id),
  CHECK((mode='real' AND reserved_cents=35) OR (mode='mock' AND reserved_cents=0))
);
INSERT INTO photo_animations_new SELECT * FROM photo_animations;
DROP TABLE photo_animations;
ALTER TABLE photo_animations_new RENAME TO photo_animations;
CREATE INDEX photo_animations_month ON photo_animations(month,mode);
CREATE TRIGGER runway_clip_admit BEFORE INSERT ON photo_animations
BEGIN
  SELECT RAISE(ABORT,'RUNWAY_JOB_INACTIVE') WHERE NOT EXISTS(SELECT 1 FROM generation_runs g JOIN jobs j ON j.id=g.job_id
    WHERE g.job_id=NEW.job_id AND g.agency_id=NEW.agency_id AND g.month=NEW.month AND g.retention='available'
    AND g.deadline>NEW.created_at AND j.status NOT IN ('ready','failed')
    AND NEW.slot<coalesce(json_array_length(g.input_json,'$.customization.runwayPhotos'),json_extract(g.input_json,'$.customization.runwayClips'),0));
  SELECT RAISE(ABORT,'RUNWAY_BUDGET_LIMIT') WHERE NEW.mode='real' AND NOT EXISTS(SELECT 1 FROM runway_budget r JOIN hosted_import_budget b ON b.month=r.month
    WHERE r.month=NEW.month AND r.paused=0 AND b.paused=0
    AND b.baseline_cents+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=b.month)<=b.ceiling_cents
    AND (SELECT coalesce(sum(reserved_cents),0) FROM photo_animations WHERE month=r.month AND mode='real')
      +(SELECT coalesce(sum(reserved_cents),0) FROM runway_external_verifications WHERE month=r.month)+NEW.reserved_cents<=r.prepaid_cents
    AND (SELECT coalesce(sum(credits),0) FROM photo_animations WHERE month=r.month AND mode='real')
      +(SELECT coalesce(sum(credits),0) FROM runway_external_verifications WHERE month=r.month)+NEW.credits<=r.api_credits);
END;
CREATE TRIGGER generation_credit_immutable BEFORE UPDATE OF credit_version,credits_total,animations_requested ON generation_runs
WHEN NEW.credit_version!=OLD.credit_version OR NEW.credits_total!=OLD.credits_total OR NEW.animations_requested!=OLD.animations_requested
BEGIN SELECT RAISE(ABORT,'CREDIT_PRICING_IMMUTABLE'); END;
CREATE TRIGGER reservation_credit_immutable BEFORE UPDATE OF credit_amount ON reservations
WHEN NEW.credit_amount!=OLD.credit_amount
BEGIN SELECT RAISE(ABORT,'CREDIT_PRICING_IMMUTABLE'); END;
CREATE TRIGGER reservation_credit_funding AFTER UPDATE OF allocation_id ON reservations
WHEN OLD.allocation_id IS NULL AND NEW.allocation_id IS NOT NULL AND NEW.status='consumed'
BEGIN UPDATE reservations SET credit_used=credit_amount WHERE id=NEW.id; END;

CREATE TRIGGER runway_external_admit BEFORE INSERT ON runway_external_verifications
BEGIN
  SELECT RAISE(ABORT,'RUNWAY_BUDGET_LIMIT') WHERE NOT EXISTS(SELECT 1 FROM runway_budget r JOIN hosted_import_budget b ON b.month=r.month
    WHERE r.month=NEW.month AND r.paused=0 AND b.paused=0
    AND b.baseline_cents+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=b.month)<=b.ceiling_cents
    AND (SELECT coalesce(sum(reserved_cents),0) FROM photo_animations WHERE month=r.month AND mode='real')
      +(SELECT coalesce(sum(reserved_cents),0) FROM runway_external_verifications WHERE month=r.month)+NEW.reserved_cents<=r.prepaid_cents
    AND (SELECT coalesce(sum(credits),0) FROM photo_animations WHERE month=r.month AND mode='real')
      +(SELECT coalesce(sum(credits),0) FROM runway_external_verifications WHERE month=r.month)+NEW.credits<=r.api_credits);
END;
