-- Automatic preparations stay out of the library until the user opens or creates the property.
ALTER TABLE listing_imports ADD COLUMN estimate_only INTEGER NOT NULL DEFAULT 0 CHECK(estimate_only IN (0,1));
CREATE TRIGGER generation_reveal_estimated_import AFTER INSERT ON generation_runs
WHEN NEW.anonymous_session_id IS NULL AND json_extract(NEW.input_json,'$.listingId') IS NOT NULL
BEGIN
 UPDATE listing_imports SET estimate_only=0,expires_at=max(expires_at,strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at,'+30 days'))
 WHERE id=json_extract(NEW.input_json,'$.listingId') AND agency_id=NEW.agency_id AND estimate_only=1;
END;
