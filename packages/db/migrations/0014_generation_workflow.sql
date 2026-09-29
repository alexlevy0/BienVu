-- Accès de développement explicite. Aucun droit public créé par la migration.
CREATE TABLE generation_access (
  agency_id TEXT PRIMARY KEY NOT NULL REFERENCES agencies(id),
  allocation_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  FOREIGN KEY(agency_id,allocation_id) REFERENCES allocations(agency_id,id)
);
CREATE TABLE generation_runs (
  job_id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL,
  allocation_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL,
  input_hash TEXT NOT NULL CHECK(length(input_hash)=64),
  input_json TEXT NOT NULL CHECK(json_valid(input_json)),
  brand_json TEXT NOT NULL CHECK(json_valid(brand_json)),
  created_at TEXT NOT NULL, deadline TEXT NOT NULL, expires_at TEXT NOT NULL,
  month TEXT NOT NULL,
  provision_cents INTEGER NOT NULL DEFAULT 120 CHECK(provision_cents=120),
  UNIQUE(agency_id,idempotency_key),
  FOREIGN KEY(agency_id,job_id) REFERENCES jobs(agency_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE generation_artifacts (
  job_id TEXT PRIMARY KEY NOT NULL REFERENCES generation_runs(job_id),
  object_key TEXT NOT NULL UNIQUE,
  report_json TEXT NOT NULL CHECK(json_valid(report_json)),
  created_at TEXT NOT NULL
);
-- Un INSERT atomique réserve le budget, le quota, le job et son lancement.
CREATE TRIGGER generation_admit BEFORE INSERT ON generation_runs
BEGIN
  SELECT RAISE(ABORT,'GENERATIONS_PAUSED') WHERE NOT EXISTS(SELECT 1 FROM generation_control WHERE enabled=1);
  SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NOT EXISTS(
    SELECT 1 FROM generation_access g JOIN allocations a ON a.id=g.allocation_id AND a.agency_id=g.agency_id
    WHERE g.agency_id=NEW.agency_id AND g.enabled=1 AND a.id=NEW.allocation_id
    AND a.valid_from<=NEW.created_at AND a.valid_until>NEW.created_at AND a.reserved+a.consumed<a.quota_limit);
  SELECT RAISE(ABORT,'GENERATION_BUSY') WHERE EXISTS(SELECT 1 FROM jobs WHERE status NOT IN ('ready','failed'));
  SELECT RAISE(ABORT,'GENERATION_BUDGET_LIMIT') WHERE NOT EXISTS(
    SELECT 1 FROM hosted_import_budget WHERE month=NEW.month AND paused=0 AND
    baseline_cents+NEW.provision_cents+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=NEW.month)<=ceiling_cents);
  SELECT RAISE(ABORT,'GENERATION_BUDGET_LIMIT') WHERE (SELECT count(*) FROM generation_runs WHERE month=NEW.month)>=30;
  SELECT RAISE(ABORT,'GENERATION_BUDGET_LIMIT') WHERE (SELECT count(*) FROM generation_runs WHERE substr(created_at,1,10)=substr(NEW.created_at,1,10))>=5;
END;
CREATE TRIGGER generation_create AFTER INSERT ON generation_runs
BEGIN
  UPDATE hosted_import_budget SET baseline_cents=baseline_cents+NEW.provision_cents WHERE month=NEW.month;
  UPDATE allocations SET reserved=reserved+1 WHERE id=NEW.allocation_id AND agency_id=NEW.agency_id;
  INSERT INTO jobs(id,agency_id,listing_id,source_url,idempotency_key,status,stage,lease_until,workflow_id,reservation_id,created_at,updated_at)
    VALUES(NEW.job_id,NEW.agency_id,json_extract(NEW.input_json,'$.listingId'),coalesce(json_extract(NEW.input_json,'$.url'),''),
    NEW.idempotency_key,'queued','importing',NEW.deadline,'generation-'||NEW.job_id,NEW.reservation_id,NEW.created_at,NEW.created_at);
  INSERT INTO reservations(id,agency_id,job_id,allocation_id,status,created_at,updated_at)
    VALUES(NEW.reservation_id,NEW.agency_id,NEW.job_id,NEW.allocation_id,'reserved',NEW.created_at,NEW.created_at);
  INSERT INTO job_launch_intents(job_id,agency_id,workflow_id,status,created_at,updated_at)
    VALUES(NEW.job_id,NEW.agency_id,'generation-'||NEW.job_id,'pending',NEW.created_at,NEW.created_at);
END;
CREATE TRIGGER generation_terminal BEFORE UPDATE OF status ON jobs
WHEN EXISTS(SELECT 1 FROM generation_runs WHERE job_id=NEW.id)
BEGIN
  SELECT RAISE(ABORT,'GENERATION_TERMINAL') WHERE OLD.status IN ('ready','failed') AND NEW.status!=OLD.status;
  SELECT RAISE(ABORT,'GENERATION_ARTIFACT_REQUIRED') WHERE NEW.status='ready' AND NOT EXISTS(SELECT 1 FROM generation_artifacts WHERE job_id=NEW.id);
END;
CREATE TRIGGER generation_settle AFTER UPDATE OF status ON jobs
WHEN OLD.status NOT IN ('ready','failed') AND NEW.status IN ('ready','failed') AND EXISTS(SELECT 1 FROM generation_runs WHERE job_id=NEW.id)
BEGIN
  UPDATE allocations SET reserved=reserved-1,consumed=consumed+(NEW.status='ready')
    WHERE id=(SELECT allocation_id FROM reservations WHERE job_id=NEW.id AND status='reserved');
  UPDATE reservations SET status=IIF(NEW.status='ready','consumed','released'),updated_at=NEW.updated_at WHERE job_id=NEW.id AND status='reserved';
  UPDATE job_launch_intents SET status='cancelled',updated_at=NEW.updated_at WHERE job_id=NEW.id AND status='pending';
END;
