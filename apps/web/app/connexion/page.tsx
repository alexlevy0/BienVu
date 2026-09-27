import Link from 'next/link';
import {Icon} from '../../components/icon';
import {VideoIllustration} from '../../components/video-illustration';
export const metadata = {title: 'Connexion'};
export default function Page() {
  return <main className="login-page"><section className="login-copy"><Link href="/" className="wordmark">bienvu<span className="brand-dot">.</span><span className="brand-mark">↗</span></Link><div><p className="eyebrow">BIENVENUE DANS VOTRE FUTUR STUDIO</p><h1>Vos annonces<br/>méritent<br/><em>d’être vues.</em></h1><p className="page-intro">Retrouvez bientôt votre agence, vos vidéos et votre abonnement dans un seul espace.</p><div className="login-box"><h2>Connexion bientôt disponible</h2><p>L’authentification est en cours de développement. Aucun compte n’est créé pour le moment.</p><button className="button primary" disabled><Icon name="lock" size={18}/>Se connecter</button><Link href="/">Explorer l’interface en développement<Icon name="arrow" size={17}/></Link></div></div><span className="field-help">Une vidéo d’essai avec filigrane sera offerte après inscription.</span></section><aside className="login-art"><VideoIllustration/><p>Moins de montage.<br/><em>Plus de présence.</em></p></aside></main>;
}
