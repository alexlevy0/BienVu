import type {MetadataRoute} from 'next';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import {homepageSettings} from '@bienvu/db';
import {publicSitemapVideos} from '../lib/sharing';
import {readHomepageConfig} from '../lib/homepage-media';
import {publicExample} from '../lib/public-examples';
import {examples,featurePages,guidePages} from '../lib/marketing-content';
import {absoluteUrl,editorialDate} from '../lib/seo';
import {blogArticles,blogArticleDates,blogUpdatedAt} from '../lib/blog-content';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
  const {env}=await getCloudflareContext({async:true});
  const [config,shared,home]=await Promise.all([readHomepageConfig(env.DB),publicSitemapVideos(env.DB),homepageSettings(env.DB)]);
  const latestHome=home.published_at??undefined;
  const dates=(date?:string)=>date&&date>editorialDate?date:editorialDate;
  const pages:MetadataRoute.Sitemap=['','/explorer','/abonnement','/sources','/conditions','/confidentialite','/guides',...featurePages.map(page=>`/${page.slug}`),...guidePages.map(page=>`/guides/${page.slug}`)]
    .map(path=>({url:absoluteUrl(path||'/'),lastModified:path===''?dates(latestHome):editorialDate}));
  pages.push({url:absoluteUrl('/blog'),lastModified:blogUpdatedAt()});
  pages.push({url:absoluteUrl('/partenaires'),lastModified:'2026-10-08'});
  pages.push({url:absoluteUrl('/avatar'),lastModified:'2026-10-10'});
  for(const article of blogArticles)pages.push({url:absoluteUrl(`/blog/${article.slug}`),lastModified:blogArticleDates(article).modifiedAt,
    images:[absoluteUrl(`/images/blog/${article.slug}.jpg`)]});
  for(const example of examples){const video=(await publicExample(example.id,config))!;
    pages.push({url:absoluteUrl(`/exemples/${example.id}`),lastModified:dates(video.publishedAt),images:[absoluteUrl(video.poster)],
      videos:[{title:video.title,description:video.description,thumbnail_loc:absoluteUrl(video.poster),content_loc:absoluteUrl(video.src),duration:Math.round(video.seconds),publication_date:video.publishedAt}]});
  }
  for(const video of shared)pages.push({url:absoluteUrl(video.pageUrl),lastModified:video.publishedAt,images:[absoluteUrl(video.posterUrl)],videos:[
    {title:video.title,description:`Vidéo immobilière partagée par ${video.agency}${video.locality?` à ${video.locality}`:''}.`,thumbnail_loc:absoluteUrl(video.posterUrl),content_loc:absoluteUrl(video.videoUrl),duration:Math.round(video.durationSeconds),publication_date:video.publishedAt}
  ]});
  return pages;
}
