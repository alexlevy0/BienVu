-- Ville facultative de l’agence. Les marques et vidéos déjà enregistrées restent inchangées.
ALTER TABLE agencies ADD COLUMN city TEXT CHECK(city IS NULL OR length(trim(city)) BETWEEN 1 AND 100);
