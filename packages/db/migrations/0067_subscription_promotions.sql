-- Product-credit bonuses are independent from monetary Stripe discounts.
CREATE TABLE subscription_promotions(
 id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,active INTEGER NOT NULL CHECK(active IN (0,1)),
 percent INTEGER NOT NULL DEFAULT 20 CHECK(percent=20),plans_json TEXT NOT NULL CHECK(json_valid(plans_json)),
 starts_at TEXT,ends_at TEXT,max_redemptions INTEGER CHECK(max_redemptions>0),version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,CHECK(ends_at IS NULL OR starts_at IS NULL OR ends_at>starts_at)
);
CREATE TABLE billing_promotion_intents(
 id TEXT PRIMARY KEY,promotion_id TEXT NOT NULL REFERENCES subscription_promotions(id),code TEXT NOT NULL,
 agency_id TEXT NOT NULL REFERENCES agencies(id),mode TEXT NOT NULL CHECK(mode IN ('test','live')),idempotency_key TEXT NOT NULL,
 plan TEXT NOT NULL CHECK(plan IN ('solo','agence','equipe','reseau')),bonus_credits INTEGER NOT NULL CHECK(bonus_credits IN (10,20,40,100)),
 state TEXT NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','released','redeemed')),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(agency_id,mode,idempotency_key),FOREIGN KEY(agency_id,mode,idempotency_key) REFERENCES billing_checkouts(agency_id,mode,idempotency_key)
);
CREATE INDEX promotion_intents_code ON billing_promotion_intents(promotion_id,mode,state);
CREATE UNIQUE INDEX promotion_one_agency ON billing_promotion_intents(agency_id,mode) WHERE state!='released';
CREATE TRIGGER promotion_reserve BEFORE INSERT ON billing_promotion_intents BEGIN
 SELECT RAISE(ABORT,'PROMOTION_INVALID') WHERE NOT EXISTS(SELECT 1 FROM subscription_promotions p WHERE p.id=NEW.promotion_id AND p.code=NEW.code AND p.active=1
  AND (p.starts_at IS NULL OR p.starts_at<=NEW.created_at) AND (p.ends_at IS NULL OR p.ends_at>NEW.created_at)
  AND EXISTS(SELECT 1 FROM json_each(p.plans_json) WHERE value=NEW.plan)
  AND (p.max_redemptions IS NULL OR (SELECT count(*) FROM billing_promotion_intents i WHERE i.promotion_id=p.id AND i.mode=NEW.mode AND i.state!='released')<p.max_redemptions));
 SELECT RAISE(ABORT,'PROMOTION_USED') WHERE EXISTS(SELECT 1 FROM billing_promotion_intents WHERE agency_id=NEW.agency_id AND mode=NEW.mode AND state!='released');
 SELECT RAISE(ABORT,'PROMOTION_INVALID') WHERE NEW.state!='reserved' OR NEW.bonus_credits!=CASE NEW.plan WHEN 'solo' THEN 10 WHEN 'agence' THEN 20 WHEN 'equipe' THEN 40 ELSE 100 END;
END;
CREATE TRIGGER promotion_intent_immutable BEFORE UPDATE OF id,promotion_id,code,agency_id,mode,idempotency_key,plan,bonus_credits,created_at ON billing_promotion_intents BEGIN SELECT RAISE(ABORT,'PROMOTION_IMMUTABLE'); END;
CREATE TRIGGER promotion_intent_state BEFORE UPDATE OF state ON billing_promotion_intents WHEN NEW.state!=OLD.state AND (OLD.state!='reserved' OR NEW.state NOT IN ('released','redeemed')) BEGIN SELECT RAISE(ABORT,'PROMOTION_IMMUTABLE'); END;
CREATE TABLE credit_promotion_redemptions(
 intent_id TEXT PRIMARY KEY REFERENCES billing_promotion_intents(id),agency_id TEXT NOT NULL REFERENCES agencies(id),
 mode TEXT NOT NULL CHECK(mode IN ('test','live')),allocation_id TEXT NOT NULL UNIQUE,receipt_id TEXT NOT NULL UNIQUE REFERENCES financial_receipts(id),
 subscription_id TEXT NOT NULL,created_at TEXT NOT NULL,
 FOREIGN KEY(agency_id,allocation_id) REFERENCES allocations(agency_id,id)
);
CREATE UNIQUE INDEX promotion_redemption_agency ON credit_promotion_redemptions(agency_id,mode);
CREATE TRIGGER promotion_redemption_guard BEFORE INSERT ON credit_promotion_redemptions BEGIN
 SELECT RAISE(ABORT,'PROMOTION_INVALID') WHERE NOT EXISTS(
  SELECT 1 FROM billing_promotion_intents p JOIN billing_checkouts c ON c.agency_id=p.agency_id AND c.mode=p.mode AND c.idempotency_key=p.idempotency_key
  JOIN allocations a ON a.id=NEW.allocation_id AND a.agency_id=NEW.agency_id
  JOIN financial_receipts r ON r.id=NEW.receipt_id JOIN billing_invoices i ON i.id=r.invoice_id
  WHERE p.id=NEW.intent_id AND p.agency_id=NEW.agency_id AND p.mode=NEW.mode AND p.state='reserved' AND c.session_id IS NOT NULL
  AND a.quota_limit=p.bonus_credits AND a.kind='paid' AND a.valid_from=i.period_start AND a.valid_until=i.period_end
  AND r.agency_id=p.agency_id AND r.mode=p.mode AND r.kind='subscription' AND i.subscription_id=NEW.subscription_id AND i.plan=p.plan);
END;
CREATE TRIGGER promotion_redeemed AFTER INSERT ON credit_promotion_redemptions BEGIN UPDATE billing_promotion_intents SET state='redeemed',updated_at=NEW.created_at WHERE id=NEW.intent_id; END;
CREATE TRIGGER promotion_redemption_immutable BEFORE UPDATE ON credit_promotion_redemptions BEGIN SELECT RAISE(ABORT,'PROMOTION_IMMUTABLE'); END;
CREATE TRIGGER promotion_redemption_no_delete BEFORE DELETE ON credit_promotion_redemptions BEGIN SELECT RAISE(ABORT,'PROMOTION_IMMUTABLE'); END;
CREATE TABLE promotion_audit(id TEXT PRIMARY KEY,promotion_id TEXT NOT NULL REFERENCES subscription_promotions(id),actor_user_id TEXT NOT NULL REFERENCES auth_user(id),before_json TEXT,after_json TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX promotion_audit_date ON promotion_audit(created_at);
CREATE TRIGGER promotion_audit_rate BEFORE INSERT ON promotion_audit WHEN (SELECT count(*) FROM promotion_audit WHERE actor_user_id=NEW.actor_user_id AND created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 minute'))>=20 BEGIN SELECT RAISE(ABORT,'PROMOTION_RATE_LIMIT'); END;
CREATE TRIGGER promotion_audit_immutable BEFORE UPDATE ON promotion_audit BEGIN SELECT RAISE(ABORT,'PROMOTION_IMMUTABLE'); END;
CREATE TRIGGER promotion_audit_no_delete BEFORE DELETE ON promotion_audit BEGIN SELECT RAISE(ABORT,'PROMOTION_IMMUTABLE'); END;
CREATE TABLE promotion_validation_limits(bucket TEXT PRIMARY KEY,attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 15),created_at TEXT NOT NULL);
CREATE INDEX promotion_validation_date ON promotion_validation_limits(created_at);
CREATE TRIGGER promotion_catalog_limit BEFORE INSERT ON subscription_promotions WHEN (SELECT count(*) FROM subscription_promotions)>=1000 BEGIN SELECT RAISE(ABORT,'PROMOTION_CATALOG_LIMIT'); END;
-- The bonus follows the original payment's refunds/disputes, without inflating
-- its revenue or changing the base quota used to calculate monthly rollover.
CREATE VIEW promotion_reversed_credits AS
 SELECT p.allocation_id,min(a.quota_limit,CAST(((r.refunded_cents+r.lost_cents)*a.quota_limit+r.gross_cents-1)/r.gross_cents AS INTEGER)) reversed
 FROM credit_promotion_redemptions p JOIN allocations a ON a.id=p.allocation_id JOIN financial_receipts r ON r.id=p.receipt_id;
DROP VIEW base_spendable_credit_sources;
CREATE VIEW base_spendable_credit_sources AS
SELECT a.*,max(0,a.quota_limit-a.reserved-a.consumed-IIF(p.intent_id IS NULL,coalesce(f.reversed_credits,0),coalesce(pr.reversed,0))) AS available,
 IIF(t.allocation_id IS NOT NULL OR p.intent_id IS NOT NULL,1,0) AS purchased,
 IIF(t.allocation_id IS NOT NULL OR p.intent_id IS NOT NULL,1,CASE
  WHEN EXISTS(SELECT 1 FROM generation_access g WHERE g.agency_id=a.agency_id AND g.allocation_id=a.id AND g.enabled=1) THEN 1
  WHEN a.kind='paid' AND EXISTS(SELECT 1 FROM billing_invoices i WHERE i.allocation_id=a.id AND i.agency_id=a.agency_id AND i.mode=(SELECT mode FROM credit_payment_policy WHERE id=1)) THEN 1
  WHEN a.kind='free' AND (SELECT free_enabled FROM trial_policy WHERE id=1)=1 AND NOT EXISTS(SELECT 1 FROM subscriptions s WHERE s.agency_id=a.agency_id AND s.status NOT IN ('canceled','incomplete_expired')) THEN 1 ELSE 0 END) AS enabled
FROM allocations a LEFT JOIN credit_topups t ON t.allocation_id=a.id
LEFT JOIN credit_promotion_redemptions p ON p.allocation_id=a.id LEFT JOIN promotion_reversed_credits pr ON pr.allocation_id=a.id
LEFT JOIN financial_receipts f ON f.allocation_id=a.id OR f.id=p.receipt_id
WHERE (t.mode IS NULL OR t.mode=(SELECT mode FROM credit_payment_policy WHERE id=1))
 AND (f.mode IS NULL OR f.mode=(SELECT mode FROM credit_payment_policy WHERE id=1)) AND coalesce(f.disputed,0)=0
 AND NOT EXISTS(SELECT 1 FROM financial_receipts debt JOIN allocations d ON d.id=debt.allocation_id
  WHERE debt.agency_id=a.agency_id AND debt.mode=(SELECT mode FROM credit_payment_policy WHERE id=1)
  AND (debt.disputed=1 OR debt.reversed_credits+d.reserved+d.consumed>d.quota_limit))
 AND NOT EXISTS(SELECT 1 FROM credit_promotion_redemptions debt JOIN allocations d ON d.id=debt.allocation_id JOIN promotion_reversed_credits r ON r.allocation_id=d.id
  WHERE debt.agency_id=a.agency_id AND debt.mode=(SELECT mode FROM credit_payment_policy WHERE id=1) AND r.reversed+d.reserved+d.consumed>d.quota_limit);

-- Consume expiring promotional credits before the monthly credits that can roll over.
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
     SELECT id,IIF(rollover=1,0,purchased) AS priority,available,coalesce(sum(available) OVER (ORDER BY IIF(EXISTS(SELECT 1 FROM credit_promotion_redemptions bonus WHERE bonus.allocation_id=spendable_credit_sources.id),0,1),IIF(rollover=1,0,purchased),IIF(rollover=1,0,1),valid_from,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS before_amount
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
      SELECT id,IIF(rollover=1,0,purchased) AS priority,available,coalesce(sum(available) OVER (ORDER BY IIF(EXISTS(SELECT 1 FROM credit_promotion_redemptions bonus WHERE bonus.allocation_id=spendable_credit_sources.id),0,1),IIF(rollover=1,0,purchased),IIF(rollover=1,0,1),valid_from,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS before_amount
      FROM spendable_credit_sources WHERE agency_id=NEW.agency_id AND enabled=1 AND valid_from<=NEW.created_at AND valid_until>NEW.created_at AND (id=NEW.allocation_id OR purchased=1))
    WHERE NEW.avatar_credits>0 AND before_amount<NEW.avatar_credits+NEW.avatar_extra_credits AND available>0;
  SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NEW.avatar_credits+NEW.avatar_extra_credits!=(SELECT coalesce(sum(amount),0) FROM avatar_credit_parts WHERE job_id=NEW.job_id);
END;

-- Allocate the same paid revenue across base + bonus credits, preserving the
-- invoice's total and rounding even when one video consumes both allocations.
DROP VIEW finance_credit_attribution;
CREATE VIEW finance_credit_attribution AS
 WITH assigned AS (
  SELECT u.*,f.id receipt_id FROM finance_credit_usage u LEFT JOIN credit_promotion_redemptions p ON p.allocation_id=u.allocation_id
  JOIN financial_receipts f ON f.allocation_id=u.allocation_id OR f.id=p.receipt_id
 ),usage AS (SELECT receipt_id,job_id,created_at,sum(used) used FROM assigned GROUP BY receipt_id,job_id,created_at),
 paid AS (SELECT u.*,sum(used) OVER(PARTITION BY u.receipt_id ORDER BY u.created_at,u.job_id ROWS UNBOUNDED PRECEDING) cumulative,
  f.mode,f.credits+coalesce(i.bonus_credits,0) credits,f.fees_complete,f.disputed,
  CAST(f.revenue_ht_cents*10000*(max(0,f.gross_cents-f.refunded_cents-f.lost_cents))/f.gross_cents AS INTEGER) net_micros,f.fee_cents*10000 fee_micros
  FROM usage u JOIN financial_receipts f ON f.id=u.receipt_id LEFT JOIN credit_promotion_redemptions p ON p.receipt_id=f.id LEFT JOIN billing_promotion_intents i ON i.id=p.intent_id)
 SELECT job_id,receipt_id,mode,used,disputed,
  CAST(net_micros*min(cumulative,credits)/credits AS INTEGER)-CAST(net_micros*min(cumulative-used,credits)/credits AS INTEGER) revenue_micros,
  CASE WHEN fees_complete=1 THEN CAST(fee_micros*min(cumulative,credits)/credits AS INTEGER)-CAST(fee_micros*min(cumulative-used,credits)/credits AS INTEGER) END fee_micros,
  IIF(fees_complete=0 OR disputed=1,1,0) incomplete FROM paid;

-- Settlement uses the same bonus-first order as reservation, including partial failures.
DROP TRIGGER generation_settle;
CREATE TRIGGER generation_settle AFTER UPDATE OF status ON jobs
WHEN OLD.status NOT IN ('ready','failed') AND NEW.status IN ('ready','failed') AND EXISTS(SELECT 1 FROM generation_runs WHERE job_id=NEW.id)
BEGIN
  UPDATE allocations SET reserved=reserved-(SELECT credit_amount FROM reservations WHERE job_id=NEW.id),consumed=consumed+(SELECT CASE WHEN g.credit_version=0 THEN IIF(NEW.status='ready',1,0) WHEN g.reuse_pricing=0 THEN IIF(NEW.status='ready',1+min(g.animations_requested,coalesce(json_array_length(v.manifest_json,'$.photoAnimations'),0)),0) ELSE IIF(NEW.status='ready',1,0)+min(g.animations_requested-g.animations_reused,(SELECT count(*) FROM photo_animations p WHERE p.job_id=g.job_id AND p.state='ready')) END FROM generation_runs g LEFT JOIN video_manifests v ON v.job_id=g.job_id WHERE g.job_id=NEW.id)
    WHERE id=(SELECT allocation_id FROM reservations WHERE job_id=NEW.id AND status='reserved') AND (SELECT funding_version FROM generation_runs WHERE job_id=NEW.id)=0;
  UPDATE reservations SET status=IIF(NEW.status='ready' OR (SELECT reuse_pricing FROM generation_runs WHERE job_id=NEW.id)=1 AND EXISTS(SELECT 1 FROM photo_animations WHERE job_id=NEW.id AND state='ready'),'consumed','released'),credit_used=(SELECT CASE WHEN g.credit_version=0 THEN IIF(NEW.status='ready',1,0) WHEN g.reuse_pricing=0 THEN IIF(NEW.status='ready',1+min(g.animations_requested,coalesce(json_array_length(v.manifest_json,'$.photoAnimations'),0)),0) ELSE IIF(NEW.status='ready',1,0)+min(g.animations_requested-g.animations_reused,(SELECT count(*) FROM photo_animations p WHERE p.job_id=g.job_id AND p.state='ready')) END FROM generation_runs g LEFT JOIN video_manifests v ON v.job_id=g.job_id WHERE g.job_id=NEW.id),updated_at=NEW.updated_at WHERE job_id=NEW.id AND status='reserved';
  UPDATE generation_credit_parts SET settled=1,consumed=min(amount,max(0,
    (SELECT credit_used FROM reservations WHERE job_id=NEW.id)-coalesce((SELECT sum(other.amount) FROM generation_credit_parts other
      JOIN allocations oa ON oa.id=other.allocation_id JOIN allocations current ON current.id=generation_credit_parts.allocation_id
      WHERE other.job_id=NEW.id AND (IIF(EXISTS(SELECT 1 FROM credit_promotion_redemptions bonus WHERE bonus.allocation_id=oa.id),0,1)<IIF(EXISTS(SELECT 1 FROM credit_promotion_redemptions bonus WHERE bonus.allocation_id=current.id),0,1) OR IIF(EXISTS(SELECT 1 FROM credit_promotion_redemptions bonus WHERE bonus.allocation_id=oa.id),0,1)=IIF(EXISTS(SELECT 1 FROM credit_promotion_redemptions bonus WHERE bonus.allocation_id=current.id),0,1) AND (other.priority<generation_credit_parts.priority OR other.priority=generation_credit_parts.priority AND
       (oa.valid_from<current.valid_from OR oa.valid_from=current.valid_from AND oa.id<current.id)))),0)))
    WHERE job_id=NEW.id AND settled=0;
  UPDATE job_launch_intents SET status='cancelled',updated_at=NEW.updated_at WHERE job_id=NEW.id AND status='pending';
  UPDATE anonymous_sessions SET credits_reserved=credits_reserved-(SELECT credits_total FROM generation_runs WHERE job_id=NEW.id),credits_consumed=credits_consumed+(NEW.status='ready') WHERE id=(SELECT anonymous_session_id FROM generation_runs WHERE job_id=NEW.id);
  UPDATE anonymous_sessions SET successes=successes+1 WHERE NEW.status='ready' AND id=(SELECT anonymous_session_id FROM generation_runs WHERE job_id=NEW.id);
  UPDATE generation_runs SET expires_at=strftime('%Y-%m-%dT%H:%M:%fZ',NEW.updated_at,'+'||(SELECT retention_hours FROM trial_policy WHERE id=1)||' hours')
    WHERE job_id=NEW.id AND owner_agency_id IS NULL AND retention='available';
  INSERT OR IGNORE INTO generation_events VALUES(NEW.id,NEW.status,NEW.updated_at);
END;

-- Settlement uses the same bonus-first order as reservation, including partial failures.
DROP TRIGGER generation_avatar_settle;
CREATE TRIGGER generation_avatar_settle AFTER UPDATE OF status ON jobs WHEN OLD.status NOT IN ('ready','failed') AND NEW.status IN ('ready','failed') BEGIN
 UPDATE avatar_credit_parts SET settled=1,consumed=min(amount,max(0,
  (SELECT IIF(EXISTS(SELECT 1 FROM avatar_tasks t WHERE t.job_id=NEW.id AND t.state='ready' AND t.reused=0),g.avatar_credits+g.avatar_extra_credits,0) FROM generation_runs g WHERE g.job_id=NEW.id)
  -coalesce((SELECT sum(p.amount) FROM avatar_credit_parts p JOIN allocations a ON a.id=p.allocation_id JOIN allocations c ON c.id=avatar_credit_parts.allocation_id WHERE p.job_id=NEW.id AND (IIF(EXISTS(SELECT 1 FROM credit_promotion_redemptions bonus WHERE bonus.allocation_id=a.id),0,1)<IIF(EXISTS(SELECT 1 FROM credit_promotion_redemptions bonus WHERE bonus.allocation_id=c.id),0,1) OR IIF(EXISTS(SELECT 1 FROM credit_promotion_redemptions bonus WHERE bonus.allocation_id=a.id),0,1)=IIF(EXISTS(SELECT 1 FROM credit_promotion_redemptions bonus WHERE bonus.allocation_id=c.id),0,1) AND (p.priority<avatar_credit_parts.priority OR p.priority=avatar_credit_parts.priority AND (a.valid_from<c.valid_from OR a.valid_from=c.valid_from AND a.id<c.id)))),0))) WHERE job_id=NEW.id AND settled=0;
END;
