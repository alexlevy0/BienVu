-- This is BienVu's operational ceiling, not a representation of Cartesia's
-- plan or live balance. Keep the atomic reservation and concurrency guard.
DROP TRIGGER cartesia_free_limits;
CREATE TRIGGER cartesia_usage_limit BEFORE INSERT ON cartesia_usage BEGIN
 SELECT RAISE(ABORT,'VOICE_FREE_LIMIT') WHERE (SELECT coalesce(sum(characters),0) FROM cartesia_usage WHERE julianday(created_at)>julianday(NEW.created_at)-31)+NEW.characters>100000;
 SELECT RAISE(ABORT,'VOICE_BUSY') WHERE (SELECT count(*) FROM cartesia_usage WHERE state='pending' AND lease_until>NEW.created_at)>=2;
END;
