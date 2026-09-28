-- Imports avant génération : aucun job, réservation ou crédit artificiel.
CREATE TABLE listing_imports (
  id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL REFERENCES agencies(id),
  idempotency_key TEXT NOT NULL,
  source_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('importing','ready','failed','deleting')),
  error_code TEXT,
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  diagnostics_json TEXT CHECK(diagnostics_json IS NULL OR json_valid(diagnostics_json)),
  created_at TEXT NOT NULL, lease_until TEXT NOT NULL, expires_at TEXT NOT NULL,
  UNIQUE(agency_id,id), UNIQUE(agency_id,idempotency_key),
  CHECK(status != 'ready' OR result_json IS NOT NULL),
  CHECK(status != 'failed' OR error_code IS NOT NULL)
);
CREATE UNIQUE INDEX imports_one_active ON listing_imports(agency_id) WHERE status='importing';
CREATE INDEX imports_expiry ON listing_imports(status,expires_at,lease_until);
CREATE TABLE import_usage (day TEXT PRIMARY KEY NOT NULL, attempts INTEGER NOT NULL CHECK(attempts>0));
CREATE TRIGGER import_budget BEFORE INSERT ON listing_imports
WHEN NOT EXISTS(SELECT 1 FROM listing_imports WHERE agency_id=NEW.agency_id AND idempotency_key=NEW.idempotency_key)
BEGIN
  SELECT RAISE(ABORT,'IMPORT_LIMIT') WHERE coalesce((SELECT attempts FROM import_usage WHERE day=substr(NEW.created_at,1,10)),0)>=5
    OR coalesce((SELECT sum(attempts) FROM import_usage WHERE substr(day,1,7)=substr(NEW.created_at,1,7)),0)>=30;
  INSERT INTO import_usage(day,attempts) VALUES(substr(NEW.created_at,1,10),1)
    ON CONFLICT(day) DO UPDATE SET attempts=attempts+1;
END;

-- Journal écrit AVANT R2 : même un put interrompu laisse une clé à purger.
CREATE TABLE import_objects (
  id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL,
  import_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  photo_json TEXT NOT NULL CHECK(json_valid(photo_json)),
  FOREIGN KEY(agency_id,import_id) REFERENCES listing_imports(agency_id,id) ON DELETE CASCADE,
  CHECK(substr(object_key,1,length('agencies/' || agency_id || '/imports/' || import_id || '/')) = 'agencies/' || agency_id || '/imports/' || import_id || '/')
);
CREATE INDEX import_objects_parent ON import_objects(agency_id,import_id);
CREATE TRIGGER import_object_immutable BEFORE UPDATE ON import_objects
BEGIN SELECT RAISE(ABORT,'IMPORT_OBJECT_IMMUTABLE'); END;

-- Publication atomique avec les métadonnées. Une écriture tardive ne réactive pas un import purgé.
CREATE TRIGGER import_publish AFTER UPDATE OF status ON listing_imports
WHEN OLD.status='importing' AND NEW.status='ready'
BEGIN
  SELECT RAISE(ABORT,'IMPORT_PHOTOS_MISSING') WHERE
    (SELECT count(*) FROM import_objects WHERE agency_id=NEW.agency_id AND import_id=NEW.id) < 3;
  INSERT INTO listings(id,agency_id,source_url,canonical_url,source_host,source_listing_id,fetched_at,adapter_version,transaction_kind,facts_json)
  VALUES(NEW.id,NEW.agency_id,NEW.source_url,json_extract(NEW.result_json,'$.canonicalUrl'),json_extract(NEW.result_json,'$.sourceHost'),
    json_extract(NEW.result_json,'$.sourceListingId'),json_extract(NEW.result_json,'$.fetchedAt'),json_extract(NEW.result_json,'$.adapterVersion'),
    json_extract(NEW.result_json,'$.transaction'),json_extract(NEW.result_json,'$.facts'));
END;
CREATE TRIGGER import_state_transition BEFORE UPDATE OF status ON listing_imports
WHEN NOT ((OLD.status='importing' AND NEW.status IN ('ready','failed','deleting')) OR
  (OLD.status IN ('ready','failed') AND NEW.status='deleting') OR OLD.status=NEW.status)
BEGIN SELECT RAISE(ABORT,'IMPORT_STATE_CONFLICT'); END;
CREATE TRIGGER import_active_object BEFORE INSERT ON import_objects
WHEN NOT EXISTS(SELECT 1 FROM listing_imports WHERE id=NEW.import_id AND agency_id=NEW.agency_id AND status='importing')
BEGIN SELECT RAISE(ABORT,'IMPORT_NOT_ACTIVE'); END;

-- Un job référencé, même terminé, protège l'import jusqu'à une politique de purge des jobs.
CREATE TRIGGER import_preserve_jobs BEFORE UPDATE OF status ON listing_imports
WHEN NEW.status='deleting' AND EXISTS(SELECT 1 FROM jobs WHERE agency_id=OLD.agency_id AND listing_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'IMPORT_IN_USE'); END;
CREATE TRIGGER job_import_ready_insert BEFORE INSERT ON jobs
WHEN EXISTS(SELECT 1 FROM listing_imports WHERE agency_id=NEW.agency_id AND id=NEW.listing_id AND status!='ready')
BEGIN SELECT RAISE(ABORT,'IMPORT_NOT_READY'); END;
CREATE TRIGGER job_import_ready_update BEFORE UPDATE OF listing_id ON jobs
WHEN EXISTS(SELECT 1 FROM listing_imports WHERE agency_id=NEW.agency_id AND id=NEW.listing_id AND status!='ready')
BEGIN SELECT RAISE(ABORT,'IMPORT_NOT_READY'); END;
CREATE TRIGGER import_delete_listing BEFORE DELETE ON listing_imports
BEGIN
  SELECT RAISE(ABORT,'IMPORT_NOT_DELETING') WHERE OLD.status!='deleting';
  DELETE FROM listings WHERE agency_id=OLD.agency_id AND id=OLD.id;
END;
