'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useEffect, useState} from 'react';
import {Icon, type IconName} from './icon';
import {useAccount} from './account';
import {readListingDraft} from '../lib/listing-draft';
const navigation: {href: string; name: string; icon: IconName}[] = [
  {href: '/studio', name: 'Vue d’ensemble', icon: 'grid'},
  {href: '/generer', name: 'Créer une vidéo', icon: 'spark'},
  {href: '/historique', name: 'Mes vidéos', icon: 'history'},
  {href: '/agence', name: 'Mon agence', icon: 'building'},
  {href: '/abonnement', name: 'Mon abonnement', icon: 'card'},
];
export function Shell({children}: {children: React.ReactNode}) {
  const pathname = usePathname();
  const {me} = useAccount();
  const [hasDraft, setHasDraft] = useState(false);
  useEffect(() => {setHasDraft(Boolean(readListingDraft()));}, [pathname]);
  return <div className="app-shell"><a className="skip-link" href="#contenu">Aller au contenu</a><aside className="sidebar">
    <Link href="/" className="wordmark" aria-label="BienVu, accueil">bienvu<span className="brand-dot">.</span><span className="brand-mark">↗</span></Link>
    <div className="workspace"><span className="workspace-avatar"><Icon name="building"/></span><div><strong>{me?.agency.name ?? "Votre espace agence"}</strong><span>{me ? "Identité enregistrée" : "Connectez-vous pour commencer"}</span></div></div><p className="nav-label">VOTRE STUDIO</p>
    <nav aria-label="Navigation principale">{navigation.map(item => <Link key={item.href} href={item.href} className={`nav-link ${pathname === item.href ? 'active' : ''}`} aria-current={pathname === item.href ? 'page' : undefined}><Icon name={item.icon}/>{item.name}{pathname === item.href && <span className="active-dot"/>}</Link>)}</nav>
    <div className="sidebar-bottom"><div className="trial-note"><span className="mini-label">POUR COMMENCER</span><strong>Votre première vidéo,<br/>pour vous faire une idée.</strong><p>Un aperçu filigrané avant inscription. Connectez-vous pour récupérer votre essai sans filigrane.</p><Link href="/abonnement">Découvrir le fonctionnement <Icon name="arrow" size={16}/></Link></div><Link className="login-link" href="/connexion"><span className="account-dot"><Icon name="lock" size={16}/></span>{me ? "Mon compte" : "Se connecter"}<Icon name="arrow" size={16}/></Link></div>
    </aside><div className="workspace-main"><header className="topbar"><Link href="/connexion">{me ? "Mon compte" : "Se connecter"}</Link><span className="development-badge"><span/>Version de développement</span></header><main id="contenu" tabIndex={-1}>{me && hasDraft && pathname !== '/generer' && <div className="information-note"><strong>Votre annonce vous attend.</strong><p>Retrouvez la préparation commencée sur l’accueil.</p><Link className="text-button" href="/generer">Reprendre mon annonce →</Link></div>}{children}</main><footer className="app-footer"><span>BienVu · De belles annonces, de belles histoires.</span><Link href="/laboratoire">État du projet</Link></footer></div></div>;
}
