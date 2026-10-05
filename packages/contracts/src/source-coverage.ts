import {sourceCoverageData} from './source-coverage-data';

// Public test catalogue only. Recognition here grants no network permission:
// importer hosts, redirects and photo destinations remain in import-sources.ts.
export const coverageSources = [
  {id: 'orpi', name: 'Orpi', kind: 'agency', hosts: ['www.orpi.com', 'orpi.com'], domains: []},
  {id: 'century21', name: 'Century 21', kind: 'agency', hosts: ['www.century21.fr', 'century21.fr'], domains: []},
  {id: 'laforet', name: 'Laforêt', kind: 'agency', hosts: ['www.laforet.com', 'laforet.com'], domains: []},
  {id: 'human', name: 'HUMAN Immobilier', kind: 'agency', hosts: ['www.human-immobilier.fr', 'human-immobilier.fr'], domains: []},
  {id: 'guy-hoquet', name: 'Guy Hoquet', kind: 'agency', hosts: ['www.guy-hoquet.com', 'guy-hoquet.com'], domains: ['guy-hoquet.com']},
  {id: 'nestenn', name: 'Nestenn', kind: 'agency', hosts: ['nestenn.com', 'www.nestenn.com'], domains: ['nestenn.com']},
  {id: 'era', name: 'ERA Immobilier', kind: 'agency', hosts: ['www.eraimmobilier.com', 'eraimmobilier.com'], domains: []},
  {id: 'ladresse', name: 'l’Adresse', kind: 'agency', hosts: ['www.ladresse.com', 'ladresse.com'], domains: []},
  {id: 'foncia', name: 'Foncia', kind: 'agency', hosts: ['fr.foncia.com', 'www.foncia.com', 'foncia.com'], domains: []},
  {id: 'citya', name: 'Citya Immobilier', kind: 'agency', hosts: ['www.citya.com', 'citya.com'], domains: []},
  {id: 'square-habitat', name: 'Square Habitat', kind: 'agency', hosts: ['www.squarehabitat.fr', 'squarehabitat.fr'], domains: []},
  {id: 'arthurimmo', name: 'Arthurimmo.com', kind: 'agency', hosts: ['www.arthurimmo.com', 'arthurimmo.com'], domains: ['arthurimmo.com']},
  {id: 'iad', name: 'iad', kind: 'agency', hosts: ['www.iadfrance.fr', 'iadfrance.fr'], domains: []},
  {id: 'safti', name: 'SAFTI', kind: 'agency', hosts: ['www.safti.fr', 'safti.fr'], domains: []},
  {id: 'espaces-atypiques', name: 'Espaces Atypiques', kind: 'agency', hosts: ['www.espaces-atypiques.com', 'espaces-atypiques.com'], domains: []},
  {id: 'figaro', name: 'Le Figaro Immobilier', kind: 'portal', hosts: ['immobilier.lefigaro.fr'], domains: []},
  {id: 'seloger', name: 'SeLoger', kind: 'portal', hosts: ['www.seloger.com', 'seloger.com'], domains: []},
  {id: 'leboncoin', name: 'Leboncoin', kind: 'portal', hosts: ['www.leboncoin.fr', 'leboncoin.fr'], domains: []},
  {id: 'bienici', name: 'Bien’ici', kind: 'portal', hosts: ['www.bienici.com', 'bienici.com'], domains: []},
] as const;
export type CoverageSource = typeof coverageSources[number];
export type CoverageSourceId = CoverageSource['id'];
export type SourceSample = {url: string; label: string; checkedAt: string; environment: 'cloudflare' | 'local_https';
  outcome: 'complete' | 'partial' | 'failed'; photos: number; note: string};
export type SourceCoverageEntry = {summary: string; samples: readonly SourceSample[]};
export const coverageLabels = {sample_tested: 'Import complet testé', partial_import: 'Import à compléter',
  mixed_results: 'Résultats variables', temporarily_unavailable: 'Saisie manuelle conseillée', generic_to_try: 'Import à essayer'} as const;
export type SourceCoverage = SourceCoverageEntry & {status: keyof typeof coverageLabels; checkedAt: string;
  listingAttempts: number; successfulImports: number; partialImports: number; environment: 'cloudflare' | 'local_https'};

export function summarizeSourceCoverage(entry: SourceCoverageEntry): SourceCoverage {
  const samples = entry.samples, complete = samples.filter(s => s.outcome === 'complete' && s.environment === 'cloudflare').length,
    partial = samples.filter(s => s.outcome === 'partial' && s.environment === 'cloudflare').length;
  // A partial draft or a local-only exploration never counts as a complete
  // import demonstrated in the deployed product.
  const confirmed = samples.length > 0 && samples.every(s => s.environment === 'cloudflare');
  const status: SourceCoverage['status'] = !confirmed ? 'generic_to_try'
    : complete === samples.length ? 'sample_tested'
    : partial === samples.length ? 'partial_import'
    : complete + partial > 0 ? 'mixed_results' : 'temporarily_unavailable';
  return {...entry, status, checkedAt: samples.map(s => s.checkedAt).sort().at(-1) ?? '',
    listingAttempts: samples.length, successfulImports: complete, partialImports: partial,
    environment: confirmed ? 'cloudflare' : 'local_https'};
}
export const sourceCoverage = Object.fromEntries(coverageSources.map(s => [s.id, summarizeSourceCoverage(sourceCoverageData[s.id])])) as Readonly<Record<CoverageSourceId, SourceCoverage>>;

export function coverageForHost(host: string): CoverageSource | undefined {
  const normalized = host.toLowerCase();
  return coverageSources.find(source => (source.hosts as readonly string[]).includes(normalized)
    || (source.domains as readonly string[]).some(domain => normalized.endsWith(`.${domain}`)));
}
