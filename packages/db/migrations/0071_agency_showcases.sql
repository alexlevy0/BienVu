-- Opt-in public storefronts. Existing agencies/properties stay private.
CREATE TABLE agency_showcases (
  agency_id TEXT PRIMARY KEY REFERENCES agencies(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','offline')),
  draft_json TEXT NOT NULL CHECK(json_valid(draft_json)),
  published_json TEXT CHECK(published_json IS NULL OR json_valid(published_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  mutation_token TEXT NOT NULL DEFAULT '',
  published_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE showcase_slugs (
  slug TEXT PRIMARY KEY, agency_id TEXT NOT NULL REFERENCES agency_showcases(agency_id),
  public INTEGER NOT NULL DEFAULT 0 CHECK(public IN (0,1)), created_at TEXT NOT NULL
);
CREATE INDEX showcase_slugs_agency ON showcase_slugs(agency_id);
CREATE TRIGGER showcase_slug_owner BEFORE INSERT ON showcase_slugs WHEN EXISTS(SELECT 1 FROM showcase_slugs WHERE slug=NEW.slug AND agency_id!=NEW.agency_id)
BEGIN SELECT RAISE(ABORT,'SHOWCASE_CONFLICT'); END;
CREATE TABLE showcase_properties (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL REFERENCES agency_showcases(agency_id), property_id TEXT NOT NULL,
  draft_json TEXT NOT NULL CHECK(json_valid(draft_json)), published_json TEXT CHECK(published_json IS NULL OR json_valid(published_json)),
  removed INTEGER NOT NULL DEFAULT 0 CHECK(removed IN (0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(agency_id,property_id)
);
CREATE INDEX showcase_properties_agency ON showcase_properties(agency_id,removed);
CREATE TABLE showcase_assets (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL REFERENCES agency_showcases(agency_id),
  source_key TEXT NOT NULL, source_hash TEXT NOT NULL CHECK(length(source_hash)=64),
  object_key TEXT UNIQUE NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('photo','video','logo','cover')),
  mime TEXT NOT NULL, width INTEGER NOT NULL CHECK(width>0), height INTEGER NOT NULL CHECK(height>0),
  size_bytes INTEGER NOT NULL CHECK(size_bytes>0 AND size_bytes<=52428800),
  ready INTEGER NOT NULL DEFAULT 0 CHECK(ready IN (0,1)), created_at TEXT NOT NULL,
  UNIQUE(agency_id,source_key,source_hash,kind)
);
CREATE INDEX showcase_assets_agency ON showcase_assets(agency_id,created_at);
CREATE TRIGGER showcase_assets_budget BEFORE INSERT ON showcase_assets BEGIN
  SELECT RAISE(ABORT,'SHOWCASE_STORAGE_FULL') WHERE
    (SELECT coalesce(sum(size_bytes),0) FROM showcase_assets WHERE agency_id=NEW.agency_id)+NEW.size_bytes>1073741824;
END;
CREATE TABLE showcase_leads (
  id TEXT PRIMARY KEY, agency_id TEXT NOT NULL REFERENCES agency_showcases(agency_id),
  property_id TEXT, property_title TEXT, request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
  turnstile_hash TEXT UNIQUE CHECK(turnstile_hash IS NULL OR length(turnstile_hash)=64),
  name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','in_progress','treated')),
  notification TEXT NOT NULL DEFAULT 'pending' CHECK(notification IN ('pending','sending','sent','failed','disabled')),
  notify_email TEXT, attempts INTEGER NOT NULL DEFAULT 0, retry_at TEXT NOT NULL, lease_until TEXT, created_at TEXT NOT NULL,
  UNIQUE(agency_id,id)
);
CREATE INDEX showcase_leads_agency ON showcase_leads(agency_id,created_at,id);
CREATE INDEX showcase_leads_outbox ON showcase_leads(notification,retry_at);
CREATE TABLE showcase_daily (
  agency_id TEXT NOT NULL REFERENCES agency_showcases(agency_id), day TEXT NOT NULL,
  agency_views INTEGER NOT NULL DEFAULT 0, property_views INTEGER NOT NULL DEFAULT 0, contact_clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(agency_id,day)
);
CREATE TABLE showcase_contact_intents (id TEXT PRIMARY KEY, agency_id TEXT NOT NULL REFERENCES agency_showcases(agency_id),request_hash TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE showcase_event_keys (id TEXT PRIMARY KEY,agency_id TEXT NOT NULL REFERENCES agency_showcases(agency_id),day TEXT NOT NULL,event TEXT NOT NULL CHECK(event IN ('agency_view','property_view','contact_click')), expires_at INTEGER NOT NULL);
CREATE TRIGGER showcase_count_event AFTER INSERT ON showcase_event_keys BEGIN
  INSERT INTO showcase_daily(agency_id,day,agency_views,property_views,contact_clicks)
    VALUES(NEW.agency_id,NEW.day,NEW.event='agency_view',NEW.event='property_view',NEW.event='contact_click')
    ON CONFLICT(agency_id,day) DO UPDATE SET agency_views=min(1000000,agency_views+excluded.agency_views),
      property_views=min(1000000,property_views+excluded.property_views),contact_clicks=min(1000000,contact_clicks+excluded.contact_clicks);
END;
CREATE TABLE showcase_limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL CHECK(count>0), expires_at INTEGER NOT NULL);
