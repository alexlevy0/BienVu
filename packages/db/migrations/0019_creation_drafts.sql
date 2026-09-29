-- A partial import remains the same private import. Its browser and transport have
-- already stopped; the user may complete it without a second network import.
ALTER TABLE listing_imports ADD COLUMN draft_pending INTEGER NOT NULL DEFAULT 0 CHECK(draft_pending IN (0,1));
DROP INDEX imports_one_active;
CREATE UNIQUE INDEX imports_one_active ON listing_imports(agency_id)
  WHERE status='importing' AND source_kind='url' AND draft_pending=0;

CREATE TABLE creation_drafts (
  id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  state TEXT NOT NULL DEFAULT 'needs_input' CHECK(state IN ('needs_input','ready')),
  data_json TEXT NOT NULL CHECK(json_valid(data_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(agency_id,id) REFERENCES listing_imports(agency_id,id) ON DELETE CASCADE
);
CREATE INDEX creation_drafts_owner ON creation_drafts(agency_id,updated_at);
CREATE TABLE creation_upload_cancellations (
  id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL,
  import_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(agency_id,import_id) REFERENCES listing_imports(agency_id,id) ON DELETE CASCADE
);
CREATE TABLE draft_extract_calls (
  id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL,
  import_id TEXT NOT NULL,
  text_hash TEXT NOT NULL CHECK(length(text_hash)=64),
  status TEXT NOT NULL CHECK(status IN ('pending','ready','failed')),
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  created_at TEXT NOT NULL,
  UNIQUE(agency_id,import_id,text_hash),
  FOREIGN KEY(agency_id,import_id) REFERENCES listing_imports(agency_id,id) ON DELETE CASCADE
);
CREATE TRIGGER draft_extract_budget BEFORE INSERT ON draft_extract_calls
BEGIN
  SELECT RAISE(ABORT,'EXTRACTION_LIMIT') WHERE
    (SELECT count(*) FROM draft_extract_calls WHERE agency_id=NEW.agency_id AND substr(created_at,1,10)=substr(NEW.created_at,1,10))>=5
    OR (SELECT count(*) FROM draft_extract_calls WHERE substr(created_at,1,7)=substr(NEW.created_at,1,7))>=100;
  SELECT RAISE(ABORT,'EXTRACTION_LIMIT') WHERE NOT EXISTS(
    SELECT 1 FROM hosted_import_budget b,trial_policy p WHERE b.month=substr(NEW.created_at,1,7) AND p.id=1 AND b.paused=0 AND
      b.baseline_cents+5+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=b.month)
        <=min(b.ceiling_cents,p.budget_ceiling_cents));
END;
CREATE TRIGGER draft_extract_reserve AFTER INSERT ON draft_extract_calls
BEGIN
  UPDATE hosted_import_budget SET baseline_cents=baseline_cents+5 WHERE month=substr(NEW.created_at,1,7);
END;
CREATE TABLE guest_extract_calls (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES anonymous_sessions(id) ON DELETE CASCADE,
  ip_hmac TEXT NOT NULL CHECK(length(ip_hmac)=64),
  idempotency_key TEXT NOT NULL,
  text_hash TEXT NOT NULL CHECK(length(text_hash)=64),
  status TEXT NOT NULL CHECK(status IN ('pending','ready','failed')),
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  created_at TEXT NOT NULL,
  UNIQUE(session_id,idempotency_key)
);
CREATE INDEX guest_extract_ip_day ON guest_extract_calls(ip_hmac,created_at);
CREATE TRIGGER guest_extract_budget BEFORE INSERT ON guest_extract_calls
BEGIN
  SELECT RAISE(ABORT,'EXTRACTION_LIMIT') WHERE
    (SELECT count(*) FROM guest_extract_calls WHERE session_id=NEW.session_id AND substr(created_at,1,10)=substr(NEW.created_at,1,10))>=2
    OR (SELECT count(*) FROM guest_extract_calls WHERE ip_hmac=NEW.ip_hmac AND substr(created_at,1,10)=substr(NEW.created_at,1,10))>=4
    OR (SELECT count(*) FROM guest_extract_calls WHERE substr(created_at,1,7)=substr(NEW.created_at,1,7))>=50;
  SELECT RAISE(ABORT,'EXTRACTION_LIMIT') WHERE NOT EXISTS(
    SELECT 1 FROM hosted_import_budget b,trial_policy p WHERE b.month=substr(NEW.created_at,1,7) AND p.id=1 AND b.paused=0 AND
      b.baseline_cents+5+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=b.month)
        <=min(b.ceiling_cents,p.budget_ceiling_cents));
END;
CREATE TRIGGER guest_extract_reserve AFTER INSERT ON guest_extract_calls
BEGIN
  UPDATE hosted_import_budget SET baseline_cents=baseline_cents+5 WHERE month=substr(NEW.created_at,1,7);
END;
CREATE TRIGGER creation_draft_insert BEFORE INSERT ON creation_drafts
WHEN NOT EXISTS(SELECT 1 FROM listing_imports WHERE id=NEW.id AND agency_id=NEW.agency_id AND status='importing')
BEGIN SELECT RAISE(ABORT,'IMPORT_NOT_ACTIVE'); END;
CREATE TRIGGER creation_draft_mark AFTER INSERT ON creation_drafts
BEGIN
  UPDATE listing_imports SET draft_pending=1,lease_until=expires_at WHERE id=NEW.id AND agency_id=NEW.agency_id;
END;
CREATE TRIGGER creation_draft_photo_budget BEFORE INSERT ON import_objects
WHEN EXISTS(SELECT 1 FROM creation_drafts WHERE id=NEW.import_id AND agency_id=NEW.agency_id AND state='needs_input')
BEGIN
  SELECT RAISE(ABORT,'IMPORT_PHOTO_LIMIT') WHERE
    (SELECT count(*) FROM import_objects WHERE import_id=NEW.import_id AND agency_id=NEW.agency_id)>=12 OR
    (SELECT coalesce(sum(json_extract(photo_json,'$.sizeBytes')),0) FROM import_objects WHERE import_id=NEW.import_id AND agency_id=NEW.agency_id)
      +json_extract(NEW.photo_json,'$.sizeBytes')>52428800;
  SELECT RAISE(ABORT,'IMPORT_UPLOAD_CANCELLED') WHERE EXISTS
    (SELECT 1 FROM creation_upload_cancellations WHERE id=NEW.id AND import_id=NEW.import_id AND agency_id=NEW.agency_id);
END;

-- The ready transition is still performed by the existing publication trigger;
-- no new listing or video ledger is introduced.
CREATE TRIGGER creation_draft_ready AFTER UPDATE OF status ON listing_imports
WHEN NEW.status='ready' AND OLD.status='importing' AND OLD.draft_pending=1
BEGIN
  UPDATE creation_drafts SET state='ready',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.id AND agency_id=NEW.agency_id;
END;

DROP TRIGGER import_publish;
CREATE TRIGGER import_publish AFTER UPDATE OF status ON listing_imports
WHEN OLD.status='importing' AND NEW.status='ready'
BEGIN
  SELECT RAISE(ABORT,'IMPORT_PHOTOS_MISSING') WHERE
    (SELECT count(*) FROM import_objects WHERE agency_id=NEW.agency_id AND import_id=NEW.id)<3;
  SELECT RAISE(ABORT,'IMPORT_SOURCE_INVALID') WHERE coalesce(json_extract(NEW.result_json,'$.sourceKind'),'url')!=NEW.source_kind
    OR (NEW.source_kind='manual' AND NEW.draft_pending=0 AND
      (SELECT count(*) FROM import_objects WHERE agency_id=NEW.agency_id AND import_id=NEW.id)!=json_array_length(NEW.input_json,'$.photos'))
    OR (NEW.draft_pending=1 AND
      (SELECT count(*) FROM import_objects WHERE agency_id=NEW.agency_id AND import_id=NEW.id)!=json_array_length(NEW.result_json,'$.photos'));
  INSERT INTO listings(id,agency_id,source_kind,source_url,canonical_url,source_host,source_listing_id,fetched_at,adapter_version,transaction_kind,facts_json,description_json)
  VALUES(NEW.id,NEW.agency_id,NEW.source_kind,NEW.source_url,coalesce(json_extract(NEW.result_json,'$.canonicalUrl'),''),coalesce(json_extract(NEW.result_json,'$.sourceHost'),''),
    json_extract(NEW.result_json,'$.sourceListingId'),json_extract(NEW.result_json,'$.fetchedAt'),json_extract(NEW.result_json,'$.adapterVersion'),
    json_extract(NEW.result_json,'$.transaction'),json_extract(NEW.result_json,'$.facts'),json_extract(NEW.result_json,'$.description'));
END;

CREATE TABLE generation_reports (
  id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  author_key TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('photos','voice','facts','technical','other')),
  comment TEXT NOT NULL CHECK(length(comment) BETWEEN 1 AND 1000),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','reviewing','closed')),
  created_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  input_hash TEXT NOT NULL CHECK(length(input_hash)=64),
  UNIQUE(job_id,author_key,idempotency_key)
);
CREATE INDEX generation_reports_queue ON generation_reports(status,created_at);
CREATE TRIGGER generation_report_limit BEFORE INSERT ON generation_reports
BEGIN
  SELECT RAISE(ABORT,'REPORT_LIMIT') WHERE
    (SELECT count(*) FROM generation_reports WHERE job_id=NEW.job_id AND author_key=NEW.author_key)>=3 OR
    (SELECT count(*) FROM generation_reports WHERE author_key=NEW.author_key AND substr(created_at,1,10)=substr(NEW.created_at,1,10))>=5;
END;
