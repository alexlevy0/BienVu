-- Saved narration is owned by an import and survives expiration of its source job.
CREATE TABLE editor_voice_sources (
  id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL,
  import_id TEXT NOT NULL,
  source_json TEXT NOT NULL CHECK(json_valid(source_json)),
  created_at TEXT NOT NULL,
  UNIQUE(agency_id,import_id),
  FOREIGN KEY(agency_id,import_id) REFERENCES listing_imports(agency_id,id) ON DELETE CASCADE
);
