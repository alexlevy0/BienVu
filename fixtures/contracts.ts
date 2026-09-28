import type {AgencyBrand, NormalizedListing, RenderManifest} from '../packages/contracts/src/product';

const createdAt = '2026-09-27T12:00:00.000Z';
export const brandFixture: AgencyBrand = {
  id: 'agency-fixture', ownerUserId: 'user-fixture', name: 'Agence de recette — synthétique', logoAssetId: null,
  primaryColor: '#214f43', secondaryColor: '#f3efe6', phone: null, email: 'recette@example.com', website: null, createdAt,
};
export function saleFixture(): NormalizedListing {
  return {
    id: 'listing-fixture', agencyId: brandFixture.id, sourceKind: 'url', sourceUrl: 'https://agence.example.com/annonces/fixture',
    canonicalUrl: 'https://agence.example.com/annonces/fixture', sourceHost: 'agence.example.com', sourceListingId: 'fixture',
    fetchedAt: createdAt, adapterVersion: 'synthetic/1', transaction: 'sale', description: null,
    facts: {
      title: {status: 'verified', value: 'Appartement synthétique', unit: 'text', sourcePath: 'fixture.title', rawEvidence: 'Appartement synthétique'},
      propertyType: {status: 'verified', value: 'apartment', unit: 'category', sourcePath: 'fixture.type', rawEvidence: 'Appartement'},
      locality: {status: 'verified', value: 'Ville de recette', unit: 'text', sourcePath: 'fixture.locality', rawEvidence: 'Ville de recette'},
      price: {status: 'verified', value: {amountCents: 30000000, currency: 'EUR', period: 'total', charges: 'not_applicable'}, unit: 'EUR_cent', sourcePath: 'fixture.price', rawEvidence: '300 000 €'},
      area: {status: 'verified', value: 62, unit: 'm2', sourcePath: 'fixture.area', rawEvidence: '62 m²'},
    },
    photos: [1, 2, 3].map(index => ({id: `photo-${index}`, agencyId: brandFixture.id, listingId: 'listing-fixture',
      sourceUrl: `https://agence.example.com/fixture-${index}.png`,
      objectKey: `agencies/${brandFixture.id}/jobs/job-fixture/photos/${index}.png`, contentHash: String(index).repeat(64),
      width: 1080, height: 1920, mime: 'image/png', sizeBytes: 30000, sourceOrder: index - 1})),
    warnings: ['FIXTURE SYNTHÉTIQUE : aucune annonce importée, aucun fichier distant.'],
  };
}
export function rentalFixture(): NormalizedListing {
  const listing = saleFixture(); listing.transaction = 'rent';
  listing.facts.price = {status: 'verified', value: {amountCents: 120000, currency: 'EUR', period: 'month', charges: 'included'},
    unit: 'EUR_cent', sourcePath: 'fixture.monthlyRent', rawEvidence: '1 200 € par mois, charges comprises'};
  return listing;
}
export function missingFixture(): NormalizedListing {
  const listing = saleFixture();
  listing.facts.price = {status: 'missing', value: null, unit: 'EUR_cent', sourcePath: null, rawEvidence: null};
  listing.facts.area = {status: 'missing', value: null, unit: 'm2', sourcePath: null, rawEvidence: null};
  return listing;
}
export function conflictingFixture(): NormalizedListing {
  const listing = saleFixture();
  listing.facts.area = {status: 'conflicting', value: null, unit: 'm2', candidates: [
    {value: 62, sourcePath: 'fixture.title', rawEvidence: '62 m²'},
    {value: 75, sourcePath: 'fixture.details', rawEvidence: '75 m²'},
  ]};
  return listing;
}
export function manifestFixture(): RenderManifest {
  const listing = saleFixture();
  return {schemaVersion: 1, agencyId: listing.agencyId, jobId: 'job-fixture', listingId: listing.id,
    templateVersion: 'synthetic/1', brand: structuredClone(brandFixture), width: 1080, height: 1920, fps: 30,
    rights: {kind: 'trial', allocationId: 'allocation-fixture', watermarked: true}, photos: listing.photos,
    audio: [1, 2, 3].map(index => ({id: `audio-${index}`, objectKey: `agencies/${listing.agencyId}/jobs/job-fixture/audio/${index}.wav`, sha256: String(index + 3).repeat(64), durationMs: 9500})),
    scenes: [1, 2, 3].map(index => ({id: `scene-${index}`, photoAssetId: `photo-${index}`, audioAssetId: `audio-${index}`,
      narrationText: 'Narration synthétique de recette, aucun appel TTS.', captionText: 'Bien de recette', factRefs: ['title'], durationFrames: 300})),
  };
}
