-- Public applications are private inbox messages, not approved partnerships.
CREATE TABLE partner_applications (
  id TEXT PRIMARY KEY NOT NULL,
  request_hash TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE REFERENCES mailbox_messages(id),
  ip_hash TEXT,
  email_hash TEXT,
  turnstile_hash TEXT UNIQUE,
  created_at TEXT NOT NULL
);
CREATE INDEX partner_applications_ip ON partner_applications(ip_hash,created_at);
CREATE INDEX partner_applications_email ON partner_applications(email_hash,created_at);
CREATE INDEX partner_applications_date ON partner_applications(created_at);
CREATE TABLE partner_application_attempts (
  ip_hash TEXT NOT NULL,
  hour TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 30),
  PRIMARY KEY(ip_hash,hour)
);
-- Runs inside the same D1 batch as the thread and message inserts. A rejection
-- rolls all three back, including the mailbox counters and event triggers.
CREATE TRIGGER partner_application_validate BEFORE INSERT ON partner_applications
BEGIN
  SELECT RAISE(ABORT,'PARTNER_CONFLICT') WHERE EXISTS(
    SELECT 1 FROM partner_applications WHERE id=NEW.id AND request_hash!=NEW.request_hash);
  SELECT RAISE(ABORT,'PARTNER_BOT_REUSED') WHERE EXISTS(
    SELECT 1 FROM partner_applications WHERE turnstile_hash=NEW.turnstile_hash AND id!=NEW.id);
  SELECT RAISE(ABORT,'PARTNER_RATE_LIMIT') WHERE NOT EXISTS(SELECT 1 FROM partner_applications WHERE id=NEW.id) AND (
    (SELECT count(*) FROM partner_applications WHERE ip_hash=NEW.ip_hash AND created_at>=strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at,'-1 hour'))>=3 OR
    (SELECT count(*) FROM partner_applications WHERE email_hash=NEW.email_hash AND created_at>=strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at,'-1 day'))>=3 OR
    (SELECT count(*) FROM partner_applications WHERE created_at>=strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at,'-1 day'))>=100
  );
END;
