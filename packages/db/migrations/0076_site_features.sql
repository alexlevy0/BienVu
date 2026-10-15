-- Visibility only: shared videos and existing public routes stay available.
CREATE TABLE site_feature_settings(id INTEGER PRIMARY KEY CHECK(id=1),
 features_json TEXT NOT NULL CHECK(json_valid(features_json) AND json_type(features_json,'$.explorer') IN ('true','false')),
 revision INTEGER NOT NULL CHECK(revision>0),updated_at TEXT NOT NULL,updated_by TEXT);
INSERT INTO site_feature_settings(id,features_json,revision,updated_at)
 VALUES(1,'{"explorer":false}',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE site_feature_events(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,features_json TEXT NOT NULL CHECK(json_valid(features_json)),
 expected_revision INTEGER NOT NULL CHECK(expected_revision>0),created_at TEXT NOT NULL);
CREATE TRIGGER site_feature_cas BEFORE INSERT ON site_feature_events BEGIN
 SELECT RAISE(ABORT,'SITE_FEATURE_CONFLICT') WHERE NOT EXISTS(SELECT 1 FROM site_feature_settings WHERE id=1 AND revision=NEW.expected_revision);
 SELECT RAISE(ABORT,'SITE_FEATURE_RATE_LIMIT') WHERE (SELECT count(*) FROM site_feature_events WHERE actor_id=NEW.actor_id AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at,'-1 minute'))>=20;
END;
CREATE TRIGGER site_feature_apply AFTER INSERT ON site_feature_events BEGIN
 UPDATE site_feature_settings SET features_json=NEW.features_json,revision=revision+1,updated_at=NEW.created_at,updated_by=NEW.actor_id WHERE id=1;
END;
CREATE TRIGGER site_feature_no_edit BEFORE UPDATE ON site_feature_events BEGIN SELECT RAISE(ABORT,'SITE_FEATURE_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER site_feature_no_delete BEFORE DELETE ON site_feature_events BEGIN SELECT RAISE(ABORT,'SITE_FEATURE_AUDIT_IMMUTABLE'); END;
