-- Alex autorise +10 € le 28/09 : enveloppe 40 €, coupure 35 €.
-- Préserve chaque ancien plafond, pause, dépense et compteur. La hausse du
-- mois courant est une action opérateur séparée, pas un effet de migration.
CREATE TABLE hosted_import_budget_v2 (
  month TEXT PRIMARY KEY NOT NULL,
  baseline_cents INTEGER NOT NULL CHECK(baseline_cents >= 0),
  ceiling_cents INTEGER NOT NULL DEFAULT 2500 CHECK(ceiling_cents BETWEEN 0 AND 3500),
  paused INTEGER NOT NULL DEFAULT 1 CHECK(paused IN (0,1))
);
INSERT INTO hosted_import_budget_v2 SELECT month,baseline_cents,ceiling_cents,paused FROM hosted_import_budget;
DROP TABLE hosted_import_budget;
ALTER TABLE hosted_import_budget_v2 RENAME TO hosted_import_budget;
