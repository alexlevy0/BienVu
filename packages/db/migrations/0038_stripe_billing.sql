CREATE TABLE billing_customers(agency_id TEXT NOT NULL REFERENCES agencies(id),mode TEXT NOT NULL CHECK(mode IN ('test','live')),customer_id TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,PRIMARY KEY(agency_id,mode));
CREATE TABLE billing_checkouts(agency_id TEXT NOT NULL REFERENCES agencies(id),idempotency_key TEXT NOT NULL,plan TEXT NOT NULL CHECK(plan IN ('plus','pro')),mode TEXT NOT NULL CHECK(mode IN ('test','live')),session_id TEXT UNIQUE,url TEXT,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(agency_id,mode,idempotency_key));
CREATE TRIGGER billing_checkout_single BEFORE INSERT ON billing_checkouts WHEN EXISTS(SELECT 1 FROM billing_checkouts WHERE agency_id=NEW.agency_id AND mode=NEW.mode AND expires_at>NEW.created_at AND idempotency_key!=NEW.idempotency_key) BEGIN SELECT RAISE(ABORT,'CHECKOUT_IN_PROGRESS'); END;
CREATE TABLE stripe_webhook_events(id TEXT PRIMARY KEY,mode TEXT NOT NULL CHECK(mode IN ('test','live')),type TEXT NOT NULL,payload_hash TEXT NOT NULL,provider_created INTEGER NOT NULL,processed_at TEXT NOT NULL);
CREATE TABLE billing_invoices(id TEXT PRIMARY KEY,agency_id TEXT NOT NULL REFERENCES agencies(id),mode TEXT NOT NULL CHECK(mode IN ('test','live')),subscription_id TEXT NOT NULL,plan TEXT NOT NULL CHECK(plan IN ('plus','pro')),amount_paid INTEGER NOT NULL CHECK(amount_paid>=0),subtotal_excluding_tax INTEGER NOT NULL CHECK(subtotal_excluding_tax>=0),currency TEXT NOT NULL CHECK(currency='eur'),period_start TEXT NOT NULL,period_end TEXT NOT NULL,allocation_id TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX billing_invoice_agency ON billing_invoices(agency_id,period_start,period_end);
ALTER TABLE subscriptions ADD COLUMN stripe_mode TEXT NOT NULL DEFAULT 'live' CHECK(stripe_mode IN ('test','live'));

-- Verified invoices authorize their own period, including a prepaid renewal.
DROP TRIGGER generation_admit;
CREATE TRIGGER generation_admit BEFORE INSERT ON generation_runs
BEGIN
  SELECT RAISE(ABORT,'GENERATIONS_PAUSED') WHERE NOT EXISTS(SELECT 1 FROM generation_control WHERE enabled=1);
  SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NEW.anonymous_session_id IS NULL AND NOT EXISTS(
    SELECT 1 FROM allocations a WHERE a.id=NEW.allocation_id AND a.agency_id=NEW.agency_id
    AND a.valid_from<=NEW.created_at AND a.valid_until>NEW.created_at AND a.reserved+a.consumed<a.quota_limit
    AND (EXISTS(SELECT 1 FROM generation_access g WHERE g.agency_id=a.agency_id AND g.allocation_id=a.id AND g.enabled=1)
      OR (a.kind='paid' AND EXISTS(SELECT 1 FROM billing_invoices i WHERE i.agency_id=a.agency_id AND i.allocation_id=a.id))
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
