-- Shared source music is copied into each owned project before use. Hiding a
-- library entry therefore never changes existing drafts or rendered exports.
CREATE TABLE music_library (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  description TEXT NOT NULL CHECK(length(description)<=300),
  license TEXT NOT NULL CHECK(length(license) BETWEEN 1 AND 300),
  asset_json TEXT NOT NULL CHECK(json_valid(asset_json)),
  waveform_json TEXT NOT NULL CHECK(json_valid(waveform_json)),
  object_key TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES auth_user(id)
);
CREATE INDEX music_library_page ON music_library(active,created_at DESC,id DESC);
CREATE TABLE music_library_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  music_id TEXT NOT NULL REFERENCES music_library(id),
  actor_id TEXT NOT NULL REFERENCES auth_user(id),
  action TEXT NOT NULL CHECK(action IN('upload','update')),
  details_json TEXT NOT NULL CHECK(json_valid(details_json)),
  created_at TEXT NOT NULL
);
CREATE TRIGGER music_library_uploaded AFTER INSERT ON music_library BEGIN
  INSERT INTO music_library_events(music_id,actor_id,action,details_json,created_at)
  VALUES(NEW.id,NEW.updated_by,'upload',json_object('name',NEW.name,'active',NEW.active,'revision',NEW.revision),NEW.created_at);
END;
CREATE TRIGGER music_library_updated AFTER UPDATE ON music_library BEGIN
  INSERT INTO music_library_events(music_id,actor_id,action,details_json,created_at)
  VALUES(NEW.id,NEW.updated_by,'update',json_object('before',json_object('name',OLD.name,'description',OLD.description,'license',OLD.license,'active',OLD.active,'revision',OLD.revision),
    'after',json_object('name',NEW.name,'description',NEW.description,'license',NEW.license,'active',NEW.active,'revision',NEW.revision)),NEW.updated_at);
END;
CREATE TRIGGER music_library_events_immutable_update BEFORE UPDATE ON music_library_events BEGIN SELECT RAISE(ABORT,'IMMUTABLE_MUSIC_EVENT'); END;
CREATE TRIGGER music_library_events_immutable_delete BEFORE DELETE ON music_library_events BEGIN SELECT RAISE(ABORT,'IMMUTABLE_MUSIC_EVENT'); END;
