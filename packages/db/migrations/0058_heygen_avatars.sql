-- Optional HeyGen avatars. Existing video credits and manifests are unchanged.
CREATE TABLE avatar_settings(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL DEFAULT 1,settings_json TEXT NOT NULL CHECK(json_valid(settings_json)),updated_at TEXT NOT NULL);
INSERT INTO avatar_settings VALUES(1,1,'{"enabled":false,"allowPremium":false,"defaultLookId":null,"maxSeconds":6,"monthlyUsd":5,"perVideoUsd":1,"concurrent":2,"priceIII":0.99,"priceIVPhoto":2.31,"priceIVStudio":4.83}',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE avatar_audit(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),created_at TEXT NOT NULL);
CREATE TABLE avatar_setting_events(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,settings_json TEXT NOT NULL CHECK(json_valid(settings_json)),expected_revision INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE TRIGGER avatar_setting_cas BEFORE INSERT ON avatar_setting_events BEGIN
 SELECT RAISE(ABORT,'CONFLICT') WHERE NOT EXISTS(SELECT 1 FROM avatar_settings WHERE id=1 AND revision=NEW.expected_revision);
 SELECT RAISE(ABORT,'RATE_LIMITED') WHERE (SELECT count(*) FROM avatar_setting_events WHERE actor_id=NEW.actor_id AND created_at>strftime('%Y-%m-%dT%H:%M:%fZ',NEW.created_at,'-1 minute'))>=20;
END;
CREATE TRIGGER avatar_setting_apply AFTER INSERT ON avatar_setting_events BEGIN
 UPDATE avatar_settings SET settings_json=NEW.settings_json,revision=revision+1,updated_at=NEW.created_at WHERE id=1;
 INSERT INTO avatar_audit VALUES(NEW.id,NEW.actor_id,'settings_updated','settings',NEW.settings_json,NEW.created_at);
END;
CREATE TRIGGER avatar_audit_immutable BEFORE UPDATE ON avatar_audit BEGIN SELECT RAISE(ABORT,'AVATAR_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER avatar_audit_no_delete BEFORE DELETE ON avatar_audit BEGIN SELECT RAISE(ABORT,'AVATAR_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER avatar_events_immutable BEFORE UPDATE ON avatar_setting_events BEGIN SELECT RAISE(ABORT,'AVATAR_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER avatar_events_no_delete BEFORE DELETE ON avatar_setting_events BEGIN SELECT RAISE(ABORT,'AVATAR_AUDIT_IMMUTABLE'); END;
CREATE TABLE avatar_looks(id TEXT PRIMARY KEY,look_json TEXT NOT NULL CHECK(json_valid(look_json)),source_json TEXT NOT NULL CHECK(json_valid(source_json)),enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL);
ALTER TABLE generation_runs ADD COLUMN avatar_credits INTEGER NOT NULL DEFAULT 0 CHECK(avatar_credits BETWEEN 0 AND 1);
ALTER TABLE generation_runs ADD COLUMN avatar_config_json TEXT CHECK(avatar_config_json IS NULL OR json_valid(avatar_config_json));
CREATE TRIGGER generation_avatar_immutable BEFORE UPDATE OF avatar_credits,avatar_config_json ON generation_runs BEGIN SELECT RAISE(ABORT,'CREDIT_PRICING_IMMUTABLE'); END;
CREATE TABLE avatar_credit_parts(job_id TEXT NOT NULL REFERENCES generation_runs(job_id),agency_id TEXT NOT NULL REFERENCES agencies(id),allocation_id TEXT NOT NULL,
 priority INTEGER NOT NULL CHECK(priority IN (0,1)),amount INTEGER NOT NULL CHECK(amount=1),consumed INTEGER NOT NULL DEFAULT 0 CHECK(consumed BETWEEN 0 AND amount),settled INTEGER NOT NULL DEFAULT 0 CHECK(settled IN (0,1)),
 PRIMARY KEY(job_id,allocation_id),FOREIGN KEY(agency_id,allocation_id) REFERENCES allocations(agency_id,id));
CREATE TRIGGER avatar_credit_guard BEFORE INSERT ON avatar_credit_parts BEGIN
 SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NOT EXISTS(SELECT 1 FROM spendable_credit_sources WHERE id=NEW.allocation_id AND agency_id=NEW.agency_id AND available>=NEW.amount AND enabled=1);
END;
CREATE TRIGGER avatar_credit_reserve AFTER INSERT ON avatar_credit_parts BEGIN UPDATE allocations SET reserved=reserved+NEW.amount WHERE id=NEW.allocation_id AND agency_id=NEW.agency_id; END;
CREATE TRIGGER avatar_credit_settle AFTER UPDATE OF settled ON avatar_credit_parts WHEN OLD.settled=0 AND NEW.settled=1 BEGIN
 UPDATE allocations SET reserved=reserved-NEW.amount,consumed=consumed+NEW.consumed WHERE id=NEW.allocation_id AND agency_id=NEW.agency_id;
END;
CREATE TRIGGER avatar_credit_immutable BEFORE UPDATE ON avatar_credit_parts WHEN OLD.settled=1 OR NEW.job_id!=OLD.job_id OR NEW.agency_id!=OLD.agency_id OR NEW.allocation_id!=OLD.allocation_id OR NEW.amount!=OLD.amount OR NEW.priority!=OLD.priority OR NEW.settled!=1 BEGIN SELECT RAISE(ABORT,'CREDIT_PRICING_IMMUTABLE'); END;
CREATE TABLE avatar_tasks(id TEXT PRIMARY KEY,agency_id TEXT NOT NULL,job_id TEXT NOT NULL REFERENCES generation_runs(job_id),moment TEXT NOT NULL CHECK(moment IN ('intro','outro')),
 cache_key TEXT NOT NULL CHECK(length(cache_key)=64),audio_json TEXT NOT NULL CHECK(json_valid(audio_json)),start_frame INTEGER NOT NULL CHECK(start_frame BETWEEN 0 AND 1199),
 state TEXT NOT NULL CHECK(state IN ('claimed','submitting','submitted','ready','failed','uncertain')),provider_id TEXT UNIQUE,audio_asset_id TEXT,
 engine TEXT NOT NULL CHECK(engine IN ('avatar_iii','avatar_iv')),mode TEXT NOT NULL CHECK(mode IN ('real','mock')),reused INTEGER NOT NULL DEFAULT 0 CHECK(reused IN (0,1)),
 reserved_micros INTEGER NOT NULL CHECK(reserved_micros>=0),result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),error_code TEXT,
 poll_after TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(job_id,moment),FOREIGN KEY(agency_id,job_id) REFERENCES jobs(agency_id,id));
CREATE INDEX avatar_tasks_poll ON avatar_tasks(state,poll_after);
CREATE INDEX avatar_tasks_budget ON avatar_tasks(created_at,mode);
CREATE TABLE avatar_library(agency_id TEXT NOT NULL REFERENCES agencies(id),cache_key TEXT NOT NULL,origin_job_id TEXT NOT NULL REFERENCES generation_runs(job_id),clip_json TEXT NOT NULL CHECK(json_valid(clip_json)),created_at TEXT NOT NULL,expires_at TEXT NOT NULL,PRIMARY KEY(agency_id,cache_key));
CREATE TRIGGER avatar_task_guard BEFORE INSERT ON avatar_tasks BEGIN
 SELECT RAISE(ABORT,'AVATAR_UNAVAILABLE') WHERE NEW.mode='real' AND NEW.reused=0 AND NEW.state NOT IN ('failed','ready') AND NOT EXISTS(SELECT 1 FROM avatar_settings WHERE id=1 AND json_extract(settings_json,'$.enabled')=1);
 SELECT RAISE(ABORT,'AVATAR_JOB_INACTIVE') WHERE NOT EXISTS(SELECT 1 FROM generation_runs g JOIN jobs j ON j.id=g.job_id WHERE g.job_id=NEW.job_id AND g.agency_id=NEW.agency_id AND g.avatar_credits>0 AND g.retention='available' AND g.deadline>NEW.created_at AND j.status NOT IN ('ready','failed'));
 SELECT RAISE(ABORT,'AVATAR_BUDGET_LIMIT') WHERE NEW.mode='real' AND NEW.reused=0 AND NEW.state NOT IN ('failed','ready') AND (
  (SELECT coalesce(sum(reserved_micros),0) FROM avatar_tasks WHERE mode='real' AND substr(created_at,1,7)=substr(NEW.created_at,1,7))+NEW.reserved_micros>1000000*(SELECT json_extract(settings_json,'$.monthlyUsd') FROM avatar_settings WHERE id=1)
  OR (SELECT coalesce(sum(reserved_micros),0) FROM avatar_tasks WHERE job_id=NEW.job_id)+NEW.reserved_micros>1000000*(SELECT json_extract(avatar_config_json,'$.settings.perVideoUsd') FROM generation_runs WHERE job_id=NEW.job_id));
 SELECT RAISE(ABORT,'AVATAR_BUSY') WHERE NEW.mode='real' AND NEW.reused=0 AND NEW.state NOT IN ('failed','ready') AND (SELECT count(*) FROM avatar_tasks t JOIN generation_runs g ON g.job_id=t.job_id WHERE t.mode='real' AND t.reused=0 AND t.state IN ('claimed','submitting','submitted') AND g.deadline>NEW.created_at)>=(SELECT json_extract(settings_json,'$.concurrent') FROM avatar_settings WHERE id=1);
END;
CREATE TRIGGER generation_avatar_admit BEFORE INSERT ON generation_runs BEGIN
 SELECT RAISE(ABORT,'AVATAR_LOGIN_REQUIRED') WHERE NEW.avatar_credits>0 AND NEW.anonymous_session_id IS NOT NULL;
 SELECT RAISE(ABORT,'VALIDATION_ERROR') WHERE NEW.avatar_credits!=IIF(json_type(NEW.input_json,'$.customization.avatar')='object' AND coalesce(json_extract(NEW.input_json,'$.customization.avatar.hidden'),0)=0,1,0);
 SELECT RAISE(ABORT,'AVATAR_UNAVAILABLE') WHERE NEW.avatar_credits>0 AND (NEW.funding_version!=1 OR NEW.credit_version!=1 OR NEW.avatar_config_json IS NULL OR coalesce(json_extract(NEW.input_json,'$.voiceEnabled'),1)=0 OR NOT EXISTS(SELECT 1 FROM avatar_settings WHERE id=1 AND json_extract(settings_json,'$.enabled')=1));
 SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NEW.avatar_credits>0 AND (SELECT coalesce(sum(available),0) FROM spendable_credit_sources WHERE agency_id=NEW.agency_id AND enabled=1 AND valid_from<=NEW.created_at AND valid_until>NEW.created_at AND (id=NEW.allocation_id OR purchased=1))<NEW.credits_total+NEW.avatar_credits;
END;

DROP TRIGGER generation_create;
CREATE TRIGGER generation_create AFTER INSERT ON generation_runs
BEGIN
  UPDATE generation_runs SET owner_agency_id=NEW.agency_id WHERE job_id=NEW.job_id AND anonymous_session_id IS NULL;
  UPDATE hosted_import_budget SET baseline_cents=baseline_cents+NEW.provision_cents+NEW.preview_provision_cents WHERE month=NEW.month;
  UPDATE allocations SET reserved=reserved+NEW.credits_total WHERE id=NEW.allocation_id AND agency_id=NEW.agency_id AND NEW.funding_version=0;
  INSERT INTO jobs(id,agency_id,listing_id,source_url,idempotency_key,status,stage,lease_until,workflow_id,reservation_id,created_at,updated_at)
    VALUES(NEW.job_id,NEW.agency_id,json_extract(NEW.input_json,'$.listingId'),coalesce(json_extract(NEW.input_json,'$.url'),''),
    NEW.idempotency_key,'queued','importing',NEW.deadline,'generation-'||NEW.job_id,NEW.reservation_id,NEW.created_at,NEW.created_at);
  INSERT INTO reservations(id,agency_id,job_id,allocation_id,status,created_at,updated_at,credit_amount)
    VALUES(NEW.reservation_id,NEW.agency_id,NEW.job_id,IIF(NEW.anonymous_session_id IS NULL,NEW.allocation_id,NULL),
    IIF(NEW.anonymous_session_id IS NULL,'reserved','unfunded'),NEW.created_at,NEW.created_at,NEW.credits_total);
  INSERT INTO generation_credit_parts(job_id,agency_id,allocation_id,priority,amount)
    SELECT NEW.job_id,NEW.agency_id,id,purchased,min(available,max(0,NEW.credits_total-before_amount)) FROM (
     SELECT id,purchased,available,coalesce(sum(available) OVER (ORDER BY purchased,valid_from,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS before_amount
     FROM spendable_credit_sources WHERE agency_id=NEW.agency_id AND enabled=1 AND available>0
     AND valid_from<=NEW.created_at AND valid_until>NEW.created_at AND (id=NEW.allocation_id OR purchased=1))
    WHERE NEW.funding_version=1 AND NEW.anonymous_session_id IS NULL AND before_amount<NEW.credits_total;
  SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NEW.funding_version=1 AND NEW.anonymous_session_id IS NULL
    AND (SELECT coalesce(sum(amount),0) FROM generation_credit_parts WHERE job_id=NEW.job_id)!=NEW.credits_total;
  UPDATE anonymous_sessions SET credits_reserved=credits_reserved+NEW.credits_total WHERE id=NEW.anonymous_session_id;
  INSERT INTO job_launch_intents(job_id,agency_id,workflow_id,status,created_at,updated_at)
    VALUES(NEW.job_id,NEW.agency_id,'generation-'||NEW.job_id,'pending',NEW.created_at,NEW.created_at);
  INSERT INTO generation_events VALUES(NEW.job_id,'requested',NEW.created_at);
  INSERT INTO avatar_credit_parts(job_id,agency_id,allocation_id,priority,amount)
    SELECT NEW.job_id,NEW.agency_id,id,purchased,min(available,max(0,NEW.avatar_credits-before_amount)) FROM (
      SELECT id,purchased,available,coalesce(sum(available) OVER (ORDER BY purchased,valid_from,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS before_amount
      FROM spendable_credit_sources WHERE agency_id=NEW.agency_id AND enabled=1 AND valid_from<=NEW.created_at AND valid_until>NEW.created_at AND (id=NEW.allocation_id OR purchased=1))
    WHERE NEW.avatar_credits>0 AND before_amount<NEW.avatar_credits AND available>0;
  SELECT RAISE(ABORT,'QUOTA_EXHAUSTED') WHERE NEW.avatar_credits!=(SELECT coalesce(sum(amount),0) FROM avatar_credit_parts WHERE job_id=NEW.job_id);
END;

CREATE TRIGGER generation_avatar_settle AFTER UPDATE OF status ON jobs WHEN OLD.status NOT IN ('ready','failed') AND NEW.status IN ('ready','failed') BEGIN
 UPDATE avatar_credit_parts SET settled=1,consumed=min(amount,max(0,
  (SELECT min(1,count(*)) FROM avatar_tasks t WHERE t.job_id=NEW.id AND t.state='ready' AND t.reused=0)
  -coalesce((SELECT sum(p.amount) FROM avatar_credit_parts p JOIN allocations a ON a.id=p.allocation_id JOIN allocations c ON c.id=avatar_credit_parts.allocation_id WHERE p.job_id=NEW.id AND (p.priority<avatar_credit_parts.priority OR p.priority=avatar_credit_parts.priority AND (a.valid_from<c.valid_from OR a.valid_from=c.valid_from AND a.id<c.id))),0))) WHERE job_id=NEW.id AND settled=0;
END;

DROP VIEW finance_video_summary;
DROP VIEW finance_supplier_costs;
DROP VIEW finance_expected_providers;
CREATE TABLE heygen_expenses_backup AS SELECT * FROM financial_expenses;
CREATE TABLE heygen_allocations_backup AS SELECT * FROM financial_expense_allocations;
DROP TRIGGER expense_allocation_guard;
DROP TABLE financial_expense_allocations;
DROP TABLE financial_expenses;
CREATE TABLE financial_expenses(
 id TEXT PRIMARY KEY,provider TEXT NOT NULL CHECK(provider IN ('openai','google','fish','cartesia','heygen','runway','cloudflare','other')),
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

INSERT INTO financial_expenses SELECT * FROM heygen_expenses_backup;
INSERT INTO financial_expense_allocations SELECT * FROM heygen_allocations_backup;
DROP TABLE heygen_allocations_backup;
DROP TABLE heygen_expenses_backup;
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
 UNION SELECT job_id,'runway' FROM photo_animations WHERE mode='real'
 UNION SELECT job_id,'heygen' FROM avatar_tasks WHERE mode='real' AND reused=0 AND reserved_micros>0;
CREATE VIEW finance_supplier_costs AS
 SELECT x.job_id,e.provider,sum(x.amount_micros*IIF(e.kind='credit_note',-1,1)) AS amount_micros,max(x.covers_provider) AS covered
 FROM financial_expense_allocations x JOIN financial_expenses e ON e.id=x.expense_id WHERE e.voided_at IS NULL GROUP BY x.job_id,e.provider;

DROP VIEW finance_credit_attribution;
DROP VIEW finance_credit_usage;
CREATE VIEW finance_credit_usage AS
 SELECT job_id,allocation_id,sum(used) AS used,created_at FROM (
  SELECT p.job_id,p.allocation_id,p.consumed AS used,g.created_at FROM generation_credit_parts p JOIN generation_runs g ON g.job_id=p.job_id WHERE p.consumed>0
  UNION ALL SELECT p.job_id,p.allocation_id,p.consumed,g.created_at FROM avatar_credit_parts p JOIN generation_runs g ON g.job_id=p.job_id WHERE p.consumed>0
  UNION ALL SELECT g.job_id,r.allocation_id,r.credit_used,g.created_at FROM generation_runs g JOIN reservations r ON r.job_id=g.job_id WHERE g.funding_version=0 AND r.credit_used>0 AND r.allocation_id IS NOT NULL
 ) GROUP BY job_id,allocation_id,created_at;
CREATE VIEW finance_credit_attribution AS
 WITH usage AS (SELECT u.*,sum(used) OVER(PARTITION BY allocation_id ORDER BY created_at,job_id ROWS UNBOUNDED PRECEDING) AS cumulative FROM finance_credit_usage u),
 paid AS (SELECT u.*,f.id AS receipt_id,f.mode,f.credits,f.fees_complete,f.disputed,
 CAST(f.revenue_ht_cents*10000*(max(0,f.gross_cents-f.refunded_cents-f.lost_cents))/f.gross_cents AS INTEGER) AS net_micros,f.fee_cents*10000 AS fee_micros
 FROM usage u JOIN financial_receipts f ON f.allocation_id=u.allocation_id)
 SELECT job_id,receipt_id,mode,used,disputed,
 CAST(net_micros*min(cumulative,credits)/credits AS INTEGER)-CAST(net_micros*min(cumulative-used,credits)/credits AS INTEGER) AS revenue_micros,
 CASE WHEN fees_complete=1 THEN CAST(fee_micros*min(cumulative,credits)/credits AS INTEGER)-CAST(fee_micros*min(cumulative-used,credits)/credits AS INTEGER) END AS fee_micros,
 IIF(fees_complete=0 OR disputed=1,1,0) AS incomplete FROM paid;
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
