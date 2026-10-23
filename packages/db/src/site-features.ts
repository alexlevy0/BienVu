import { AdminSiteFeatures, SiteFeatures } from '@bienvu/contracts';
import type { Database } from './index';

export async function siteFeatures(db: Database) {
  const row = await db
    .prepare('SELECT features_json AS features,revision,updated_at AS updatedAt FROM site_feature_settings WHERE id=1')
    .first<{ features: string; revision: number; updatedAt: string }>();
  if (!row) throw Error('SITE_FEATURE_SETTINGS_MISSING');
  return AdminSiteFeatures.parse({ ...row, features: JSON.parse(row.features) });
}
export async function setSiteFeatures(
  db: Database,
  actorId: string,
  features: SiteFeatures,
  revision: number,
  now = Date.now(),
) {
  const selected = SiteFeatures.parse(features);
  await db
    .prepare(
      'INSERT INTO site_feature_events(id,actor_id,features_json,expected_revision,created_at) VALUES(?,?,?,?,?)',
    )
    .bind(crypto.randomUUID(), actorId, JSON.stringify(selected), revision, new Date(now).toISOString())
    .run();
  return siteFeatures(db);
}
