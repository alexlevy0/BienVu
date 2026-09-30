-- Historique administratif minimal, sans cookies, jetons ou données de paiement.
CREATE TABLE admin_audit (
  id TEXT PRIMARY KEY NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES auth_user(id),
  action TEXT NOT NULL CHECK(action IN ('generation_gate','report_status','quota')),
  target_id TEXT NOT NULL,
  before_value TEXT NOT NULL,
  after_value TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 5 AND 300),
  created_at TEXT NOT NULL
);
CREATE INDEX admin_audit_created ON admin_audit(created_at DESC,id DESC);
CREATE INDEX jobs_admin_created ON jobs(created_at DESC,id DESC);
CREATE INDEX imports_admin_created ON listing_imports(created_at DESC,id DESC);
CREATE INDEX reports_admin_created ON generation_reports(created_at DESC,id DESC);
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
END;
CREATE TRIGGER admin_action_apply AFTER INSERT ON admin_audit
BEGIN
  UPDATE generation_control SET enabled=CAST(NEW.after_value AS INTEGER),updated_at=NEW.created_at
    WHERE NEW.action='generation_gate' AND id=NEW.target_id;
  UPDATE generation_reports SET status=NEW.after_value WHERE NEW.action='report_status' AND id=NEW.target_id;
  UPDATE allocations SET quota_limit=CAST(NEW.after_value AS INTEGER) WHERE NEW.action='quota' AND id=NEW.target_id;
END;
