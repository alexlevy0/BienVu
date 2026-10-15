-- Imported galleries are larger than the 3..12-photo video selection.
-- Ordinary manual uploads retain their cap; source copies preserve the full
-- bounded gallery and the existing 50 MiB/storage and cancellation guards.
DROP TRIGGER creation_draft_photo_budget;
CREATE TRIGGER creation_draft_photo_budget BEFORE INSERT ON import_objects
WHEN EXISTS(SELECT 1 FROM creation_drafts WHERE id=NEW.import_id AND agency_id=NEW.agency_id AND state='needs_input')
BEGIN
  SELECT RAISE(ABORT,'IMPORT_PHOTO_LIMIT') WHERE
    (SELECT count(*) FROM import_objects WHERE import_id=NEW.import_id AND agency_id=NEW.agency_id)>=
      CASE WHEN (SELECT json_extract(data_json,'$.canonicalUrl') FROM creation_drafts WHERE id=NEW.import_id AND agency_id=NEW.agency_id) IS NOT NULL THEN 40 ELSE 12 END OR
    (SELECT coalesce(sum(json_extract(photo_json,'$.sizeBytes')),0) FROM import_objects WHERE import_id=NEW.import_id AND agency_id=NEW.agency_id)
      +json_extract(NEW.photo_json,'$.sizeBytes')>52428800;
  SELECT RAISE(ABORT,'IMPORT_UPLOAD_CANCELLED') WHERE EXISTS
    (SELECT 1 FROM creation_upload_cancellations WHERE id=NEW.id AND import_id=NEW.import_id AND agency_id=NEW.agency_id);
END;
