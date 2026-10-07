-- A verified browser can upload only its own bounded manual manifest. Creating
-- the permit and import in one statement prevents concurrent quota bypasses.
CREATE TABLE anonymous_manual_imports (
-- Keep a quota tombstone when the expired import is purged. Otherwise
-- deleting abandoned uploads would replenish the daily anonymous quota.
  import_id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL REFERENCES anonymous_sessions(id),
  idempotency_key TEXT NOT NULL,
  input_json TEXT NOT NULL CHECK(json_valid(input_json)),
  input_hash TEXT NOT NULL CHECK(length(input_hash)=64),
  ip_hmac TEXT CHECK(ip_hmac IS NULL OR length(ip_hmac)=64),
  turnstile_hash TEXT UNIQUE CHECK(turnstile_hash IS NULL OR length(turnstile_hash)=64),
  created_at TEXT NOT NULL,
  verified_until TEXT NOT NULL,
  UNIQUE(session_id,idempotency_key)
);
CREATE INDEX anonymous_manual_ip ON anonymous_manual_imports(ip_hmac,created_at);
CREATE TRIGGER anonymous_manual_admit BEFORE INSERT ON anonymous_manual_imports
WHEN NOT EXISTS(SELECT 1 FROM anonymous_manual_imports WHERE session_id=NEW.session_id AND idempotency_key=NEW.idempotency_key)
BEGIN
  SELECT RAISE(ABORT,'ANONYMOUS_UNAVAILABLE') WHERE NOT EXISTS(
    SELECT 1 FROM anonymous_sessions s,trial_policy p WHERE s.id=NEW.session_id AND s.expires_at>NEW.created_at
    AND s.proof_hash IS NOT NULL AND p.enabled=1 AND NEW.turnstile_hash IS NOT NULL AND NEW.ip_hmac IS NOT NULL);
  SELECT RAISE(ABORT,'GENERATIONS_PAUSED') WHERE NOT EXISTS(SELECT 1 FROM generation_control WHERE enabled=1);
  SELECT RAISE(ABORT,'TRIAL_USED') WHERE NOT EXISTS(
    SELECT 1 FROM anonymous_sessions s,trial_policy p WHERE s.id=NEW.session_id
    AND s.successes<p.successes AND s.credits_reserved+s.credits_consumed<s.credits_granted);
  SELECT RAISE(ABORT,'TRIAL_LIMIT') WHERE EXISTS(SELECT 1 FROM trial_policy p WHERE
    (SELECT count(*) FROM anonymous_manual_imports WHERE session_id=NEW.session_id AND julianday(created_at)>julianday(NEW.created_at)-1)>=p.session_daily
    OR (SELECT count(*) FROM anonymous_manual_imports WHERE ip_hmac=NEW.ip_hmac AND julianday(created_at)>julianday(NEW.created_at)-1)>=p.ip_daily
    OR (SELECT count(*) FROM anonymous_manual_imports WHERE substr(created_at,1,10)=substr(NEW.created_at,1,10))>=p.global_daily
    OR (SELECT count(*) FROM anonymous_manual_imports WHERE substr(created_at,1,7)=substr(NEW.created_at,1,7))>=p.global_monthly);
  SELECT RAISE(ABORT,'GENERATION_BUSY') WHERE EXISTS(SELECT 1 FROM jobs WHERE status NOT IN ('ready','failed'));
  SELECT RAISE(ABORT,'IMPORT_BUDGET_LIMIT') WHERE NOT EXISTS(SELECT 1 FROM hosted_import_budget b WHERE
    b.month=substr(NEW.created_at,1,7) AND b.paused=0 AND b.baseline_cents+50+
    (SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=b.month)<=b.ceiling_cents);
  SELECT RAISE(ABORT,'BOT_VERIFICATION_FAILED') WHERE EXISTS(SELECT 1 FROM generation_runs WHERE turnstile_hash=NEW.turnstile_hash);
END;
CREATE TRIGGER anonymous_manual_create AFTER INSERT ON anonymous_manual_imports
BEGIN
  INSERT INTO listing_imports(id,agency_id,idempotency_key,source_url,source_kind,input_json,input_hash,status,created_at,lease_until,expires_at)
    SELECT NEW.import_id,s.scope_id,NEW.idempotency_key,'','manual',NEW.input_json,NEW.input_hash,'importing',NEW.created_at,NEW.verified_until,
      strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at,'+1 day') FROM anonymous_sessions s WHERE s.id=NEW.session_id;
END;
-- A guessed listing ID or a signed-in customer's import can never be admitted
-- as an anonymous video, including direct database callers.
CREATE TRIGGER anonymous_manual_generation BEFORE INSERT ON generation_runs
WHEN NEW.anonymous_session_id IS NOT NULL AND json_extract(NEW.input_json,'$.listingId') IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'NOT_FOUND') WHERE NOT EXISTS(
    SELECT 1 FROM listing_imports i JOIN anonymous_manual_imports m ON m.import_id=i.id
    WHERE i.id=json_extract(NEW.input_json,'$.listingId') AND i.agency_id=NEW.agency_id AND m.session_id=NEW.anonymous_session_id
    AND i.source_kind='manual' AND i.status='ready' AND i.expires_at>NEW.created_at);
END;
