-- Bounded durable queues. No idle renderer starts while a job waits for a provider.
-- Existing credits, anonymous protections and monetary budget guards are retained.
CREATE TABLE generation_queue_settings(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL DEFAULT 1,settings_json TEXT NOT NULL CHECK(json_valid(settings_json)),updated_at TEXT NOT NULL);
INSERT INTO generation_queue_settings VALUES(1,1,'{"preparationConcurrency":5,"perAgencyConcurrency":2,"renderConcurrency":3,"runwayConcurrency":5,"maxPending":40,"maxPerAgency":5,"maxWaitMinutes":20}',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE generation_queue_setting_events(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,settings_json TEXT NOT NULL CHECK(json_valid(settings_json)),expected_revision INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE TRIGGER generation_queue_settings_guard BEFORE INSERT ON generation_queue_setting_events BEGIN
 SELECT RAISE(ABORT,'GENERATION_QUEUE_SETTING_CONFLICT') WHERE NEW.expected_revision!=(SELECT revision FROM generation_queue_settings WHERE id=1);
 SELECT RAISE(ABORT,'VALIDATION_ERROR') WHERE json_type(NEW.settings_json)!='object'
  OR (SELECT count(*) FROM json_each(NEW.settings_json))!=7
  OR (SELECT count(DISTINCT key) FROM json_each(NEW.settings_json))!=7
  OR EXISTS(SELECT 1 FROM json_each(NEW.settings_json) WHERE type!='integer'
    OR key NOT IN ('preparationConcurrency','perAgencyConcurrency','renderConcurrency','runwayConcurrency','maxPending','maxPerAgency','maxWaitMinutes')) OR
  json_extract(NEW.settings_json,'$.preparationConcurrency') NOT BETWEEN 1 AND 20 OR
  json_extract(NEW.settings_json,'$.perAgencyConcurrency') NOT BETWEEN 1 AND 5 OR
  json_extract(NEW.settings_json,'$.renderConcurrency') NOT BETWEEN 1 AND 5 OR
  json_extract(NEW.settings_json,'$.runwayConcurrency') NOT BETWEEN 1 AND 20 OR
  json_extract(NEW.settings_json,'$.maxPending') NOT BETWEEN 1 AND 200 OR
  json_extract(NEW.settings_json,'$.maxPerAgency') NOT BETWEEN 1 AND 10 OR
  json_extract(NEW.settings_json,'$.maxWaitMinutes') NOT BETWEEN 1 AND 20 OR
  json_extract(NEW.settings_json,'$.perAgencyConcurrency')>json_extract(NEW.settings_json,'$.preparationConcurrency') OR
  json_extract(NEW.settings_json,'$.perAgencyConcurrency')>json_extract(NEW.settings_json,'$.maxPerAgency') OR
  json_extract(NEW.settings_json,'$.maxPerAgency')>json_extract(NEW.settings_json,'$.maxPending');
 SELECT RAISE(ABORT,'GENERATION_QUEUE_SETTING_RATE_LIMIT') WHERE (SELECT count(*) FROM generation_queue_setting_events WHERE actor_id=NEW.actor_id AND julianday(created_at)>julianday(NEW.created_at)-1.0/24)>=20;
END;
CREATE TRIGGER generation_queue_settings_apply AFTER INSERT ON generation_queue_setting_events BEGIN
 UPDATE generation_queue_settings SET settings_json=NEW.settings_json,revision=revision+1,updated_at=NEW.created_at WHERE id=1;
END;
CREATE TRIGGER generation_queue_settings_audit_immutable BEFORE UPDATE ON generation_queue_setting_events BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TRIGGER generation_queue_settings_audit_no_delete BEFORE DELETE ON generation_queue_setting_events BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;
CREATE TABLE generation_provider_limits(provider TEXT PRIMARY KEY CHECK(provider='runway'),concurrency INTEGER NOT NULL CHECK(concurrency BETWEEN 1 AND 100),daily_limit INTEGER NOT NULL CHECK(daily_limit>0),checked_at TEXT,last_error TEXT);
INSERT INTO generation_provider_limits VALUES('runway',1,50,NULL,NULL);
DROP INDEX jobs_one_active_per_agency;
CREATE INDEX jobs_active_per_agency ON jobs(agency_id) WHERE status NOT IN ('ready','failed');
ALTER TABLE generation_runs ADD COLUMN render_slot INTEGER CHECK(render_slot BETWEEN 0 AND 4);
CREATE TABLE generation_queue(
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT NOT NULL REFERENCES generation_runs(job_id),agency_id TEXT NOT NULL,
 resource TEXT NOT NULL CHECK(resource IN ('preparation','avatar','runway','render')),
 state TEXT NOT NULL DEFAULT 'waiting' CHECK(state IN ('waiting','active','released')),slot INTEGER CHECK(slot BETWEEN 0 AND 19),
 created_at TEXT NOT NULL,started_at TEXT,updated_at TEXT NOT NULL,UNIQUE(job_id,resource)
);
CREATE INDEX generation_queue_waiting ON generation_queue(resource,state,sequence);
CREATE UNIQUE INDEX generation_queue_active_slot ON generation_queue(resource,slot) WHERE state='active';
CREATE TABLE generation_queue_slots(slot INTEGER PRIMARY KEY CHECK(slot BETWEEN 0 AND 19));
INSERT INTO generation_queue_slots VALUES(0),(1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12),(13),(14),(15),(16),(17),(18),(19);
CREATE VIEW generation_queue_capacity AS
 SELECT 'preparation' AS resource,json_extract(settings_json,'$.preparationConcurrency') AS concurrency FROM generation_queue_settings WHERE id=1
 UNION ALL SELECT 'render',json_extract(settings_json,'$.renderConcurrency') FROM generation_queue_settings WHERE id=1
 UNION ALL SELECT 'runway',min(json_extract(s.settings_json,'$.runwayConcurrency'),IIF(p.last_error IS NULL AND p.checked_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 hour'),p.concurrency,1)) FROM generation_queue_settings s JOIN generation_provider_limits p ON p.provider='runway' WHERE s.id=1
 UNION ALL SELECT 'avatar',min(20,json_extract(settings_json,'$.concurrent')) FROM avatar_settings WHERE id=1;
CREATE TRIGGER generation_queue_enrol AFTER INSERT ON generation_runs BEGIN
 INSERT INTO generation_queue(job_id,agency_id,resource,created_at,updated_at) VALUES(NEW.job_id,NEW.agency_id,'preparation',NEW.created_at,NEW.created_at);
END;
CREATE TRIGGER generation_queue_render_route AFTER UPDATE OF state ON generation_queue WHEN NEW.state='active' AND NEW.resource='render' BEGIN
 UPDATE generation_runs SET render_slot=NEW.slot WHERE job_id=NEW.job_id AND render_slot IS NULL;
END;
CREATE TRIGGER generation_queue_release AFTER UPDATE OF status ON jobs WHEN NEW.status IN ('ready','failed') BEGIN
 UPDATE generation_queue SET state='released',updated_at=NEW.updated_at WHERE job_id=NEW.id AND state!='released';
END;

DROP TRIGGER generation_admit;
CREATE TRIGGER generation_admit BEFORE INSERT ON generation_runs
BEGIN
  SELECT RAISE(ABORT,'GENERATIONS_PAUSED') WHERE NOT EXISTS(SELECT 1 FROM generation_control WHERE enabled=1);
  SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NEW.anonymous_session_id IS NULL AND NEW.funding_version=0 AND NOT EXISTS(
    SELECT 1 FROM allocations a WHERE a.id=NEW.allocation_id AND a.agency_id=NEW.agency_id
    AND a.valid_from<=NEW.created_at AND a.valid_until>NEW.created_at AND a.reserved+a.consumed<a.quota_limit
    AND (EXISTS(SELECT 1 FROM generation_access g WHERE g.agency_id=a.agency_id AND g.allocation_id=a.id AND g.enabled=1)
      OR (a.kind='paid' AND EXISTS(SELECT 1 FROM billing_invoices i WHERE i.agency_id=a.agency_id AND i.allocation_id=a.id))
      OR (a.kind='free' AND (SELECT free_enabled FROM trial_policy WHERE id=1)=1 AND NOT EXISTS(SELECT 1 FROM subscriptions s WHERE s.agency_id=a.agency_id AND s.status NOT IN ('canceled','incomplete_expired')))));
  SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NEW.anonymous_session_id IS NULL AND NEW.funding_version=1 AND NOT EXISTS(
    SELECT 1 FROM spendable_credit_sources a WHERE a.id=NEW.allocation_id AND a.agency_id=NEW.agency_id AND a.enabled=1
    AND a.valid_from<=NEW.created_at AND a.valid_until>NEW.created_at);
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
    (SELECT count(*) FROM generation_runs g JOIN jobs j ON j.id=g.job_id WHERE g.anonymous_session_id=NEW.anonymous_session_id AND j.status NOT IN ('ready','failed'))>=p.session_concurrency);
  SELECT RAISE(ABORT,'GENERATION_QUEUE_FULL') WHERE
    (SELECT count(*) FROM jobs WHERE status NOT IN ('ready','failed'))>=(SELECT json_extract(settings_json,'$.maxPending') FROM generation_queue_settings WHERE id=1)
    OR (SELECT count(*) FROM jobs WHERE agency_id=NEW.agency_id AND status NOT IN ('ready','failed'))>=(SELECT json_extract(settings_json,'$.maxPerAgency') FROM generation_queue_settings WHERE id=1);
  SELECT RAISE(ABORT,'GENERATION_BUDGET_LIMIT') WHERE NOT EXISTS(SELECT 1 FROM hosted_import_budget WHERE month=NEW.month AND paused=0 AND
    baseline_cents+NEW.provision_cents+NEW.preview_provision_cents+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=NEW.month)<=ceiling_cents);
END;

DROP TRIGGER anonymous_manual_admit;
CREATE TRIGGER anonymous_manual_admit BEFORE INSERT ON anonymous_manual_imports
WHEN NOT EXISTS(SELECT 1 FROM anonymous_manual_imports WHERE session_id=NEW.session_id AND idempotency_key=NEW.idempotency_key)
BEGIN
  SELECT RAISE(ABORT,'ANONYMOUS_UNAVAILABLE') WHERE NOT EXISTS(
    SELECT 1 FROM anonymous_sessions s,trial_policy p WHERE s.id=NEW.session_id AND s.expires_at>NEW.created_at
    AND s.proof_hash IS NOT NULL AND p.enabled=1 AND NEW.turnstile_hash IS NOT NULL AND NEW.ip_hmac IS NOT NULL);
  SELECT RAISE(ABORT,'GENERATIONS_PAUSED') WHERE NOT EXISTS(SELECT 1 FROM generation_control WHERE enabled=1);
  SELECT RAISE(ABORT,'TRIAL_USED') WHERE NOT EXISTS(
    SELECT 1 FROM anonymous_sessions s,trial_policy p WHERE s.id=NEW.session_id
    AND s.successes<p.successes AND s.credits_reserved+s.credits_consumed<s.credits_granted);
  SELECT RAISE(ABORT,'TRIAL_LIMIT') WHERE EXISTS(SELECT 1 FROM trial_policy p WHERE
    (SELECT count(*) FROM anonymous_manual_imports WHERE session_id=NEW.session_id AND julianday(created_at)>julianday(NEW.created_at)-1)>=p.session_daily
    OR (SELECT count(*) FROM anonymous_manual_imports WHERE ip_hmac=NEW.ip_hmac AND julianday(created_at)>julianday(NEW.created_at)-1)>=p.ip_daily
    OR (SELECT count(*) FROM anonymous_manual_imports WHERE substr(created_at,1,10)=substr(NEW.created_at,1,10))>=p.global_daily
    OR (SELECT count(*) FROM anonymous_manual_imports WHERE substr(created_at,1,7)=substr(NEW.created_at,1,7))>=p.global_monthly);

  SELECT RAISE(ABORT,'IMPORT_BUDGET_LIMIT') WHERE NOT EXISTS(SELECT 1 FROM hosted_import_budget b WHERE
    b.month=substr(NEW.created_at,1,7) AND b.paused=0 AND b.baseline_cents+50+
    (SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=b.month)<=b.ceiling_cents);
  SELECT RAISE(ABORT,'BOT_VERIFICATION_FAILED') WHERE EXISTS(SELECT 1 FROM generation_runs WHERE turnstile_hash=NEW.turnstile_hash);
END;
