-- Better Auth 1.7.6 : dates en millisecondes, noms de champs de l'adaptateur natif.
CREATE TABLE auth_user (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0, image TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
);
CREATE TABLE auth_session (
  id TEXT PRIMARY KEY NOT NULL, expiresAt INTEGER NOT NULL, token TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, ipAddress TEXT, userAgent TEXT,
  userId TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE
);
CREATE INDEX auth_session_user ON auth_session(userId);
CREATE TABLE auth_account (
  id TEXT PRIMARY KEY NOT NULL, accountId TEXT NOT NULL, providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  accessToken TEXT, refreshToken TEXT, idToken TEXT, accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER, scope TEXT, password TEXT, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
  UNIQUE(providerId, accountId)
);
CREATE INDEX auth_account_user ON auth_account(userId);
CREATE TABLE auth_verification (
  id TEXT PRIMARY KEY NOT NULL, identifier TEXT NOT NULL, value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
);
CREATE INDEX auth_verification_identifier ON auth_verification(identifier);
CREATE TABLE auth_rate_limit (
  id TEXT PRIMARY KEY NOT NULL, key TEXT NOT NULL UNIQUE, count INTEGER NOT NULL, lastRequest INTEGER NOT NULL
);
ALTER TABLE agencies ADD COLUMN brand_version INTEGER NOT NULL DEFAULT 0 CHECK(brand_version >= 0);

-- La marque courante ne peut référencer que son propre logo. Les anciennes
-- versions restent immuables, disponibles pour les manifestes et jobs existants.
CREATE TRIGGER agency_logo_scope BEFORE UPDATE OF logo_asset_id ON agencies
WHEN NEW.logo_asset_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM media_assets WHERE id = NEW.logo_asset_id AND agency_id = NEW.id AND kind = 'brand'
)
BEGIN SELECT RAISE(ABORT, 'BRAND_LOGO_MISMATCH'); END;
CREATE TRIGGER agency_logo_scope_insert BEFORE INSERT ON agencies
WHEN NEW.logo_asset_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'BRAND_LOGO_MISMATCH'); END;
CREATE TRIGGER brand_asset_immutable BEFORE UPDATE ON media_assets WHEN OLD.kind = 'brand'
BEGIN SELECT RAISE(ABORT, 'BRAND_ASSET_IMMUTABLE'); END;
CREATE TRIGGER brand_storage_limit BEFORE INSERT ON media_assets
WHEN NEW.kind = 'brand' AND (
  (SELECT count(*) FROM media_assets WHERE agency_id=NEW.agency_id AND kind='brand') >= 64 OR
  (SELECT coalesce(sum(size_bytes),0) FROM media_assets WHERE agency_id=NEW.agency_id AND kind='brand') + NEW.size_bytes > 33554432
)
BEGIN SELECT RAISE(ABORT, 'LOGO_STORAGE_FULL'); END;
CREATE TRIGGER current_logo_preserved BEFORE DELETE ON media_assets
WHEN EXISTS (SELECT 1 FROM agencies WHERE logo_asset_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'BRAND_ASSET_IN_USE'); END;

-- Compteurs bornés par utilisateur et action, incrément atomique côté D1.
CREATE TABLE agency_write_limits (
  owner_user_id TEXT NOT NULL, action TEXT NOT NULL, minute INTEGER NOT NULL, count INTEGER NOT NULL,
  PRIMARY KEY(owner_user_id, action)
);
