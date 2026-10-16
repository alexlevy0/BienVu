import {getCloudflareContext} from '@opennextjs/cloudflare';
import {HomepageMediaProvider} from '../../components/homepage-media';
import {BetaLandingPage} from '../../components/beta-landing-page';
import {readHomepageConfig,homepageEdgeCache} from '../../lib/homepage-media';
import {seoMetadata} from '../../lib/seo';
import '../landing.css';
import '../home-avatars.css';
import '../home-render-comparison.css';
import '../home-editor-showcase.css';
import '../home-vitrine.css';
import '../home-footer.css';
import '../home-composer.css';
import '../home-noise.css';
import '../home-typography.css';
import './beta.css';

export const dynamic='force-dynamic';
export const metadata=seoMetadata({title:'BienVu — Votre annonce, sa prochaine vidéo',description:'Essayez une nouvelle façon de découvrir BienVu : une annonce, trois rendus et une vidéo à votre image.',path:'/beta',noindex:true});
export default async function Page(){
  const {env,ctx}=await getCloudflareContext({async:true});
  const config=await readHomepageConfig(env.DB,false,await homepageEdgeCache(env.BETTER_AUTH_URL,task=>ctx.waitUntil(task)));
  return <HomepageMediaProvider config={config}><link rel="preload" href="/fonts/newsreader.woff2" as="font" type="font/woff2" crossOrigin="anonymous"/><BetaLandingPage/></HomepageMediaProvider>;
}
