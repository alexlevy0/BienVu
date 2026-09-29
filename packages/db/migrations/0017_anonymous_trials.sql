-- D1 migrations are transactional. Defer existing foreign keys while rebuilding
-- two CHECK constraints; keep every existing ID, counter and paid period intact.
PRAGMA defer_foreign_keys = ON;
DROP TRIGGER generation_admit;
DROP TRIGGER generation_create;
DROP TRIGGER generation_terminal;
DROP TRIGGER generation_settle;
CREATE TABLE _allocations_backup AS SELECT * FROM allocations;
DROP TABLE allocations;
CREATE TABLE allocations (
  id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL REFERENCES agencies(id),
  kind TEXT NOT NULL CHECK(kind IN ('trial','paid','free')), period_key TEXT NOT NULL,
  quota_limit INTEGER NOT NULL CHECK(quota_limit>0), reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved>=0),
  consumed INTEGER NOT NULL DEFAULT 0 CHECK(consumed>=0), valid_from TEXT NOT NULL, valid_until TEXT NOT NULL,
  CHECK(reserved+consumed<=quota_limit), CHECK(valid_until>valid_from), CHECK(kind!='trial' OR quota_limit=1),
  UNIQUE(agency_id,id), UNIQUE(agency_id,kind,period_key)
);
INSERT INTO allocations SELECT * FROM _allocations_backup;
DROP TABLE _allocations_backup;
CREATE UNIQUE INDEX allocations_one_trial_per_agency ON allocations(agency_id) WHERE kind='trial';
CREATE TABLE _reservations_backup AS SELECT * FROM reservations;
DROP TABLE reservations;
CREATE TABLE reservations (
  id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL REFERENCES agencies(id), job_id TEXT NOT NULL UNIQUE,
  allocation_id TEXT REFERENCES allocations(id),
  status TEXT NOT NULL CHECK(status IN ('unfunded','reserved','consumed','released')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(agency_id,job_id,id),
  CHECK((status='unfunded')=(allocation_id IS NULL)),
  FOREIGN KEY(agency_id,job_id) REFERENCES jobs(agency_id,id)
);
INSERT INTO reservations SELECT * FROM _reservations_backup;
DROP TABLE _reservations_backup;
CREATE INDEX reservations_allocation_status ON reservations(allocation_id,status);

CREATE TABLE trial_policy (
  id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  free_enabled INTEGER NOT NULL DEFAULT 0 CHECK(free_enabled IN (0,1)), free_monthly INTEGER NOT NULL DEFAULT 3 CHECK(free_monthly>0),
  session_days INTEGER NOT NULL DEFAULT 30 CHECK(session_days BETWEEN 1 AND 90),
  successes INTEGER NOT NULL DEFAULT 1 CHECK(successes>0), session_concurrency INTEGER NOT NULL DEFAULT 1 CHECK(session_concurrency>0),
  session_daily INTEGER NOT NULL DEFAULT 3 CHECK(session_daily>0), ip_daily INTEGER NOT NULL DEFAULT 5 CHECK(ip_daily>0),
  global_daily INTEGER NOT NULL DEFAULT 5 CHECK(global_daily>0), global_monthly INTEGER NOT NULL DEFAULT 30 CHECK(global_monthly>0),
  render_concurrency INTEGER NOT NULL DEFAULT 1 CHECK(render_concurrency=1),
  retention_hours INTEGER NOT NULL DEFAULT 24 CHECK(retention_hours BETWEEN 1 AND 72),
  active_minutes INTEGER NOT NULL DEFAULT 15 CHECK(active_minutes BETWEEN 5 AND 30),
  preview_provision_cents INTEGER NOT NULL DEFAULT 30 CHECK(preview_provision_cents BETWEEN 0 AND 50)
);
INSERT INTO trial_policy(id) VALUES(1);
CREATE TABLE anonymous_sessions (
  id TEXT PRIMARY KEY NOT NULL, proof_hash TEXT UNIQUE, scope_id TEXT NOT NULL UNIQUE REFERENCES agencies(id) DEFERRABLE INITIALLY DEFERRED,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, successes INTEGER NOT NULL DEFAULT 0 CHECK(successes>=0),
  CHECK(proof_hash IS NULL OR length(proof_hash)=64)
);
-- This is an internal storage namespace, not a customer agency or a user account.
CREATE TRIGGER anonymous_namespace AFTER INSERT ON anonymous_sessions
BEGIN
  INSERT INTO agencies(id,owner_user_id,name,primary_color,secondary_color,created_at,updated_at)
    VALUES(NEW.scope_id,NEW.id,'BienVu','#E1E8D9','#171714',NEW.created_at,NEW.created_at);
END;
ALTER TABLE generation_runs ADD COLUMN owner_agency_id TEXT REFERENCES agencies(id);
ALTER TABLE generation_runs ADD COLUMN anonymous_session_id TEXT REFERENCES anonymous_sessions(id);
ALTER TABLE generation_runs ADD COLUMN ip_hmac TEXT;
ALTER TABLE generation_runs ADD COLUMN turnstile_hash TEXT;
ALTER TABLE generation_runs ADD COLUMN claimed_at TEXT;
ALTER TABLE generation_runs ADD COLUMN retention TEXT NOT NULL DEFAULT 'available' CHECK(retention IN ('available','expiring','expired'));
ALTER TABLE generation_runs ADD COLUMN preview_provision_cents INTEGER NOT NULL DEFAULT 0 CHECK(preview_provision_cents BETWEEN 0 AND 50);
UPDATE generation_runs SET owner_agency_id=agency_id;
CREATE INDEX generations_owner ON generation_runs(owner_agency_id,created_at);
CREATE INDEX generations_session ON generation_runs(anonymous_session_id,created_at);
CREATE INDEX generations_ip ON generation_runs(ip_hmac,created_at) WHERE ip_hmac IS NOT NULL;
CREATE UNIQUE INDEX generations_turnstile ON generation_runs(turnstile_hash) WHERE turnstile_hash IS NOT NULL;
CREATE TABLE generation_events (
  job_id TEXT NOT NULL REFERENCES generation_runs(job_id),
  event TEXT NOT NULL CHECK(event IN ('requested','started','ready','failed','login','claimed','download')),
  created_at TEXT NOT NULL, PRIMARY KEY(job_id,event)
);
CREATE TABLE generation_previews (
  job_id TEXT PRIMARY KEY NOT NULL REFERENCES generation_runs(job_id), object_key TEXT NOT NULL UNIQUE,
  report_json TEXT NOT NULL CHECK(json_valid(report_json)), created_at TEXT NOT NULL
);

CREATE TRIGGER generation_admit BEFORE INSERT ON generation_runs
BEGIN
  SELECT RAISE(ABORT,'GENERATIONS_PAUSED') WHERE NOT EXISTS(SELECT 1 FROM generation_control WHERE enabled=1);
  SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NEW.anonymous_session_id IS NULL AND NOT EXISTS(
    SELECT 1 FROM allocations a WHERE a.id=NEW.allocation_id AND a.agency_id=NEW.agency_id
    AND a.valid_from<=NEW.created_at AND a.valid_until>NEW.created_at AND a.reserved+a.consumed<a.quota_limit
    AND (EXISTS(SELECT 1 FROM generation_access g WHERE g.agency_id=a.agency_id AND g.allocation_id=a.id AND g.enabled=1)
      OR (a.kind='free' AND (SELECT free_enabled FROM trial_policy WHERE id=1)=1 AND NOT EXISTS(SELECT 1 FROM subscriptions s WHERE s.agency_id=a.agency_id AND s.status NOT IN ('canceled','incomplete_expired')))));
  SELECT RAISE(ABORT,'ANONYMOUS_UNAVAILABLE') WHERE NEW.anonymous_session_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM trial_policy p,anonymous_sessions s WHERE p.enabled=1 AND s.id=NEW.anonymous_session_id
    AND s.scope_id=NEW.agency_id AND s.proof_hash IS NOT NULL AND s.expires_at>NEW.created_at
    AND NEW.owner_agency_id IS NULL AND NEW.allocation_id='unfunded' AND length(NEW.ip_hmac)=64 AND length(NEW.turnstile_hash)=64
    AND NEW.preview_provision_cents=p.preview_provision_cents);
  SELECT RAISE(ABORT,'TRIAL_USED') WHERE NEW.anonymous_session_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM anonymous_sessions s,trial_policy p WHERE s.id=NEW.anonymous_session_id AND s.successes>=p.successes);
  SELECT RAISE(ABORT,'TRIAL_LIMIT') WHERE NEW.anonymous_session_id IS NOT NULL AND EXISTS(SELECT 1 FROM trial_policy p WHERE
    (SELECT count(*) FROM generation_runs WHERE anonymous_session_id=NEW.anonymous_session_id AND julianday(created_at)>julianday(NEW.created_at)-1)>=p.session_daily
    OR (SELECT count(*) FROM generation_runs WHERE ip_hmac=NEW.ip_hmac AND julianday(created_at)>julianday(NEW.created_at)-1)>=p.ip_daily
    OR (SELECT count(*) FROM generation_runs WHERE anonymous_session_id IS NOT NULL AND substr(created_at,1,10)=substr(NEW.created_at,1,10))>=p.global_daily
    OR (SELECT count(*) FROM generation_runs WHERE anonymous_session_id IS NOT NULL AND month=NEW.month)>=p.global_monthly);
  SELECT RAISE(ABORT,'GENERATION_BUSY') WHERE NEW.anonymous_session_id IS NOT NULL AND EXISTS(SELECT 1 FROM trial_policy p WHERE
    (SELECT count(*) FROM generation_runs g JOIN jobs j ON j.id=g.job_id WHERE g.anonymous_session_id=NEW.anonymous_session_id AND j.status NOT IN ('ready','failed'))>=p.session_concurrency
    OR (SELECT count(*) FROM generation_runs g JOIN jobs j ON j.id=g.job_id WHERE g.anonymous_session_id IS NOT NULL AND j.status NOT IN ('ready','failed'))>=p.render_concurrency);
-- Existing global renderer gate and total-service limits remain in force.
  SELECT RAISE(ABORT,'GENERATION_BUSY') WHERE EXISTS(SELECT 1 FROM jobs WHERE status NOT IN ('ready','failed'));
  SELECT RAISE(ABORT,'GENERATION_BUDGET_LIMIT') WHERE NOT EXISTS(SELECT 1 FROM hosted_import_budget WHERE month=NEW.month AND paused=0 AND
    baseline_cents+NEW.provision_cents+NEW.preview_provision_cents+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=NEW.month)<=ceiling_cents);
  SELECT RAISE(ABORT,'GENERATION_BUDGET_LIMIT') WHERE (SELECT count(*) FROM generation_runs WHERE month=NEW.month)>=30;
  SELECT RAISE(ABORT,'GENERATION_BUDGET_LIMIT') WHERE (SELECT count(*) FROM generation_runs WHERE substr(created_at,1,10)=substr(NEW.created_at,1,10))>=5;
END;
CREATE TRIGGER generation_create AFTER INSERT ON generation_runs
BEGIN
  UPDATE generation_runs SET owner_agency_id=NEW.agency_id WHERE job_id=NEW.job_id AND anonymous_session_id IS NULL;
  UPDATE hosted_import_budget SET baseline_cents=baseline_cents+NEW.provision_cents+NEW.preview_provision_cents WHERE month=NEW.month;
  UPDATE allocations SET reserved=reserved+1 WHERE id=NEW.allocation_id AND agency_id=NEW.agency_id;
  INSERT INTO jobs(id,agency_id,listing_id,source_url,idempotency_key,status,stage,lease_until,workflow_id,reservation_id,created_at,updated_at)
    VALUES(NEW.job_id,NEW.agency_id,json_extract(NEW.input_json,'$.listingId'),coalesce(json_extract(NEW.input_json,'$.url'),''),
    NEW.idempotency_key,'queued','importing',NEW.deadline,'generation-'||NEW.job_id,NEW.reservation_id,NEW.created_at,NEW.created_at);
  INSERT INTO reservations(id,agency_id,job_id,allocation_id,status,created_at,updated_at)
    VALUES(NEW.reservation_id,NEW.agency_id,NEW.job_id,IIF(NEW.anonymous_session_id IS NULL,NEW.allocation_id,NULL),
    IIF(NEW.anonymous_session_id IS NULL,'reserved','unfunded'),NEW.created_at,NEW.created_at);
  INSERT INTO job_launch_intents(job_id,agency_id,workflow_id,status,created_at,updated_at)
    VALUES(NEW.job_id,NEW.agency_id,'generation-'||NEW.job_id,'pending',NEW.created_at,NEW.created_at);
  INSERT INTO generation_events VALUES(NEW.job_id,'requested',NEW.created_at);
END;
CREATE TRIGGER generation_owner_guard BEFORE UPDATE OF owner_agency_id ON generation_runs
WHEN NEW.anonymous_session_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'FORBIDDEN') WHERE OLD.owner_agency_id IS NOT NULL AND NEW.owner_agency_id IS NOT OLD.owner_agency_id;
  SELECT RAISE(ABORT,'TRIAL_EXPIRED') WHERE OLD.owner_agency_id IS NULL AND NEW.owner_agency_id IS NOT NULL
    AND (OLD.retention!='available' OR OLD.expires_at<=NEW.claimed_at);
END;
CREATE TRIGGER generation_retention_guard BEFORE UPDATE OF retention ON generation_runs
WHEN NEW.retention!=OLD.retention
BEGIN
  SELECT RAISE(ABORT,'FORBIDDEN') WHERE OLD.owner_agency_id IS NOT NULL OR OLD.anonymous_session_id IS NULL
    OR (OLD.retention='expired') OR (OLD.retention='expiring' AND NEW.retention!='expired');
END;
-- Reservation funding is the only operation that allocates a credit to a claim.
-- This trigger validates and mutates the original period within one statement.
CREATE TRIGGER reservation_funding BEFORE UPDATE OF allocation_id ON reservations
WHEN NEW.allocation_id IS NOT OLD.allocation_id
BEGIN
  SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE OLD.status!='unfunded' OR NEW.status NOT IN ('reserved','consumed') OR NOT EXISTS(
    SELECT 1 FROM allocations a JOIN generation_runs g ON g.owner_agency_id=a.agency_id JOIN jobs j ON j.id=g.job_id
    WHERE g.job_id=NEW.job_id AND g.retention='available' AND g.expires_at>NEW.updated_at AND a.id=NEW.allocation_id
    AND a.valid_from<=NEW.updated_at AND a.valid_until>NEW.updated_at AND a.reserved+a.consumed<a.quota_limit
    AND j.status!='failed' AND NEW.status=IIF(j.status='ready','consumed','reserved'));
  UPDATE allocations SET reserved=reserved+(NEW.status='reserved'),consumed=consumed+(NEW.status='consumed') WHERE id=NEW.allocation_id;
END;
CREATE TRIGGER generation_terminal BEFORE UPDATE OF status ON jobs
WHEN EXISTS(SELECT 1 FROM generation_runs WHERE job_id=NEW.id)
BEGIN
  SELECT RAISE(ABORT,'GENERATION_TERMINAL') WHERE OLD.status IN ('ready','failed') AND NEW.status!=OLD.status;
  SELECT RAISE(ABORT,'TRIAL_EXPIRED') WHERE NEW.status='ready' AND EXISTS(SELECT 1 FROM generation_runs WHERE job_id=NEW.id AND retention!='available');
  SELECT RAISE(ABORT,'GENERATION_ARTIFACT_REQUIRED') WHERE NEW.status='ready' AND (NOT EXISTS(SELECT 1 FROM generation_artifacts WHERE job_id=NEW.id)
    OR (EXISTS(SELECT 1 FROM generation_runs WHERE job_id=NEW.id AND anonymous_session_id IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM generation_previews WHERE job_id=NEW.id)));
END;
CREATE TRIGGER generation_settle AFTER UPDATE OF status ON jobs
WHEN OLD.status NOT IN ('ready','failed') AND NEW.status IN ('ready','failed') AND EXISTS(SELECT 1 FROM generation_runs WHERE job_id=NEW.id)
BEGIN
  UPDATE allocations SET reserved=reserved-1,consumed=consumed+(NEW.status='ready')
    WHERE id=(SELECT allocation_id FROM reservations WHERE job_id=NEW.id AND status='reserved');
  UPDATE reservations SET status=IIF(NEW.status='ready','consumed','released'),updated_at=NEW.updated_at WHERE job_id=NEW.id AND status='reserved';
  UPDATE job_launch_intents SET status='cancelled',updated_at=NEW.updated_at WHERE job_id=NEW.id AND status='pending';
  UPDATE anonymous_sessions SET successes=successes+1 WHERE NEW.status='ready' AND id=(SELECT anonymous_session_id FROM generation_runs WHERE job_id=NEW.id);
  UPDATE generation_runs SET expires_at=strftime('%Y-%m-%dT%H:%M:%fZ',NEW.updated_at,'+'||(SELECT retention_hours FROM trial_policy WHERE id=1)||' hours')
    WHERE job_id=NEW.id AND owner_agency_id IS NULL AND retention='available';
  INSERT OR IGNORE INTO generation_events VALUES(NEW.id,NEW.status,NEW.updated_at);
END;
CREATE TRIGGER generation_started AFTER UPDATE OF status ON jobs
WHEN OLD.status='queued' AND NEW.status NOT IN ('queued','failed') AND EXISTS(SELECT 1 FROM generation_runs WHERE job_id=NEW.id)
BEGIN
  INSERT OR IGNORE INTO generation_events VALUES(NEW.id,'started',NEW.updated_at);
END;
ALTER TABLE generation_runs ADD COLUMN funding_candidate TEXT REFERENCES allocations(id);
CREATE TRIGGER generation_claim_fund AFTER UPDATE OF owner_agency_id,funding_candidate ON generation_runs
WHEN NEW.owner_agency_id IS NOT NULL AND NEW.anonymous_session_id IS NOT NULL
BEGIN
  UPDATE reservations SET allocation_id=NEW.funding_candidate,
    status=IIF((SELECT status FROM jobs WHERE id=NEW.job_id)='ready','consumed','reserved'),updated_at=NEW.claimed_at
    WHERE job_id=NEW.job_id AND status='unfunded' AND NEW.retention='available'
    AND (SELECT status FROM jobs WHERE id=NEW.job_id)!='failed' AND EXISTS(SELECT 1 FROM allocations a
      WHERE a.id=NEW.funding_candidate AND a.agency_id=NEW.owner_agency_id AND a.valid_from<=NEW.claimed_at AND a.valid_until>NEW.claimed_at
      AND a.reserved+a.consumed<a.quota_limit AND (a.kind!='free' OR NOT EXISTS(SELECT 1 FROM subscriptions s WHERE s.agency_id=a.agency_id AND s.status NOT IN ('canceled','incomplete_expired'))));
  INSERT OR IGNORE INTO generation_events VALUES(NEW.job_id,'claimed',NEW.claimed_at);
END;
ALTER TABLE anonymous_sessions ADD COLUMN claim_job_id TEXT REFERENCES generation_runs(job_id);
-- Retain the old cross-agency insertion invariant. Only a claimed anonymous
-- reservation may subsequently be funded by its new owner's allocation.
CREATE TRIGGER reservation_owner_insert BEFORE INSERT ON reservations
WHEN NEW.allocation_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM allocations a WHERE a.id=NEW.allocation_id
  AND a.agency_id=coalesce((SELECT owner_agency_id FROM generation_runs WHERE job_id=NEW.job_id),NEW.agency_id))
BEGIN SELECT RAISE(ABORT,'FOREIGN KEY allocation owner mismatch'); END;
