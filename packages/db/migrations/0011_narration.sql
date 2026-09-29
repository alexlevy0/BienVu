-- Étapes texte/voix privées. Lancement des jobs et quotas client restent au sprint 07/08.
CREATE TABLE narration_budget (
  month TEXT PRIMARY KEY NOT NULL,
  envelope_cents INTEGER NOT NULL CHECK(envelope_cents BETWEEN 0 AND 2500),
  paused INTEGER NOT NULL DEFAULT 1 CHECK(paused IN (0,1))
);
-- Aucun mois ni budget réel activé par la migration.
CREATE TABLE narration_runs (
  job_id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL,
  input_hash TEXT NOT NULL CHECK(length(input_hash)=64),
  config_hash TEXT NOT NULL CHECK(length(config_hash)=64),
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json) AND length(snapshot_json)<=128000),
  provider_mode TEXT NOT NULL CHECK(provider_mode IN ('real','mock')),
  state TEXT NOT NULL DEFAULT 'working' CHECK(state IN ('working','prepared','failed')),
  script_json TEXT CHECK(script_json IS NULL OR (json_valid(script_json) AND length(script_json)<=32000)),
  result_json TEXT CHECK(result_json IS NULL OR (json_valid(result_json) AND length(result_json)<=128000)),
  error_code TEXT,
  lock_id TEXT, lock_until TEXT,
  job_attempt INTEGER NOT NULL CHECK(job_attempt BETWEEN 1 AND 2),
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  UNIQUE(agency_id,job_id),
  FOREIGN KEY(agency_id,job_id) REFERENCES jobs(agency_id,id)
);
CREATE TABLE narration_calls (
  id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL, job_id TEXT NOT NULL, step_key TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
  provider TEXT NOT NULL CHECK(provider IN ('openai','google')),
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
CREATE INDEX narration_calls_month ON narration_calls(month,provider_mode);
-- Garder ces deux limites explicites : la variante CASE ... END est refusée
-- comme « incomplete input » par la migration D1 distante (Wrangler 4.142).
CREATE TRIGGER narration_call_limits BEFORE INSERT ON narration_calls
BEGIN
  SELECT RAISE(ABORT,'NARRATION_BUDGET_LIMIT') WHERE NEW.provider='openai' AND
    (SELECT count(*) FROM narration_calls WHERE agency_id=NEW.agency_id AND job_id=NEW.job_id AND provider=NEW.provider)>=2;
  SELECT RAISE(ABORT,'NARRATION_BUDGET_LIMIT') WHERE NEW.provider='google' AND
    (SELECT count(*) FROM narration_calls WHERE agency_id=NEW.agency_id AND job_id=NEW.job_id AND provider=NEW.provider)>=12;
  SELECT RAISE(ABORT,'NARRATION_BUDGET_LIMIT') WHERE NEW.provider_mode='real' AND NOT EXISTS(
    SELECT 1 FROM narration_budget WHERE month=NEW.month AND paused=0 AND envelope_cents>=NEW.reservation_cents+
      (SELECT coalesce(sum(reservation_cents),0) FROM narration_calls WHERE month=NEW.month AND provider_mode='real'));
  SELECT RAISE(ABORT,'NARRATION_CONFLICT') WHERE NOT EXISTS(
    SELECT 1 FROM narration_runs WHERE agency_id=NEW.agency_id AND job_id=NEW.job_id AND provider_mode=NEW.provider_mode);
END;
