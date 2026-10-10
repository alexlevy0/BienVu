-- New public prices; existing invoices, sessions and credit allocations retain their values.
PRAGMA defer_foreign_keys=ON;
PRAGMA legacy_alter_table=ON;

CREATE TABLE billing_checkouts_v2(agency_id TEXT NOT NULL REFERENCES agencies(id),idempotency_key TEXT NOT NULL,plan TEXT NOT NULL CHECK(plan IN ('plus','pro','solo','agence','equipe','reseau')),mode TEXT NOT NULL CHECK(mode IN ('test','live')),session_id TEXT UNIQUE,url TEXT,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(agency_id,mode,idempotency_key));
INSERT INTO billing_checkouts_v2 SELECT * FROM billing_checkouts;
DROP TABLE billing_checkouts;
ALTER TABLE billing_checkouts_v2 RENAME TO billing_checkouts;

CREATE TABLE billing_invoices_v2(id TEXT PRIMARY KEY,agency_id TEXT NOT NULL REFERENCES agencies(id),mode TEXT NOT NULL CHECK(mode IN ('test','live')),subscription_id TEXT NOT NULL,plan TEXT NOT NULL CHECK(plan IN ('plus','pro','solo','agence','equipe','reseau')),amount_paid INTEGER NOT NULL CHECK(amount_paid>=0),subtotal_excluding_tax INTEGER NOT NULL CHECK(subtotal_excluding_tax>=0),currency TEXT NOT NULL CHECK(currency='eur'),period_start TEXT NOT NULL,period_end TEXT NOT NULL,allocation_id TEXT NOT NULL,created_at TEXT NOT NULL);
INSERT INTO billing_invoices_v2 SELECT * FROM billing_invoices;
DROP TABLE billing_invoices;
ALTER TABLE billing_invoices_v2 RENAME TO billing_invoices;

CREATE TABLE billing_topup_checkouts_v2(
 agency_id TEXT NOT NULL REFERENCES agencies(id),mode TEXT NOT NULL CHECK(mode IN ('test','live')),idempotency_key TEXT NOT NULL,
 pack TEXT NOT NULL CHECK(pack IN ('pack10','pack30','pack100','pack20v2','pack50v2','pack100v2')),credits INTEGER NOT NULL CHECK(credits IN (10,20,30,50,100)),price_cents INTEGER NOT NULL CHECK(price_cents IN (700,1900,2000,5000,5900,10000)),
 session_id TEXT UNIQUE,url TEXT,valid_days INTEGER NOT NULL DEFAULT 0 CHECK(valid_days IN (0,365)),expires_at TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(agency_id,mode,idempotency_key),
 CHECK((pack='pack10' AND credits=10 AND price_cents=700) OR (pack='pack30' AND credits=30 AND price_cents=1900) OR (pack='pack100' AND credits=100 AND price_cents=5900) OR (pack='pack20v2' AND credits=20 AND price_cents=2000) OR (pack='pack50v2' AND credits=50 AND price_cents=5000) OR (pack='pack100v2' AND credits=100 AND price_cents=10000))
);
INSERT INTO billing_topup_checkouts_v2 SELECT * FROM billing_topup_checkouts;
DROP TABLE billing_topup_checkouts;
ALTER TABLE billing_topup_checkouts_v2 RENAME TO billing_topup_checkouts;

CREATE TABLE credit_topups_v2(
 session_id TEXT PRIMARY KEY,agency_id TEXT NOT NULL REFERENCES agencies(id),mode TEXT NOT NULL CHECK(mode IN ('test','live')),
 pack TEXT NOT NULL CHECK(pack IN ('pack10','pack30','pack100','pack20v2','pack50v2','pack100v2')),allocation_id TEXT NOT NULL UNIQUE,
 receipt_id TEXT NOT NULL UNIQUE REFERENCES financial_receipts(id),created_at TEXT NOT NULL,
 FOREIGN KEY(agency_id,allocation_id) REFERENCES allocations(agency_id,id)
);
INSERT INTO credit_topups_v2 SELECT * FROM credit_topups;
DROP TABLE credit_topups;
ALTER TABLE credit_topups_v2 RENAME TO credit_topups;

CREATE TRIGGER billing_checkout_single BEFORE INSERT ON billing_checkouts WHEN EXISTS(SELECT 1 FROM billing_checkouts WHERE agency_id=NEW.agency_id AND mode=NEW.mode AND expires_at>NEW.created_at AND idempotency_key!=NEW.idempotency_key) BEGIN SELECT RAISE(ABORT,'CHECKOUT_IN_PROGRESS'); END;
CREATE TRIGGER topup_checkout_single BEFORE INSERT ON billing_topup_checkouts
WHEN EXISTS(SELECT 1 FROM billing_topup_checkouts WHERE agency_id=NEW.agency_id AND mode=NEW.mode AND expires_at>NEW.created_at AND idempotency_key!=NEW.idempotency_key)
BEGIN SELECT RAISE(ABORT,'CHECKOUT_IN_PROGRESS'); END;
CREATE INDEX billing_invoice_agency ON billing_invoices(agency_id,period_start,period_end);
CREATE INDEX credit_topups_agency ON credit_topups(agency_id,mode,created_at);
DROP VIEW spendable_credit_sources;
CREATE VIEW base_spendable_credit_sources AS
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
CREATE TABLE credit_rollover_links(
 allocation_id TEXT PRIMARY KEY,agency_id TEXT NOT NULL REFERENCES agencies(id),previous_allocation_id TEXT,
 base_credits INTEGER NOT NULL CHECK(base_credits>0),carried INTEGER NOT NULL CHECK(carried BETWEEN 0 AND base_credits),created_at TEXT NOT NULL,
 FOREIGN KEY(agency_id,allocation_id) REFERENCES allocations(agency_id,id),FOREIGN KEY(agency_id,previous_allocation_id) REFERENCES allocations(agency_id,id),
 CHECK(previous_allocation_id IS NOT NULL OR carried=0)
);
CREATE INDEX rollover_previous ON credit_rollover_links(previous_allocation_id);
CREATE TRIGGER rollover_guard BEFORE INSERT ON credit_rollover_links BEGIN
 SELECT RAISE(ABORT,'CREDIT_ROLLOVER_INVALID') WHERE NOT EXISTS(SELECT 1 FROM billing_invoices i JOIN allocations a ON a.id=i.allocation_id JOIN financial_receipts r ON r.invoice_id=i.id
  WHERE a.id=NEW.allocation_id AND a.agency_id=NEW.agency_id AND i.agency_id=NEW.agency_id AND i.plan IN ('solo','agence','equipe','reseau')
  AND i.mode=(SELECT mode FROM credit_payment_policy WHERE id=1) AND r.credits=NEW.base_credits AND r.disputed=0 AND r.reversed_credits=0
  AND a.valid_from<=NEW.created_at AND a.valid_until>NEW.created_at);
 SELECT RAISE(ABORT,'CREDIT_ROLLOVER_INVALID') WHERE NEW.previous_allocation_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM billing_invoices current JOIN billing_invoices previous ON previous.agency_id=current.agency_id AND previous.subscription_id=current.subscription_id AND previous.mode=current.mode AND previous.period_end=current.period_start
  JOIN base_spendable_credit_sources a ON a.id=previous.allocation_id JOIN financial_receipts r ON r.invoice_id=previous.id
  WHERE current.allocation_id=NEW.allocation_id AND previous.allocation_id=NEW.previous_allocation_id AND a.enabled=1 AND a.available>=NEW.carried AND r.credits>=NEW.carried);
END;
CREATE TRIGGER rollover_immutable BEFORE UPDATE ON credit_rollover_links BEGIN SELECT RAISE(ABORT,'CREDIT_ROLLOVER_IMMUTABLE'); END;
CREATE TRIGGER rollover_no_delete BEFORE DELETE ON credit_rollover_links BEGIN SELECT RAISE(ABORT,'CREDIT_ROLLOVER_IMMUTABLE'); END;
-- Count only jobs admitted in the new period, not outstanding old-period jobs.
CREATE VIEW credit_rollover_usage AS
 SELECT l.allocation_id,coalesce(sum(IIF(p.settled=0,p.amount,0)),0) AS reserved,coalesce(sum(p.consumed),0) AS consumed
 FROM credit_rollover_links l JOIN allocations current ON current.id=l.allocation_id LEFT JOIN (
  SELECT p.allocation_id,p.amount,p.consumed,p.settled,g.created_at FROM generation_credit_parts p JOIN generation_runs g ON g.job_id=p.job_id
  UNION ALL SELECT p.allocation_id,p.amount,p.consumed,p.settled,g.created_at FROM avatar_credit_parts p JOIN generation_runs g ON g.job_id=p.job_id
 ) p ON p.allocation_id=l.previous_allocation_id AND p.created_at>=current.valid_from AND p.created_at<current.valid_until GROUP BY l.allocation_id;
-- The original source is never extended or duplicated at the same timestamp.
-- Carry still consumes its original paid allocation: reversals and revenue
-- attribution therefore remain attached to the original invoice.
CREATE VIEW spendable_credit_sources AS
 SELECT b.*,0 AS rollover FROM base_spendable_credit_sources b
 UNION ALL
 SELECT b.id,b.agency_id,b.kind,b.period_key,l.carried,u.reserved,u.consumed,current.valid_from,current.valid_until,
  max(0,min(b.available,l.carried-u.reserved-u.consumed)) AS available,1 AS purchased,b.enabled AS enabled,1 AS rollover
 FROM credit_rollover_links l JOIN base_spendable_credit_sources b ON b.id=l.previous_allocation_id AND b.agency_id=l.agency_id
 JOIN allocations current ON current.id=l.allocation_id JOIN base_spendable_credit_sources next ON next.id=l.allocation_id AND next.enabled=1
 JOIN financial_receipts r ON r.allocation_id=l.allocation_id AND r.disputed=0 AND r.reversed_credits<r.credits
 JOIN credit_rollover_usage u ON u.allocation_id=l.allocation_id WHERE l.carried>0;
DROP TRIGGER credit_part_guard;

CREATE TRIGGER credit_part_guard BEFORE INSERT ON generation_credit_parts
BEGIN
 SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NOT EXISTS(
  SELECT 1 FROM generation_runs g JOIN spendable_credit_sources a ON a.agency_id=g.agency_id
  WHERE g.job_id=NEW.job_id AND g.funding_version=1 AND g.anonymous_session_id IS NULL
  AND a.id=NEW.allocation_id AND a.agency_id=NEW.agency_id AND a.enabled=1
  AND (a.id=g.allocation_id OR a.purchased=1) AND a.valid_from<=g.created_at AND a.valid_until>g.created_at
  AND a.available>=NEW.amount AND NEW.priority=IIF(a.rollover=1,0,a.purchased));
 SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NEW.amount+(SELECT coalesce(sum(amount),0) FROM generation_credit_parts WHERE job_id=NEW.job_id)>(SELECT credits_total FROM generation_runs WHERE job_id=NEW.job_id);
END;
DROP TRIGGER generation_create;
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
    SELECT NEW.job_id,NEW.agency_id,id,priority,min(available,max(0,NEW.credits_total-before_amount)) FROM (
     SELECT id,IIF(rollover=1,0,purchased) AS priority,available,coalesce(sum(available) OVER (ORDER BY IIF(rollover=1,0,purchased),IIF(rollover=1,0,1),valid_from,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS before_amount
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
    SELECT NEW.job_id,NEW.agency_id,id,priority,min(available,max(0,NEW.avatar_credits+NEW.avatar_extra_credits-before_amount)) FROM (
      SELECT id,IIF(rollover=1,0,purchased) AS priority,available,coalesce(sum(available) OVER (ORDER BY IIF(rollover=1,0,purchased),IIF(rollover=1,0,1),valid_from,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS before_amount
      FROM spendable_credit_sources WHERE agency_id=NEW.agency_id AND enabled=1 AND valid_from<=NEW.created_at AND valid_until>NEW.created_at AND (id=NEW.allocation_id OR purchased=1))
    WHERE NEW.avatar_credits>0 AND before_amount<NEW.avatar_credits+NEW.avatar_extra_credits AND available>0;
  SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NEW.avatar_credits+NEW.avatar_extra_credits!=(SELECT coalesce(sum(amount),0) FROM avatar_credit_parts WHERE job_id=NEW.job_id);
END;
PRAGMA legacy_alter_table=OFF;
PRAGMA defer_foreign_keys=OFF;
