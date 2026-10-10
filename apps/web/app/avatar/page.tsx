import Link from 'next/link';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import {avatarGallery} from '@bienvu/db';
import {AvatarGallery} from '../../components/avatar-gallery';
import {StudioFrame} from '../../components/studio-frame';
import {HomeIcon} from '../../components/home-icons';
import {StructuredData} from '../../components/structured-data';
import {seoMetadata,breadcrumbs} from '../../lib/seo';
import '../landing.css';
import './avatar.css';

export const dynamic='force-dynamic';
export const metadata=seoMetadata({title:'Avatars IA immobiliers — Découvrez les présentateurs BienVu',
  description:'Découvrez les avatars HeyGen disponibles dans BienVu. Comparez leurs styles et regardez leurs démonstrations avant de créer vos vidéos immobilières.',path:'/avatar',image:'/images/studio-home/avatar-integrated.webp'});
export default async function AvatarPage(){
  const {env}=await getCloudflareContext({async:true});
  const initial=await avatarGallery(env.DB,{query:'',gender:'all',offset:0});
  return <StudioFrame active="create"><div className="avatar-page" data-analytics-public>
    <StructuredData data={breadcrumbs([{name:'BienVu',path:'/'},{name:'Avatars IA',path:'/avatar'}])}/>
    <Link href="/" className="avatar-back">← Retour au studio</Link>
    <header className="avatar-gallery-intro"><div><span className="avatar-gallery-eyebrow"><HomeIcon name="sparkle" filled size={18}/>LES AVATARS IA BIENVU</span>
      <h1>Vos annonces <em>prennent la parole.</em></h1>
      <p>Trouvez le présentateur qui ressemble à votre agence.<br/>BienVu lui donne la voix de votre vidéo.</p></div>
      <Link className="avatar-gallery-create" href="/">Créer ma vidéo <HomeIcon name="arrow" size={20}/></Link></header>
    <AvatarGallery initial={initial}/>
    <aside className="avatar-gallery-next"><HomeIcon name="user" size={30}/><div><h2>Un visage, votre voix, vos biens.</h2>
      <p>Choisissez votre avatar dans « Personnaliser » → « Avatar IA ». Faites-le apparaître pendant quelques passages ou tout au long de votre vidéo.</p></div><Link href="/abonnement">Voir les offres <HomeIcon name="arrow" size={18}/></Link></aside>
  </div></StudioFrame>;
}
