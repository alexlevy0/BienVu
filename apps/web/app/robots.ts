import type {MetadataRoute} from 'next';
export default function robots():MetadataRoute.Robots{
  return {rules:{userAgent:'*',allow:['/','/api/explorer'],
    disallow:['/api/','/admin','/agence','/historique','/publications','/essai/','/laboratoire','/generer','/studio']},
    sitemap:'https://bienvu.online/sitemap.xml'};
}
