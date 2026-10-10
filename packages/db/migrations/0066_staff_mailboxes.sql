-- Existing support mail remains in contact; no message or attachment is rewritten.
ALTER TABLE mailbox_threads ADD COLUMN mailbox_address TEXT NOT NULL DEFAULT 'contact@bienvu.online' COLLATE NOCASE;
ALTER TABLE mailbox_uploads ADD COLUMN mailbox_address TEXT NOT NULL DEFAULT 'contact@bienvu.online' COLLATE NOCASE;
CREATE INDEX mailbox_threads_scope ON mailbox_threads(mailbox_address,folder,last_at DESC,id DESC);
CREATE INDEX mailbox_threads_scope_peer ON mailbox_threads(mailbox_address,peer_email,subject_key,last_at DESC);
CREATE TRIGGER mailbox_message_scope BEFORE INSERT ON mailbox_messages
BEGIN
  SELECT RAISE(ABORT,'MAIL_SCOPE_CONFLICT') WHERE NOT EXISTS(
    SELECT 1 FROM mailbox_threads t WHERE t.id=NEW.thread_id AND t.mailbox_address=
      CASE WHEN NEW.direction='in' THEN NEW.to_email ELSE NEW.from_email END COLLATE NOCASE);
  SELECT RAISE(ABORT,'MAIL_ATTACHMENTS_CONFLICT') WHERE NEW.direction='out' AND EXISTS(
    SELECT 1 FROM mailbox_uploads u JOIN json_each(NEW.attachments_json) a ON u.id=json_extract(a.value,'$.id')
    JOIN mailbox_threads t ON t.id=NEW.thread_id WHERE u.mailbox_address!=t.mailbox_address COLLATE NOCASE);
END;
