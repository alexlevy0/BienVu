import {ImportFailure, ListingUrl} from '@bienvu/contracts';
import {isPublicIp} from './safety';

export const IMPORT_LIMITS = {htmlBytes: 2 * 1024 * 1024, imageBytes: 10 * 1024 * 1024,
  totalBytes: 50 * 1024 * 1024, photos: 12, candidates: 24, redirects: 3, requests: 20, durationMs: 60_000} as const;

export function publicUrl(value: string): URL {
  const parsed = ListingUrl.safeParse(value);
  if (!parsed.success) throw new ImportFailure('UNSAFE_URL', 'URL non publique ou invalide.');
  const url = new URL(parsed.data);
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(url.hostname))
    throw new ImportFailure('UNSAFE_URL', 'Nom de domaine non pris en charge.');
  return url;
}

// Aucun joker ni hôte fourni par le contenu de la page. Les CDN sont explicites.
const mediaHosts: Record<string, readonly string[]> = {
  'www.espaces-atypiques.com': ['www.espaces-atypiques.com'],
  'www.orpi.com': ['www.orpi.com', 'cutjhqvjma.cloudimg.io'],
  'www.century21.fr': ['www.century21.fr', 'images.century21.fr'],
};
export function sourcePolicy(source: string) {
  const host = publicUrl(source).hostname;
  return {pageHosts: [host], imageHosts: mediaHosts[host] ?? [host]};
}
export function scopedUrl(value: string, hosts: readonly string[]) {
  const url = publicUrl(value);
  if (!hosts.includes(url.hostname)) throw new ImportFailure('UNSAFE_URL', 'Hôte extérieur à la source autorisée.');
  return url;
}
export function publicAddresses(addresses: readonly {address: string; family: number}[]) {
  if (!addresses.length || !addresses.every(item => isPublicIp(item.address) && [4, 6].includes(item.family)))
    throw new ImportFailure('UNSAFE_URL', 'La résolution contient une adresse privée, réservée ou non vérifiable.');
  return [...addresses].sort((a, b) => a.family - b.family);
}

export type Resource = {url: string; bytes: Uint8Array<ArrayBuffer>; mime: string; sourceBytes: number;
  width?: number; height?: number};
// Le transport garantit : IP épinglée, TLS, redirections contrôlées, flux bornés,
// aucun cookie, puis décodage/réencodage raster pour les images. Pas de fetch implicite.
export interface ImportTransport {
  load(url: string, kind: 'page' | 'image' | 'asset', hosts: readonly string[], signal: AbortSignal, maxBytes?: number): Promise<Resource>;
}
