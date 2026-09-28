import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {importListing} from '../packages/importers/src/import-listing';
import {nodeImportTransport} from './import-transport';
import {beginImport, journalImportPhoto, completeImport, failImport} from '../packages/db/src/imports';
import {ImportFailure} from '../packages/contracts/src/index';

// Échantillon fermé : trois sources, trois photos retenues au plus, aucune relance.
const cases = [
  {name: 'espaces-atypiques', url: 'https://www.espaces-atypiques.com/ventes/69007-lyon-ancien-renove-au-coeur-du-7eme-14713/'},
  {name: 'orpi', url: 'https://www.orpi.com/annonce-vente-appartement-t2-paris-12-75012-ddbf1828-1eb9-4ebe-885c-85f7e30057f1/'},
  {name: 'century21', url: 'https://www.century21.fr/trouver_logement/detail/16965965448/'},
];
if (!process.argv.includes('--real')) throw new Error('Passer --real pour consulter les trois sources publiques depuis Node local.');
const folder = 'evidence/local/sprint-03/real';
await mkdir(folder, {recursive: true});
const mf = new Miniflare(convertV4MiniflareOptions({modules: true, script: 'export default {fetch(){return new Response("local")}}',
  compatibilityDate: '2026-09-27', d1Databases: ['DB'], r2Buckets: ['MEDIA']}));
const {DB, MEDIA} = await mf.getBindings<Pick<CloudflareEnv, 'DB' | 'MEDIA'>>();
const report: Record<string, unknown> = {at: new Date().toISOString(), mode: 'real-public-https-from-local-node',
  storage: 'real-local-D1-R2-Miniflare-isolated', browserRun: 'not-used', cloudflareRemote: 'not-tested',
  paidCalls: 0, marginalProviderCostEUR: 0, invoiceChecked: false, attempts: []};
try {
  for (const file of (await readdir('packages/db/migrations')).filter(f => f.endsWith('.sql')).sort())
    await DB.exec((await readFile(`packages/db/migrations/${file}`, 'utf8')).replace(/^--.*$/gm, '').replace(/\n/g, ' '));
  const at = new Date().toISOString();
  await DB.prepare("INSERT INTO agencies(id,owner_user_id,name,created_at,updated_at) VALUES('real-local-probe','fixture-owner','Recette locale',?,?)").bind(at, at).run();
  for (const sample of cases) {
    const start = Date.now(), context = (await beginImport(DB, 'real-local-probe', sample.url, `real-sample-${sample.name}-001`)).row;
    try {
      const value = await importListing(sample.url, {agencyId: context.agencyId, importId: context.id}, {transport: nodeImportTransport(),
        store: async (photo, bytes) => {await journalImportPhoto(DB, context.agencyId, context.id, photo);
          await MEDIA.put(photo.objectKey, bytes, {customMetadata: {sha256: photo.contentHash}});
          const stored = await MEDIA.get(photo.objectKey); if (!stored || stored.size !== bytes.length) throw new Error('R2_READBACK_FAILED');
          const path = `${folder}/${sample.name}-${photo.sourceOrder + 1}.jpg`; await writeFile(path, new Uint8Array(await stored.arrayBuffer()));
        }}, {maxPhotos: 3});
      await completeImport(DB, value.listing, value.diagnostics);
      await writeFile(`${folder}/${sample.name}.json`, JSON.stringify(value, null, 2));
      (report.attempts as unknown[]).push({...sample, outcome: 'success', ...value});
      console.log(`${sample.name} : ${value.listing.photos.length} photos, ${Date.now() - start} ms, R2 local relu.`);
    } catch (error) {
      const code = error instanceof ImportFailure ? error.code : 'SOURCE_UNAVAILABLE';
      await failImport(DB, context.agencyId, context.id, code, {});
      (report.attempts as unknown[]).push({...sample, outcome: 'failed', code, durationMs: Date.now() - start,
        diagnostics: error && typeof error === 'object' && 'diagnostics' in error ? error.diagnostics : null});
      console.log(`${sample.name} : ${code}, aucune relance.`);
    }
  }
  report.cleanedLocalStorage = true;
} finally {
  await mf.dispose();
  await writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2));
}
