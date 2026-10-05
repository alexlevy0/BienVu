import {LandingPage} from '../components/landing-page';
import {HomepageMediaProvider} from '../components/homepage-media';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {requireAdmin} from '../lib/admin-access';
import {readHomepageConfig} from '../lib/homepage-media';
import {StructuredData} from '../components/structured-data';
import {seoMetadata,siteSchema} from '../lib/seo';
import './landing.css';
import './home-showcase.css';
import './home-mandate-kit.css';
import './home-sharing.css';
import './home-editor-showcase.css';
import './home-footer.css';
import './home-composer.css';
import './manual-listing.css';
import './customizer.css';
import './marketing.css';

export async function generateMetadata({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const query=await searchParams;
  return seoMetadata({title:'BienVu — Marketing immobilier IA et création de vidéos',description:'Créez des vidéos immobilières à partir de vos annonces et photos. Personnalisez vos contenus et programmez leur publication sur Instagram et Facebook.',path:'/',noindex:Boolean(query.homePreview||query.draft)});
}
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{homePreview?:string}>}) {
  const env=(await getCloudflareContext({async:true})).env,preview=(await searchParams).homePreview==='1';
  if(preview){try{await requireAdmin(new Request(env.BETTER_AUTH_URL,{headers:await headers()}),env);}catch{notFound();}}
  const config=await readHomepageConfig(env.DB,preview);
  return <HomepageMediaProvider config={config}>{!preview&&<StructuredData data={siteSchema}/>} {preview&&<div className="homepage-preview-banner" role="status">Aperçu privé · Ces changements ne sont pas encore publiés. <a href="/admin?view=homepage">Retour à l’administration →</a></div>}<LandingPage/></HomepageMediaProvider>;
}
