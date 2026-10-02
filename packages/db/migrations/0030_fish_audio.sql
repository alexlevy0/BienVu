-- Preserve existing call journals, reservations, cache keys and audio objects.
DROP TRIGGER narration_call_limits;
PRAGMA legacy_alter_table=ON;
ALTER TABLE narration_calls RENAME TO narration_calls_old;
CREATE TABLE narration_calls (
  id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL, job_id TEXT NOT NULL, step_key TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
  provider TEXT NOT NULL CHECK(provider IN ('openai','google','fish')),
  provider_mode TEXT NOT NULL CHECK(provider_mode IN ('real','mock')),
  month TEXT NOT NULL,
  reservation_cents INTEGER NOT NULL CHECK(reservation_cents IN (0,5)),
  state TEXT NOT NULL CHECK(state IN ('pending','done','failed')),
  result_json TEXT CHECK(result_json IS NULL OR (json_valid(result_json) AND length(result_json)<=128000)),
  object_key TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(agency_id,job_id,step_key),
  FOREIGN KEY(agency_id,job_id) REFERENCES narration_runs(agency_id,job_id),
  CHECK((provider_mode='mock' AND reservation_cents=0) OR (provider_mode='real' AND reservation_cents=5)),
  CHECK(object_key IS NULL OR substr(object_key,1,length('agencies/' || agency_id || '/jobs/' || job_id || '/audio/')) = 'agencies/' || agency_id || '/jobs/' || job_id || '/audio/')
);
INSERT INTO narration_calls SELECT * FROM narration_calls_old;
DROP TABLE narration_calls_old;
PRAGMA legacy_alter_table=OFF;
CREATE INDEX narration_calls_month ON narration_calls(month,provider_mode);
-- Garder ces deux limites explicites : la variante CASE ... END est refusée
-- comme « incomplete input » par la migration D1 distante (Wrangler 4.142).
CREATE TRIGGER narration_call_limits BEFORE INSERT ON narration_calls
BEGIN
  SELECT RAISE(ABORT,'NARRATION_BUDGET_LIMIT') WHERE NEW.provider='openai' AND
    (SELECT count(*) FROM narration_calls WHERE agency_id=NEW.agency_id AND job_id=NEW.job_id AND provider=NEW.provider)>=2;
  SELECT RAISE(ABORT,'NARRATION_BUDGET_LIMIT') WHERE NEW.provider IN ('google','fish') AND
    (SELECT count(*) FROM narration_calls WHERE agency_id=NEW.agency_id AND job_id=NEW.job_id AND provider IN ('google','fish'))>=12;
  SELECT RAISE(ABORT,'NARRATION_BUDGET_LIMIT') WHERE NEW.provider_mode='real' AND NOT EXISTS(
    SELECT 1 FROM narration_budget WHERE month=NEW.month AND paused=0 AND envelope_cents>=NEW.reservation_cents+
      (SELECT coalesce(sum(reservation_cents),0) FROM narration_calls WHERE month=NEW.month AND provider_mode='real'));
  SELECT RAISE(ABORT,'NARRATION_CONFLICT') WHERE NOT EXISTS(
    SELECT 1 FROM narration_runs WHERE agency_id=NEW.agency_id AND job_id=NEW.job_id AND provider_mode=NEW.provider_mode);
END;
