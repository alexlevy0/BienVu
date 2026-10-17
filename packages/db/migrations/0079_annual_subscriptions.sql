-- Annual payments remain one real invoice/receipt, funding 12 monthly grants.
-- Existing monthly invoices and their immutable receipts are left intact.
ALTER TABLE billing_checkouts ADD COLUMN billing_interval TEXT NOT NULL DEFAULT 'month' CHECK(billing_interval IN ('month','year'));
ALTER TABLE subscriptions ADD COLUMN billing_interval TEXT NOT NULL DEFAULT 'month' CHECK(billing_interval IN ('month','year'));
ALTER TABLE billing_invoices ADD COLUMN billing_interval TEXT NOT NULL DEFAULT 'month' CHECK(billing_interval IN ('month','year'));
CREATE TABLE annual_credit_periods(
 invoice_id TEXT NOT NULL REFERENCES billing_invoices(id),allocation_id TEXT NOT NULL UNIQUE REFERENCES allocations(id),
 ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 0 AND 11),PRIMARY KEY(invoice_id,ordinal)
);
CREATE TRIGGER annual_period_guard BEFORE INSERT ON annual_credit_periods
WHEN NOT EXISTS(SELECT 1 FROM annual_credit_periods WHERE invoice_id=NEW.invoice_id AND ordinal=NEW.ordinal) BEGIN
 SELECT RAISE(ABORT,'ANNUAL_PERIOD_INVALID') WHERE NOT EXISTS(
  SELECT 1 FROM billing_invoices i JOIN allocations a ON a.agency_id=i.agency_id JOIN financial_receipts f ON f.invoice_id=i.id
  WHERE i.id=NEW.invoice_id AND a.id=NEW.allocation_id AND i.billing_interval='year' AND i.plan IN ('solo','agence','equipe','reseau')
  AND a.kind='paid' AND a.valid_from>=i.period_start AND a.valid_until<=i.period_end AND a.valid_until>a.valid_from
  AND a.quota_limit*12=f.credits AND (NEW.ordinal!=0 OR a.id=i.allocation_id));
END;
CREATE TRIGGER annual_period_immutable BEFORE UPDATE ON annual_credit_periods BEGIN SELECT RAISE(ABORT,'ANNUAL_PERIOD_IMMUTABLE'); END;
CREATE TRIGGER annual_period_no_delete BEFORE DELETE ON annual_credit_periods BEGIN SELECT RAISE(ABORT,'ANNUAL_PERIOD_IMMUTABLE'); END;
CREATE VIEW subscription_credit_periods AS
 SELECT i.id,i.agency_id,i.mode,i.subscription_id,i.plan,i.allocation_id,a.valid_from period_start,a.valid_until period_end
 FROM billing_invoices i JOIN allocations a ON a.id=i.allocation_id WHERE i.billing_interval='month'
 UNION ALL
 SELECT i.id,i.agency_id,i.mode,i.subscription_id,i.plan,p.allocation_id,a.valid_from,a.valid_until
 FROM billing_invoices i JOIN annual_credit_periods p ON p.invoice_id=i.id JOIN allocations a ON a.id=p.allocation_id;
-- Monthly reversals from an annual receipt use the same refund ratio as bonus
-- credits. A disputed receipt suspends all its periods, including future ones.
CREATE VIEW allocation_receipts AS
 SELECT a.id allocation_id,f.id receipt_id,
 CASE WHEN annual.allocation_id IS NOT NULL THEN f.credits/12 WHEN promo.intent_id IS NOT NULL THEN a.quota_limit ELSE f.credits END base_credits,
 CASE WHEN annual.allocation_id IS NOT NULL THEN min(f.credits/12,CAST(((f.refunded_cents+f.lost_cents)*(f.credits/12)+f.gross_cents-1)/f.gross_cents AS INTEGER))
 WHEN promo.intent_id IS NOT NULL THEN min(a.quota_limit,CAST(((f.refunded_cents+f.lost_cents)*a.quota_limit+f.gross_cents-1)/f.gross_cents AS INTEGER))
  ELSE f.reversed_credits END reversed
 FROM allocations a LEFT JOIN annual_credit_periods annual ON annual.allocation_id=a.id
 LEFT JOIN credit_promotion_redemptions promo ON promo.allocation_id=a.id
 JOIN financial_receipts f ON f.allocation_id=a.id OR f.invoice_id=annual.invoice_id OR f.id=promo.receipt_id;
DROP VIEW base_spendable_credit_sources;
CREATE VIEW base_spendable_credit_sources AS
SELECT a.*,max(0,a.quota_limit-a.reserved-a.consumed-coalesce(r.reversed,0)) AS available,
 IIF(t.allocation_id IS NOT NULL OR p.intent_id IS NOT NULL,1,0) AS purchased,
 IIF(t.allocation_id IS NOT NULL OR p.intent_id IS NOT NULL,1,CASE
  WHEN EXISTS(SELECT 1 FROM generation_access g WHERE g.agency_id=a.agency_id AND g.allocation_id=a.id AND g.enabled=1) THEN 1
  WHEN a.kind='paid' AND EXISTS(SELECT 1 FROM subscription_credit_periods i WHERE i.allocation_id=a.id AND i.agency_id=a.agency_id AND i.mode=(SELECT mode FROM credit_payment_policy WHERE id=1)) THEN 1
  WHEN a.kind='free' AND (SELECT free_enabled FROM trial_policy WHERE id=1)=1 AND NOT EXISTS(SELECT 1 FROM subscriptions s WHERE s.agency_id=a.agency_id AND s.status NOT IN ('canceled','incomplete_expired')) THEN 1 ELSE 0 END) AS enabled
FROM allocations a LEFT JOIN credit_topups t ON t.allocation_id=a.id
LEFT JOIN credit_promotion_redemptions p ON p.allocation_id=a.id
LEFT JOIN allocation_receipts r ON r.allocation_id=a.id LEFT JOIN financial_receipts f ON f.id=r.receipt_id
WHERE (t.mode IS NULL OR t.mode=(SELECT mode FROM credit_payment_policy WHERE id=1))
 AND (f.mode IS NULL OR f.mode=(SELECT mode FROM credit_payment_policy WHERE id=1)) AND coalesce(f.disputed,0)=0
 AND NOT EXISTS(SELECT 1 FROM allocation_receipts reversal JOIN allocations d ON d.id=reversal.allocation_id JOIN financial_receipts debt ON debt.id=reversal.receipt_id
  WHERE debt.agency_id=a.agency_id AND debt.mode=(SELECT mode FROM credit_payment_policy WHERE id=1)
  AND (debt.disputed=1 OR reversal.reversed+d.reserved+d.consumed>d.quota_limit));
DROP TRIGGER rollover_guard;
CREATE TRIGGER rollover_guard BEFORE INSERT ON credit_rollover_links BEGIN
 SELECT RAISE(ABORT,'CREDIT_ROLLOVER_INVALID') WHERE NOT EXISTS(SELECT 1 FROM subscription_credit_periods i JOIN allocations a ON a.id=i.allocation_id JOIN allocation_receipts ar ON ar.allocation_id=a.id JOIN financial_receipts r ON r.id=ar.receipt_id
  WHERE a.id=NEW.allocation_id AND a.agency_id=NEW.agency_id AND i.agency_id=NEW.agency_id AND i.plan IN ('solo','agence','equipe','reseau')
  AND i.mode=(SELECT mode FROM credit_payment_policy WHERE id=1) AND ar.base_credits=NEW.base_credits AND r.disputed=0 AND ar.reversed=0
  AND a.valid_from<=NEW.created_at AND a.valid_until>NEW.created_at);
 SELECT RAISE(ABORT,'CREDIT_ROLLOVER_INVALID') WHERE NEW.previous_allocation_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM subscription_credit_periods current JOIN subscription_credit_periods previous ON previous.agency_id=current.agency_id AND previous.subscription_id=current.subscription_id AND previous.mode=current.mode AND previous.period_end=current.period_start
  JOIN base_spendable_credit_sources a ON a.id=previous.allocation_id JOIN allocation_receipts pr ON pr.allocation_id=a.id
  WHERE current.allocation_id=NEW.allocation_id AND previous.allocation_id=NEW.previous_allocation_id AND a.enabled=1 AND a.available>=NEW.carried AND pr.base_credits>=NEW.carried);
END;
DROP VIEW spendable_credit_sources;
CREATE VIEW spendable_credit_sources AS
 SELECT b.*,0 AS rollover FROM base_spendable_credit_sources b
 UNION ALL
 SELECT b.id,b.agency_id,b.kind,b.period_key,l.carried,u.reserved,u.consumed,current.valid_from,current.valid_until,
  max(0,min(b.available,l.carried-u.reserved-u.consumed)) AS available,1 AS purchased,b.enabled AS enabled,1 AS rollover
 FROM credit_rollover_links l JOIN base_spendable_credit_sources b ON b.id=l.previous_allocation_id AND b.agency_id=l.agency_id
 JOIN allocations current ON current.id=l.allocation_id JOIN base_spendable_credit_sources next ON next.id=l.allocation_id AND next.enabled=1
 JOIN allocation_receipts ar ON ar.allocation_id=l.allocation_id JOIN financial_receipts r ON r.id=ar.receipt_id AND r.disputed=0 AND ar.reversed<ar.base_credits
 JOIN credit_rollover_usage u ON u.allocation_id=l.allocation_id WHERE l.carried>0;
DROP VIEW finance_credit_attribution;
CREATE VIEW finance_credit_attribution AS
 WITH assigned AS (
  SELECT u.*,f.id receipt_id FROM finance_credit_usage u JOIN allocation_receipts ar ON ar.allocation_id=u.allocation_id JOIN financial_receipts f ON f.id=ar.receipt_id
 ),usage AS (SELECT receipt_id,job_id,created_at,sum(used) used FROM assigned GROUP BY receipt_id,job_id,created_at),
 paid AS (SELECT u.*,sum(used) OVER(PARTITION BY u.receipt_id ORDER BY u.created_at,u.job_id ROWS UNBOUNDED PRECEDING) cumulative,
  f.mode,f.credits+coalesce(i.bonus_credits,0) credits,f.fees_complete,f.disputed,
  CAST(f.revenue_ht_cents*10000*(max(0,f.gross_cents-f.refunded_cents-f.lost_cents))/f.gross_cents AS INTEGER) net_micros,f.fee_cents*10000 fee_micros
  FROM usage u JOIN financial_receipts f ON f.id=u.receipt_id LEFT JOIN credit_promotion_redemptions p ON p.receipt_id=f.id LEFT JOIN billing_promotion_intents i ON i.id=p.intent_id)
 SELECT job_id,receipt_id,mode,used,disputed,
  CAST(net_micros*min(cumulative,credits)/credits AS INTEGER)-CAST(net_micros*min(cumulative-used,credits)/credits AS INTEGER) revenue_micros,
  CASE WHEN fees_complete=1 THEN CAST(fee_micros*min(cumulative,credits)/credits AS INTEGER)-CAST(fee_micros*min(cumulative-used,credits)/credits AS INTEGER) END fee_micros,
  IIF(fees_complete=0 OR disputed=1,1,0) incomplete FROM paid;

DROP TRIGGER promotion_redemption_guard;
CREATE TRIGGER promotion_redemption_guard BEFORE INSERT ON credit_promotion_redemptions BEGIN
 SELECT RAISE(ABORT,'PROMOTION_INVALID') WHERE NOT EXISTS(
  SELECT 1 FROM billing_promotion_intents p JOIN billing_checkouts c ON c.agency_id=p.agency_id AND c.mode=p.mode AND c.idempotency_key=p.idempotency_key
  JOIN allocations a ON a.id=NEW.allocation_id AND a.agency_id=NEW.agency_id
  JOIN financial_receipts r ON r.id=NEW.receipt_id JOIN subscription_credit_periods i ON i.id=r.invoice_id AND i.allocation_id=r.allocation_id
  WHERE p.id=NEW.intent_id AND p.agency_id=NEW.agency_id AND p.mode=NEW.mode AND p.state='reserved' AND c.session_id IS NOT NULL
  AND a.quota_limit=p.bonus_credits AND a.kind='paid' AND a.valid_from=i.period_start AND a.valid_until=i.period_end
  AND r.agency_id=p.agency_id AND r.mode=p.mode AND r.kind='subscription' AND i.subscription_id=NEW.subscription_id AND i.plan=p.plan);
END;
