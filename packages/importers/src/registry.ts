import {ImportFailure, sourceForHost, sourceListingId} from '@bienvu/contracts';
import {publicUrl} from './network';

export function selectAdapter(value: string) {
  const url = publicUrl(value), source = sourceForHost(url.hostname);
  if (!source) return {id: 'generic' as const, listingId: null, source: null};
  const listingId = sourceListingId(source, url.pathname);
  if (!listingId) throw new ImportFailure('NOT_A_LISTING', 'Utilisez le lien direct d’une annonce.', 'not_listing');
  return {id: source.id, listingId, source};
}

// Une redirection vers une recherche ou un autre bien ne devient jamais un succès.
export function assertListingDestination(sourceUrl: string, destination: string) {
  const selected = selectAdapter(sourceUrl), final = publicUrl(destination);
  if (!selected.source) return;
  const id = sourceListingId(selected.source, final.pathname);
  const transactionChanged = selected.id === 'orpi' && new URL(sourceUrl).pathname.startsWith('/annonce-location-') !== final.pathname.startsWith('/annonce-location-');
  if (!selected.source.hosts.includes(final.hostname) || id !== selected.listingId || transactionChanged)
    throw new ImportFailure('SOURCE_UNAVAILABLE', 'Le lien ne mène plus à la même annonce.', 'listing_redirect');
}
