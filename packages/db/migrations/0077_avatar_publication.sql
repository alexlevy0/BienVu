-- Discovery is curated separately from technical availability and frozen jobs.
CREATE TABLE avatar_publication(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL DEFAULT 1,
 publication_json TEXT NOT NULL CHECK(json_valid(publication_json)),updated_at TEXT NOT NULL);
-- A conservative starting selection. Later provider synchronizations never add
-- to this snapshot. The administrator can replace, rename, group and reorder it.
INSERT INTO avatar_publication(id,revision,publication_json,updated_at)
WITH candidates AS (
 SELECT id,look_json,row_number() OVER(ORDER BY
  (id=(SELECT json_extract(settings_json,'$.defaultLookId') FROM avatar_settings WHERE id=1)) DESC,
  (lower(json_extract(look_json,'$.name')) LIKE '%blazer%' OR lower(json_extract(look_json,'$.name')) LIKE '%office%'
   OR lower(json_extract(look_json,'$.name')) LIKE '%business%' OR lower(json_extract(look_json,'$.name')) LIKE '%suit%') DESC,
  json_extract(look_json,'$.name') COLLATE NOCASE,id) AS position
 FROM avatar_looks WHERE enabled=1 AND json_extract(look_json,'$.ownership')='public'
  AND EXISTS(SELECT 1 FROM json_each(look_json,'$.engines') WHERE value='avatar_iii' OR
   (value='avatar_iv' AND coalesce((SELECT json_extract(settings_json,'$.allowPremium') FROM avatar_settings WHERE id=1),0)=1))
), selected AS (SELECT * FROM candidates WHERE position<=24 ORDER BY position)
SELECT 1,1,json_object('groups',json(coalesce((SELECT json_group_array(json_object('id',id,'name',substr(json_extract(look_json,'$.name'),1,100),
 'recommended',json(IIF(position<=8,'true','false')),'lookIds',json_array(id))) FROM selected),'[]')),
 'defaultLookId',(SELECT id FROM selected ORDER BY position LIMIT 1)),strftime('%Y-%m-%dT%H:%M:%fZ','now');
CREATE TABLE avatar_publication_events(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,expected_revision INTEGER NOT NULL,
 publication_json TEXT NOT NULL CHECK(json_valid(publication_json)),created_at TEXT NOT NULL);
CREATE TRIGGER avatar_publication_guard BEFORE INSERT ON avatar_publication_events BEGIN
 SELECT RAISE(ABORT,'CONFLICT') WHERE NOT EXISTS(SELECT 1 FROM avatar_publication WHERE id=1 AND revision=NEW.expected_revision);
 SELECT RAISE(ABORT,'RATE_LIMITED') WHERE (SELECT count(*) FROM avatar_publication_events WHERE actor_id=NEW.actor_id
  AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at,'-1 minute'))>=20;
 SELECT RAISE(ABORT,'AVATAR_UNAVAILABLE') WHERE EXISTS(
  SELECT 1 FROM json_each(NEW.publication_json,'$.groups') g JOIN json_each(g.value,'$.lookIds') v
  WHERE NOT EXISTS(SELECT 1 FROM avatar_looks a WHERE a.id=v.value AND a.enabled=1 AND json_extract(a.look_json,'$.ownership')='public'
   AND EXISTS(SELECT 1 FROM json_each(a.look_json,'$.engines') WHERE value='avatar_iii' OR
    (value='avatar_iv' AND coalesce((SELECT json_extract(settings_json,'$.allowPremium') FROM avatar_settings WHERE id=1),0)=1))));
END;
CREATE TRIGGER avatar_publication_apply AFTER INSERT ON avatar_publication_events BEGIN
 UPDATE avatar_publication SET publication_json=NEW.publication_json,revision=revision+1,updated_at=NEW.created_at WHERE id=1;
 INSERT INTO avatar_audit VALUES(NEW.id,NEW.actor_id,'selection_published','publication',NEW.publication_json,NEW.created_at);
END;
CREATE TRIGGER avatar_publication_event_immutable BEFORE UPDATE ON avatar_publication_events BEGIN SELECT RAISE(ABORT,'AVATAR_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER avatar_publication_event_no_delete BEFORE DELETE ON avatar_publication_events BEGIN SELECT RAISE(ABORT,'AVATAR_AUDIT_IMMUTABLE'); END;
