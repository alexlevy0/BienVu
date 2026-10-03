-- Supplier invoices are kept separately from estimates and prepaid budgets.
ALTER TABLE generation_runs ADD COLUMN financial_mode TEXT NOT NULL DEFAULT 'test' CHECK(financial_mode IN ('test','live'));
CREATE TRIGGER generation_financial_mode_immutable BEFORE UPDATE OF financial_mode ON generation_runs
BEGIN SELECT RAISE(ABORT,'GENERATION_IMMUTABLE'); END;
CREATE TABLE financial_expenses(
 id TEXT PRIMARY KEY,provider TEXT NOT NULL CHECK(provider IN ('openai','google','fish','runway','cloudflare','other')),
 reference TEXT NOT NULL CHECK(length(reference) BETWEEN 2 AND 120),mode TEXT NOT NULL CHECK(mode IN ('live','test')),
 kind TEXT NOT NULL CHECK(kind IN ('usage','fixed','prepaid','credit_note')),currency TEXT NOT NULL CHECK(currency IN ('EUR','USD')),
 original_minor INTEGER NOT NULL CHECK(original_minor BETWEEN 0 AND 100000000),eur_cents INTEGER NOT NULL CHECK(eur_cents BETWEEN 0 AND 100000000),
 unit_quantity INTEGER NOT NULL CHECK(unit_quantity BETWEEN 1 AND 100000000),period_from TEXT NOT NULL,period_until TEXT NOT NULL,
 paid_at TEXT NOT NULL,note TEXT NOT NULL CHECK(length(note)<=500),actor_id TEXT NOT NULL,created_at TEXT NOT NULL,
 voided_at TEXT,voided_by TEXT,void_reason TEXT,CHECK(period_until>=period_from),
 CHECK((voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL) OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND length(void_reason) BETWEEN 5 AND 300))
);
CREATE UNIQUE INDEX expense_reference_active ON financial_expenses(provider,mode,reference) WHERE voided_at IS NULL;
CREATE TABLE financial_expense_allocations(
 expense_id TEXT NOT NULL REFERENCES financial_expenses(id),job_id TEXT NOT NULL REFERENCES generation_runs(job_id),units INTEGER NOT NULL CHECK(units>0),
 amount_micros INTEGER NOT NULL CHECK(amount_micros BETWEEN 0 AND 1000000000000),offset_units INTEGER NOT NULL CHECK(offset_units>=0),covers_provider INTEGER NOT NULL CHECK(covers_provider IN (0,1)),
 PRIMARY KEY(expense_id,job_id)
);
CREATE TRIGGER expense_allocation_guard BEFORE INSERT ON financial_expense_allocations
BEGIN
 SELECT RAISE(ABORT,'FINANCIAL_ALLOCATION_INVALID') WHERE NOT EXISTS(SELECT 1 FROM financial_expenses e JOIN generation_runs g ON g.job_id=NEW.job_id
  WHERE e.id=NEW.expense_id AND e.voided_at IS NULL AND substr(g.created_at,1,10) BETWEEN e.period_from AND e.period_until
  AND NEW.offset_units=(SELECT coalesce(sum(units),0) FROM financial_expense_allocations WHERE expense_id=e.id)
  AND NEW.units+(SELECT coalesce(sum(units),0) FROM financial_expense_allocations WHERE expense_id=e.id)<=e.unit_quantity
  AND NEW.amount_micros+(SELECT coalesce(sum(amount_micros),0) FROM financial_expense_allocations WHERE expense_id=e.id)<=e.eur_cents*10000);
END;
CREATE TRIGGER expense_immutable BEFORE UPDATE OF id,provider,reference,mode,kind,currency,original_minor,eur_cents,unit_quantity,period_from,period_until,paid_at,note,actor_id,created_at ON financial_expenses
BEGIN SELECT RAISE(ABORT,'FINANCIAL_EXPENSE_IMMUTABLE'); END;
CREATE TRIGGER expense_void_once BEFORE UPDATE OF voided_at,voided_by,void_reason ON financial_expenses
WHEN OLD.voided_at IS NOT NULL OR NEW.voided_at IS NULL BEGIN SELECT RAISE(ABORT,'FINANCIAL_EXPENSE_IMMUTABLE'); END;
CREATE TRIGGER expense_allocation_immutable BEFORE UPDATE ON financial_expense_allocations
BEGIN SELECT RAISE(ABORT,'FINANCIAL_EXPENSE_IMMUTABLE'); END;
CREATE TRIGGER expense_no_delete BEFORE DELETE ON financial_expenses BEGIN SELECT RAISE(ABORT,'FINANCIAL_EXPENSE_IMMUTABLE'); END;
CREATE TRIGGER expense_allocation_no_delete BEFORE DELETE ON financial_expense_allocations BEGIN SELECT RAISE(ABORT,'FINANCIAL_EXPENSE_IMMUTABLE'); END;

CREATE TABLE financial_audit(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,action TEXT NOT NULL CHECK(action IN ('expense','allocate','void','stripe_sync')),
 target_id TEXT NOT NULL,detail_json TEXT NOT NULL CHECK(json_valid(detail_json)),created_at TEXT NOT NULL);
CREATE TRIGGER financial_audit_rate BEFORE INSERT ON financial_audit
WHEN (SELECT count(*) FROM financial_audit WHERE actor_id=NEW.actor_id AND created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 minute'))>=10
BEGIN SELECT RAISE(ABORT,'FINANCIAL_RATE_LIMIT'); END;
CREATE TRIGGER financial_audit_no_update BEFORE UPDATE ON financial_audit BEGIN SELECT RAISE(ABORT,'FINANCIAL_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER financial_audit_no_delete BEFORE DELETE ON financial_audit BEGIN SELECT RAISE(ABORT,'FINANCIAL_AUDIT_IMMUTABLE'); END;

CREATE VIEW finance_credit_usage AS
 SELECT p.job_id,p.allocation_id,p.consumed AS used,g.created_at FROM generation_credit_parts p JOIN generation_runs g ON g.job_id=p.job_id WHERE p.consumed>0
 UNION ALL
 SELECT g.job_id,r.allocation_id,r.credit_used,g.created_at FROM generation_runs g JOIN reservations r ON r.job_id=g.job_id
 WHERE g.funding_version=0 AND r.credit_used>0 AND r.allocation_id IS NOT NULL;
-- Integer micro-euros conserve rounding across every receipt. Revenue is assigned
-- over the original number of purchased credits, never over the remaining wallet.
CREATE VIEW finance_credit_attribution AS
 WITH usage AS (SELECT u.*,sum(used) OVER(PARTITION BY allocation_id ORDER BY created_at,job_id ROWS UNBOUNDED PRECEDING) AS cumulative FROM finance_credit_usage u),
 paid AS (SELECT u.*,f.id AS receipt_id,f.mode,f.credits,f.fees_complete,f.disputed,
 CAST(f.revenue_ht_cents*10000*(max(0,f.gross_cents-f.refunded_cents-f.lost_cents))/f.gross_cents AS INTEGER) AS net_micros,f.fee_cents*10000 AS fee_micros
 FROM usage u JOIN financial_receipts f ON f.allocation_id=u.allocation_id)
 SELECT job_id,receipt_id,mode,used,disputed,
 CAST(net_micros*min(cumulative,credits)/credits AS INTEGER)-CAST(net_micros*min(cumulative-used,credits)/credits AS INTEGER) AS revenue_micros,
 CASE WHEN fees_complete=1 THEN CAST(fee_micros*min(cumulative,credits)/credits AS INTEGER)-CAST(fee_micros*min(cumulative-used,credits)/credits AS INTEGER) END AS fee_micros,
 IIF(fees_complete=0 OR disputed=1,1,0) AS incomplete FROM paid;
CREATE VIEW finance_expected_providers AS
 SELECT job_id,'cloudflare' AS provider FROM generation_runs
 UNION SELECT job_id,provider FROM narration_calls WHERE provider_mode='real'
 UNION SELECT job_id,'runway' FROM photo_animations WHERE mode='real';
CREATE VIEW finance_supplier_costs AS
 SELECT x.job_id,e.provider,sum(x.amount_micros*IIF(e.kind='credit_note',-1,1)) AS amount_micros,max(x.covers_provider) AS covered
 FROM financial_expense_allocations x JOIN financial_expenses e ON e.id=x.expense_id WHERE e.voided_at IS NULL GROUP BY x.job_id,e.provider;
CREATE VIEW finance_video_summary AS
 SELECT g.job_id,g.agency_id,g.financial_mode AS mode,g.created_at,j.status,
 coalesce(json_extract(l.facts_json,'$.title.value'),json_extract(i.result_json,'$.facts.title.value'),'Votre annonce') AS title,
 a.name AS agency,coalesce((SELECT sum(used) FROM finance_credit_usage u WHERE u.job_id=g.job_id),0) AS credits_used,
 coalesce((SELECT sum(revenue_micros) FROM finance_credit_attribution f WHERE f.job_id=g.job_id),0) AS revenue_micros,
 coalesce((SELECT sum(fee_micros) FROM finance_credit_attribution f WHERE f.job_id=g.job_id),0) AS fee_micros,
 (SELECT count(*) FROM finance_credit_attribution f WHERE f.job_id=g.job_id AND f.incomplete=1) AS fees_missing,
 coalesce((SELECT sum(amount_micros) FROM finance_supplier_costs c WHERE c.job_id=g.job_id),0) AS cost_micros,
 (SELECT group_concat(p.provider,',') FROM finance_expected_providers p WHERE p.job_id=g.job_id AND NOT EXISTS(
 SELECT 1 FROM finance_supplier_costs c WHERE c.job_id=p.job_id AND c.provider=p.provider AND c.covered=1)) AS missing_providers
 FROM generation_runs g JOIN jobs j ON j.id=g.job_id LEFT JOIN agencies a ON a.id=g.agency_id
 LEFT JOIN listings l ON l.id=j.listing_id LEFT JOIN listing_imports i ON i.id=j.listing_id;
