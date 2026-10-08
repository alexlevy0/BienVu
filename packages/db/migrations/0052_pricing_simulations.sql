CREATE TABLE pricing_scenarios (
 id TEXT PRIMARY KEY CHECK(length(id)=36),
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 revision INTEGER NOT NULL CHECK(revision>=1),
 input_json TEXT NOT NULL CHECK(json_valid(input_json) AND length(input_json)<=49152),
 mutation_id TEXT NOT NULL UNIQUE,
 created_by TEXT NOT NULL, updated_by TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX pricing_scenarios_active ON pricing_scenarios(deleted_at,updated_at);
CREATE TRIGGER pricing_scenario_limit BEFORE INSERT ON pricing_scenarios
WHEN (SELECT count(*) FROM pricing_scenarios WHERE deleted_at IS NULL)>=100
BEGIN SELECT RAISE(ABORT,'PRICING_SCENARIO_LIMIT'); END;

CREATE TABLE pricing_scenario_audit (
 id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, scenario_id TEXT NOT NULL REFERENCES pricing_scenarios(id),
 action TEXT NOT NULL CHECK(action IN ('create','update','delete')),
 revision INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TRIGGER pricing_audit_rate BEFORE INSERT ON pricing_scenario_audit
WHEN (SELECT count(*) FROM pricing_scenario_audit WHERE actor_id=NEW.actor_id
 AND created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 minute'))>=10
BEGIN SELECT RAISE(ABORT,'PRICING_RATE_LIMIT'); END;
CREATE TRIGGER pricing_audit_no_update BEFORE UPDATE ON pricing_scenario_audit
BEGIN SELECT RAISE(ABORT,'PRICING_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER pricing_audit_no_delete BEFORE DELETE ON pricing_scenario_audit
BEGIN SELECT RAISE(ABORT,'PRICING_AUDIT_IMMUTABLE'); END;

-- Bound the dated observation queries and supplier-cost joins as usage grows.
CREATE INDEX pricing_generation_period ON generation_runs(created_at,financial_mode,job_id);
CREATE INDEX pricing_receipt_period ON financial_receipts(paid_at,mode,kind);
CREATE INDEX pricing_expense_job ON financial_expense_allocations(job_id,expense_id);
