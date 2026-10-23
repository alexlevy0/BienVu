-- A separate cursor preserves job/business timestamps and launch/billing journals.
-- Stamp before attempting a row, so errors and interrupted checks rotate too.
CREATE TABLE IF NOT EXISTS generation_reconciliation_attempts (
  job_id TEXT PRIMARY KEY NOT NULL REFERENCES generation_runs(job_id) ON DELETE CASCADE,
  last_attempt_at TEXT NOT NULL
);
