import { emptyCreationFields, type ShowcasePublic, type ShowcasePublicProperty } from '@bienvu/contracts';

export const showcaseExamplePath = '/ma-vitrine/exemple';
export const showcaseExampleCover = '/images/showcase-example/riviera-1024.webp';
const updatedAt = '2026-10-12T00:00:00.000Z';

// Marketing examples use only BienVu's existing generated visuals and demo clips.
// No agency, imported listing or private media is read for this public example.
export const showcaseExampleProperties = (
  [
    {
      id: 'villa',
      title: 'Villa contemporaine',
      locality: 'Nice · Mont Boron',
      image: 'sud',
      price: 1980000,
      area: 180,
      rooms: 5,
      type: 'house',
      transaction: 'sale',
      duration: 32,
    },
    {
      id: 'terrasse',
      title: 'Appartement avec terrasse',
      locality: 'Cannes · Croisette',
      image: 'paris',
      price: 1250000,
      area: 95,
      rooms: 4,
      type: 'apartment',
      transaction: 'sale',
      duration: 28,
    },
    {
      id: 'jardin',
      title: 'Maison de caractère',
      locality: 'Mougins',
      image: 'bordeaux',
      price: 890000,
      area: 210,
      rooms: 6,
      type: 'house',
      transaction: 'sale',
      duration: 30,
    },
    {
      id: 'appartement',
      title: 'Appartement lumineux',
      locality: 'Antibes',
      image: 'lyon',
      price: 2600,
      area: 78,
      rooms: 3,
      type: 'apartment',
      transaction: 'rent',
      duration: 27,
    },
  ] as const
).map<ShowcasePublicProperty>((item) => {
  const cover = { id: item.id, url: `/images/studio-home/${item.image}-640.webp`, width: 640, height: 853 };
  return {
    id: item.id,
    url: `${showcaseExamplePath}?bien=${item.id}`,
    reference: `EXEMPLE-${item.id.toUpperCase()}`,
    fields: {
      ...emptyCreationFields(),
      title: item.title,
      locality: item.locality,
      propertyType: item.type,
      transaction: item.transaction,
      priceCents: item.price * 100,
      area: item.area,
      rooms: item.rooms,
      description:
        'Cette annonce fictive illustre la présentation d’un bien sur Ma vitrine. Votre propre vitrine utilise les informations, les photos et les vidéos que vous choisissez dans BienVu.',
    },
    status: 'available',
    featured: false,
    photos: [cover],
    cover,
    video: { url: `/videos/studio-home/${item.image}.mp4`, aspectRatio: '9:16', durationSeconds: item.duration },
    address: null,
    dpe: null,
    ges: null,
    legal: 'Exemple fictif. Visuels générés et vidéos de démonstration, sans annonce immobilière réelle.',
    videoOutdated: false,
    updatedAt,
  };
});

export function showcaseExampleData(query: Record<string, string> = {}): ShowcasePublic {
  const includes = (text: string, value: string) =>
    text.toLocaleLowerCase('fr-FR').includes(value.toLocaleLowerCase('fr-FR'));
  const properties = showcaseExampleProperties.filter(
    (item) =>
      (!query.transaction || item.fields.transaction === query.transaction) &&
      (!query.type || item.fields.propertyType === query.type) &&
      (!query.locality || includes(item.fields.locality ?? '', query.locality)) &&
      (!query.q || includes(`${item.fields.title} ${item.fields.locality}`, query.q)) &&
      (!query.budget || (item.fields.priceCents ?? 0) <= Number(query.budget) * 100) &&
      (!query.rooms || (item.fields.rooms ?? 0) >= Number(query.rooms)),
  );
  return {
    config: {
      name: 'Agence Bellevue',
      slug: 'exemple-bellevue',
      tagline: 'Des biens à vivre, des vidéos à découvrir.',
      description:
        'Une agence à votre image, des lieux à découvrir. Présentez votre équipe, vos secteurs et votre façon d’accompagner les projets immobiliers. Cette agence fictive vous permet d’explorer le fonctionnement de Ma vitrine.',
      city: 'Côte d’Azur',
      sectors: [],
      phone: null,
      email: null,
      website: null,
      socials: { instagram: null, facebook: null, linkedin: null, youtube: null },
      address: '',
      showAddress: false,
      accent: '#213e31',
      keepSold: false,
    },
    cover: { id: 'couverture', url: showcaseExampleCover, width: 1024, height: 400 },
    logo: null,
    properties,
    featured: [],
    total: properties.length,
    page: 1,
    pages: 1,
    publishedAt: updatedAt,
    preview: true,
  };
}
