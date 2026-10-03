CREATE TABLE agency_members(agency_id TEXT NOT NULL REFERENCES agencies(id),user_id TEXT NOT NULL REFERENCES auth_user(id),role TEXT NOT NULL CHECK(role IN ('owner','admin','editor','viewer')),created_at TEXT NOT NULL,PRIMARY KEY(agency_id,user_id));
INSERT INTO agency_members SELECT a.id,a.owner_user_id,'owner',a.created_at FROM agencies a JOIN auth_user u ON u.id=a.owner_user_id;
CREATE INDEX agency_members_user ON agency_members(user_id,agency_id);
CREATE TABLE agency_invitations(id TEXT PRIMARY KEY,agency_id TEXT NOT NULL REFERENCES agencies(id),email TEXT NOT NULL COLLATE NOCASE,role TEXT NOT NULL CHECK(role IN ('admin','editor','viewer')),token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),status TEXT NOT NULL CHECK(status IN ('pending','accepted','revoked')),expires_at TEXT NOT NULL,created_at TEXT NOT NULL,accepted_by TEXT REFERENCES auth_user(id));
CREATE INDEX agency_invites_agency ON agency_invitations(agency_id,status,expires_at);
CREATE TRIGGER agency_owner_preserved BEFORE DELETE ON agency_members WHEN OLD.role='owner' BEGIN SELECT RAISE(ABORT,'TEAM_OWNER_REQUIRED'); END;
CREATE TRIGGER agency_owner_role_preserved BEFORE UPDATE OF role ON agency_members WHEN OLD.role='owner' OR NEW.role='owner' BEGIN SELECT RAISE(ABORT,'TEAM_OWNER_REQUIRED'); END;
CREATE TRIGGER agency_member_limit BEFORE INSERT ON agency_members WHEN (SELECT count(*) FROM agency_members WHERE agency_id=NEW.agency_id)>=20 AND NOT EXISTS(SELECT 1 FROM agency_members WHERE agency_id=NEW.agency_id AND user_id=NEW.user_id) BEGIN SELECT RAISE(ABORT,'TEAM_LIMIT'); END;
