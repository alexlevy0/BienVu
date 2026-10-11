-- Only managed generations use the new resource queue and its bounded caps.
-- Preserve serialization for legacy producers which do not enrol a generation.
CREATE TRIGGER jobs_legacy_active_insert BEFORE INSERT ON jobs
WHEN NEW.status NOT IN ('ready','failed') AND NOT EXISTS(SELECT 1 FROM generation_runs WHERE job_id=NEW.id)
BEGIN
 SELECT RAISE(ABORT,'UNIQUE constraint failed: jobs.agency_id') WHERE EXISTS(
   SELECT 1 FROM jobs WHERE agency_id=NEW.agency_id AND status NOT IN ('ready','failed') AND id!=NEW.id);
END;
CREATE TRIGGER jobs_legacy_active_update BEFORE UPDATE OF status,agency_id ON jobs
WHEN NEW.status NOT IN ('ready','failed') AND NOT EXISTS(SELECT 1 FROM generation_runs WHERE job_id=NEW.id)
BEGIN
 SELECT RAISE(ABORT,'UNIQUE constraint failed: jobs.agency_id') WHERE EXISTS(
   SELECT 1 FROM jobs WHERE agency_id=NEW.agency_id AND status NOT IN ('ready','failed') AND id!=NEW.id);
END;
