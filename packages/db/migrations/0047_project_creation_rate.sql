-- Project count is not an import allowance. Keep a separate, temporary guard
-- against repeated manual/demonstration copies, independent of video credits.
-- This ledger survives deleting a draft; replaying its key does not charge it.
CREATE TABLE project_creation_usage (
  agency_id TEXT NOT NULL REFERENCES agencies(id),
  hour TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK(attempts>0),
  PRIMARY KEY(agency_id,hour)
);
INSERT INTO project_creation_usage(agency_id,hour,attempts)
  SELECT agency_id,substr(created_at,1,13),count(*) FROM listing_imports
  WHERE source_kind='manual' GROUP BY agency_id,substr(created_at,1,13);

CREATE TRIGGER project_creation_rate BEFORE INSERT ON listing_imports
WHEN NEW.source_kind='manual' AND NOT EXISTS(
  SELECT 1 FROM listing_imports WHERE agency_id=NEW.agency_id AND idempotency_key=NEW.idempotency_key)
BEGIN
  SELECT RAISE(ABORT,'PROJECT_RATE_LIMIT') WHERE coalesce((SELECT attempts
    FROM project_creation_usage WHERE agency_id=NEW.agency_id AND hour=substr(NEW.created_at,1,13)),0)>=60;
END;
CREATE TRIGGER project_creation_count AFTER INSERT ON listing_imports
WHEN NEW.source_kind='manual'
BEGIN
  INSERT INTO project_creation_usage(agency_id,hour,attempts) VALUES(NEW.agency_id,substr(NEW.created_at,1,13),1)
    ON CONFLICT(agency_id,hour) DO UPDATE SET attempts=attempts+1;
END;
