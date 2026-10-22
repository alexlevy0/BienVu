-- Preserve historical reservations and their exact bonus; accept both catalogs
-- during the web rollout. New reservations use 24 / 50 / 130 bonus credits.
PRAGMA defer_foreign_keys=ON;
PRAGMA legacy_alter_table=ON;

CREATE TABLE billing_promotion_intents_v3(
 id TEXT PRIMARY KEY,promotion_id TEXT NOT NULL REFERENCES subscription_promotions(id),code TEXT NOT NULL,
 agency_id TEXT NOT NULL REFERENCES agencies(id),mode TEXT NOT NULL CHECK(mode IN ('test','live')),idempotency_key TEXT NOT NULL,
 plan TEXT NOT NULL CHECK(plan IN ('solo','agence','equipe','reseau')),bonus_credits INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','released','redeemed')),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(agency_id,mode,idempotency_key),FOREIGN KEY(agency_id,mode,idempotency_key) REFERENCES billing_checkouts(agency_id,mode,idempotency_key),
 CHECK((plan='solo' AND bonus_credits=10) OR (plan='agence' AND bonus_credits IN (20,24)) OR (plan='equipe' AND bonus_credits IN (40,50)) OR (plan='reseau' AND bonus_credits IN (100,130)))
);
INSERT INTO billing_promotion_intents_v3 SELECT * FROM billing_promotion_intents;
DROP TABLE billing_promotion_intents;
ALTER TABLE billing_promotion_intents_v3 RENAME TO billing_promotion_intents;
CREATE INDEX promotion_intents_code ON billing_promotion_intents(promotion_id,mode,state);
CREATE UNIQUE INDEX promotion_one_agency ON billing_promotion_intents(agency_id,mode) WHERE state!='released';
CREATE TRIGGER promotion_reserve BEFORE INSERT ON billing_promotion_intents BEGIN
 SELECT RAISE(ABORT,'PROMOTION_INVALID') WHERE NOT EXISTS(SELECT 1 FROM subscription_promotions p WHERE p.id=NEW.promotion_id AND p.code=NEW.code AND p.active=1
  AND (p.starts_at IS NULL OR p.starts_at<=NEW.created_at) AND (p.ends_at IS NULL OR p.ends_at>NEW.created_at)
  AND EXISTS(SELECT 1 FROM json_each(p.plans_json) WHERE value=NEW.plan)
  AND (p.max_redemptions IS NULL OR (SELECT count(*) FROM billing_promotion_intents i WHERE i.promotion_id=p.id AND i.mode=NEW.mode AND i.state!='released')<p.max_redemptions));
 SELECT RAISE(ABORT,'PROMOTION_USED') WHERE EXISTS(SELECT 1 FROM billing_promotion_intents WHERE agency_id=NEW.agency_id AND mode=NEW.mode AND state!='released');
 SELECT RAISE(ABORT,'PROMOTION_INVALID') WHERE NEW.state!='reserved';
END;
CREATE TRIGGER promotion_intent_immutable BEFORE UPDATE OF id,promotion_id,code,agency_id,mode,idempotency_key,plan,bonus_credits,created_at ON billing_promotion_intents BEGIN SELECT RAISE(ABORT,'PROMOTION_IMMUTABLE'); END;
CREATE TRIGGER promotion_intent_state BEFORE UPDATE OF state ON billing_promotion_intents WHEN NEW.state!=OLD.state AND (OLD.state!='reserved' OR NEW.state NOT IN ('released','redeemed')) BEGIN SELECT RAISE(ABORT,'PROMOTION_IMMUTABLE'); END;
PRAGMA legacy_alter_table=OFF;
PRAGMA defer_foreign_keys=OFF;
