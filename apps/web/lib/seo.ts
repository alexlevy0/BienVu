import type {Metadata} from 'next';

export const siteOrigin = 'https://bienvu.online';
export const editorialDate = '2026-10-05';
export const absoluteUrl = (path: string) => new URL(path, siteOrigin).href;

export function seoMetadata({title, description, path, image = '/images/seo/bienvu-og.jpg', noindex = false, type = 'website'}:
  {title: string; description: string; path: string; image?: string; noindex?: boolean; type?: 'website' | 'article'}): Metadata {
  return {title: {absolute: title}, description, alternates: {canonical: path},
    robots: {index: !noindex, follow: true},
    openGraph: {type, locale: 'fr_FR', siteName: 'BienVu', title, description, url: absoluteUrl(path),
      images: [{url: absoluteUrl(image), alt: title}]},
    twitter: {card: 'summary_large_image', title, description, images: [absoluteUrl(image)]}};
}

// Content can come from a public listing: never let a title close the script element.
export function schemaJson(value: unknown) {return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');}
export function breadcrumbs(items: {name: string; path: string}[]) {
  return {'@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((item, index) =>
    ({'@type': 'ListItem', position: index + 1, name: item.name, item: absoluteUrl(item.path)}))};
}
export function videoSchema(video: {title: string; description: string; path: string; poster: string; src: string; seconds: number; publishedAt: string}) {
  return {'@context': 'https://schema.org', '@type': 'VideoObject', name: video.title, description: video.description,
    thumbnailUrl: [absoluteUrl(video.poster)], uploadDate: video.publishedAt, duration: `PT${Math.round(video.seconds)}S`,
    contentUrl: absoluteUrl(video.src), url: absoluteUrl(video.path), inLanguage: 'fr',
    publisher: {'@id': `${siteOrigin}/#organization`}};
}
export const siteSchema = {'@context': 'https://schema.org', '@graph': [
  {'@type': 'Organization', '@id': `${siteOrigin}/#organization`, name: 'BienVu', url: siteOrigin, email: 'contact@bienvu.online'},
  {'@type': 'WebSite', '@id': `${siteOrigin}/#website`, name: 'BienVu', url: siteOrigin, inLanguage: 'fr-FR', publisher: {'@id': `${siteOrigin}/#organization`}},
  {'@type': 'WebApplication', '@id': `${siteOrigin}/#application`, name: 'BienVu', url: siteOrigin,
    applicationCategory: 'BusinessApplication', operatingSystem: 'Web', inLanguage: 'fr',
    description: 'Création, personnalisation et publication de vidéos immobilières à partir des annonces et photos de votre agence.',
    offers: {'@type': 'Offer', price: '0', priceCurrency: 'EUR', description: 'Offre gratuite : 3 crédits mensuels après connexion.'},
    publisher: {'@id': `${siteOrigin}/#organization`}},
]};
