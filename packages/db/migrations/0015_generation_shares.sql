-- Une publication explicite, révocable, par vidéo. Aucun job existant n'est partagé.
CREATE TABLE generation_shares (
  id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  published_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY(agency_id, job_id) REFERENCES jobs(agency_id, id)
);
CREATE UNIQUE INDEX generation_shares_one_active ON generation_shares(job_id) WHERE revoked_at IS NULL;
CREATE INDEX generation_shares_public ON generation_shares(published_at DESC, id DESC) WHERE revoked_at IS NULL;
CREATE INDEX generation_shares_owner ON generation_shares(agency_id, job_id) WHERE revoked_at IS NULL;
