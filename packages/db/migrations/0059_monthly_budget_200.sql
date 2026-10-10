-- Plafond mensuel doublé par Alex le 09/10/2026 : 200 EUR.
-- Migration de schéma uniquement : aucun plafond courant augmenté,
-- aucune dépense, réservation, pause ou révision réinitialisée.
PRAGMA defer_foreign_keys=ON;
PRAGMA legacy_alter_table=ON;
DROP TRIGGER admin_action_validate;
CREATE TABLE hosted_import_budget_v3 (
 month TEXT PRIMARY KEY NOT NULL,
 baseline_cents INTEGER NOT NULL CHECK(baseline_cents>=0),
 ceiling_cents INTEGER NOT NULL DEFAULT 2500 CHECK(ceiling_cents BETWEEN 0 AND 19500),
 paused INTEGER NOT NULL DEFAULT 1 CHECK(paused IN (0,1))
);
INSERT INTO hosted_import_budget_v3 SELECT * FROM hosted_import_budget;
DROP TABLE hosted_import_budget;
ALTER TABLE hosted_import_budget_v3 RENAME TO hosted_import_budget;
CREATE TABLE monthly_budget_settings_v2 (
 month TEXT PRIMARY KEY NOT NULL REFERENCES hosted_import_budget(month),
 envelope_cents INTEGER NOT NULL CHECK(envelope_cents BETWEEN 500 AND 20000),
 revision INTEGER NOT NULL CHECK(revision>=1)
);
INSERT INTO monthly_budget_settings_v2 SELECT * FROM monthly_budget_settings;
DROP TABLE monthly_budget_settings;
ALTER TABLE monthly_budget_settings_v2 RENAME TO monthly_budget_settings;
PRAGMA legacy_alter_table=OFF;
CREATE TRIGGER admin_action_validate BEFORE INSERT ON admin_audit
BEGIN
  SELECT RAISE(ABORT,'ADMIN_RATE_LIMIT') WHERE
    (SELECT count(*) FROM admin_audit WHERE actor_user_id=NEW.actor_user_id AND created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 minute'))>=20;
  SELECT RAISE(ABORT,'ADMIN_CONFLICT') WHERE NEW.action='generation_gate' AND
    (NEW.target_id!='generations' OR NEW.after_value NOT IN ('0','1') OR NOT EXISTS(
      SELECT 1 FROM generation_control WHERE id=NEW.target_id AND CAST(enabled AS TEXT)=NEW.before_value));
  SELECT RAISE(ABORT,'ADMIN_CONFLICT') WHERE NEW.action='report_status' AND
    (NEW.after_value NOT IN ('new','reviewing','closed') OR NOT EXISTS(
      SELECT 1 FROM generation_reports WHERE id=NEW.target_id AND status=NEW.before_value));
  SELECT RAISE(ABORT,'ADMIN_CONFLICT') WHERE NEW.action='quota' AND NOT EXISTS(
    SELECT 1 FROM allocations a JOIN agencies g ON g.id=a.agency_id JOIN auth_user u ON u.id=g.owner_user_id
      WHERE a.id=NEW.target_id AND CAST(a.quota_limit AS TEXT)=NEW.before_value
      AND a.valid_from<=NEW.created_at AND a.valid_until>NEW.created_at
      AND (a.kind!='trial' OR CAST(NEW.after_value AS INTEGER)=1)
      AND CAST(NEW.after_value AS INTEGER) BETWEEN max(1,a.reserved+a.consumed) AND 1000);

  SELECT RAISE(ABORT,'ADMIN_CONFLICT') WHERE NEW.action='monthly_budget' AND (
    NEW.target_id!=strftime('%Y-%m','now') OR substr(NEW.created_at,1,7)!=NEW.target_id
    OR NOT json_valid(NEW.after_value)
    OR coalesce(json_type(NEW.after_value,'$.envelopeCents'),'')!='integer'
    OR coalesce(json_type(NEW.after_value,'$.ceilingCents'),'')!='integer'
    OR coalesce(json_type(NEW.after_value,'$.openingCents'),'')!='integer'
    OR coalesce(json_type(NEW.after_value,'$.paused'),'')!='integer'
    OR json_extract(NEW.after_value,'$.envelopeCents') NOT BETWEEN 500 AND 20000
    OR json_extract(NEW.after_value,'$.ceilingCents') NOT BETWEEN 0 AND 19500
    OR json_extract(NEW.after_value,'$.envelopeCents')-json_extract(NEW.after_value,'$.ceilingCents')<500
    OR json_extract(NEW.after_value,'$.openingCents') NOT BETWEEN 0 AND json_extract(NEW.after_value,'$.ceilingCents')
    OR json_extract(NEW.after_value,'$.paused') NOT IN (0,1)
    OR (NEW.before_value='null' AND EXISTS(SELECT 1 FROM hosted_import_budget WHERE month=NEW.target_id))
    OR (NEW.before_value!='null' AND (json_extract(NEW.after_value,'$.openingCents')!=0 OR NOT EXISTS(
      SELECT 1 FROM hosted_import_budget b LEFT JOIN monthly_budget_settings s ON s.month=b.month
      WHERE b.month=NEW.target_id AND coalesce(s.revision,0)=json_extract(NEW.before_value,'$.revision'))))
    OR coalesce((SELECT baseline_cents FROM hosted_import_budget WHERE month=NEW.target_id),json_extract(NEW.after_value,'$.openingCents'))
       +(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=NEW.target_id)>json_extract(NEW.after_value,'$.ceilingCents')
    OR (SELECT coalesce(sum(reservation_cents),0) FROM narration_calls WHERE month=NEW.target_id AND provider_mode='real')>min(2500,json_extract(NEW.after_value,'$.ceilingCents'))
  );
END;

PRAGMA defer_foreign_keys=OFF;
