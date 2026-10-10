-- Optional preparation checkpoints do not change job states, inputs or billing.
CREATE TABLE generation_preparation_steps (
  job_id TEXT NOT NULL,
  agency_id TEXT NOT NULL,
  step TEXT NOT NULL CHECK(step IN ('map','avatar','animations')),
  state TEXT NOT NULL CHECK(state IN ('working','ready','skipped')),
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(job_id,step),
  FOREIGN KEY(job_id) REFERENCES generation_runs(job_id),
  FOREIGN KEY(agency_id,job_id) REFERENCES jobs(agency_id,id)
);
