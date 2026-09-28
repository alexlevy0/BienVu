-- Configuration opérateur explicite par mois. Aucune activation/facturation automatique.
CREATE TABLE hosted_import_budget (
  month TEXT PRIMARY KEY NOT NULL,
  baseline_cents INTEGER NOT NULL CHECK(baseline_cents >= 0),
  ceiling_cents INTEGER NOT NULL DEFAULT 2500 CHECK(ceiling_cents BETWEEN 0 AND 2500),
  paused INTEGER NOT NULL DEFAULT 1 CHECK(paused IN (0,1))
);
-- Sans cascade : les dépenses et tentatives restent comptées après purge d'une annonce.
CREATE TABLE hosted_import_costs (
  import_id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL,
  month TEXT NOT NULL,
  reserved_cents INTEGER NOT NULL DEFAULT 50 CHECK(reserved_cents = 50),
  requests INTEGER NOT NULL DEFAULT 0 CHECK(requests BETWEEN 0 AND 48),
  source_bytes INTEGER NOT NULL DEFAULT 0 CHECK(source_bytes BETWEEN 0 AND 52428800),
  browser_started INTEGER NOT NULL DEFAULT 0 CHECK(browser_started IN (0,1)),
  created_at TEXT NOT NULL
);
CREATE INDEX hosted_cost_month ON hosted_import_costs(month);
CREATE TABLE hosted_browser_slot (id INTEGER PRIMARY KEY CHECK(id=1), lease_id TEXT, lease_until INTEGER NOT NULL DEFAULT 0);
INSERT INTO hosted_browser_slot(id) VALUES(1);
