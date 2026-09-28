import {EntityId} from '@bienvu/contracts';
import type {Database} from './index';
import {ImportStateFailure} from './imports';

// Réservation prudente, distincte d'une facture et des crédits vidéo clients.
export async function reserveHostedImport(db: Database, agencyId: string, importId: string, now = Date.now()) {
  EntityId.parse(agencyId); EntityId.parse(importId);
  const at = new Date(now).toISOString(), month = at.slice(0, 7);
  await db.prepare(`INSERT INTO hosted_import_costs(import_id,agency_id,month,created_at)
    SELECT ?,?,?,? FROM hosted_import_budget b
    WHERE b.month=? AND b.paused=0 AND b.baseline_cents+50+
      (SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=b.month)<=b.ceiling_cents
    AND EXISTS(SELECT 1 FROM listing_imports WHERE id=? AND agency_id=? AND status='importing' AND lease_until>?)
    ON CONFLICT(import_id) DO NOTHING`).bind(importId, agencyId, month, at, month, importId, agencyId, at).run();
  const found = await db.prepare(`SELECT import_id FROM hosted_import_costs WHERE import_id=? AND agency_id=? AND month=?`)
    .bind(importId, agencyId, month).first();
  if (!found) throw new ImportStateFailure('IMPORT_LIMIT');
}
export async function claimHostedResource(db: Database, agencyId: string, importId: string, bytes: number, now = Date.now()) {
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > 10 * 1024 * 1024) throw new ImportStateFailure('IMPORT_LIMIT');
  const at = new Date(now).toISOString();
  const row = await db.prepare(`UPDATE hosted_import_costs SET requests=requests+1,source_bytes=source_bytes+?
    WHERE import_id=? AND agency_id=? AND month=? AND requests<48 AND source_bytes+?<=52428800
      AND EXISTS(SELECT 1 FROM hosted_import_budget WHERE month=? AND paused=0)
      AND EXISTS(SELECT 1 FROM listing_imports WHERE id=? AND agency_id=? AND status='importing' AND lease_until>?)
    RETURNING requests`).bind(bytes, importId, agencyId, at.slice(0, 7), bytes, at.slice(0, 7), importId, agencyId, at).first();
  if (!row) throw new ImportStateFailure('IMPORT_LIMIT');
}
export async function settleHostedResource(db: Database, importId: string, reserved: number, received: number) {
  if (!Number.isSafeInteger(received) || received < 0 || received > reserved) throw new ImportStateFailure('IMPORT_LIMIT');
  await db.prepare('UPDATE hosted_import_costs SET source_bytes=source_bytes-? WHERE import_id=?')
    .bind(reserved - received, importId).run();
}
export async function claimHostedBrowser(db: Database, agencyId: string, importId: string, now = Date.now()) {
  const at = new Date(now).toISOString();
  const cost = await db.prepare(`UPDATE hosted_import_costs SET browser_started=1 WHERE import_id=? AND agency_id=? AND browser_started=0 AND month=?
    AND EXISTS(SELECT 1 FROM hosted_import_budget WHERE month=? AND paused=0)
    AND EXISTS(SELECT 1 FROM listing_imports WHERE id=? AND agency_id=? AND status='importing' AND lease_until>?) RETURNING import_id`)
    .bind(importId, agencyId, at.slice(0, 7), at.slice(0, 7), importId, agencyId, at).first();
  if (!cost) throw new ImportStateFailure('IMPORT_LIMIT');
  const lock = await db.prepare('UPDATE hosted_browser_slot SET lease_id=?,lease_until=? WHERE id=1 AND lease_until<? RETURNING id')
    .bind(importId, now + 120_000, now).first();
  if (!lock) throw new ImportStateFailure('IMPORT_LIMIT');
}
export async function releaseHostedBrowser(db: Database, importId: string) {
  await db.prepare('UPDATE hosted_browser_slot SET lease_id=NULL,lease_until=0 WHERE id=1 AND lease_id=?').bind(importId).run();
}
