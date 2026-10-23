import {
  ShowcaseConfig,
  type ShowcaseStoredProperty,
  type ShowcaseItem,
  type ShowcaseConfig as Config,
} from '@bienvu/contracts';
import type { Database } from './index';
export type ShowcaseRow = {
  agencyId: string;
  status: 'draft' | 'published' | 'offline';
  draft: Config;
  published: Config | null;
  version: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
type RawShowcase = {
  agencyId: string;
  status: ShowcaseRow['status'];
  draft: string;
  published: string | null;
  version: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
const columns =
  'agency_id AS agencyId,status,draft_json AS draft,published_json AS published,version,published_at AS publishedAt,created_at AS createdAt,updated_at AS updatedAt';
export async function readShowcase(db: Database, agencyId: string): Promise<ShowcaseRow | null> {
  const row = await db
    .prepare(`SELECT ${columns} FROM agency_showcases WHERE agency_id=?`)
    .bind(agencyId)
    .first<RawShowcase>();
  return row
    ? {
        ...row,
        draft: ShowcaseConfig.parse(JSON.parse(row.draft)),
        published: row.published ? ShowcaseConfig.parse(JSON.parse(row.published)) : null,
      }
    : null;
}
export async function readShowcaseItems(db: Database, agencyId: string): Promise<ShowcaseItem[]> {
  const rows = await db
    .prepare(`SELECT json_group_array(json_object('id',id,'propertyId',property_id,'draft',draft_json,'published',published_json,'removed',removed,'updatedAt',updated_at)) AS items
    FROM (SELECT * FROM showcase_properties WHERE agency_id=? ORDER BY created_at,id LIMIT 500)`)
    .bind(agencyId)
    .first<{ items: string }>();
  return (
    JSON.parse(rows?.items ?? '[]') as {
      id: string;
      propertyId: string;
      draft: string;
      published: string | null;
      removed: number;
      updatedAt: string;
    }[]
  ).map((row) => ({
    ...row,
    removed: row.removed === 1,
    draft: JSON.parse(row.draft) as ShowcaseStoredProperty,
    published: row.published ? (JSON.parse(row.published) as ShowcaseStoredProperty) : null,
  }));
}
export async function showcaseSlugAvailable(db: Database, agencyId: string, slug: string) {
  const row = await db
    .prepare('SELECT agency_id AS agencyId FROM showcase_slugs WHERE slug=?')
    .bind(slug)
    .first<{ agencyId: string }>();
  return !row || row.agencyId === agencyId;
}
export async function showcaseLimit(db: Database, scope: string, max: number, windowMs: number, now = Date.now()) {
  const bucket = Math.floor(now / windowMs),
    row = await db
      .prepare(`INSERT INTO showcase_limits(id,count,expires_at) VALUES(?,1,?)
    ON CONFLICT(id) DO UPDATE SET count=count+1 WHERE count<? RETURNING count`)
      .bind(`${scope}:${bucket}`, (bucket + 1) * windowMs, max)
      .first();
  return Boolean(row);
}
export async function withdrawShowcaseProperties(
  db: Database,
  agencyId: string,
  aliases: string[],
  now = new Date().toISOString(),
) {
  await db
    .prepare(
      'UPDATE showcase_properties SET removed=1,published_json=NULL,updated_at=? WHERE agency_id=? AND property_id IN (SELECT value FROM json_each(?))',
    )
    .bind(now, agencyId, JSON.stringify(aliases))
    .run();
}
