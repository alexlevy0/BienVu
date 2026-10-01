-- Budget mensuel administrable : autorisation 100 EUR, marge minimale 5 EUR.
-- Aucun mois ouvert ni plafond augmenté automatiquement. Aucune dépense effacée.
PRAGMA legacy_alter_table=ON;
ALTER TABLE hosted_import_budget RENAME TO hosted_import_budget_old;
CREATE TABLE hosted_import_budget (
 month TEXT PRIMARY KEY NOT NULL,
 baseline_cents INTEGER NOT NULL CHECK(baseline_cents>=0),
 ceiling_cents INTEGER NOT NULL DEFAULT 2500 CHECK(ceiling_cents BETWEEN 0 AND 9500),
 paused INTEGER NOT NULL DEFAULT 1 CHECK(paused IN (0,1))
);
INSERT INTO hosted_import_budget SELECT * FROM hosted_import_budget_old;
DROP TABLE hosted_import_budget_old;
PRAGMA legacy_alter_table=OFF;
CREATE TABLE monthly_budget_settings (
 month TEXT PRIMARY KEY NOT NULL REFERENCES hosted_import_budget(month),
 envelope_cents INTEGER NOT NULL CHECK(envelope_cents BETWEEN 500 AND 10000),
 revision INTEGER NOT NULL CHECK(revision>=1)
);
CREATE TABLE admin_audit_backup AS SELECT * FROM admin_audit;
DROP TABLE admin_audit;
-- Historique administratif minimal, sans cookies, jetons ou données de paiement.
CREATE TABLE admin_audit (
  id TEXT PRIMARY KEY NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES auth_user(id),
  action TEXT NOT NULL CHECK(action IN ('generation_gate','report_status','quota','monthly_budget')),
  target_id TEXT NOT NULL,
  before_value TEXT NOT NULL,
  after_value TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 5 AND 300),
  created_at TEXT NOT NULL
);
CREATE INDEX admin_audit_created ON admin_audit(created_at DESC,id DESC);
INSERT INTO admin_audit SELECT * FROM admin_audit_backup;
DROP TABLE admin_audit_backup;
CREATE TRIGGER admin_audit_immutable_update BEFORE UPDATE ON admin_audit
BEGIN SELECT RAISE(ABORT,'ADMIN_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER admin_audit_immutable_delete BEFORE DELETE ON admin_audit
BEGIN SELECT RAISE(ABORT,'ADMIN_AUDIT_IMMUTABLE'); END;
-- Une seule écriture valide, modifie puis journalise ; aucun succès partiel.
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
    OR json_extract(NEW.after_value,'$.envelopeCents') NOT BETWEEN 500 AND 10000
    OR json_extract(NEW.after_value,'$.ceilingCents') NOT BETWEEN 0 AND 9500
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
CREATE TRIGGER admin_action_apply AFTER INSERT ON admin_audit
BEGIN
  UPDATE generation_control SET enabled=CAST(NEW.after_value AS INTEGER),updated_at=NEW.created_at
    WHERE NEW.action='generation_gate' AND id=NEW.target_id;
  UPDATE generation_reports SET status=NEW.after_value WHERE NEW.action='report_status' AND id=NEW.target_id;
  UPDATE allocations SET quota_limit=CAST(NEW.after_value AS INTEGER) WHERE NEW.action='quota' AND id=NEW.target_id;

  INSERT INTO hosted_import_budget(month,baseline_cents,ceiling_cents,paused)
    SELECT NEW.target_id,json_extract(NEW.after_value,'$.openingCents'),json_extract(NEW.after_value,'$.ceilingCents'),json_extract(NEW.after_value,'$.paused')
      WHERE NEW.action='monthly_budget'
    ON CONFLICT(month) DO UPDATE SET ceiling_cents=excluded.ceiling_cents,paused=excluded.paused;
  INSERT INTO monthly_budget_settings(month,envelope_cents,revision)
    SELECT NEW.target_id,json_extract(NEW.after_value,'$.envelopeCents'),1 WHERE NEW.action='monthly_budget'
    ON CONFLICT(month) DO UPDATE SET envelope_cents=excluded.envelope_cents,revision=monthly_budget_settings.revision+1;
  UPDATE trial_policy SET budget_ceiling_cents=json_extract(NEW.after_value,'$.ceilingCents') WHERE id=1 AND NEW.action='monthly_budget';
  INSERT INTO narration_budget(month,envelope_cents,paused)
    SELECT NEW.target_id,min(2500,json_extract(NEW.after_value,'$.ceilingCents')),json_extract(NEW.after_value,'$.paused') WHERE NEW.action='monthly_budget'
    ON CONFLICT(month) DO UPDATE SET envelope_cents=excluded.envelope_cents,paused=excluded.paused;
END;
