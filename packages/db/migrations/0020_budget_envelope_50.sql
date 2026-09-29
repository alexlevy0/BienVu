-- Alex autorise +20 EUR le 29/09 : pilote 50 EUR, coupure 45 EUR.
-- Conserver les dépenses, réservations, pauses et mois précédents.
-- Legacy ALTER garde les triggers des jobs/extractions pointés vers le nom public.
PRAGMA legacy_alter_table = ON;
ALTER TABLE hosted_import_budget RENAME TO hosted_import_budget_old;
CREATE TABLE hosted_import_budget (
  month TEXT PRIMARY KEY NOT NULL,
  baseline_cents INTEGER NOT NULL CHECK(baseline_cents >= 0),
  ceiling_cents INTEGER NOT NULL DEFAULT 2500 CHECK(ceiling_cents BETWEEN 0 AND 4500),
  paused INTEGER NOT NULL DEFAULT 1 CHECK(paused IN (0,1))
);
INSERT INTO hosted_import_budget SELECT month,baseline_cents,ceiling_cents,paused FROM hosted_import_budget_old;
DROP TABLE hosted_import_budget_old;
PRAGMA legacy_alter_table = OFF;
-- L'augmentation ne concerne que le mois actif et un plafond déjà autorisé à 35 EUR.
UPDATE hosted_import_budget SET ceiling_cents=4500
  WHERE month=strftime('%Y-%m','now') AND ceiling_cents=3500;
UPDATE trial_policy SET budget_ceiling_cents=4500
  WHERE id=1 AND budget_ceiling_cents=2500;
