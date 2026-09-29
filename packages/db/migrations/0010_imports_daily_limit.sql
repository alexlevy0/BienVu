-- Plafond d'essai porté à 10 imports/jour UTC à la demande d'Alex (28/09/2026).
-- Les compteurs existants, le plafond mensuel de 30 et le budget hébergé restent conservés.
DROP TRIGGER import_budget;
CREATE TRIGGER import_budget BEFORE INSERT ON listing_imports
WHEN NOT EXISTS(SELECT 1 FROM listing_imports WHERE agency_id=NEW.agency_id AND idempotency_key=NEW.idempotency_key)
BEGIN
  SELECT RAISE(ABORT,'IMPORT_LIMIT') WHERE coalesce((SELECT attempts FROM import_usage WHERE day=substr(NEW.created_at,1,10)),0)>=10
    OR coalesce((SELECT sum(attempts) FROM import_usage WHERE substr(day,1,7)=substr(NEW.created_at,1,7)),0)>=30;
  INSERT INTO import_usage(day,attempts) VALUES(substr(NEW.created_at,1,10),1)
    ON CONFLICT(day) DO UPDATE SET attempts=attempts+1;
END;
