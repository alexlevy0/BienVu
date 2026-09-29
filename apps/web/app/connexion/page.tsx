import Link from 'next/link';
import {HomeWordmark} from '../../components/home-icons';
import {Login} from '../../components/login';
import {LoginDemo} from '../../components/login-demo';
import '../landing.css';
import './login.css';

export const metadata = {title: 'Connexion'};

export default function Page() {
  return <main className="login-studio">
    <section className="login-studio-left" aria-labelledby="login-studio-title">
      <header className="login-studio-header">
        <Link href="/" aria-label="BienVu, retour à l’accueil"><HomeWordmark/></Link>
        <span>Votre studio immobilier</span>
      </header>
      <div className="login-studio-content">
        <p className="login-studio-kicker">L’IMMOBILIER, EN MOUVEMENT</p>
        <h1 id="login-studio-title">Chaque bien<br/>a sa <em>story.</em></h1>
        <p className="login-studio-intro">Connectez-vous pour retrouver votre agence, vos créations et vos prochaines idées.</p>
        <Login/>
      </div>
      <footer className="login-studio-footer"><span>© BienVu</span><Link href="/explorer">Explorer les vidéos <span aria-hidden="true">↗</span></Link></footer>
    </section>
    <LoginDemo/>
  </main>;
}
