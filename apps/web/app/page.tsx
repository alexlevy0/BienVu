import {LandingPage} from '../components/landing-page';
import {HomepageMediaProvider} from '../components/homepage-media';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {requireAdmin} from '../lib/admin-access';
import {readHomepageConfig,readHomepageHeroPoster,homepageEdgeCache} from '../lib/homepage-media';
import {resolveHomeMedia,imageWidthUrl,homeImageSrcSet,heroPosterSizes} from '../lib/home-media-view';
import {StructuredData} from '../components/structured-data';
import {seoMetadata,siteSchema} from '../lib/seo';
import './landing.css';
import './home-showcase.css';
import './home-avatars.css';
import './home-animation-comparison.css';
import './home-render-comparison.css';
import './home-mandate-kit.css';
import './home-sharing.css';
import './home-vitrine.css';
import './home-editor-showcase.css';
import './home-footer.css';
import './home-composer.css';
import './home-noise.css';
import './home-typography.css';

export async function generateMetadata({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const query=await searchParams;
  return seoMetadata({title:'BienVu — Marketing immobilier IA et création de vidéos',description:'Créez des vidéos immobilières à partir de vos annonces et photos. Personnalisez vos contenus et programmez leur publication sur Instagram et Facebook.',path:'/',noindex:Boolean(query.homePreview||query.draft)});
}
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{homePreview?:string}>}) {
  const {env,ctx}=await getCloudflareContext({async:true}),preview=(await searchParams).homePreview==='1';
  if(preview){try{await requireAdmin(new Request(env.BETTER_AUTH_URL,{headers:await headers()}),env);}catch{notFound();}}
  const cache=await homepageEdgeCache(env.BETTER_AUTH_URL,task=>ctx.waitUntil(task));
  const config=await readHomepageConfig(env.DB,preview,cache),heroPoster=preview?null:await readHomepageHeroPoster(env,config,cache),hero=resolveHomeMedia(config,'hero.visual');
  return <HomepageMediaProvider config={config} heroPoster={heroPoster}>
    {heroPoster&&<link rel="preload" as="image" href={imageWidthUrl(hero.src,640)} imageSrcSet={homeImageSrcSet(hero.src)} imageSizes={heroPosterSizes} media="(min-width: 761px)" fetchPriority="high"/>}
    <link rel="preload" href="/fonts/newsreader-ui.woff2" as="font" type="font/woff2" crossOrigin="anonymous"/>
    <link rel="preload" href="/fonts/newsreader-italic-ui.woff2" as="font" type="font/woff2" crossOrigin="anonymous"/>
    {!preview&&<StructuredData data={siteSchema}/>} {preview&&<div className="homepage-preview-banner" role="status">Aperçu privé · Ces changements ne sont pas encore publiés. <a href="/admin?view=homepage">Retour à l’administration →</a></div>}<LandingPage/>
  </HomepageMediaProvider>;
}
