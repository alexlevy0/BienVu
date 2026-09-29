import {readFile, readdir} from 'node:fs/promises';
import {narrationBrand, narrationListing} from '../fixtures/narration';

// Base isolée de recette, jamais appeler ce seed sur un binding de production.
export async function migrateNarrationProbe(DB: D1Database) {
  await DB.exec('CREATE TABLE IF NOT EXISTS narration_probe_migrations(name TEXT PRIMARY KEY NOT NULL)');
  for (const file of (await readdir(new URL('../packages/db/migrations/', import.meta.url))).filter(f => /^\d{4}_[\w-]+\.sql$/.test(f)).sort()) {
    if (await DB.prepare('SELECT name FROM narration_probe_migrations WHERE name=?').bind(file).first()) continue;
    await DB.exec((await readFile(new URL(`../packages/db/migrations/${file}`, import.meta.url), 'utf8')).replace(/^--.*$/gm, '').replace(/\n/g, ' '));
    await DB.prepare('INSERT INTO narration_probe_migrations(name) VALUES(?)').bind(file).run();
  }
}
export async function seedNarrationFixture(DB: D1Database, label: string, manual = false) {
  if (!/^[a-z0-9-]{1,28}$/.test(label)) throw new Error('FIXTURE_LABEL_INVALID');
  const agencyId = `s05-${label}`, jobId = `job-${label}`, listingId = `listing-${label}`;
  if (await DB.prepare('SELECT id FROM jobs WHERE id=?').bind(jobId).first()) return {agencyId, jobId};
  const now = Date.now(), at = new Date(now).toISOString(), expires = new Date(now + 30 * 86400_000).toISOString();
  const listing = narrationListing(manual); listing.id = listingId; listing.agencyId = agencyId;
  for (const photo of listing.photos) {photo.agencyId = agencyId; photo.listingId = listingId; photo.objectKey = `agencies/${agencyId}/imports/${listingId}/${photo.id}.png`;}
  await DB.prepare(`INSERT INTO agencies(id,owner_user_id,name,phone,email,primary_color,secondary_color,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(agencyId, `owner-${label}`, narrationBrand.name, narrationBrand.phone, narrationBrand.email, narrationBrand.primaryColor, narrationBrand.secondaryColor, at, at).run();
  await DB.prepare(`INSERT INTO listing_imports(id,agency_id,idempotency_key,source_url,source_kind,input_json,input_hash,status,result_json,created_at,lease_until,expires_at)
    VALUES(?,?,?,?,?,?,?,'ready',?,?,?,?)`).bind(listingId, agencyId, `fixture-import-${label}`, listing.sourceUrl ?? '', listing.sourceKind,
      manual ? JSON.stringify({photos: listing.photos.map(p => ({sha256: p.contentHash}))}) : null, manual ? 'f'.repeat(64) : null, JSON.stringify(listing), at, expires, expires).run();
  await DB.prepare(`INSERT INTO listings(id,agency_id,source_kind,source_url,canonical_url,source_host,source_listing_id,fetched_at,adapter_version,transaction_kind,facts_json,description_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(listingId, agencyId, listing.sourceKind, listing.sourceUrl ?? '', listing.canonicalUrl ?? '', listing.sourceHost ?? '', listing.sourceListingId,
      listing.fetchedAt, listing.adapterVersion, listing.transaction, JSON.stringify(listing.facts), JSON.stringify(listing.description)).run();
  await DB.prepare(`INSERT INTO allocations(id,agency_id,kind,period_key,quota_limit,valid_from,valid_until) VALUES(?,?,'trial','lifetime',1,?,?)`).bind(`allocation-${label}`, agencyId, at, expires).run();
  await DB.batch([
    DB.prepare(`INSERT INTO jobs(id,agency_id,listing_id,source_url,idempotency_key,status,stage,reservation_id,created_at,updated_at)
      VALUES(?,?,?,?,?,'scripting','scripting',?,?,?)`).bind(jobId, agencyId, listingId, listing.sourceUrl ?? '', `fixture-job-${label}`, `reservation-${label}`, at, at),
    DB.prepare(`INSERT INTO reservations(id,agency_id,job_id,allocation_id,status,created_at,updated_at) VALUES(?,?,?,?,'reserved',?,?)`)
      .bind(`reservation-${label}`, agencyId, jobId, `allocation-${label}`, at, at),
  ]);
  return {agencyId, jobId};
}
