import type {MetadataRoute} from 'next';
export default function sitemap():MetadataRoute.Sitemap{
  return ['','/explorer','/abonnement','/sources','/conditions','/confidentialite'].map(path=>({url:`https://bienvu.online${path}`}));
}
