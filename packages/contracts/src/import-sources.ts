// Hôtes et routes explicites, partagés par le contrat, le registre et l'interface.
// La présence dans ce catalogue n'est pas une promesse de compatibilité.
export type SourceId = 'espaces-atypiques' | 'orpi' | 'century21' | 'figaro' | 'seloger' | 'leboncoin' | 'bienici' | 'ladresse' | 'cesar-brutus' | 'iad' | 'remax' | 'safti';
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
    paths: [/^\/annonces\/annonce-(\d+)\.html$/], mediaHosts: ['immobilier.lefigaro.fr', 'cdn.immobilier.lefigaro.fr', 'lh3.googleusercontent.com']},
  {id: 'seloger', name: 'SeLoger', hosts: ['www.seloger.com', 'seloger.com'],
    paths: [/^\/annonce\/(?:achat|location)\/(?:[^/]+\/){3}([A-Z0-9]+)\/?$/,
      /^\/annonces\/(?:achat|locations)\/(?:[^/]+\/)+(\d+)\.htm$/], mediaHosts: ['www.seloger.com']},
  {id: 'leboncoin', name: 'Leboncoin', hosts: ['www.leboncoin.fr', 'leboncoin.fr'],
    paths: [/^\/ad\/(?:ventes_immobilieres|locations)\/(\d+)\/?$/,
      /^\/(?:ventes_immobilieres|locations)\/(\d+)\.htm$/], mediaHosts: ['www.leboncoin.fr']},
  {id: 'bienici', name: 'Bien’ici', hosts: ['www.bienici.com', 'bienici.com'],
    paths: [/^\/annonce\/(?:vente|location)\/(?:[^/]+\/){2,3}([a-zA-Z0-9_-]+)\/?$/], mediaHosts: ['www.bienici.com', 'file.bienici.com']},
  {id: 'ladresse', name: 'l’Adresse', hosts: ['www.ladresse.com', 'ladresse.com'],
    paths: [/^\/annonce\/achat\/(?:maison|appartement)\/[^/]+\/(\d+)\/?$/], mediaHosts: ['admin.exceladresse.com']},
  {id: 'cesar-brutus', name: 'César & Brutus', hosts: ['www.cesaretbrutus.com', 'cesaretbrutus.com'],
    paths: [/^\/bien\/[^/]+?-((?:[a-z]{1,10}-)?\d+-cesaretbrutus\d+)\/?$/i], mediaHosts: []},
  {id: 'iad', name: 'iad', hosts: ['www.iadfrance.fr', 'iadfrance.fr'],
    paths: [/^\/annonce\/(?:appartement|maison)-vente-[^/]+\/r(\d+)\/?$/], mediaHosts: ['images.playiad.com', 'images.iadfrance.fr']},
  {id: 'remax', name: 'RE/MAX', hosts: ['remax.fr', 'www.remax.fr'],
    paths: [/^\/fr\/mandats\/vente-(?:maison|appartement)-[^/]+\/(\d+-\d+)\/?$/], mediaHosts: ['i.maxwork.fr']},
  {id: 'safti', name: 'SAFTI', hosts: ['www.safti.fr', 'safti.fr'],
    paths: [/^\/annonces\/achat\/(?:maison|appartement)\/[^/]+\/(\d+)\/?$/], mediaHosts: ['cdn.safti.fr']},
];
export const sourceForHost = (host: string) => importSources.find(source => source.hosts.includes(host));
export function sourceListingId(source: ImportSource, path: string): string | null {
  for (const pattern of source.paths) {const id = pattern.exec(path)?.[1]; if (id) return id;}
  return null;
}
export function sameSourceHost(first: string, second: string) {
  return first === second || Boolean(sourceForHost(first)?.hosts.includes(second));
}
