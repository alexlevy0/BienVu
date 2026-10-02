-- The transport quota bounds scraping, not user-supplied photos. Keep historical
-- counts intact. Manual drafts still have the 30-dossiers/agency cap, the hosted
-- monetary reservation and the 12 photos / 50 MiB / 48 requests limits.
DROP TRIGGER import_budget;
CREATE TRIGGER import_budget BEFORE INSERT ON listing_imports
WHEN NEW.source_kind='url' AND NOT EXISTS(
  SELECT 1 FROM listing_imports WHERE agency_id=NEW.agency_id AND idempotency_key=NEW.idempotency_key)
BEGIN
  SELECT RAISE(ABORT,'IMPORT_LIMIT') WHERE coalesce((SELECT attempts FROM import_usage WHERE day=substr(NEW.created_at,1,10)),0)>=10
    OR coalesce((SELECT sum(attempts) FROM import_usage WHERE substr(day,1,7)=substr(NEW.created_at,1,7)),0)>=30;
  INSERT INTO import_usage(day,attempts) VALUES(substr(NEW.created_at,1,10),1)
    ON CONFLICT(day) DO UPDATE SET attempts=attempts+1;
END;
