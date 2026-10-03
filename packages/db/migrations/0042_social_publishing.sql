-- Les jetons Meta sont chiffrés côté serveur, jamais renvoyés au navigateur.
CREATE TABLE social_connections (
  id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL REFERENCES agencies(id),
  platform TEXT NOT NULL CHECK(platform IN ('instagram','facebook')),
  remote_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  meta_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  username TEXT,
  token_cipher TEXT,
  status TEXT NOT NULL CHECK(status IN ('active','reconnect','disconnected')),
  expires_at TEXT,
  connected_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(agency_id,platform,remote_id)
);
CREATE INDEX social_connections_owner ON social_connections(agency_id,status);
CREATE INDEX social_connections_meta_user ON social_connections(meta_user_id);
CREATE TABLE social_oauth_states (
  state_hash TEXT PRIMARY KEY NOT NULL,
  browser_hash TEXT NOT NULL,
  agency_id TEXT NOT NULL REFERENCES agencies(id),
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE social_oauth_grants (
  id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL REFERENCES agencies(id),
  user_id TEXT NOT NULL,
  choices_cipher TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE social_posts (
  id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL REFERENCES agencies(id),
  job_id TEXT NOT NULL REFERENCES jobs(id),
  idempotency_key TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  created_by TEXT NOT NULL,
  title TEXT NOT NULL,
  caption TEXT NOT NULL CHECK(length(caption)<=2200),
  scheduled_at TEXT NOT NULL,
  timezone TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  object_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes>0 AND size_bytes<=52428800),
  sha256 TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  duration_seconds REAL NOT NULL,
  prepared INTEGER NOT NULL DEFAULT 0 CHECK(prepared IN (0,1)),
  prepare_lease TEXT,
  prepare_until TEXT,
  expires_at TEXT NOT NULL,
  media_deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  action_token TEXT,
  UNIQUE(agency_id,idempotency_key)
);
CREATE INDEX social_posts_calendar ON social_posts(agency_id,scheduled_at DESC,id);
CREATE INDEX social_posts_retention ON social_posts(expires_at) WHERE media_deleted_at IS NULL;
CREATE TABLE social_targets (
  id TEXT PRIMARY KEY NOT NULL,
  post_id TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  connection_id TEXT REFERENCES social_connections(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK(platform IN ('instagram','facebook')),
  account_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','processing','published','failed','uncertain','cancelled')),
  stage TEXT NOT NULL DEFAULT 'queued' CHECK(stage IN ('queued','creating','uploading','processing','publishing','done')),
  remote_id TEXT,
  upload_url TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  polls INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  permalink TEXT,
  published_at TEXT,
  final_started_at TEXT,
  lease_token TEXT,
  lease_until TEXT,
  next_attempt_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(post_id,connection_id)
);
CREATE INDEX social_targets_due ON social_targets(next_attempt_at,status,lease_until);
CREATE TABLE social_events (
  id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL,
  post_id TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  target_id TEXT,
  actor_id TEXT,
  action TEXT NOT NULL,
  code TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE social_deletion_receipts (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL
);
-- La copie conservée représente exactement la version validée pour diffusion.
CREATE TRIGGER social_snapshot_immutable BEFORE UPDATE OF agency_id,job_id,manifest_hash,object_key,size_bytes,sha256,width,height,duration_seconds ON social_posts
BEGIN SELECT RAISE(ABORT,'SOCIAL_SNAPSHOT_IMMUTABLE'); END;
