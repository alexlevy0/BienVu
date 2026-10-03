CREATE TABLE editor_exports (
 agency_id TEXT NOT NULL REFERENCES agencies(id), import_id TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0),
 job_id TEXT NOT NULL REFERENCES generation_runs(job_id), created_at TEXT NOT NULL,
 PRIMARY KEY(agency_id,import_id,version), FOREIGN KEY(agency_id,import_id) REFERENCES listing_imports(agency_id,id)
);
