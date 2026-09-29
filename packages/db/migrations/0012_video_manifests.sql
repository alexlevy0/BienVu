-- Le droit de sortie, la marque et la timeline sont figés avant tout rendu.
CREATE TABLE video_manifests (
  job_id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL,
  job_attempt INTEGER NOT NULL CHECK(job_attempt BETWEEN 1 AND 2),
  manifest_hash TEXT NOT NULL UNIQUE CHECK(length(manifest_hash)=64),
  manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json) AND length(manifest_json)<=64000),
  sources_json TEXT NOT NULL CHECK(json_valid(sources_json) AND length(sources_json)<=32000),
  state TEXT NOT NULL CHECK(state IN ('preparing','prepared')),
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  FOREIGN KEY(agency_id,job_id) REFERENCES jobs(agency_id,id)
);
CREATE TRIGGER video_manifest_immutable BEFORE UPDATE OF job_id,agency_id,job_attempt,manifest_hash,manifest_json,sources_json ON video_manifests
BEGIN
  SELECT RAISE(ABORT,'VIDEO_MANIFEST_IMMUTABLE');
END;
