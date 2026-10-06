-- Preserve existing call journals, reservations, cache keys and audio objects.
DROP TRIGGER narration_call_limits;
PRAGMA legacy_alter_table=ON;
ALTER TABLE narration_calls RENAME TO narration_calls_old;
CREATE TABLE narration_calls (
  id TEXT PRIMARY KEY NOT NULL,
  agency_id TEXT NOT NULL, job_id TEXT NOT NULL, step_key TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
  provider TEXT NOT NULL CHECK(provider IN ('openai','google','fish','cartesia')),
  provider_mode TEXT NOT NULL CHECK(provider_mode IN ('real','mock')),
  month TEXT NOT NULL,
  reservation_cents INTEGER NOT NULL CHECK(reservation_cents IN (0,5)),
  state TEXT NOT NULL CHECK(state IN ('pending','done','failed')),
  result_json TEXT CHECK(result_json IS NULL OR (json_valid(result_json) AND length(result_json)<=128000)),
  object_key TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(agency_id,job_id,step_key),
  FOREIGN KEY(agency_id,job_id) REFERENCES narration_runs(agency_id,job_id),
  CHECK((provider_mode='mock' AND reservation_cents=0) OR (provider_mode='real' AND reservation_cents=5)),
  CHECK(object_key IS NULL OR substr(object_key,1,length('agencies/' || agency_id || '/jobs/' || job_id || '/audio/')) = 'agencies/' || agency_id || '/jobs/' || job_id || '/audio/')
);
INSERT INTO narration_calls SELECT * FROM narration_calls_old;
DROP TABLE narration_calls_old;
PRAGMA legacy_alter_table=OFF;
CREATE INDEX narration_calls_month ON narration_calls(month,provider_mode);
-- Garder ces deux limites explicites : la variante CASE ... END est refusée
-- comme « incomplete input » par la migration D1 distante (Wrangler 4.142).
CREATE TRIGGER narration_call_limits BEFORE INSERT ON narration_calls
BEGIN
  SELECT RAISE(ABORT,'NARRATION_BUDGET_LIMIT') WHERE NEW.provider='openai' AND
    (SELECT count(*) FROM narration_calls WHERE agency_id=NEW.agency_id AND job_id=NEW.job_id AND provider=NEW.provider)>=2;
  SELECT RAISE(ABORT,'NARRATION_BUDGET_LIMIT') WHERE NEW.provider IN ('google','fish','cartesia') AND
    (SELECT count(*) FROM narration_calls WHERE agency_id=NEW.agency_id AND job_id=NEW.job_id AND provider IN ('google','fish','cartesia'))>=12;
  SELECT RAISE(ABORT,'NARRATION_BUDGET_LIMIT') WHERE NEW.provider_mode='real' AND NOT EXISTS(
    SELECT 1 FROM narration_budget WHERE month=NEW.month AND paused=0 AND envelope_cents>=NEW.reservation_cents+
      (SELECT coalesce(sum(reservation_cents),0) FROM narration_calls WHERE month=NEW.month AND provider_mode='real'));
  SELECT RAISE(ABORT,'NARRATION_CONFLICT') WHERE NOT EXISTS(
    SELECT 1 FROM narration_runs WHERE agency_id=NEW.agency_id AND job_id=NEW.job_id AND provider_mode=NEW.provider_mode);
END;

-- An admitted job keeps its voice, even if the global default changes later.
ALTER TABLE generation_runs ADD COLUMN selected_voice TEXT NOT NULL DEFAULT 'fish-manon';
CREATE TABLE voice_catalog(id TEXT PRIMARY KEY NOT NULL);
INSERT INTO voice_catalog(id) VALUES ('fr-FR-Chirp3-HD-Aoede'),('fr-FR-Chirp3-HD-Kore'),('fr-FR-Chirp3-HD-Charon'),('fish-manon'),('fish-lucas'),('fish-camille'),('cartesia-7c58f4a4-a72c-42fa-a503-41b9408820f3'),('cartesia-b56a7171-86f0-42b6-b3fa-a316794aa4e0'),('cartesia-996ec149-0dca-4389-ad08-e2d6f906b4bf'),('cartesia-92579402-6868-412e-b845-3efed0be7a9e'),('cartesia-045b0ec6-3bed-4bc8-b797-b90a7bb5b445'),('cartesia-d9f4af15-c402-4f50-bbda-d8823d028d6a'),('cartesia-8f1e9d27-96ff-405e-9213-7432a784ac0b'),('cartesia-fbc431c6-7d79-4ef5-b1bb-aab9f579c690'),('cartesia-5def377d-908b-4540-8bd7-3c968fcae351'),('cartesia-c9f95851-235c-458c-acfb-67cdb2558538'),('cartesia-80f117a5-5196-4b64-8b4c-efda3d3ab176'),('cartesia-7345dfa5-ee04-44d2-abf4-29262b880ab4'),('cartesia-e70cceed-576e-4fc1-9fc1-f1e137f15367'),('cartesia-57c90262-e4a1-4496-b256-98e3a92d8d82'),('cartesia-93c98a2b-7d15-4f7b-8236-294b1e02b1c0'),('cartesia-90358bc7-3328-4b93-a942-d0447d7d4b5c'),('cartesia-6acedd3e-bac4-41bc-8c7c-ef560d27e778'),('cartesia-004e0148-b251-48ae-b77a-234fbb5e2099'),('cartesia-d6f67b55-1fec-4319-8949-32ec9fa863c9'),('cartesia-78291f16-fc9b-4f72-a21b-1ac7d767d104'),('cartesia-658607d6-26cd-4ab5-8a36-d964ee4b1051'),('cartesia-5f83e88f-9b5a-4563-95c4-904f4b0036e9'),('cartesia-cc7d2711-69af-4072-9674-df588dd85682'),('cartesia-faa75703-00e3-4a57-9955-0703001e3231'),('cartesia-0d09e991-5763-406e-b637-02bc431ef72d'),('cartesia-c96a7d7d-3457-4979-8665-522f7b3e36fb'),('cartesia-ab636c8b-9960-4fb3-bb0c-b7b655fb9745'),('cartesia-2d693a9c-fc75-4313-aefb-c9cfaa17dd83'),('cartesia-2f8e82c4-cb94-4e6d-8b6a-29bf58ceb60a'),('cartesia-c9115185-0086-4cf4-bfdd-0d36425db387'),('cartesia-adff5dcb-249f-463f-aa89-d98d8ca05e88'),('cartesia-80e11491-2d8a-4361-ac61-c4f3e0a4f7e7'),('cartesia-bfd5390b-e4f9-4e44-95ab-9ebd223acd62'),('cartesia-735287ee-ce91-4b08-8de4-63315c5ba1fb'),('cartesia-5deeaea9-c3cf-4288-82ec-22d8f04eb158'),('cartesia-6c64b57a-bc65-48e4-bff4-12dbe85606cd'),('cartesia-0418348a-0ca2-4e90-9986-800fb8b3bbc0'),('cartesia-5c3c89e5-535f-43ef-b14d-f8ffe148c1f0'),('cartesia-8832a0b5-47b2-4751-bb22-6a8e2149303d'),('cartesia-ab7c61f5-3daa-47dd-a23b-4ac0aac5f5c3'),('cartesia-65b25c5d-ff07-4687-a04c-da2f43ef6fa9');
CREATE TABLE voice_settings(id INTEGER PRIMARY KEY CHECK(id=1),voice_id TEXT NOT NULL REFERENCES voice_catalog(id),revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,updated_by TEXT);
INSERT INTO voice_settings(id,voice_id,updated_at) VALUES(1,'cartesia-7c58f4a4-a72c-42fa-a503-41b9408820f3',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE voice_setting_events(id TEXT PRIMARY KEY NOT NULL,actor_id TEXT NOT NULL,previous_voice TEXT NOT NULL,voice_id TEXT NOT NULL REFERENCES voice_catalog(id),expected_revision INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE TRIGGER voice_setting_cas BEFORE INSERT ON voice_setting_events BEGIN
 SELECT RAISE(ABORT,'VOICE_SETTING_CONFLICT') WHERE NOT EXISTS(SELECT 1 FROM voice_settings WHERE id=1 AND revision=NEW.expected_revision AND voice_id=NEW.previous_voice);
END;
CREATE TRIGGER voice_setting_apply AFTER INSERT ON voice_setting_events BEGIN
 UPDATE voice_settings SET voice_id=NEW.voice_id,revision=revision+1,updated_at=NEW.created_at,updated_by=NEW.actor_id WHERE id=1;
END;
CREATE TRIGGER voice_setting_immutable_update BEFORE UPDATE ON voice_setting_events BEGIN SELECT RAISE(ABORT,'VOICE_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER voice_setting_immutable_delete BEFORE DELETE ON voice_setting_events BEGIN SELECT RAISE(ABORT,'VOICE_AUDIT_IMMUTABLE'); END;
-- A rolling 31-day limit cannot spend more than Free's 20k in any billing month,
-- regardless of the provider account's renewal day. Failures remain provisioned.
CREATE TABLE cartesia_usage(id TEXT PRIMARY KEY NOT NULL,characters INTEGER NOT NULL CHECK(characters BETWEEN 1 AND 1000),created_at TEXT NOT NULL,lease_until TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('pending','done','failed')));
CREATE INDEX cartesia_usage_window ON cartesia_usage(created_at);
CREATE TRIGGER cartesia_free_limits BEFORE INSERT ON cartesia_usage BEGIN
 SELECT RAISE(ABORT,'VOICE_FREE_LIMIT') WHERE (SELECT coalesce(sum(characters),0) FROM cartesia_usage WHERE julianday(created_at)>julianday(NEW.created_at)-31)+NEW.characters>20000;
 SELECT RAISE(ABORT,'VOICE_BUSY') WHERE (SELECT count(*) FROM cartesia_usage WHERE state='pending' AND lease_until>NEW.created_at)>=2;
END;
CREATE TRIGGER cartesia_usage_no_delete BEFORE DELETE ON cartesia_usage BEGIN SELECT RAISE(ABORT,'VOICE_USAGE_IMMUTABLE'); END;
CREATE TRIGGER cartesia_usage_no_edit BEFORE UPDATE ON cartesia_usage WHEN NEW.id<>OLD.id OR NEW.characters<>OLD.characters OR NEW.created_at<>OLD.created_at OR NEW.lease_until<>OLD.lease_until OR OLD.state<>'pending' OR NEW.state NOT IN ('done','failed') BEGIN SELECT RAISE(ABORT,'VOICE_USAGE_IMMUTABLE'); END;
CREATE TABLE voice_samples(id TEXT PRIMARY KEY NOT NULL,voice_id TEXT NOT NULL REFERENCES voice_catalog(id),text_hash TEXT NOT NULL CHECK(length(text_hash)=64),actor_id TEXT NOT NULL,created_at TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('pending','done','failed')),object_key TEXT NOT NULL UNIQUE,metrics_json TEXT,error_code TEXT,UNIQUE(voice_id,text_hash));
CREATE INDEX voice_samples_actor_time ON voice_samples(actor_id,created_at);

-- Rebuild both related supplier tables together; preserve invoices, allocations,
-- immutable guards and view names without renaming foreign-key targets.
DROP VIEW finance_video_summary;
DROP VIEW finance_supplier_costs;
DROP VIEW finance_expected_providers;
CREATE TABLE cartesia_expenses_backup AS SELECT * FROM financial_expenses;
CREATE TABLE cartesia_allocations_backup AS SELECT * FROM financial_expense_allocations;
DROP TRIGGER expense_allocation_guard;
DROP TABLE financial_expense_allocations;
DROP TABLE financial_expenses;
CREATE TABLE financial_expenses(
 id TEXT PRIMARY KEY,provider TEXT NOT NULL CHECK(provider IN ('openai','google','fish','cartesia','runway','cloudflare','other')),
 reference TEXT NOT NULL CHECK(length(reference) BETWEEN 2 AND 120),mode TEXT NOT NULL CHECK(mode IN ('live','test')),
 kind TEXT NOT NULL CHECK(kind IN ('usage','fixed','prepaid','credit_note')),currency TEXT NOT NULL CHECK(currency IN ('EUR','USD')),
 original_minor INTEGER NOT NULL CHECK(original_minor BETWEEN 0 AND 100000000),eur_cents INTEGER NOT NULL CHECK(eur_cents BETWEEN 0 AND 100000000),
 unit_quantity INTEGER NOT NULL CHECK(unit_quantity BETWEEN 1 AND 100000000),period_from TEXT NOT NULL,period_until TEXT NOT NULL,
 paid_at TEXT NOT NULL,note TEXT NOT NULL CHECK(length(note)<=500),actor_id TEXT NOT NULL,created_at TEXT NOT NULL,
 voided_at TEXT,voided_by TEXT,void_reason TEXT,CHECK(period_until>=period_from),
 CHECK((voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL) OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND length(void_reason) BETWEEN 5 AND 300))
);
CREATE UNIQUE INDEX expense_reference_active ON financial_expenses(provider,mode,reference) WHERE voided_at IS NULL;
CREATE TABLE financial_expense_allocations(
 expense_id TEXT NOT NULL REFERENCES financial_expenses(id),job_id TEXT NOT NULL REFERENCES generation_runs(job_id),units INTEGER NOT NULL CHECK(units>0),
 amount_micros INTEGER NOT NULL CHECK(amount_micros BETWEEN 0 AND 1000000000000),offset_units INTEGER NOT NULL CHECK(offset_units>=0),covers_provider INTEGER NOT NULL CHECK(covers_provider IN (0,1)),
 PRIMARY KEY(expense_id,job_id)
);

INSERT INTO financial_expenses SELECT * FROM cartesia_expenses_backup;
INSERT INTO financial_expense_allocations SELECT * FROM cartesia_allocations_backup;
DROP TABLE cartesia_allocations_backup;
DROP TABLE cartesia_expenses_backup;
CREATE TRIGGER expense_allocation_guard BEFORE INSERT ON financial_expense_allocations
BEGIN
 SELECT RAISE(ABORT,'FINANCIAL_ALLOCATION_INVALID') WHERE NOT EXISTS(SELECT 1 FROM financial_expenses e JOIN generation_runs g ON g.job_id=NEW.job_id
  WHERE e.id=NEW.expense_id AND e.voided_at IS NULL AND substr(g.created_at,1,10) BETWEEN e.period_from AND e.period_until
  AND NEW.offset_units=(SELECT coalesce(sum(units),0) FROM financial_expense_allocations WHERE expense_id=e.id)
  AND NEW.units+(SELECT coalesce(sum(units),0) FROM financial_expense_allocations WHERE expense_id=e.id)<=e.unit_quantity
  AND NEW.amount_micros+(SELECT coalesce(sum(amount_micros),0) FROM financial_expense_allocations WHERE expense_id=e.id)<=e.eur_cents*10000);
END;
CREATE TRIGGER expense_immutable BEFORE UPDATE OF id,provider,reference,mode,kind,currency,original_minor,eur_cents,unit_quantity,period_from,period_until,paid_at,note,actor_id,created_at ON financial_expenses
BEGIN SELECT RAISE(ABORT,'FINANCIAL_EXPENSE_IMMUTABLE'); END;
CREATE TRIGGER expense_void_once BEFORE UPDATE OF voided_at,voided_by,void_reason ON financial_expenses
WHEN OLD.voided_at IS NOT NULL OR NEW.voided_at IS NULL BEGIN SELECT RAISE(ABORT,'FINANCIAL_EXPENSE_IMMUTABLE'); END;
CREATE TRIGGER expense_allocation_immutable BEFORE UPDATE ON financial_expense_allocations
BEGIN SELECT RAISE(ABORT,'FINANCIAL_EXPENSE_IMMUTABLE'); END;
CREATE TRIGGER expense_no_delete BEFORE DELETE ON financial_expenses BEGIN SELECT RAISE(ABORT,'FINANCIAL_EXPENSE_IMMUTABLE'); END;
CREATE TRIGGER expense_allocation_no_delete BEFORE DELETE ON financial_expense_allocations BEGIN SELECT RAISE(ABORT,'FINANCIAL_EXPENSE_IMMUTABLE'); END;

CREATE VIEW finance_expected_providers AS
 SELECT job_id,'cloudflare' AS provider FROM generation_runs
 UNION SELECT job_id,provider FROM narration_calls WHERE provider_mode='real'
 UNION SELECT job_id,'runway' FROM photo_animations WHERE mode='real';
CREATE VIEW finance_supplier_costs AS
 SELECT x.job_id,e.provider,sum(x.amount_micros*IIF(e.kind='credit_note',-1,1)) AS amount_micros,max(x.covers_provider) AS covered
 FROM financial_expense_allocations x JOIN financial_expenses e ON e.id=x.expense_id WHERE e.voided_at IS NULL GROUP BY x.job_id,e.provider;
CREATE VIEW finance_video_summary AS
 SELECT g.job_id,g.agency_id,g.financial_mode AS mode,g.created_at,j.status,
 coalesce(json_extract(l.facts_json,'$.title.value'),json_extract(i.result_json,'$.facts.title.value'),'Votre annonce') AS title,
 a.name AS agency,coalesce((SELECT sum(used) FROM finance_credit_usage u WHERE u.job_id=g.job_id),0) AS credits_used,
 coalesce((SELECT sum(revenue_micros) FROM finance_credit_attribution f WHERE f.job_id=g.job_id),0) AS revenue_micros,
 coalesce((SELECT sum(fee_micros) FROM finance_credit_attribution f WHERE f.job_id=g.job_id),0) AS fee_micros,
 (SELECT count(*) FROM finance_credit_attribution f WHERE f.job_id=g.job_id AND f.incomplete=1) AS fees_missing,
 coalesce((SELECT sum(amount_micros) FROM finance_supplier_costs c WHERE c.job_id=g.job_id),0) AS cost_micros,
 (SELECT group_concat(p.provider,',') FROM finance_expected_providers p WHERE p.job_id=g.job_id AND NOT EXISTS(
 SELECT 1 FROM finance_supplier_costs c WHERE c.job_id=p.job_id AND c.provider=p.provider AND c.covered=1)) AS missing_providers
 FROM generation_runs g JOIN jobs j ON j.id=g.job_id LEFT JOIN agencies a ON a.id=g.agency_id
 LEFT JOIN listings l ON l.id=j.listing_id LEFT JOIN listing_imports i ON i.id=j.listing_id;

CREATE TRIGGER generation_voice_immutable BEFORE UPDATE OF selected_voice ON generation_runs BEGIN SELECT RAISE(ABORT,'GENERATION_IMMUTABLE'); END;
CREATE TRIGGER voice_sample_rate BEFORE INSERT ON voice_samples BEGIN SELECT RAISE(ABORT,'VOICE_SAMPLE_RATE_LIMIT') WHERE (SELECT count(*) FROM voice_samples WHERE actor_id=NEW.actor_id AND julianday(created_at)>julianday(NEW.created_at)-1)>=60; END;
