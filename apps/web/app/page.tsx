import {LandingPage} from '../components/landing-page';
import {HomepageMediaProvider} from '../components/homepage-media';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {requireAdmin} from '../lib/admin-access';
import {readHomepageConfig} from '../lib/homepage-media';
import './landing.css';
import './home-showcase.css';
import './home-mandate-kit.css';
import './home-sharing.css';
import './home-editor-showcase.css';
import './home-footer.css';
import './home-composer.css';
import './customizer.css';

export const metadata = {
  title: "BienVu — Vous rentrez le mandat. BienVu s'occupe du marketing.",
  description: 'Création, personnalisation et publication. Tout est automatisé.',
  alternates:{canonical:'/'},
};
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{homePreview?:string}>}) {
  const env=(await getCloudflareContext({async:true})).env,preview=(await searchParams).homePreview==='1';
  if(preview){try{await requireAdmin(new Request(env.BETTER_AUTH_URL,{headers:await headers()}),env);}catch{notFound();}}
  const config=await readHomepageConfig(env.DB,preview);
  return <HomepageMediaProvider config={config}>{preview&&<div className="homepage-preview-banner" role="status">Aperçu privé · Ces changements ne sont pas encore publiés. <a href="/admin?view=homepage">Retour à l’administration →</a></div>}<LandingPage/></HomepageMediaProvider>;
}
