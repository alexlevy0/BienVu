// Hôtes et routes explicites, partagés par le contrat, le registre et l'interface.
// La présence dans ce catalogue n'est pas une promesse de compatibilité.
export type SourceId = 'espaces-atypiques' | 'orpi' | 'century21' | 'figaro' | 'seloger' | 'leboncoin' | 'bienici';
export type ImportSource = {id: SourceId; name: string; hosts: readonly string[]; paths: readonly RegExp[];
  mediaHosts: readonly string[]};
export const importSources: readonly ImportSource[] = [
  {id: 'espaces-atypiques', name: 'Espaces Atypiques', hosts: ['www.espaces-atypiques.com', 'espaces-atypiques.com'],
    paths: [/^\/ventes\/[^/]+-([a-zA-Z0-9]+)\/$/], mediaHosts: ['www.espaces-atypiques.com']},
  {id: 'orpi', name: 'Orpi', hosts: ['www.orpi.com', 'orpi.com'],
    paths: [/^\/annonce-(?:vente|location)-[^/]+-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/?$/], mediaHosts: ['www.orpi.com', 'cutjhqvjma.cloudimg.io']},
  {id: 'century21', name: 'Century 21', hosts: ['www.century21.fr', 'century21.fr'],
    paths: [/^\/trouver_logement\/detail\/(\d+)\/$/], mediaHosts: ['www.century21.fr', 'images.century21.fr']},
  {id: 'figaro', name: 'Le Figaro Immobilier', hosts: ['immobilier.lefigaro.fr'],
    paths: [/^\/annonces\/annonce-(\d+)\.html$/], mediaHosts: ['immobilier.lefigaro.fr']},
  {id: 'seloger', name: 'SeLoger', hosts: ['www.seloger.com', 'seloger.com'],
    paths: [/^\/annonce\/(?:achat|location)\/(?:[^/]+\/){3}([A-Z0-9]+)\/?$/,
      /^\/annonces\/(?:achat|locations)\/(?:[^/]+\/)+(\d+)\.htm$/], mediaHosts: ['www.seloger.com']},
  {id: 'leboncoin', name: 'Leboncoin', hosts: ['www.leboncoin.fr', 'leboncoin.fr'],
    paths: [/^\/ad\/(?:ventes_immobilieres|locations)\/(\d+)\/?$/,
      /^\/(?:ventes_immobilieres|locations)\/(\d+)\.htm$/], mediaHosts: ['www.leboncoin.fr']},
  {id: 'bienici', name: 'Bien’ici', hosts: ['www.bienici.com', 'bienici.com'],
    paths: [/^\/annonce\/(?:vente|location)\/(?:[^/]+\/){2,3}([a-zA-Z0-9_-]+)\/?$/], mediaHosts: ['www.bienici.com', 'file.bienici.com']},
];
export const sourceForHost = (host: string) => importSources.find(source => source.hosts.includes(host));
export function sourceListingId(source: ImportSource, path: string): string | null {
  for (const pattern of source.paths) {const id = pattern.exec(path)?.[1]; if (id) return id;}
  return null;
}
export function sameSourceHost(first: string, second: string) {
  return first === second || Boolean(sourceForHost(first)?.hosts.includes(second));
}

export type SourceCoverage = {status: 'sample_tested' | 'generic_to_try' | 'temporarily_unavailable';
  checkedAt: string; listingAttempts: number; successfulImports: number;
  environment: 'cloudflare' | 'local_https'; summary: string};
export const sourceCoverage: Readonly<Record<SourceId, SourceCoverage>> = {
  'espaces-atypiques': {status: 'sample_tested', checkedAt: '2026-09-28', listingAttempts: 1, successfulImports: 1, environment: 'cloudflare', summary: 'Une annonce de vente importée. Les surfaces ambiguës sont omises.'},
  orpi: {status: 'sample_tested', checkedAt: '2026-09-28', listingAttempts: 1, successfulImports: 1, environment: 'cloudflare', summary: 'Une annonce de vente importée avec sa galerie.'},
  century21: {status: 'sample_tested', checkedAt: '2026-09-28', listingAttempts: 1, successfulImports: 1, environment: 'cloudflare', summary: 'Une annonce de vente importée avec sa galerie.'},
  figaro: {status: 'temporarily_unavailable', checkedAt: '2026-09-28', listingAttempts: 1, successfulImports: 0, environment: 'cloudflare', summary: 'Accès refusé à l’importeur sur le lien essayé.'},
  seloger: {status: 'temporarily_unavailable', checkedAt: '2026-09-28', listingAttempts: 1, successfulImports: 0, environment: 'cloudflare', summary: 'Accès refusé à l’importeur sur le lien essayé.'},
  leboncoin: {status: 'temporarily_unavailable', checkedAt: '2026-09-28', listingAttempts: 1, successfulImports: 0, environment: 'cloudflare', summary: 'Accès refusé à l’importeur sur le lien essayé.'},
  bienici: {status: 'temporarily_unavailable', checkedAt: '2026-09-28', listingAttempts: 1, successfulImports: 0, environment: 'cloudflare', summary: 'BienVu ne parvient pas encore à récupérer automatiquement les informations et les photos de l’annonce testée.'},
};
export const coverageLabels = {sample_tested: 'Testé sur un échantillon', generic_to_try: 'Import générique à essayer',
  temporarily_unavailable: 'Import momentanément indisponible'} as const;
