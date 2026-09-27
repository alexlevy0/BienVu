import {AgencyProfile, AgencyUpdate, EntityId} from '@bienvu/contracts';
import type {Database} from './index';

const columns = `id, owner_user_id AS ownerUserId, name, logo_asset_id AS logoAssetId,
  primary_color AS primaryColor, secondary_color AS secondaryColor, phone, email, website,
  created_at AS createdAt, updated_at AS updatedAt, brand_version AS brandVersion`;

export async function agencyForUser(db: Database, userId: string): Promise<AgencyProfile | null> {
  EntityId.parse(userId);
  const row = await db.prepare(`SELECT ${columns} FROM agencies WHERE owner_user_id = ?`).bind(userId).first();
  return row ? AgencyProfile.parse(row) : null;
}

export async function ensureAgency(db: Database, user: {id: string; email: string}): Promise<AgencyProfile> {
  EntityId.parse(user.id);
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO agencies (id,owner_user_id,name,email,created_at,updated_at)
    SELECT ?,id,'Mon agence',email,?,? FROM auth_user WHERE id = ? AND emailVerified = 1
    ON CONFLICT(owner_user_id) DO NOTHING`).bind(crypto.randomUUID(), now, now, user.id).run();
  const agency = await agencyForUser(db, user.id);
  if (!agency) throw new Error('VERIFIED_OWNER_REQUIRED');
  // Rejouable après interruption : aucune allocation ni génération n'est accordée.
  await db.prepare(`INSERT INTO trial_claims(owner_user_id,agency_id) VALUES(?,?)
    ON CONFLICT(owner_user_id) DO NOTHING`).bind(user.id, agency.id).run();
  return agency;
}

export async function updateAgency(db: Database, userId: string, input: AgencyUpdate): Promise<AgencyProfile> {
  const brand = AgencyUpdate.parse(input);
  const row = await db.prepare(`UPDATE agencies SET name=?,primary_color=?,secondary_color=?,phone=?,email=?,website=?,
    updated_at=?,brand_version=brand_version+1 WHERE owner_user_id=? RETURNING ${columns}`)
    .bind(brand.name, brand.primaryColor, brand.secondaryColor, brand.phone, brand.email, brand.website,
      new Date().toISOString(), EntityId.parse(userId)).first();
  return AgencyProfile.parse(row);
}

export async function allowAgencyWrite(db: Database, userId: string, action: 'brand' | 'logo', now = Date.now()): Promise<boolean> {
  const minute = Math.floor(now / 60_000);
  const row = await db.prepare(`INSERT INTO agency_write_limits(owner_user_id,action,minute,count) VALUES(?,?,?,1)
    ON CONFLICT(owner_user_id,action) DO UPDATE SET minute=excluded.minute,
      count=CASE WHEN agency_write_limits.minute=excluded.minute THEN agency_write_limits.count+1 ELSE 1 END
    RETURNING count`).bind(userId, action, minute).first<{count: number}>();
  return Boolean(row && row.count <= (action === 'logo' ? 6 : 30));
}

export async function findAgencyLogo(db: Database, agencyId: string, assetId: string) {
  if (!EntityId.safeParse(assetId).success) return null;
  return db.prepare(`SELECT id,object_key AS objectKey,content_hash AS contentHash,size_bytes AS sizeBytes,
    width,height FROM media_assets WHERE id=? AND agency_id=? AND kind='brand'`)
    .bind(assetId, agencyId).first<{id: string; objectKey: string; contentHash: string; sizeBytes: number; width: number; height: number}>();
}
