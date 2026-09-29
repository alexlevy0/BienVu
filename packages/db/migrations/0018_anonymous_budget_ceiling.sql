-- Anonymous pilot requested at 30 EUR, with a 5 EUR safety margin. Keep the
-- existing service ledger/history and its older paid-test envelope untouched.
ALTER TABLE trial_policy ADD COLUMN budget_ceiling_cents INTEGER NOT NULL DEFAULT 2500 CHECK(budget_ceiling_cents>0);
CREATE TRIGGER anonymous_budget_ceiling BEFORE INSERT ON generation_runs
WHEN NEW.anonymous_session_id IS NOT NULL
BEGIN
-- Include the forthcoming import's existing 50-cent provision in admission.
-- The import ledger books it itself later; do not reserve it twice here.
  SELECT RAISE(ABORT,'GENERATION_BUDGET_LIMIT') WHERE NOT EXISTS(
    SELECT 1 FROM hosted_import_budget b,trial_policy p WHERE b.month=NEW.month AND p.id=1 AND b.paused=0
    AND b.baseline_cents+NEW.provision_cents+NEW.preview_provision_cents+50+
      (SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=NEW.month)
      <=min(b.ceiling_cents,p.budget_ceiling_cents));
END;
