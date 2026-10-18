-- Explicit contributor approval for the public beta map. No account is opted in by migration.
CREATE TABLE beta_world_map_contributors (
 agency_id TEXT PRIMARY KEY REFERENCES agencies(id),
 approved_by_user_id TEXT NOT NULL REFERENCES auth_user(id),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 approved_at TEXT NOT NULL
);
