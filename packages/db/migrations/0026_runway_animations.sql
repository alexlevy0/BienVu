-- No live budget is opened by migration. A purchased API top-up is accounted
-- once in the service budget; per-clip reservations consume that prepaid pool.
CREATE TABLE runway_budget (
  month TEXT PRIMARY KEY NOT NULL REFERENCES hosted_import_budget(month),
  prepaid_cents INTEGER NOT NULL CHECK(prepaid_cents BETWEEN 1 AND 1000),
  api_credits INTEGER NOT NULL CHECK(api_credits BETWEEN 25 AND 1000),
  paused INTEGER NOT NULL DEFAULT 1 CHECK(paused IN (0,1)),
  created_at TEXT NOT NULL
);
CREATE TRIGGER runway_prepaid_admit BEFORE INSERT ON runway_budget
BEGIN
  SELECT RAISE(ABORT,'RUNWAY_BUDGET_LIMIT') WHERE NOT EXISTS(SELECT 1 FROM hosted_import_budget b WHERE b.month=NEW.month AND b.paused=0
    AND b.baseline_cents+NEW.prepaid_cents+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=b.month)<=b.ceiling_cents);
END;
CREATE TRIGGER runway_prepaid_account AFTER INSERT ON runway_budget
BEGIN UPDATE hosted_import_budget SET baseline_cents=baseline_cents+NEW.prepaid_cents WHERE month=NEW.month; END;
CREATE TRIGGER runway_prepaid_immutable BEFORE UPDATE OF month,prepaid_cents,api_credits ON runway_budget
BEGIN SELECT RAISE(ABORT,'RUNWAY_BUDGET_IMMUTABLE'); END;
CREATE TABLE photo_animations (
  id TEXT PRIMARY KEY NOT NULL, agency_id TEXT NOT NULL, job_id TEXT NOT NULL REFERENCES generation_runs(job_id),
  photo_id TEXT NOT NULL, source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
  slot INTEGER NOT NULL CHECK(slot BETWEEN 0 AND 1), month TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('real','mock')), model TEXT NOT NULL CHECK(model='gen4_turbo'),
  credits INTEGER NOT NULL CHECK(credits=25), reserved_cents INTEGER NOT NULL CHECK(reserved_cents IN (0,35)),
  state TEXT NOT NULL CHECK(state IN ('submitting','submitted','ready','failed','uncertain')),
  task_id TEXT, error_code TEXT, animation_json TEXT CHECK(animation_json IS NULL OR json_valid(animation_json)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(job_id,slot), UNIQUE(job_id,photo_id), FOREIGN KEY(agency_id,job_id) REFERENCES jobs(agency_id,id),
  CHECK((mode='real' AND reserved_cents=35) OR (mode='mock' AND reserved_cents=0))
);
CREATE INDEX photo_animations_month ON photo_animations(month,mode);
CREATE TRIGGER runway_clip_admit BEFORE INSERT ON photo_animations
BEGIN
  SELECT RAISE(ABORT,'RUNWAY_JOB_INACTIVE') WHERE NOT EXISTS(SELECT 1 FROM generation_runs g JOIN jobs j ON j.id=g.job_id
    WHERE g.job_id=NEW.job_id AND g.agency_id=NEW.agency_id AND g.month=NEW.month AND g.retention='available'
    AND g.deadline>NEW.created_at AND j.status NOT IN ('ready','failed')
    AND NEW.slot<coalesce(json_extract(g.input_json,'$.customization.runwayClips'),0));
  SELECT RAISE(ABORT,'RUNWAY_BUDGET_LIMIT') WHERE NEW.mode='real' AND NOT EXISTS(SELECT 1 FROM runway_budget r JOIN hosted_import_budget b ON b.month=r.month
    WHERE r.month=NEW.month AND r.paused=0 AND b.paused=0
    AND b.baseline_cents+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=b.month)<=b.ceiling_cents
    AND (SELECT coalesce(sum(reserved_cents),0) FROM photo_animations WHERE month=r.month AND mode='real')+NEW.reserved_cents<=r.prepaid_cents
    AND (SELECT coalesce(sum(credits),0) FROM photo_animations WHERE month=r.month AND mode='real')+NEW.credits<=r.api_credits);
END;
