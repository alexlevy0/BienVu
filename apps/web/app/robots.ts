import type {MetadataRoute} from 'next';
export default function robots():MetadataRoute.Robots{
  return {rules:{userAgent:'*',allow:['/','/agences/','/api/vitrines/','/api/explorer/','/api/homepage/media/'],
    disallow:['/api/','/admin','/agence$','/ma-vitrine','/historique','/biens','/publications','/essai/','/laboratoire','/editeur$','/editeur/','/projets','/equipe','/validation/']},
    sitemap:'https://bienvu.online/sitemap.xml'};
}
