-- A new default never changes historical inputs, manifests or editor timelines.
CREATE TABLE video_map_settings(id INTEGER PRIMARY KEY CHECK(id=1),settings_json TEXT NOT NULL CHECK(json_valid(settings_json)),
 revision INTEGER NOT NULL CHECK(revision>0),updated_at TEXT NOT NULL,updated_by TEXT);
INSERT INTO video_map_settings(id,settings_json,revision,updated_at) VALUES(1,
 '{"enabled":true,"position":"start","durationSeconds":4,"view":"satellite","zoomStart":12,"zoomEnd":14.5}',1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE video_map_setting_events(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,settings_json TEXT NOT NULL CHECK(json_valid(settings_json)),
 expected_revision INTEGER NOT NULL CHECK(expected_revision>0),created_at TEXT NOT NULL);
CREATE TRIGGER video_map_setting_cas BEFORE INSERT ON video_map_setting_events BEGIN
 SELECT RAISE(ABORT,'VIDEO_MAP_SETTING_CONFLICT') WHERE NOT EXISTS(SELECT 1 FROM video_map_settings WHERE id=1 AND revision=NEW.expected_revision);
 SELECT RAISE(ABORT,'VIDEO_MAP_SETTING_RATE_LIMIT') WHERE (SELECT count(*) FROM video_map_setting_events WHERE actor_id=NEW.actor_id AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at,'-1 minute'))>=20;
END;
CREATE TRIGGER video_map_setting_apply AFTER INSERT ON video_map_setting_events BEGIN
 UPDATE video_map_settings SET settings_json=NEW.settings_json,revision=revision+1,updated_at=NEW.created_at,updated_by=NEW.actor_id WHERE id=1;
END;
CREATE TRIGGER video_map_setting_no_edit BEFORE UPDATE ON video_map_setting_events BEGIN SELECT RAISE(ABORT,'VIDEO_MAP_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER video_map_setting_no_delete BEFORE DELETE ON video_map_setting_events BEGIN SELECT RAISE(ABORT,'VIDEO_MAP_AUDIT_IMMUTABLE'); END;
ALTER TABLE generation_runs ADD COLUMN default_map_json TEXT CHECK(default_map_json IS NULL OR json_valid(default_map_json));
CREATE TRIGGER generation_map_policy_immutable BEFORE UPDATE OF default_map_json ON generation_runs BEGIN SELECT RAISE(ABORT,'GENERATION_IMMUTABLE'); END;
CREATE TABLE generation_map_resolutions(job_id TEXT PRIMARY KEY,agency_id TEXT NOT NULL,map_json TEXT CHECK(map_json IS NULL OR json_valid(map_json)),
 reason TEXT CHECK(reason IN ('location_missing','ambiguous_location','map_unavailable')),created_at TEXT NOT NULL,
 FOREIGN KEY(job_id) REFERENCES generation_runs(job_id),FOREIGN KEY(agency_id,job_id) REFERENCES jobs(agency_id,id),
 CHECK((map_json IS NOT NULL AND reason IS NULL) OR (map_json IS NULL AND reason IS NOT NULL)));
CREATE TRIGGER generation_map_resolution_admit BEFORE INSERT ON generation_map_resolutions BEGIN
 SELECT RAISE(ABORT,'GENERATION_MAP_INVALID') WHERE NOT EXISTS(SELECT 1 FROM generation_runs g JOIN jobs j ON j.id=g.job_id
  WHERE g.agency_id=NEW.agency_id AND g.job_id=NEW.job_id AND g.default_map_json IS NOT NULL AND j.status NOT IN ('ready','failed'));
END;
CREATE TRIGGER generation_map_resolution_immutable BEFORE UPDATE ON generation_map_resolutions BEGIN SELECT RAISE(ABORT,'GENERATION_MAP_IMMUTABLE'); END;
