-- Purchased credits are independent from monthly periods. No historical row is
-- rewritten; only new authenticated jobs opt into funding from several sources.
CREATE TABLE credit_payment_policy(id INTEGER PRIMARY KEY CHECK(id=1),mode TEXT NOT NULL CHECK(mode IN ('test','live')),topup_valid_days INTEGER NOT NULL DEFAULT 0 CHECK(topup_valid_days IN (0,365)));
INSERT INTO credit_payment_policy VALUES(1,'test',0);
CREATE TABLE billing_topup_checkouts(
 agency_id TEXT NOT NULL REFERENCES agencies(id),mode TEXT NOT NULL CHECK(mode IN ('test','live')),idempotency_key TEXT NOT NULL,
 pack TEXT NOT NULL CHECK(pack IN ('pack10','pack30','pack100')),credits INTEGER NOT NULL CHECK(credits IN (10,30,100)),price_cents INTEGER NOT NULL CHECK(price_cents IN (700,1900,5900)),
 session_id TEXT UNIQUE,url TEXT,valid_days INTEGER NOT NULL DEFAULT 0 CHECK(valid_days IN (0,365)),expires_at TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(agency_id,mode,idempotency_key),
 CHECK((pack='pack10' AND credits=10 AND price_cents=700) OR (pack='pack30' AND credits=30 AND price_cents=1900) OR (pack='pack100' AND credits=100 AND price_cents=5900))
);
CREATE TRIGGER topup_checkout_single BEFORE INSERT ON billing_topup_checkouts
WHEN EXISTS(SELECT 1 FROM billing_topup_checkouts WHERE agency_id=NEW.agency_id AND mode=NEW.mode AND expires_at>NEW.created_at AND idempotency_key!=NEW.idempotency_key)
BEGIN SELECT RAISE(ABORT,'CHECKOUT_IN_PROGRESS'); END;
CREATE TABLE financial_receipts(
 id TEXT PRIMARY KEY,agency_id TEXT NOT NULL REFERENCES agencies(id),mode TEXT NOT NULL CHECK(mode IN ('test','live')),
 kind TEXT NOT NULL CHECK(kind IN ('subscription','topup')),allocation_id TEXT NOT NULL UNIQUE,credits INTEGER NOT NULL CHECK(credits>0),
 gross_cents INTEGER NOT NULL CHECK(gross_cents>0),revenue_ht_cents INTEGER NOT NULL CHECK(revenue_ht_cents BETWEEN 0 AND gross_cents),
 currency TEXT NOT NULL CHECK(currency='eur'),customer_id TEXT NOT NULL,payment_intent_id TEXT UNIQUE,invoice_id TEXT UNIQUE,checkout_session_id TEXT UNIQUE,
 lost_cents INTEGER NOT NULL DEFAULT 0 CHECK(lost_cents>=0),refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK(refunded_cents BETWEEN 0 AND gross_cents),reversed_credits INTEGER NOT NULL DEFAULT 0 CHECK(reversed_credits BETWEEN 0 AND credits),
 disputed INTEGER NOT NULL DEFAULT 0 CHECK(disputed IN (0,1)),fee_cents INTEGER,fees_complete INTEGER NOT NULL DEFAULT 0 CHECK(fees_complete IN (0,1)),
 paid_at TEXT NOT NULL,checked_at TEXT,FOREIGN KEY(agency_id,allocation_id) REFERENCES allocations(agency_id,id)
);
CREATE INDEX financial_receipts_agency ON financial_receipts(agency_id,mode,paid_at);
INSERT INTO financial_receipts(id,agency_id,mode,kind,allocation_id,credits,gross_cents,revenue_ht_cents,currency,customer_id,invoice_id,paid_at)
 SELECT 'invoice-'||i.id,i.agency_id,i.mode,'subscription',i.allocation_id,CASE i.plan WHEN 'plus' THEN 40 ELSE 120 END,i.amount_paid,i.subtotal_excluding_tax,'eur',c.customer_id,i.id,i.created_at
 FROM billing_invoices i JOIN allocations a ON a.id=i.allocation_id AND a.agency_id=i.agency_id
 JOIN billing_customers c ON c.agency_id=i.agency_id AND c.mode=i.mode WHERE i.amount_paid>0
 ON CONFLICT(allocation_id) DO NOTHING;
CREATE TRIGGER receipt_original_immutable BEFORE UPDATE OF agency_id,mode,kind,allocation_id,credits,gross_cents,revenue_ht_cents,currency,customer_id,payment_intent_id,invoice_id,checkout_session_id,paid_at ON financial_receipts
BEGIN SELECT RAISE(ABORT,'FINANCIAL_RECEIPT_IMMUTABLE'); END;
CREATE TABLE financial_charges(
 id TEXT PRIMARY KEY,receipt_id TEXT NOT NULL REFERENCES financial_receipts(id),payment_intent_id TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0),lost_cents INTEGER NOT NULL DEFAULT 0 CHECK(lost_cents>=0),refunded_cents INTEGER NOT NULL CHECK(refunded_cents BETWEEN 0 AND amount_cents),
 balance_transaction_id TEXT UNIQUE,currency TEXT,settlement_amount INTEGER,fee_minor INTEGER,net_minor INTEGER,
 dispute_fee_minor INTEGER,refund_fee_minor INTEGER,disputed INTEGER NOT NULL CHECK(disputed IN (0,1)),complete INTEGER NOT NULL CHECK(complete IN (0,1)),checked_at TEXT NOT NULL
);
CREATE TRIGGER financial_charge_owner BEFORE UPDATE OF receipt_id,payment_intent_id ON financial_charges
WHEN NEW.receipt_id!=OLD.receipt_id OR NEW.payment_intent_id!=OLD.payment_intent_id
BEGIN SELECT RAISE(ABORT,'FINANCIAL_RECEIPT_IMMUTABLE'); END;
CREATE TABLE credit_topups(
 session_id TEXT PRIMARY KEY,agency_id TEXT NOT NULL REFERENCES agencies(id),mode TEXT NOT NULL CHECK(mode IN ('test','live')),
 pack TEXT NOT NULL CHECK(pack IN ('pack10','pack30','pack100')),allocation_id TEXT NOT NULL UNIQUE,
 receipt_id TEXT NOT NULL UNIQUE REFERENCES financial_receipts(id),created_at TEXT NOT NULL,
 FOREIGN KEY(agency_id,allocation_id) REFERENCES allocations(agency_id,id)
);
CREATE INDEX credit_topups_agency ON credit_topups(agency_id,mode,created_at);
CREATE VIEW spendable_credit_sources AS
SELECT a.*,max(0,a.quota_limit-a.reserved-a.consumed-coalesce(f.reversed_credits,0)) AS available,
 IIF(t.allocation_id IS NULL,0,1) AS purchased,
 IIF(t.allocation_id IS NOT NULL,1,CASE
  WHEN EXISTS(SELECT 1 FROM generation_access g WHERE g.agency_id=a.agency_id AND g.allocation_id=a.id AND g.enabled=1) THEN 1
  WHEN a.kind='paid' AND EXISTS(SELECT 1 FROM billing_invoices i WHERE i.allocation_id=a.id AND i.agency_id=a.agency_id AND i.mode=(SELECT mode FROM credit_payment_policy WHERE id=1)) THEN 1
  WHEN a.kind='free' AND (SELECT free_enabled FROM trial_policy WHERE id=1)=1 AND NOT EXISTS(SELECT 1 FROM subscriptions s WHERE s.agency_id=a.agency_id AND s.status NOT IN ('canceled','incomplete_expired')) THEN 1 ELSE 0 END) AS enabled
FROM allocations a LEFT JOIN credit_topups t ON t.allocation_id=a.id
LEFT JOIN financial_receipts f ON f.allocation_id=a.id
WHERE (t.mode IS NULL OR t.mode=(SELECT mode FROM credit_payment_policy WHERE id=1))
 AND (f.mode IS NULL OR f.mode=(SELECT mode FROM credit_payment_policy WHERE id=1))
 AND coalesce(f.disputed,0)=0
 AND NOT EXISTS(SELECT 1 FROM financial_receipts debt JOIN allocations d ON d.id=debt.allocation_id
  WHERE debt.agency_id=a.agency_id AND debt.mode=(SELECT mode FROM credit_payment_policy WHERE id=1)
  AND (debt.disputed=1 OR debt.reversed_credits+d.reserved+d.consumed>d.quota_limit));

ALTER TABLE generation_runs ADD COLUMN funding_version INTEGER NOT NULL DEFAULT 0 CHECK(funding_version IN (0,1));
CREATE TRIGGER generation_funding_immutable BEFORE UPDATE OF funding_version ON generation_runs
WHEN NEW.funding_version!=OLD.funding_version BEGIN SELECT RAISE(ABORT,'CREDIT_PRICING_IMMUTABLE'); END;
CREATE TABLE generation_credit_parts(
 job_id TEXT NOT NULL REFERENCES generation_runs(job_id),agency_id TEXT NOT NULL REFERENCES agencies(id),allocation_id TEXT NOT NULL,
 priority INTEGER NOT NULL CHECK(priority IN (0,1)),amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 13),
 consumed INTEGER NOT NULL DEFAULT 0 CHECK(consumed BETWEEN 0 AND amount),settled INTEGER NOT NULL DEFAULT 0 CHECK(settled IN (0,1)),
 PRIMARY KEY(job_id,allocation_id),FOREIGN KEY(agency_id,allocation_id) REFERENCES allocations(agency_id,id)
);
CREATE INDEX generation_credit_parts_allocation ON generation_credit_parts(allocation_id,job_id);
CREATE TRIGGER credit_part_guard BEFORE INSERT ON generation_credit_parts
BEGIN
 SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NOT EXISTS(
  SELECT 1 FROM generation_runs g JOIN spendable_credit_sources a ON a.agency_id=g.agency_id
  WHERE g.job_id=NEW.job_id AND g.funding_version=1 AND g.anonymous_session_id IS NULL
  AND a.id=NEW.allocation_id AND a.agency_id=NEW.agency_id AND a.enabled=1
  AND (a.id=g.allocation_id OR a.purchased=1) AND a.valid_from<=g.created_at AND a.valid_until>g.created_at
  AND a.available>=NEW.amount AND NEW.priority=a.purchased);
 SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NEW.amount+(SELECT coalesce(sum(amount),0) FROM generation_credit_parts WHERE job_id=NEW.job_id)>(SELECT credits_total FROM generation_runs WHERE job_id=NEW.job_id);
END;
CREATE TRIGGER credit_part_reserve AFTER INSERT ON generation_credit_parts
BEGIN UPDATE allocations SET reserved=reserved+NEW.amount WHERE id=NEW.allocation_id; END;
CREATE TRIGGER credit_part_immutable BEFORE UPDATE OF job_id,agency_id,allocation_id,priority,amount ON generation_credit_parts
BEGIN SELECT RAISE(ABORT,'CREDIT_PRICING_IMMUTABLE'); END;
CREATE TRIGGER credit_part_settle BEFORE UPDATE OF consumed,settled ON generation_credit_parts
BEGIN
 SELECT RAISE(ABORT,'CREDIT_PRICING_IMMUTABLE') WHERE OLD.settled=1 OR NEW.settled!=1
  OR NOT EXISTS(SELECT 1 FROM jobs WHERE id=NEW.job_id AND status IN ('ready','failed'));
 UPDATE allocations SET reserved=reserved-OLD.amount,consumed=consumed+NEW.consumed WHERE id=OLD.allocation_id;
END;

DROP TRIGGER generation_admit;
DROP TRIGGER generation_credit_admit;
DROP TRIGGER generation_create;
DROP TRIGGER generation_settle;
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
    (SELECT count(*) FROM generation_runs g JOIN jobs j ON j.id=g.job_id WHERE g.anonymous_session_id=NEW.anonymous_session_id AND j.status NOT IN ('ready','failed'))>=p.session_concurrency
    OR (SELECT count(*) FROM generation_runs g JOIN jobs j ON j.id=g.job_id WHERE g.anonymous_session_id IS NOT NULL AND j.status NOT IN ('ready','failed'))>=p.render_concurrency);
-- Existing global renderer gate and total-service limits remain in force.
  SELECT RAISE(ABORT,'GENERATION_BUSY') WHERE EXISTS(SELECT 1 FROM jobs WHERE status NOT IN ('ready','failed'));
  SELECT RAISE(ABORT,'GENERATION_BUDGET_LIMIT') WHERE NOT EXISTS(SELECT 1 FROM hosted_import_budget WHERE month=NEW.month AND paused=0 AND
    baseline_cents+NEW.provision_cents+NEW.preview_provision_cents+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=NEW.month)<=ceiling_cents);
  SELECT RAISE(ABORT,'GENERATION_BUDGET_LIMIT') WHERE (SELECT count(*) FROM generation_runs WHERE month=NEW.month)>=30;
  SELECT RAISE(ABORT,'GENERATION_BUDGET_LIMIT') WHERE (SELECT count(*) FROM generation_runs WHERE substr(created_at,1,10)=substr(NEW.created_at,1,10))>=5;
END;
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
  SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NEW.anonymous_session_id IS NULL AND NEW.funding_version=0 AND NOT EXISTS(
    SELECT 1 FROM allocations WHERE id=NEW.allocation_id AND agency_id=NEW.agency_id AND reserved+consumed+NEW.credits_total<=quota_limit);
  SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NEW.anonymous_session_id IS NULL AND NEW.funding_version=1 AND
    (SELECT coalesce(sum(available),0) FROM spendable_credit_sources WHERE agency_id=NEW.agency_id AND enabled=1
     AND valid_from<=NEW.created_at AND valid_until>NEW.created_at AND (id=NEW.allocation_id OR purchased=1))<NEW.credits_total;
  SELECT RAISE(ABORT,'VALIDATION_ERROR') WHERE NEW.anonymous_session_id IS NOT NULL AND NEW.funding_version!=0;
  SELECT RAISE(ABORT,'TRIAL_USED') WHERE NEW.anonymous_session_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM anonymous_sessions WHERE id=NEW.anonymous_session_id AND credits_reserved+credits_consumed+NEW.credits_total<=credits_granted);
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
END;
CREATE TRIGGER generation_settle AFTER UPDATE OF status ON jobs
WHEN OLD.status NOT IN ('ready','failed') AND NEW.status IN ('ready','failed') AND EXISTS(SELECT 1 FROM generation_runs WHERE job_id=NEW.id)
BEGIN
  UPDATE allocations SET reserved=reserved-(SELECT credit_amount FROM reservations WHERE job_id=NEW.id),consumed=consumed+(SELECT CASE WHEN g.credit_version=0 THEN IIF(NEW.status='ready',1,0) WHEN g.reuse_pricing=0 THEN IIF(NEW.status='ready',1+min(g.animations_requested,coalesce(json_array_length(v.manifest_json,'$.photoAnimations'),0)),0) ELSE IIF(NEW.status='ready',1,0)+min(g.animations_requested-g.animations_reused,(SELECT count(*) FROM photo_animations p WHERE p.job_id=g.job_id AND p.state='ready')) END FROM generation_runs g LEFT JOIN video_manifests v ON v.job_id=g.job_id WHERE g.job_id=NEW.id)
    WHERE id=(SELECT allocation_id FROM reservations WHERE job_id=NEW.id AND status='reserved') AND (SELECT funding_version FROM generation_runs WHERE job_id=NEW.id)=0;
  UPDATE reservations SET status=IIF(NEW.status='ready' OR (SELECT reuse_pricing FROM generation_runs WHERE job_id=NEW.id)=1 AND EXISTS(SELECT 1 FROM photo_animations WHERE job_id=NEW.id AND state='ready'),'consumed','released'),credit_used=(SELECT CASE WHEN g.credit_version=0 THEN IIF(NEW.status='ready',1,0) WHEN g.reuse_pricing=0 THEN IIF(NEW.status='ready',1+min(g.animations_requested,coalesce(json_array_length(v.manifest_json,'$.photoAnimations'),0)),0) ELSE IIF(NEW.status='ready',1,0)+min(g.animations_requested-g.animations_reused,(SELECT count(*) FROM photo_animations p WHERE p.job_id=g.job_id AND p.state='ready')) END FROM generation_runs g LEFT JOIN video_manifests v ON v.job_id=g.job_id WHERE g.job_id=NEW.id),updated_at=NEW.updated_at WHERE job_id=NEW.id AND status='reserved';
  UPDATE generation_credit_parts SET settled=1,consumed=min(amount,max(0,
    (SELECT credit_used FROM reservations WHERE job_id=NEW.id)-coalesce((SELECT sum(other.amount) FROM generation_credit_parts other
      JOIN allocations oa ON oa.id=other.allocation_id JOIN allocations current ON current.id=generation_credit_parts.allocation_id
      WHERE other.job_id=NEW.id AND (other.priority<generation_credit_parts.priority OR other.priority=generation_credit_parts.priority AND
       (oa.valid_from<current.valid_from OR oa.valid_from=current.valid_from AND oa.id<current.id))),0)))
    WHERE job_id=NEW.id AND settled=0;
  UPDATE job_launch_intents SET status='cancelled',updated_at=NEW.updated_at WHERE job_id=NEW.id AND status='pending';
  UPDATE anonymous_sessions SET credits_reserved=credits_reserved-(SELECT credits_total FROM generation_runs WHERE job_id=NEW.id),credits_consumed=credits_consumed+(NEW.status='ready') WHERE id=(SELECT anonymous_session_id FROM generation_runs WHERE job_id=NEW.id);
  UPDATE anonymous_sessions SET successes=successes+1 WHERE NEW.status='ready' AND id=(SELECT anonymous_session_id FROM generation_runs WHERE job_id=NEW.id);
  UPDATE generation_runs SET expires_at=strftime('%Y-%m-%dT%H:%M:%fZ',NEW.updated_at,'+'||(SELECT retention_hours FROM trial_policy WHERE id=1)||' hours')
    WHERE job_id=NEW.id AND owner_agency_id IS NULL AND retention='available';
  INSERT OR IGNORE INTO generation_events VALUES(NEW.id,NEW.status,NEW.updated_at);
END;
