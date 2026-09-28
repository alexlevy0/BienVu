-- Description source en texte brut, distincte des faits vérifiés. Les anciennes
-- annonces gardent NULL ; aucune description inventée ou récupération implicite.
ALTER TABLE listings ADD COLUMN description_json TEXT
  CHECK(description_json IS NULL OR json_valid(description_json));

DROP TRIGGER import_publish;
CREATE TRIGGER import_publish AFTER UPDATE OF status ON listing_imports
WHEN OLD.status='importing' AND NEW.status='ready'
BEGIN
  SELECT RAISE(ABORT,'IMPORT_PHOTOS_MISSING') WHERE
    (SELECT count(*) FROM import_objects WHERE agency_id=NEW.agency_id AND import_id=NEW.id) < 3;
  INSERT INTO listings(id,agency_id,source_url,canonical_url,source_host,source_listing_id,fetched_at,adapter_version,transaction_kind,facts_json,description_json)
  VALUES(NEW.id,NEW.agency_id,NEW.source_url,json_extract(NEW.result_json,'$.canonicalUrl'),json_extract(NEW.result_json,'$.sourceHost'),
    json_extract(NEW.result_json,'$.sourceListingId'),json_extract(NEW.result_json,'$.fetchedAt'),json_extract(NEW.result_json,'$.adapterVersion'),
    json_extract(NEW.result_json,'$.transaction'),json_extract(NEW.result_json,'$.facts'),json_extract(NEW.result_json,'$.description'));
END;
