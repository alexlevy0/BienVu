import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {ImportFailure} from '../packages/contracts/src/index';
import {importListing} from '../packages/importers/src/import-listing';
import {nodeImportTransport} from './import-transport';
import {beginImport, journalImportPhoto, completeImport, failImport} from '../packages/db/src/imports';

// Échantillon daté, pas de découverte automatique ni de rafraîchissement en boucle.
const samples = [
  {name: 'figaro-sale', url: 'https://immobilier.lefigaro.fr/annonces/annonce-108944355.html'},
  {name: 'figaro-old-rent', url: 'https://immobilier.lefigaro.fr/annonces/annonce-107461633.html'},
  {name: 'figaro-rent', url: 'https://immobilier.lefigaro.fr/annonces/annonce-109267703.html'},
  {name: 'seloger-sale', url: 'https://www.seloger.com/annonce/achat/auvergne-rhone-alpes/rhone-69/lyon-69000/26M7SYHC5MVH'},
  {name: 'leboncoin-sale', url: 'https://www.leboncoin.fr/ad/ventes_immobilieres/3222183771'},
  {name: 'bienici-sale', url: 'https://www.bienici.com/annonce/vente/nice/appartement/2pieces/apimo-86775374'},
  {name: 'bienici-rent', url: 'https://www.bienici.com/annonce/location/clamart/appartement/2pieces/mgc-ancien-602_0602_009784'},
];
const [flag, name, ...extra] = process.argv.slice(2);
if (flag === '--list' && !name) {console.log(JSON.stringify(samples, null, 2)); process.exit(0);}
const sample = samples.find(s => s.name === name);
if (flag !== '--real' || !sample || extra.length) throw new Error('Usage : pnpm probe:portals --list | --real <nom>. Une seule annonce publique, depuis Node local.');
const at = new Date().toISOString(), base = `evidence/local/sprint-04/probes/${at.slice(0, 10)}`;
await mkdir(base, {recursive: true});
const folder = `${base}/${sample.name}`;
await mkdir(folder); // Refuse une seconde tentative du même cas ce jour UTC.
const report: Record<string, unknown> = {at, ...sample, mode: 'real-public-https-from-local-node',
  storage: 'isolated-local-D1-R2', browserRun: 'not-used', cloudflareRemote: 'not-tested', paidCalls: 0, invoiceChecked: false};
const mf = new Miniflare(convertV4MiniflareOptions({modules: true, script: 'export default {fetch(){return new Response("local")}}',
  compatibilityDate: '2026-09-27', d1Databases: ['DB'], r2Buckets: ['MEDIA']}));
try {
  const {DB, MEDIA} = await mf.getBindings<Pick<CloudflareEnv, 'DB' | 'MEDIA'>>();
  for (const file of (await readdir('packages/db/migrations')).filter(f => f.endsWith('.sql')).sort())
    await DB.exec((await readFile(`packages/db/migrations/${file}`, 'utf8')).replace(/^--.*$/gm, '').replace(/\n/g, ' '));
  await DB.prepare("INSERT INTO agencies(id,owner_user_id,name,created_at,updated_at) VALUES('portal-probe','fixture-owner','Recette portails',?,?)").bind(at, at).run();
  const context = (await beginImport(DB, 'portal-probe', sample.url, `portal-sample-${sample.name}`)).row;
  try {
    const result = await importListing(sample.url, {agencyId: context.agencyId, importId: context.id}, {transport: nodeImportTransport(),
      store: async (photo, bytes) => {
        await journalImportPhoto(DB, context.agencyId, context.id, photo);
        await MEDIA.put(photo.objectKey, bytes, {customMetadata: {sha256: photo.contentHash}});
        const stored = await MEDIA.get(photo.objectKey);
        if (!stored || stored.size !== bytes.length) throw new Error('R2_READBACK_FAILED');
        const readback = await stored.arrayBuffer();
        if (Buffer.from(await crypto.subtle.digest('SHA-256', readback)).toString('hex') !== photo.contentHash) throw new Error('R2_HASH_MISMATCH');
        await writeFile(`${folder}/photo-${photo.sourceOrder + 1}.jpg`, new Uint8Array(readback), {flag: 'wx'});
      }}, {maxPhotos: 3});
    await completeImport(DB, result.listing, result.diagnostics);
    Object.assign(report, {outcome: 'success-local-only', ...result});
    console.log(`${sample.name} : ${result.listing.photos.length} photos relues en R2 local. Contrôle visuel et Cloudflare distincts.`);
  } catch (error) {
    const code = error instanceof ImportFailure ? error.code : 'SOURCE_UNAVAILABLE';
    const diagnostics = error && typeof error === 'object' && 'diagnostics' in error ? error.diagnostics : {};
    await failImport(DB, context.agencyId, context.id, code, diagnostics);
    Object.assign(report, {outcome: 'failed', code, reason: error instanceof ImportFailure ? error.reason : undefined, diagnostics});
    console.log(`${sample.name} : ${code}, aucune relance.`); process.exitCode = 2;
  }
} finally {
  await mf.dispose();
  await writeFile(`${folder}/report.json`, JSON.stringify({...report, localStorageDisposed: true}, null, 2), {flag: 'wx'});
}
