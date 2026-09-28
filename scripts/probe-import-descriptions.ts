import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {ImportFailure} from '../packages/contracts/src/index';
import {extractListingHtml} from '../packages/importers/src/listing';
import {sourcePolicy} from '../packages/importers/src/network';
import {nodeImportTransport} from './import-transport';

// Trois pages publiques fixes, une tentative chacune. Aucune photo ni API payante.
if (!process.argv.includes('--real')) throw new Error('Passer --real pour consulter les trois pages publiques depuis Node local.');
const cases = [
  {name: 'espaces-atypiques', url: 'https://www.espaces-atypiques.com/ventes/69007-lyon-ancien-renove-au-coeur-du-7eme-14713/'},
  {name: 'orpi', url: 'https://www.orpi.com/annonce-vente-appartement-t2-paris-12-75012-ddbf1828-1eb9-4ebe-885c-85f7e30057f1/'},
  {name: 'century21', url: 'https://www.century21.fr/trouver_logement/detail/16965965448/'},
];
const folder = 'evidence/local/sprint-03/descriptions';
await mkdir(folder, {recursive: true});
const attempts: Record<string, unknown>[] = [];
for (const sample of cases) {
  const start = Date.now();
  try {
    const page = await nodeImportTransport().load(sample.url, 'page', sourcePolicy(sample.url).pageHosts, AbortSignal.timeout(15_000));
    const html = new TextDecoder().decode(page.bytes), listing = extractListingHtml(html, page.url);
    await writeFile(`${folder}/${sample.name}.html`, html);
    await writeFile(`${folder}/${sample.name}.json`, JSON.stringify(listing.description, null, 2));
    if (!listing.description) throw new Error('DESCRIPTION_MISSING');
    const {text, sourcePath, truncated} = listing.description;
    attempts.push({...sample, outcome: 'success', durationMs: Date.now() - start, htmlBytes: page.sourceBytes,
      adapterVersion: listing.adapterVersion, sourcePath, characters: text.length, paragraphs: text.split(/\n\n/).length,
      sha256: createHash('sha256').update(text).digest('hex'), truncated});
    console.log(`${sample.name} : description présente, ${text.length} caractères, troncature ${truncated}.`);
  } catch (error) {
    const code = error instanceof ImportFailure ? error.code
      : error instanceof Error && error.message === 'DESCRIPTION_MISSING' ? 'DESCRIPTION_MISSING' : 'PROBE_ERROR';
    attempts.push({...sample, outcome: 'failed', code, durationMs: Date.now() - start});
    console.log(`${sample.name} : ${code}, aucune relance.`);
    process.exitCode = 1;
  }
}
await writeFile(`${folder}/report.json`, JSON.stringify({at: new Date().toISOString(),
  mode: 'real-public-https-from-local-node', scope: 'description-extraction-only', storage: 'local-evidence-only',
  cloudflareRemote: 'not-tested', imagesDownloaded: 0, browserRun: 'not-used', paidCalls: 0,
  marginalProviderCostEUR: 0, invoiceChecked: false, attempts}, null, 2));
