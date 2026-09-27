'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Icon, type IconName} from './icon';
const navigation: {href: string; name: string; icon: IconName}[] = [
  {href: '/', name: 'Vue d’ensemble', icon: 'grid'},
  {href: '/generer', name: 'Créer une vidéo', icon: 'spark'},
  {href: '/historique', name: 'Mes vidéos', icon: 'history'},
  {href: '/agence', name: 'Mon agence', icon: 'building'},
  {href: '/abonnement', name: 'Mon abonnement', icon: 'card'},
];
export function Shell({children}: {children: React.ReactNode}) {
  const pathname = usePathname();
  return <div className="app-shell"><a className="skip-link" href="#contenu">Aller au contenu</a><aside className="sidebar">
    <Link href="/" className="wordmark" aria-label="BienVu, accueil">bienvu<span className="brand-dot">.</span><span className="brand-mark">↗</span></Link>
    <div className="workspace"><span className="workspace-avatar"><Icon name="building"/></span><div><strong>Votre espace agence</strong><span>Configuration à venir</span></div></div><p className="nav-label">VOTRE STUDIO</p>
    <nav aria-label="Navigation principale">{navigation.map(item => <Link key={item.href} href={item.href} className={`nav-link ${pathname === item.href ? 'active' : ''}`} aria-current={pathname === item.href ? 'page' : undefined}><Icon name={item.icon}/>{item.name}{pathname === item.href && <span className="active-dot"/>}</Link>)}</nav>
    <div className="sidebar-bottom"><div className="trial-note"><span className="mini-label">POUR COMMENCER</span><strong>Votre première vidéo,<br/>pour vous faire une idée.</strong><p>Un essai avec filigrane sera offert après inscription.</p><Link href="/abonnement">Découvrir le fonctionnement <Icon name="arrow" size={16}/></Link></div><Link className="login-link" href="/connexion"><span className="account-dot"><Icon name="lock" size={16}/></span>Connexion à venir<Icon name="arrow" size={16}/></Link></div>
    </aside><div className="workspace-main"><header className="topbar"><span>Votre studio immobilier</span><span className="development-badge"><span/>Version de développement</span></header><main id="contenu" tabIndex={-1}>{children}</main><footer className="app-footer"><span>BienVu · De belles annonces, de belles histoires.</span><Link href="/laboratoire">État du projet</Link></footer></div></div>;
}
