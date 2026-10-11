-- Freeze the offered cities before narration, animation or a video manifest.
CREATE TABLE generation_map_confirmations(
 job_id TEXT PRIMARY KEY,agency_id TEXT NOT NULL,options_json TEXT NOT NULL CHECK(json_valid(options_json) AND json_type(options_json)='array' AND json_array_length(options_json) BETWEEN 1 AND 5),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','selected','skipped','expired')),selected_id TEXT,
 created_at TEXT NOT NULL,expires_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 FOREIGN KEY(job_id) REFERENCES generation_runs(job_id),FOREIGN KEY(agency_id,job_id) REFERENCES jobs(agency_id,id),
 CHECK(expires_at>created_at),CHECK((state='selected' AND selected_id IS NOT NULL) OR (state!='selected' AND selected_id IS NULL))
);
CREATE TRIGGER generation_map_confirmation_admit BEFORE INSERT ON generation_map_confirmations BEGIN
 SELECT RAISE(ABORT,'GENERATION_MAP_CONFIRMATION_INVALID') WHERE NEW.state!='pending' OR NOT EXISTS(
  SELECT 1 FROM generation_runs g JOIN jobs j ON j.id=g.job_id WHERE g.job_id=NEW.job_id AND g.agency_id=NEW.agency_id
   AND g.default_map_json IS NOT NULL AND g.retention='available' AND g.deadline>NEW.expires_at AND j.status='importing' AND j.stage='importing')
  OR EXISTS(SELECT 1 FROM generation_map_resolutions WHERE job_id=NEW.job_id)
  OR EXISTS(SELECT 1 FROM narration_runs WHERE job_id=NEW.job_id)
  OR EXISTS(SELECT 1 FROM video_manifests WHERE job_id=NEW.job_id);
END;
CREATE TRIGGER generation_map_confirmation_immutable BEFORE UPDATE ON generation_map_confirmations BEGIN
 SELECT RAISE(ABORT,'GENERATION_MAP_CONFIRMATION_IMMUTABLE') WHERE OLD.state!='pending' OR NEW.state='pending'
  OR NEW.job_id!=OLD.job_id OR NEW.agency_id!=OLD.agency_id OR NEW.options_json!=OLD.options_json
  OR NEW.created_at!=OLD.created_at OR NEW.expires_at!=OLD.expires_at
  OR (NEW.state='selected' AND NOT EXISTS(SELECT 1 FROM json_each(OLD.options_json) WHERE json_extract(value,'$.id')=NEW.selected_id));
END;
