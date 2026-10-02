-- A real verification may use an isolated database so it never consumes a
-- customer's import allowance. Its prepaid credits remain reserved here.
CREATE TABLE runway_external_verifications (
  id TEXT PRIMARY KEY NOT NULL,
  month TEXT NOT NULL REFERENCES runway_budget(month),
  credits INTEGER NOT NULL CHECK(credits=25),
  reserved_cents INTEGER NOT NULL CHECK(reserved_cents=35),
  task_id TEXT,
  state TEXT NOT NULL CHECK(state IN ('reserved','submitted','ready','failed','uncertain')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
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
CREATE TRIGGER runway_external_immutable BEFORE UPDATE OF id,month,credits,reserved_cents ON runway_external_verifications
BEGIN SELECT RAISE(ABORT,'RUNWAY_BUDGET_IMMUTABLE'); END;
DROP TRIGGER runway_clip_admit;
CREATE TRIGGER runway_clip_admit BEFORE INSERT ON photo_animations
BEGIN
  SELECT RAISE(ABORT,'RUNWAY_JOB_INACTIVE') WHERE NOT EXISTS(SELECT 1 FROM generation_runs g JOIN jobs j ON j.id=g.job_id
    WHERE g.job_id=NEW.job_id AND g.agency_id=NEW.agency_id AND g.month=NEW.month AND g.retention='available'
    AND g.deadline>NEW.created_at AND j.status NOT IN ('ready','failed')
    AND NEW.slot<coalesce(json_extract(g.input_json,'$.customization.runwayClips'),0));
  SELECT RAISE(ABORT,'RUNWAY_BUDGET_LIMIT') WHERE NEW.mode='real' AND NOT EXISTS(SELECT 1 FROM runway_budget r JOIN hosted_import_budget b ON b.month=r.month
    WHERE r.month=NEW.month AND r.paused=0 AND b.paused=0
    AND b.baseline_cents+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=b.month)<=b.ceiling_cents
    AND (SELECT coalesce(sum(reserved_cents),0) FROM photo_animations WHERE month=r.month AND mode='real')
      +(SELECT coalesce(sum(reserved_cents),0) FROM runway_external_verifications WHERE month=r.month)+NEW.reserved_cents<=r.prepaid_cents
    AND (SELECT coalesce(sum(credits),0) FROM photo_animations WHERE month=r.month AND mode='real')
      +(SELECT coalesce(sum(credits),0) FROM runway_external_verifications WHERE month=r.month)+NEW.credits<=r.api_credits);
END;
