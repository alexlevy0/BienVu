import Link from 'next/link';
import {Login} from '../../components/login';
import {VideoIllustration} from '../../components/video-illustration';
export const metadata = {title: 'Connexion'};
export default function Page() {
  return <main className="login-page"><section className="login-copy"><Link href="/" className="wordmark">bienvu<span className="brand-dot">.</span><span className="brand-mark">↗</span></Link><div><p className="eyebrow">BIENVENUE DANS VOTRE STUDIO</p><h1>Votre agence,<br/><em>en un seul endroit.</em></h1><Login/></div><span className="field-help">Version de développement. L’essai vidéo avec filigrane sera disponible après l’ouverture du service.</span></section><aside className="login-art"><VideoIllustration/><p>Moins de montage.<br/><em>Plus de présence.</em></p></aside></main>;
}
