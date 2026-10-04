-- Homepage copies are separate from every customer's private media. Only
-- assets referenced by published_json can be read by the public endpoint.
CREATE TABLE homepage_assets (
 id TEXT PRIMARY KEY NOT NULL, source_kind TEXT NOT NULL CHECK(source_kind IN ('photo','video','animation','library')),
 source_id TEXT NOT NULL, request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
 object_key TEXT NOT NULL UNIQUE, metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
 poster_json TEXT CHECK(poster_json IS NULL OR json_valid(poster_json)),
 state TEXT NOT NULL DEFAULT 'staging' CHECK(state IN ('staging','active','deleting')),
 created_at TEXT NOT NULL, actor_user_id TEXT NOT NULL REFERENCES auth_user(id),
 CHECK(object_key LIKE 'homepage/' || id || '/%')
);
CREATE INDEX homepage_assets_cleanup ON homepage_assets(state,created_at);
CREATE TABLE homepage_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0,
 draft_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(draft_json)),
 published_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(published_json)),
 published_version INTEGER NOT NULL DEFAULT 0,published_at TEXT,
 updated_at TEXT NOT NULL
);
INSERT INTO homepage_settings(id,updated_at) VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE homepage_audit (
 id TEXT PRIMARY KEY NOT NULL, actor_user_id TEXT NOT NULL REFERENCES auth_user(id),
 action TEXT NOT NULL CHECK(action IN ('assign','publish','discard')),
 revision INTEGER NOT NULL, selections_json TEXT NOT NULL CHECK(json_valid(selections_json)),created_at TEXT NOT NULL
);
CREATE TRIGGER homepage_revision_guard BEFORE UPDATE ON homepage_settings
WHEN NEW.revision!=OLD.revision+1
BEGIN SELECT RAISE(ABORT,'HOMEPAGE_CONFLICT'); END;
CREATE TRIGGER homepage_references_guard BEFORE UPDATE OF draft_json,published_json ON homepage_settings
WHEN EXISTS(SELECT 1 FROM json_each(NEW.draft_json) r WHERE r.value IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM homepage_assets a WHERE a.id=r.value AND a.state='active'))
 OR EXISTS(SELECT 1 FROM json_each(NEW.published_json) r WHERE r.value IS NOT NULL AND NOT EXISTS(
 SELECT 1 FROM homepage_assets a WHERE a.id=r.value AND a.state='active'))
BEGIN SELECT RAISE(ABORT,'HOMEPAGE_ASSET_UNAVAILABLE'); END;
CREATE TRIGGER homepage_asset_immutable BEFORE UPDATE OF id,source_kind,source_id,request_hash,object_key,metadata_json,poster_json,created_at,actor_user_id ON homepage_assets
BEGIN SELECT RAISE(ABORT,'HOMEPAGE_ASSET_IMMUTABLE'); END;
CREATE TRIGGER homepage_asset_cleanup_guard BEFORE UPDATE OF state ON homepage_assets
WHEN NEW.state='deleting' AND EXISTS(SELECT 1 FROM homepage_settings s,json_each(s.draft_json) r WHERE r.value=OLD.id
 UNION ALL SELECT 1 FROM homepage_settings s,json_each(s.published_json) r WHERE r.value=OLD.id)
BEGIN SELECT RAISE(ABORT,'HOMEPAGE_ASSET_IN_USE'); END;
CREATE TRIGGER homepage_asset_delete_guard BEFORE DELETE ON homepage_assets
WHEN EXISTS(SELECT 1 FROM homepage_settings s,json_each(s.draft_json) r WHERE r.value=OLD.id
 UNION ALL SELECT 1 FROM homepage_settings s,json_each(s.published_json) r WHERE r.value=OLD.id)
BEGIN SELECT RAISE(ABORT,'HOMEPAGE_ASSET_IN_USE'); END;
CREATE TRIGGER homepage_audit_immutable_update BEFORE UPDATE ON homepage_audit
BEGIN SELECT RAISE(ABORT,'HOMEPAGE_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER homepage_audit_immutable_delete BEFORE DELETE ON homepage_audit
BEGIN SELECT RAISE(ABORT,'HOMEPAGE_AUDIT_IMMUTABLE'); END;
