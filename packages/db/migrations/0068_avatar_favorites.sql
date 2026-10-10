-- Personal preferences, independent of the agency and public avatar catalogue.
CREATE TABLE avatar_favorites (
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  look_id TEXT NOT NULL REFERENCES avatar_looks(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, look_id)
);
CREATE INDEX avatar_favorites_look ON avatar_favorites(look_id);
