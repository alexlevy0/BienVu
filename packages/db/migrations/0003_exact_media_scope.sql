-- LIKE traite '_' comme un joker. Comparaison exacte des préfixes d'agence,
-- y compris pour une base locale ayant déjà appliqué 0002.
CREATE TRIGGER media_exact_scope_insert BEFORE INSERT ON media_assets
WHEN substr(NEW.object_key, 1, length('agencies/' || NEW.agency_id || '/')) != 'agencies/' || NEW.agency_id || '/'
BEGIN
  SELECT RAISE(ABORT, 'MEDIA_AGENCY_MISMATCH');
END;
CREATE TRIGGER media_exact_scope_update BEFORE UPDATE OF object_key, agency_id ON media_assets
WHEN substr(NEW.object_key, 1, length('agencies/' || NEW.agency_id || '/')) != 'agencies/' || NEW.agency_id || '/'
BEGIN
  SELECT RAISE(ABORT, 'MEDIA_AGENCY_MISMATCH');
END;
