-- Double the shared daily URL-import allowance without resetting usage.
-- Monthly allowance, manual projects and financial safeguards stay unchanged.
DROP TRIGGER import_budget;
CREATE TRIGGER import_budget BEFORE INSERT ON listing_imports
WHEN NEW.source_kind='url' AND NOT EXISTS(
  SELECT 1 FROM listing_imports WHERE agency_id=NEW.agency_id AND idempotency_key=NEW.idempotency_key)
BEGIN
  SELECT RAISE(ABORT,'IMPORT_LIMIT') WHERE coalesce((SELECT attempts FROM import_usage WHERE day=substr(NEW.created_at,1,10)),0)>=40
    OR coalesce((SELECT sum(attempts) FROM import_usage WHERE substr(day,1,7)=substr(NEW.created_at,1,7)),0)>=300;
  INSERT INTO import_usage(day,attempts) VALUES(substr(NEW.created_at,1,10),1)
    ON CONFLICT(day) DO UPDATE SET attempts=attempts+1;
END;
