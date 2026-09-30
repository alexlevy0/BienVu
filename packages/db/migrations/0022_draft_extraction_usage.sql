-- Deleting a draft must not reset the extraction rate limits or its costs.
-- Keep aggregate usage independently of the private draft and its text.
CREATE TABLE draft_extraction_usage (
  agency_id TEXT NOT NULL REFERENCES agencies(id),
  day TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK(attempts>0),
  PRIMARY KEY(agency_id,day)
);
CREATE INDEX draft_extraction_usage_day ON draft_extraction_usage(day);
INSERT INTO draft_extraction_usage(agency_id,day,attempts)
  SELECT agency_id,substr(created_at,1,10),count(*) FROM draft_extract_calls
  GROUP BY agency_id,substr(created_at,1,10);

DROP TRIGGER draft_extract_budget;
CREATE TRIGGER draft_extract_budget BEFORE INSERT ON draft_extract_calls
BEGIN
  SELECT RAISE(ABORT,'EXTRACTION_LIMIT') WHERE
    coalesce((SELECT attempts FROM draft_extraction_usage WHERE agency_id=NEW.agency_id AND day=substr(NEW.created_at,1,10)),0)>=5
    OR coalesce((SELECT sum(attempts) FROM draft_extraction_usage WHERE substr(day,1,7)=substr(NEW.created_at,1,7)),0)>=100;
  SELECT RAISE(ABORT,'EXTRACTION_LIMIT') WHERE NOT EXISTS(
    SELECT 1 FROM hosted_import_budget b,trial_policy p WHERE b.month=substr(NEW.created_at,1,7) AND p.id=1 AND b.paused=0 AND
      b.baseline_cents+5+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=b.month)
        <=min(b.ceiling_cents,p.budget_ceiling_cents));
END;
DROP TRIGGER draft_extract_reserve;
CREATE TRIGGER draft_extract_reserve AFTER INSERT ON draft_extract_calls
BEGIN
  UPDATE hosted_import_budget SET baseline_cents=baseline_cents+5 WHERE month=substr(NEW.created_at,1,7);
  INSERT INTO draft_extraction_usage(agency_id,day,attempts) VALUES(NEW.agency_id,substr(NEW.created_at,1,10),1)
    ON CONFLICT(agency_id,day) DO UPDATE SET attempts=attempts+1;
END;
