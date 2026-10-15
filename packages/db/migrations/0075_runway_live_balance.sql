-- The original 10 EUR test purchase is an accounting entry, not a lifetime
-- spending ceiling. New purchases are discovered through the read-only SDK.
ALTER TABLE generation_provider_limits ADD COLUMN credit_balance REAL CHECK(credit_balance>=0);
ALTER TABLE generation_provider_limits ADD COLUMN balance_reserved_credits INTEGER NOT NULL DEFAULT 0 CHECK(balance_reserved_credits>=0);
ALTER TABLE generation_provider_limits ADD COLUMN balance_pending_credits INTEGER NOT NULL DEFAULT 0 CHECK(balance_pending_credits>=0);
ALTER TABLE generation_provider_limits ADD COLUMN balance_checked_at TEXT;
ALTER TABLE generation_provider_limits ADD COLUMN balance_error TEXT;
ALTER TABLE generation_preparation_steps ADD COLUMN error_code TEXT;

CREATE VIEW runway_local_usage AS
 SELECT coalesce(sum(credits),0) AS reserved_credits,coalesce(sum(pending),0) AS pending_credits FROM (
  SELECT credits,IIF(state IN ('submitting','submitted'),credits,0) AS pending FROM photo_animations WHERE mode='real'
  UNION ALL SELECT credits,IIF(state='reserved',credits,0) FROM runway_external_verifications);
CREATE VIEW runway_month_usage AS
 SELECT month,sum(reserved_cents) AS reserved_cents FROM (
  SELECT month,reserved_cents FROM photo_animations WHERE mode='real'
  UNION ALL SELECT month,reserved_cents FROM runway_external_verifications) GROUP BY month;
CREATE VIEW runway_available_balance AS
 SELECT p.credit_balance AS credits,p.balance_checked_at AS checked_at,
  max(0,p.credit_balance-p.balance_pending_credits-max(0,u.reserved_credits-p.balance_reserved_credits)) AS available_credits
 FROM generation_provider_limits p CROSS JOIN runway_local_usage u WHERE p.provider='runway' AND p.credit_balance IS NOT NULL
  AND p.balance_checked_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 minutes') AND p.balance_error IS NULL;

DROP TRIGGER runway_clip_admit;
CREATE TRIGGER runway_clip_admit BEFORE INSERT ON photo_animations BEGIN
 SELECT RAISE(ABORT,'RUNWAY_JOB_INACTIVE') WHERE NOT EXISTS(SELECT 1 FROM generation_runs g JOIN jobs j ON j.id=g.job_id
  WHERE g.job_id=NEW.job_id AND g.agency_id=NEW.agency_id AND g.month=NEW.month AND g.retention='available'
   AND g.deadline>NEW.created_at AND j.status NOT IN ('ready','failed')
   AND NEW.slot<coalesce(json_array_length(g.input_json,'$.customization.runwayPhotos'),json_extract(g.input_json,'$.customization.runwayClips'),0));
 SELECT RAISE(ABORT,'RUNWAY_BUDGET_LIMIT') WHERE NEW.mode='real' AND NOT EXISTS(
  SELECT 1 FROM hosted_import_budget b LEFT JOIN runway_budget r ON r.month=b.month LEFT JOIN runway_month_usage u ON u.month=b.month
  WHERE b.month=NEW.month AND b.paused=0 AND coalesce(r.paused,0)=0
   AND b.baseline_cents+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=b.month)
    +min(NEW.reserved_cents,max(0,coalesce(u.reserved_cents,0)+NEW.reserved_cents-coalesce(r.prepaid_cents,0)))<=b.ceiling_cents
   AND (EXISTS(SELECT 1 FROM runway_available_balance WHERE available_credits>=NEW.credits)
    OR ((SELECT balance_checked_at FROM generation_provider_limits WHERE provider='runway') IS NULL
     AND (SELECT balance_error FROM generation_provider_limits WHERE provider='runway') IS NULL
     AND r.month IS NOT NULL AND coalesce(u.reserved_cents,0)+NEW.reserved_cents<=r.prepaid_cents
     AND (SELECT coalesce(sum(credits),0) FROM photo_animations WHERE month=b.month AND mode='real')
      +(SELECT coalesce(sum(credits),0) FROM runway_external_verifications WHERE month=b.month)+NEW.credits<=r.api_credits)));
END;
CREATE TRIGGER runway_clip_cash_account AFTER INSERT ON photo_animations WHEN NEW.mode='real' BEGIN
 UPDATE hosted_import_budget SET baseline_cents=baseline_cents+min(NEW.reserved_cents,max(0,
  (SELECT reserved_cents FROM runway_month_usage WHERE month=NEW.month)-coalesce((SELECT prepaid_cents FROM runway_budget WHERE month=NEW.month),0))) WHERE month=NEW.month;
END;

DROP TRIGGER runway_external_admit;
CREATE TRIGGER runway_external_admit BEFORE INSERT ON runway_external_verifications BEGIN
 SELECT RAISE(ABORT,'RUNWAY_BUDGET_LIMIT') WHERE NOT EXISTS(
  SELECT 1 FROM hosted_import_budget b LEFT JOIN runway_budget r ON r.month=b.month LEFT JOIN runway_month_usage u ON u.month=b.month
  WHERE b.month=NEW.month AND b.paused=0 AND coalesce(r.paused,0)=0
   AND b.baseline_cents+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=b.month)
    +min(NEW.reserved_cents,max(0,coalesce(u.reserved_cents,0)+NEW.reserved_cents-coalesce(r.prepaid_cents,0)))<=b.ceiling_cents
   AND (EXISTS(SELECT 1 FROM runway_available_balance WHERE available_credits>=NEW.credits)
    OR ((SELECT balance_checked_at FROM generation_provider_limits WHERE provider='runway') IS NULL
     AND (SELECT balance_error FROM generation_provider_limits WHERE provider='runway') IS NULL
     AND r.month IS NOT NULL AND coalesce(u.reserved_cents,0)+NEW.reserved_cents<=r.prepaid_cents
     AND (SELECT coalesce(sum(credits),0) FROM photo_animations WHERE month=b.month AND mode='real')
      +(SELECT coalesce(sum(credits),0) FROM runway_external_verifications WHERE month=b.month)+NEW.credits<=r.api_credits)));
END;
CREATE TRIGGER runway_external_cash_account AFTER INSERT ON runway_external_verifications BEGIN
 UPDATE hosted_import_budget SET baseline_cents=baseline_cents+min(NEW.reserved_cents,max(0,
  (SELECT reserved_cents FROM runway_month_usage WHERE month=NEW.month)-coalesce((SELECT prepaid_cents FROM runway_budget WHERE month=NEW.month),0))) WHERE month=NEW.month;
END;
