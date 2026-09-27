-- Métadonnées produit ; aucun compte, droit gratuit ou abonnement réel créé.
-- owner_user_id sera relié à l'identité authentifiée au sprint 02.
CREATE TABLE agencies (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  logo_asset_id TEXT,
  primary_color TEXT NOT NULL DEFAULT '#214F43',
  secondary_color TEXT NOT NULL DEFAULT '#F3EFE6',
  phone TEXT, email TEXT, website TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE listings (
  id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL REFERENCES agencies(id),
  source_url TEXT NOT NULL, canonical_url TEXT NOT NULL, source_host TEXT NOT NULL,
  source_listing_id TEXT, fetched_at TEXT NOT NULL, adapter_version TEXT NOT NULL,
  transaction_kind TEXT NOT NULL CHECK(transaction_kind IN ('sale','rent')),
  facts_json TEXT NOT NULL CHECK(json_valid(facts_json)),
  UNIQUE(agency_id, id)
);
CREATE INDEX listings_agency_fetched ON listings(agency_id, fetched_at DESC, id);

CREATE TABLE allocations (
  id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL REFERENCES agencies(id),
  kind TEXT NOT NULL CHECK(kind IN ('trial','paid')),
  period_key TEXT NOT NULL,
  quota_limit INTEGER NOT NULL CHECK(quota_limit > 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved >= 0),
  consumed INTEGER NOT NULL DEFAULT 0 CHECK(consumed >= 0),
  valid_from TEXT NOT NULL, valid_until TEXT NOT NULL,
  CHECK(reserved + consumed <= quota_limit),
  CHECK(valid_until > valid_from),
  CHECK(kind != 'trial' OR quota_limit = 1),
  UNIQUE(agency_id, id), UNIQUE(agency_id, kind, period_key)
);
CREATE UNIQUE INDEX allocations_one_trial_per_agency ON allocations(agency_id) WHERE kind = 'trial';

CREATE TABLE jobs (
  id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL REFERENCES agencies(id),
  listing_id TEXT,
  source_url TEXT NOT NULL, idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','importing','scripting','voicing','rendering','retry_wait','ready','failed')),
  stage TEXT NOT NULL CHECK(stage IN ('importing','scripting','voicing','rendering')),
  attempt INTEGER NOT NULL DEFAULT 1 CHECK(attempt BETWEEN 1 AND 2),
  lease_until TEXT, workflow_id TEXT UNIQUE,
  reservation_id TEXT NOT NULL UNIQUE,
  error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(agency_id, id), UNIQUE(agency_id, idempotency_key),
  CHECK(updated_at >= created_at),
  CHECK(status NOT IN ('ready','failed') OR lease_until IS NULL),
  CHECK(status != 'failed' OR error_code IS NOT NULL),
  CHECK(status != 'ready' OR error_code IS NULL),
  FOREIGN KEY(agency_id, listing_id) REFERENCES listings(agency_id, id),
  FOREIGN KEY(agency_id, id, reservation_id) REFERENCES reservations(agency_id, job_id, id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX jobs_agency_created ON jobs(agency_id, created_at DESC, id);
CREATE INDEX jobs_reconciliation ON jobs(status, lease_until, updated_at);
CREATE UNIQUE INDEX jobs_one_active_per_agency ON jobs(agency_id) WHERE status NOT IN ('ready','failed');

CREATE TABLE reservations (
  id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL REFERENCES agencies(id),
  job_id TEXT NOT NULL UNIQUE,
  allocation_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('reserved','consumed','released')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(agency_id, job_id, id),
  FOREIGN KEY(agency_id, job_id) REFERENCES jobs(agency_id, id),
  FOREIGN KEY(agency_id, allocation_id) REFERENCES allocations(agency_id, id)
);
CREATE INDEX reservations_allocation_status ON reservations(allocation_id, status);

-- Trace minimale indépendante des médias ; aucune identité réelle au sprint 01.
CREATE TABLE trial_claims (
  owner_user_id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL UNIQUE REFERENCES agencies(id),
  consumed_job_id TEXT,
  consumed_at TEXT,
  CHECK((consumed_job_id IS NULL) = (consumed_at IS NULL)),
  FOREIGN KEY(agency_id, consumed_job_id) REFERENCES jobs(agency_id, id)
);

CREATE TABLE job_launch_intents (
  job_id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('pending','started','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  next_attempt_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(agency_id, job_id) REFERENCES jobs(agency_id, id)
);
CREATE INDEX launch_intents_pending ON job_launch_intents(status, next_attempt_at);

CREATE TABLE media_assets (
  id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL REFERENCES agencies(id),
  job_id TEXT, listing_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('brand','photo','audio','manifest','video')),
  object_key TEXT NOT NULL UNIQUE,
  content_hash TEXT NOT NULL CHECK(length(content_hash) = 64),
  mime TEXT NOT NULL, size_bytes INTEGER NOT NULL CHECK(size_bytes > 0),
  width INTEGER CHECK(width > 0), height INTEGER CHECK(height > 0),
  source_url TEXT, source_order INTEGER CHECK(source_order >= 0),
  created_at TEXT NOT NULL, expires_at TEXT,
  UNIQUE(agency_id, id),
  CHECK(object_key LIKE 'agencies/' || agency_id || '/%'),
  CHECK((kind = 'brand' AND job_id IS NULL) OR (kind != 'brand' AND job_id IS NOT NULL)),
  FOREIGN KEY(agency_id, job_id) REFERENCES jobs(agency_id, id),
  FOREIGN KEY(agency_id, listing_id) REFERENCES listings(agency_id, id)
);
CREATE INDEX media_agency_job ON media_assets(agency_id, job_id, kind);
CREATE INDEX media_expiry ON media_assets(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE subscriptions (
  agency_id TEXT PRIMARY KEY NOT NULL REFERENCES agencies(id),
  stripe_customer_id TEXT NOT NULL UNIQUE, stripe_subscription_id TEXT NOT NULL UNIQUE,
  plan_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
  period_start TEXT, period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK(cancel_at_period_end IN (0,1)),
  sync_version INTEGER NOT NULL DEFAULT 0 CHECK(sync_version >= 0), updated_at TEXT NOT NULL
);

CREATE TABLE cost_events (
  id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT REFERENCES agencies(id), job_id TEXT, request_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('cloudflare','openai','remotion')),
  stage TEXT NOT NULL CHECK(stage IN ('hosting','importing','scripting','voicing','rendering','storage')),
  kind TEXT NOT NULL CHECK(kind IN ('estimate','reconciled','fixed','prepayment')),
  quantity REAL NOT NULL CHECK(quantity >= 0), unit TEXT NOT NULL,
  currency TEXT NOT NULL CHECK(currency IN ('EUR','USD')),
  unit_price_micros INTEGER NOT NULL CHECK(unit_price_micros >= 0),
  amount_micros INTEGER NOT NULL CHECK(amount_micros >= 0),
  price_date TEXT NOT NULL, created_at TEXT NOT NULL,
  CHECK(job_id IS NULL OR agency_id IS NOT NULL),
  FOREIGN KEY(agency_id, job_id) REFERENCES jobs(agency_id, id)
);
CREATE INDEX costs_job_stage ON cost_events(agency_id, job_id, stage);
CREATE INDEX costs_period ON cost_events(created_at, currency, kind);

CREATE TABLE generation_control (
  id TEXT PRIMARY KEY CHECK(id = 'generations'),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  updated_at TEXT NOT NULL
);
INSERT INTO generation_control(id, enabled, updated_at) VALUES ('generations', 0, '2026-09-27T00:00:00.000Z');
