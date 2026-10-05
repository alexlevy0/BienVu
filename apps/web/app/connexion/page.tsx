import Link from 'next/link';
import {HomeWordmark} from '../../components/home-icons';
import {Login} from '../../components/login';
import {LoginDemo} from '../../components/login-demo';
import '../landing.css';
import './login.css';

export const metadata = {title: 'Connexion', robots:{index:false,follow:true},alternates:{canonical:'/connexion'}};

export default function Page() {
  return <main className="login-studio">
    <section className="login-studio-left" aria-labelledby="login-studio-title">
      <header className="login-studio-header">
        <Link href="/" aria-label="BienVu, retour à l’accueil"><HomeWordmark/></Link>
        <span>Le studio marketing IA de votre agence immobilière.</span>
      </header>
      <div className="login-studio-content">
        <p className="login-studio-kicker">L’IMMOBILIER, EN MOUVEMENT</p>
        <h1 id="login-studio-title">Chaque bien<br/>a sa <em>story.</em></h1>
        <p className="login-studio-intro">Connectez-vous pour retrouver votre agence, vos créations et vos prochaines idées.</p>
        <Login/>
      </div>
      <footer className="login-studio-footer"><span>© BienVu</span><nav aria-label="Informations"><Link href="/confidentialite">Confidentialité</Link><Link href="/conditions">Conditions d’utilisation</Link><Link href="/explorer">Explorer <span aria-hidden="true">↗</span></Link></nav></footer>
    </section>
    <LoginDemo/>
  </main>;
}
