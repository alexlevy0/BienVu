-- Private support mailbox. No mail bodies, addresses or attachment contents enter public APIs or logs.
CREATE TABLE mailbox_threads (
  id TEXT PRIMARY KEY NOT NULL,
  peer_email TEXT NOT NULL COLLATE NOCASE,
  peer_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  folder TEXT NOT NULL DEFAULT 'inbox' CHECK(folder IN ('inbox','archived','spam')),
  snippet TEXT NOT NULL DEFAULT '',
  unread INTEGER NOT NULL DEFAULT 0 CHECK(unread>=0),
  message_count INTEGER NOT NULL DEFAULT 0,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  last_direction TEXT NOT NULL DEFAULT 'in' CHECK(last_direction IN ('in','out')),
  last_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX mailbox_threads_folder ON mailbox_threads(folder,last_at DESC,id DESC);
CREATE INDEX mailbox_threads_peer ON mailbox_threads(peer_email,subject_key,last_at DESC);
CREATE TABLE mailbox_messages (
  id TEXT PRIMARY KEY NOT NULL,
  thread_id TEXT NOT NULL REFERENCES mailbox_threads(id),
  dedupe_key TEXT NOT NULL UNIQUE,
  direction TEXT NOT NULL CHECK(direction IN ('in','out')),
  from_email TEXT NOT NULL,
  from_name TEXT NOT NULL,
  to_email TEXT NOT NULL,
  reply_to TEXT,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  truncated INTEGER NOT NULL DEFAULT 0 CHECK(truncated IN (0,1)),
  raw_key TEXT,
  rfc_message_id TEXT,
  in_reply_to TEXT,
  references_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(references_json)),
  attachments_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(attachments_json)),
  is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0,1)),
  delivery TEXT NOT NULL CHECK(delivery IN ('received','queued','sending','sent','failed','uncertain')),
  provider_id TEXT,
  error_code TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  actor_id TEXT REFERENCES auth_user(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(direction!='in' OR delivery='received')
);
CREATE INDEX mailbox_messages_thread ON mailbox_messages(thread_id,created_at DESC,id DESC);
CREATE INDEX mailbox_messages_rfc ON mailbox_messages(rfc_message_id);
CREATE INDEX mailbox_messages_outbox ON mailbox_messages(delivery,created_at) WHERE direction='out';
CREATE TABLE mailbox_uploads (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 3145728),
  object_key TEXT NOT NULL UNIQUE,
  content_hash TEXT NOT NULL,
  message_id TEXT REFERENCES mailbox_messages(id),
  created_at TEXT NOT NULL
);
CREATE INDEX mailbox_uploads_cleanup ON mailbox_uploads(created_at) WHERE message_id IS NULL;
CREATE TABLE mailbox_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL REFERENCES mailbox_threads(id),
  message_id TEXT REFERENCES mailbox_messages(id),
  actor_id TEXT REFERENCES auth_user(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TRIGGER mailbox_outgoing_validate BEFORE INSERT ON mailbox_messages WHEN NEW.direction='out'
  AND NOT EXISTS(SELECT 1 FROM mailbox_messages WHERE dedupe_key=NEW.dedupe_key)
BEGIN
  SELECT RAISE(ABORT,'MAIL_RATE_LIMIT') WHERE
    (SELECT count(*) FROM mailbox_messages WHERE direction='out' AND created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 minute'))>=10 OR
    (SELECT count(*) FROM mailbox_messages WHERE direction='out' AND created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day'))>=100;
  SELECT RAISE(ABORT,'MAIL_ATTACHMENTS_CONFLICT') WHERE
    (SELECT count(*) FROM mailbox_uploads u JOIN json_each(NEW.attachments_json) a ON u.id=json_extract(a.value,'$.id')
      WHERE u.actor_id=NEW.actor_id AND u.message_id IS NULL AND u.name=json_extract(a.value,'$.name')
      AND u.mime=json_extract(a.value,'$.mime') AND u.size=json_extract(a.value,'$.size')
      AND u.object_key=json_extract(a.value,'$.objectKey'))!=json_array_length(NEW.attachments_json);
END;
CREATE TRIGGER mailbox_message_received AFTER INSERT ON mailbox_messages
BEGIN
  UPDATE mailbox_threads SET message_count=message_count+1,attachment_count=attachment_count+json_array_length(NEW.attachments_json),
    unread=unread+CASE WHEN NEW.direction='in' AND NEW.is_read=0 THEN 1 ELSE 0 END,
    folder=CASE WHEN NEW.direction='in' AND folder='archived' THEN 'inbox' ELSE folder END,
    snippet=CASE WHEN NEW.created_at>=last_at THEN substr(NEW.body_text,1,250) ELSE snippet END,
    last_direction=CASE WHEN NEW.created_at>=last_at THEN NEW.direction ELSE last_direction END,
    last_at=max(last_at,NEW.created_at) WHERE id=NEW.thread_id;
  UPDATE mailbox_uploads SET message_id=NEW.id WHERE NEW.direction='out'
    AND id IN (SELECT json_extract(value,'$.id') FROM json_each(NEW.attachments_json));
  INSERT INTO mailbox_events(thread_id,message_id,actor_id,action,created_at)
    VALUES(NEW.thread_id,NEW.id,NEW.actor_id,CASE WHEN NEW.direction='in' THEN 'received' ELSE 'queued' END,NEW.created_at);
END;
CREATE TRIGGER mailbox_read_changed AFTER UPDATE OF is_read ON mailbox_messages WHEN NEW.is_read!=OLD.is_read AND NEW.direction='in'
BEGIN UPDATE mailbox_threads SET unread=unread+OLD.is_read-NEW.is_read WHERE id=NEW.thread_id; END;
CREATE TRIGGER mailbox_delivery_changed AFTER UPDATE OF delivery ON mailbox_messages WHEN NEW.delivery!=OLD.delivery
BEGIN INSERT INTO mailbox_events(thread_id,message_id,actor_id,action,created_at)
  VALUES(NEW.thread_id,NEW.id,NEW.actor_id,NEW.delivery,NEW.updated_at); END;
