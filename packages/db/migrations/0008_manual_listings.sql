-- Compatibilité des anciennes colonnes NOT NULL : chaîne vide en SQL pour une
-- saisie sans source web, null dans le contrat/API. Aucune URL fictive créée.
ALTER TABLE listing_imports ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'url' CHECK(source_kind IN ('url','manual'));
ALTER TABLE listing_imports ADD COLUMN input_json TEXT CHECK(input_json IS NULL OR json_valid(input_json));
ALTER TABLE listing_imports ADD COLUMN input_hash TEXT;
ALTER TABLE listings ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'url' CHECK(source_kind IN ('url','manual'));

-- Un import réseau actif ; les uploads manuels sont bornés par leurs manifestes,
-- le plafond de 30 dossiers/agence et les compteurs existants (tous modes).
DROP INDEX imports_one_active;
CREATE UNIQUE INDEX imports_one_active ON listing_imports(agency_id) WHERE status='importing' AND source_kind='url';
CREATE UNIQUE INDEX manual_photo_slot ON import_objects(agency_id,import_id,json_extract(photo_json,'$.sourceOrder'));
CREATE TRIGGER import_source_insert BEFORE INSERT ON listing_imports
WHEN (NEW.source_kind='manual' AND (NEW.source_url!='' OR NEW.input_json IS NULL OR NEW.input_hash IS NULL OR length(NEW.input_hash)!=64))
  OR (NEW.source_kind='url' AND (NEW.source_url='' OR NEW.input_json IS NOT NULL OR NEW.input_hash IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'IMPORT_SOURCE_INVALID'); END;
CREATE TRIGGER import_source_immutable BEFORE UPDATE OF source_kind,source_url,input_json,input_hash ON listing_imports
BEGIN SELECT RAISE(ABORT,'IMPORT_SOURCE_IMMUTABLE'); END;

DROP TRIGGER import_publish;
CREATE TRIGGER import_publish AFTER UPDATE OF status ON listing_imports
WHEN OLD.status='importing' AND NEW.status='ready'
BEGIN
  SELECT RAISE(ABORT,'IMPORT_PHOTOS_MISSING') WHERE
    (SELECT count(*) FROM import_objects WHERE agency_id=NEW.agency_id AND import_id=NEW.id) < 3;
  SELECT RAISE(ABORT,'IMPORT_SOURCE_INVALID') WHERE coalesce(json_extract(NEW.result_json,'$.sourceKind'),'url')!=NEW.source_kind
    OR (NEW.source_kind='manual' AND (SELECT count(*) FROM import_objects WHERE agency_id=NEW.agency_id AND import_id=NEW.id)!=json_array_length(NEW.input_json,'$.photos'));
  INSERT INTO listings(id,agency_id,source_kind,source_url,canonical_url,source_host,source_listing_id,fetched_at,adapter_version,transaction_kind,facts_json,description_json)
  VALUES(NEW.id,NEW.agency_id,NEW.source_kind,NEW.source_url,coalesce(json_extract(NEW.result_json,'$.canonicalUrl'),''),coalesce(json_extract(NEW.result_json,'$.sourceHost'),''),
    json_extract(NEW.result_json,'$.sourceListingId'),json_extract(NEW.result_json,'$.fetchedAt'),json_extract(NEW.result_json,'$.adapterVersion'),
    json_extract(NEW.result_json,'$.transaction'),json_extract(NEW.result_json,'$.facts'),json_extract(NEW.result_json,'$.description'));
END;
