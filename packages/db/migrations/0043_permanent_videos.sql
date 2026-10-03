-- Successful videos and their editing resources have no storage deadline.
-- Keep the old NOT NULL expiry as a cleanup timestamp for failed attempts,
-- without rebuilding the generation journal or changing any credit settlement.
ALTER TABLE generation_runs ADD COLUMN storage_permanent INTEGER NOT NULL DEFAULT 1 CHECK(storage_permanent IN (0,1));
UPDATE generation_runs SET storage_permanent=0 WHERE retention!='available'
  OR job_id IN (SELECT id FROM jobs WHERE status='failed');

CREATE TRIGGER generation_failed_storage AFTER UPDATE OF status ON jobs
WHEN NEW.status='failed' AND OLD.status!='failed'
BEGIN UPDATE generation_runs SET storage_permanent=0 WHERE job_id=NEW.id; END;

CREATE TRIGGER generation_storage_guard BEFORE UPDATE OF storage_permanent ON generation_runs
WHEN OLD.storage_permanent=1 AND NEW.storage_permanent=0
  AND (SELECT status FROM jobs WHERE id=OLD.job_id)!='failed'
BEGIN SELECT RAISE(ABORT,'FORBIDDEN'); END;

DROP TRIGGER generation_owner_guard;
CREATE TRIGGER generation_owner_guard BEFORE UPDATE OF owner_agency_id ON generation_runs
WHEN NEW.anonymous_session_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'FORBIDDEN') WHERE OLD.owner_agency_id IS NOT NULL AND NEW.owner_agency_id IS NOT OLD.owner_agency_id;
  SELECT RAISE(ABORT,'TRIAL_EXPIRED') WHERE OLD.owner_agency_id IS NULL AND NEW.owner_agency_id IS NOT NULL
    AND (OLD.retention!='available' OR OLD.storage_permanent=0 AND OLD.expires_at<=NEW.claimed_at);
END;

-- Also fences an older scheduled worker before it can delete anything in R2.
DROP TRIGGER generation_retention_guard;
CREATE TRIGGER generation_retention_guard BEFORE UPDATE OF retention ON generation_runs
WHEN NEW.retention!=OLD.retention
BEGIN
  SELECT RAISE(ABORT,'FORBIDDEN') WHERE OLD.storage_permanent=1 OR OLD.owner_agency_id IS NOT NULL
    OR OLD.anonymous_session_id IS NULL OR OLD.retention='expired'
    OR (OLD.retention='expiring' AND NEW.retention!='expired');
END;

DROP TRIGGER reservation_funding;
CREATE TRIGGER reservation_funding BEFORE UPDATE OF allocation_id ON reservations
WHEN NEW.allocation_id IS NOT OLD.allocation_id
BEGIN
  SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE OLD.status!='unfunded' OR NEW.status NOT IN ('reserved','consumed') OR NOT EXISTS(
    SELECT 1 FROM allocations a JOIN generation_runs g ON g.owner_agency_id=a.agency_id JOIN jobs j ON j.id=g.job_id
    WHERE g.job_id=NEW.job_id AND g.retention='available' AND (g.storage_permanent=1 OR g.expires_at>NEW.updated_at) AND a.id=NEW.allocation_id
    AND a.valid_from<=NEW.updated_at AND a.valid_until>NEW.updated_at AND a.reserved+a.consumed<a.quota_limit
    AND j.status!='failed' AND NEW.status=IIF(j.status='ready','consumed','reserved'));
  UPDATE allocations SET reserved=reserved+(NEW.status='reserved'),consumed=consumed+(NEW.status='consumed') WHERE id=NEW.allocation_id;
END;

CREATE TRIGGER animation_library_retention_guard BEFORE UPDATE OF state ON animation_library
WHEN NEW.state='expiring' AND OLD.state!='expiring' AND EXISTS(SELECT 1 FROM generation_runs g
  WHERE g.agency_id=OLD.agency_id AND g.storage_permanent=1 AND g.retention='available'
  AND (g.job_id=OLD.origin_job_id OR EXISTS(SELECT 1 FROM json_each(g.animation_reuses_json) r
    WHERE json_extract(r.value,'$.libraryId')=OLD.id)))
BEGIN SELECT RAISE(ABORT,'FORBIDDEN'); END;

CREATE TRIGGER animation_library_delete_guard BEFORE DELETE ON animation_library
WHEN EXISTS(SELECT 1 FROM generation_runs g
  WHERE g.agency_id=OLD.agency_id AND g.storage_permanent=1 AND g.retention='available'
  AND (g.job_id=OLD.origin_job_id OR EXISTS(SELECT 1 FROM json_each(g.animation_reuses_json) r
    WHERE json_extract(r.value,'$.libraryId')=OLD.id)))
BEGIN SELECT RAISE(ABORT,'FORBIDDEN'); END;

-- Preserve the current pricing/funding rules; only the reuse storage check changes.
DROP TRIGGER generation_credit_admit;
CREATE TRIGGER generation_credit_admit BEFORE INSERT ON generation_runs
BEGIN
  SELECT RAISE(ABORT,'VALIDATION_ERROR') WHERE NEW.animations_reused!=json_array_length(NEW.animation_reuses_json)
    OR NEW.animations_reused>NEW.animations_requested OR NEW.animations_reused>0 AND NEW.reuse_pricing!=1
    OR EXISTS(SELECT 1 FROM json_each(NEW.animation_reuses_json) reuse WHERE NOT EXISTS(
      SELECT 1 FROM animation_library l WHERE l.id=json_extract(reuse.value,'$.libraryId') AND l.agency_id=NEW.agency_id
      AND l.source_sha256=json_extract(reuse.value,'$.sha256') AND (l.expires_at>NEW.created_at OR EXISTS(
        SELECT 1 FROM generation_runs g WHERE g.agency_id=l.agency_id AND g.storage_permanent=1 AND g.retention='available'
        AND (g.job_id=l.origin_job_id OR EXISTS(SELECT 1 FROM json_each(g.animation_reuses_json) r
          WHERE json_extract(r.value,'$.libraryId')=l.id))))
      AND l.state='available' AND l.aspect_ratio=coalesce(json_extract(NEW.input_json,'$.aspectRatio'),'9:16') AND l.mode='real'));
  SELECT RAISE(ABORT,'VALIDATION_ERROR') WHERE NEW.credit_version=1 AND
    (NEW.animations_requested!=coalesce(json_array_length(NEW.input_json,'$.customization.runwayPhotos'),json_extract(NEW.input_json,'$.customization.runwayClips'),0)
      OR NEW.credits_total!=1+NEW.animations_requested-NEW.animations_reused);
  SELECT RAISE(ABORT,'RUNWAY_LOGIN_REQUIRED') WHERE NEW.anonymous_session_id IS NOT NULL AND
    coalesce(json_array_length(NEW.input_json,'$.customization.runwayPhotos'),json_extract(NEW.input_json,'$.customization.runwayClips'),0)>0;
  SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NEW.anonymous_session_id IS NULL AND NEW.funding_version=0 AND NOT EXISTS(
    SELECT 1 FROM allocations WHERE id=NEW.allocation_id AND agency_id=NEW.agency_id AND reserved+consumed+NEW.credits_total<=quota_limit);
  SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NEW.anonymous_session_id IS NULL AND NEW.funding_version=1 AND
    (SELECT coalesce(sum(available),0) FROM spendable_credit_sources WHERE agency_id=NEW.agency_id AND enabled=1
     AND valid_from<=NEW.created_at AND valid_until>NEW.created_at AND (id=NEW.allocation_id OR purchased=1))<NEW.credits_total;
  SELECT RAISE(ABORT,'VALIDATION_ERROR') WHERE NEW.anonymous_session_id IS NOT NULL AND NEW.funding_version!=0;
  SELECT RAISE(ABORT,'TRIAL_USED') WHERE NEW.anonymous_session_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM anonymous_sessions WHERE id=NEW.anonymous_session_id AND credits_reserved+credits_consumed+NEW.credits_total<=credits_granted);
END;
