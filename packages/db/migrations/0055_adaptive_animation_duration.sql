-- Preserve historical five-second clips and their journals. New clips reserve
-- the actual whole-second Gen-4 Turbo cost (5 API credits/s), with the existing
-- conservative cash provision (7 cents/s). Customer credit pricing is unchanged.
DROP VIEW finance_video_summary;
DROP VIEW finance_expected_providers;
DROP TRIGGER generation_settle;
DROP TRIGGER runway_external_admit;
DROP TRIGGER runway_clip_admit;
CREATE TABLE photo_animations_new (
 id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, job_id TEXT NOT NULL REFERENCES generation_runs(job_id),
 photo_id TEXT NOT NULL, source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
 slot INTEGER NOT NULL CHECK(slot BETWEEN 0 AND 11), month TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('real','mock')), model TEXT NOT NULL CHECK(model='gen4_turbo'),
 credits INTEGER NOT NULL CHECK(credits=duration_seconds*5), reserved_cents INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('submitting','submitted','ready','failed','uncertain')),
 task_id TEXT, error_code TEXT, animation_json TEXT CHECK(animation_json IS NULL OR json_valid(animation_json)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 duration_seconds INTEGER NOT NULL DEFAULT 5 CHECK(duration_seconds BETWEEN 2 AND 5),
 UNIQUE(job_id,slot), UNIQUE(job_id,photo_id), FOREIGN KEY(agency_id,job_id) REFERENCES jobs(agency_id,id),
 CHECK((mode='real' AND reserved_cents=duration_seconds*7) OR (mode='mock' AND reserved_cents=0))
);
INSERT INTO photo_animations_new SELECT *,5 FROM photo_animations;
DROP TABLE photo_animations;
ALTER TABLE photo_animations_new RENAME TO photo_animations;
CREATE INDEX photo_animations_month ON photo_animations(month,mode);
CREATE TRIGGER runway_clip_terms_immutable BEFORE UPDATE OF id,agency_id,job_id,photo_id,source_sha256,slot,month,mode,model,credits,reserved_cents,duration_seconds ON photo_animations
BEGIN SELECT RAISE(ABORT,'RUNWAY_BUDGET_IMMUTABLE'); END;
CREATE TABLE generation_animation_timing (
 job_id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, version INTEGER NOT NULL CHECK(version=1),
 photo_timeline_json TEXT NOT NULL CHECK(json_valid(photo_timeline_json) AND json_type(photo_timeline_json)='array' AND json_array_length(photo_timeline_json) BETWEEN 3 AND 12),
 created_at TEXT NOT NULL, FOREIGN KEY(agency_id,job_id) REFERENCES jobs(agency_id,id)
);
CREATE TRIGGER generation_animation_timing_admit BEFORE INSERT ON generation_animation_timing
BEGIN
 SELECT RAISE(ABORT,'RUNWAY_JOB_INACTIVE') WHERE NOT EXISTS(SELECT 1 FROM generation_runs g JOIN jobs j ON j.id=g.job_id
  WHERE g.job_id=NEW.job_id AND g.agency_id=NEW.agency_id AND g.retention='available' AND g.deadline>NEW.created_at AND j.status NOT IN ('ready','failed'));
END;
CREATE TRIGGER generation_animation_timing_immutable BEFORE UPDATE ON generation_animation_timing
BEGIN SELECT RAISE(ABORT,'GENERATION_IMMUTABLE'); END;
CREATE TRIGGER runway_clip_admit BEFORE INSERT ON photo_animations
BEGIN
  SELECT RAISE(ABORT,'RUNWAY_JOB_INACTIVE') WHERE NOT EXISTS(SELECT 1 FROM generation_runs g JOIN jobs j ON j.id=g.job_id
    WHERE g.job_id=NEW.job_id AND g.agency_id=NEW.agency_id AND g.month=NEW.month AND g.retention='available'
    AND g.deadline>NEW.created_at AND j.status NOT IN ('ready','failed')
    AND NEW.slot<coalesce(json_array_length(g.input_json,'$.customization.runwayPhotos'),json_extract(g.input_json,'$.customization.runwayClips'),0));
  SELECT RAISE(ABORT,'RUNWAY_BUDGET_LIMIT') WHERE NEW.mode='real' AND NOT EXISTS(SELECT 1 FROM runway_budget r JOIN hosted_import_budget b ON b.month=r.month
    WHERE r.month=NEW.month AND r.paused=0 AND b.paused=0
    AND b.baseline_cents+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=b.month)<=b.ceiling_cents
    AND (SELECT coalesce(sum(reserved_cents),0) FROM photo_animations WHERE month=r.month AND mode='real')
      +(SELECT coalesce(sum(reserved_cents),0) FROM runway_external_verifications WHERE month=r.month)+NEW.reserved_cents<=r.prepaid_cents
    AND (SELECT coalesce(sum(credits),0) FROM photo_animations WHERE month=r.month AND mode='real')
      +(SELECT coalesce(sum(credits),0) FROM runway_external_verifications WHERE month=r.month)+NEW.credits<=r.api_credits);
END;

CREATE TRIGGER runway_external_admit BEFORE INSERT ON runway_external_verifications
BEGIN
  SELECT RAISE(ABORT,'RUNWAY_BUDGET_LIMIT') WHERE NOT EXISTS(SELECT 1 FROM runway_budget r JOIN hosted_import_budget b ON b.month=r.month
    WHERE r.month=NEW.month AND r.paused=0 AND b.paused=0
    AND b.baseline_cents+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=b.month)<=b.ceiling_cents
    AND (SELECT coalesce(sum(reserved_cents),0) FROM photo_animations WHERE month=r.month AND mode='real')
      +(SELECT coalesce(sum(reserved_cents),0) FROM runway_external_verifications WHERE month=r.month)+NEW.reserved_cents<=r.prepaid_cents
    AND (SELECT coalesce(sum(credits),0) FROM photo_animations WHERE month=r.month AND mode='real')
      +(SELECT coalesce(sum(credits),0) FROM runway_external_verifications WHERE month=r.month)+NEW.credits<=r.api_credits);
END;

CREATE TRIGGER generation_settle AFTER UPDATE OF status ON jobs
WHEN OLD.status NOT IN ('ready','failed') AND NEW.status IN ('ready','failed') AND EXISTS(SELECT 1 FROM generation_runs WHERE job_id=NEW.id)
BEGIN
  UPDATE allocations SET reserved=reserved-(SELECT credit_amount FROM reservations WHERE job_id=NEW.id),consumed=consumed+(SELECT CASE WHEN g.credit_version=0 THEN IIF(NEW.status='ready',1,0) WHEN g.reuse_pricing=0 THEN IIF(NEW.status='ready',1+min(g.animations_requested,coalesce(json_array_length(v.manifest_json,'$.photoAnimations'),0)),0) ELSE IIF(NEW.status='ready',1,0)+min(g.animations_requested-g.animations_reused,(SELECT count(*) FROM photo_animations p WHERE p.job_id=g.job_id AND p.state='ready')) END FROM generation_runs g LEFT JOIN video_manifests v ON v.job_id=g.job_id WHERE g.job_id=NEW.id)
    WHERE id=(SELECT allocation_id FROM reservations WHERE job_id=NEW.id AND status='reserved') AND (SELECT funding_version FROM generation_runs WHERE job_id=NEW.id)=0;
  UPDATE reservations SET status=IIF(NEW.status='ready' OR (SELECT reuse_pricing FROM generation_runs WHERE job_id=NEW.id)=1 AND EXISTS(SELECT 1 FROM photo_animations WHERE job_id=NEW.id AND state='ready'),'consumed','released'),credit_used=(SELECT CASE WHEN g.credit_version=0 THEN IIF(NEW.status='ready',1,0) WHEN g.reuse_pricing=0 THEN IIF(NEW.status='ready',1+min(g.animations_requested,coalesce(json_array_length(v.manifest_json,'$.photoAnimations'),0)),0) ELSE IIF(NEW.status='ready',1,0)+min(g.animations_requested-g.animations_reused,(SELECT count(*) FROM photo_animations p WHERE p.job_id=g.job_id AND p.state='ready')) END FROM generation_runs g LEFT JOIN video_manifests v ON v.job_id=g.job_id WHERE g.job_id=NEW.id),updated_at=NEW.updated_at WHERE job_id=NEW.id AND status='reserved';
  UPDATE generation_credit_parts SET settled=1,consumed=min(amount,max(0,
    (SELECT credit_used FROM reservations WHERE job_id=NEW.id)-coalesce((SELECT sum(other.amount) FROM generation_credit_parts other
      JOIN allocations oa ON oa.id=other.allocation_id JOIN allocations current ON current.id=generation_credit_parts.allocation_id
      WHERE other.job_id=NEW.id AND (other.priority<generation_credit_parts.priority OR other.priority=generation_credit_parts.priority AND
       (oa.valid_from<current.valid_from OR oa.valid_from=current.valid_from AND oa.id<current.id))),0)))
    WHERE job_id=NEW.id AND settled=0;
  UPDATE job_launch_intents SET status='cancelled',updated_at=NEW.updated_at WHERE job_id=NEW.id AND status='pending';
  UPDATE anonymous_sessions SET credits_reserved=credits_reserved-(SELECT credits_total FROM generation_runs WHERE job_id=NEW.id),credits_consumed=credits_consumed+(NEW.status='ready') WHERE id=(SELECT anonymous_session_id FROM generation_runs WHERE job_id=NEW.id);
  UPDATE anonymous_sessions SET successes=successes+1 WHERE NEW.status='ready' AND id=(SELECT anonymous_session_id FROM generation_runs WHERE job_id=NEW.id);
  UPDATE generation_runs SET expires_at=strftime('%Y-%m-%dT%H:%M:%fZ',NEW.updated_at,'+'||(SELECT retention_hours FROM trial_policy WHERE id=1)||' hours')
    WHERE job_id=NEW.id AND owner_agency_id IS NULL AND retention='available';
  INSERT OR IGNORE INTO generation_events VALUES(NEW.id,NEW.status,NEW.updated_at);
END;

CREATE VIEW finance_expected_providers AS
 SELECT job_id,'cloudflare' AS provider FROM generation_runs
 UNION SELECT job_id,provider FROM narration_calls WHERE provider_mode='real'
 UNION SELECT job_id,'runway' FROM photo_animations WHERE mode='real';

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
