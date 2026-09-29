'use client';
import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';
import {SignOut, useAccount} from './account';
import {HomeIcon, HomeWordmark} from './home-icons';
import {useGenerationStore} from './generation-store';

export function StudioSidebar({active}: {active: 'create' | 'videos' | 'explore' | 'agency'}) {
  const {me, loading} = useAccount();
  const [menuOpen, setMenuOpen] = useState(false);
  const store=useGenerationStore();
  const recent=[...store.jobs.map(job=>({kind:'job' as const,createdAt:job.createdAt,job})),
    ...store.drafts.map(draft=>({kind:'draft' as const,createdAt:draft.createdAt,draft}))]
    .sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,2);
  const sidebar = useRef<HTMLElement>(null), menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    sidebar.current?.querySelector<HTMLElement>('a')?.focus();
    function keyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') {setMenuOpen(false); menuButton.current?.focus();}
      if (event.key !== 'Tab') return;
      const items = [...(sidebar.current?.querySelectorAll<HTMLElement>('a,button,summary') ?? [])]
        .filter(element => element.getClientRects().length && !element.hasAttribute('disabled'));
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
    }
    document.addEventListener('keydown', keyboard);
    return () => {document.body.style.overflow = previous; document.removeEventListener('keydown', keyboard);};
  }, [menuOpen]);
  const closeMenu = () => setMenuOpen(false);
  const initials = me?.user.name.trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'BV';
  const accountName = me?.user.name.trim().split(/\s+/)[0] || 'Mon compte';
  const item = (href: string, name: string, icon: 'plus' | 'video' | 'compass' | 'house', section: typeof active) =>
    <Link className={`home-nav-item${active === section ? ' home-nav-active' : ''}`} href={href}
      aria-current={active === section ? 'page' : undefined} onClick={() => {closeMenu();if(active==='create'&&section==='create')window.dispatchEvent(new Event('bienvu:new-video'));}}>
      <HomeIcon name={icon} size={section === 'create' ? 28 : 26}/>{name}
    </Link>;
  return <>
    <header className="home-mobile-header"><Link href="/" aria-label="BienVu, accueil"><HomeWordmark/></Link><button ref={menuButton} type="button" aria-expanded={menuOpen} aria-controls="home-sidebar" aria-label={menuOpen ? 'Fermer la navigation' : 'Ouvrir la navigation'} onClick={() => setMenuOpen(value => !value)}><HomeIcon name={menuOpen ? 'close' : 'menu'}/></button></header>
    {menuOpen && <button type="button" className="home-menu-backdrop" aria-label="Fermer la navigation" onClick={closeMenu} tabIndex={-1}/>}
    <aside id="home-sidebar" ref={sidebar} className={`home-sidebar${menuOpen ? ' home-sidebar-open' : ''}`} aria-label="Votre studio BienVu">
      <Link className="home-brand-link" href="/" aria-label="BienVu, accueil" onClick={closeMenu}><HomeWordmark/></Link>
      <nav className="home-navigation" aria-label="Navigation principale">
        {item('/', 'Créer une vidéo', 'plus', 'create')}
        {item('/historique', 'Mes vidéos', 'video', 'videos')}
        {item('/explorer', 'Explorer', 'compass', 'explore')}
        {item('/agence', 'Mon agence', 'house', 'agency')}
      </nav>
      <section className="home-recents" aria-labelledby="home-recents-title"><h2 id="home-recents-title">RÉCENTES</h2>
        {recent.map(item => item.kind==='job'?<Link className="home-recent-link" key={`job:${item.job.id}`}
          href={`/historique#video-${item.job.id}`} onClick={closeMenu}>
          <img src={`/api/generations/${item.job.id}/source-photo`} alt="" onError={event=>{event.currentTarget.style.display='none';}}/>
          <span>{item.job.title||'Votre annonce'}<small>{item.job.status==='ready'?'Prête':item.job.status==='failed'?'Échec':'En cours'}
            {item.job.locality?` · ${item.job.locality}`:''}</small></span></Link>
          :<Link className="home-recent-link" key={`draft:${item.draft.id}`} href={`/?draft=${encodeURIComponent(item.draft.id)}`} onClick={closeMenu}>
            {item.draft.previewPhotoId?<img src={`/api/imports/${item.draft.id}/photos/${item.draft.previewPhotoId}`} alt=""
              onError={event=>{event.currentTarget.style.display='none';}}/>:<span className="home-recent-placeholder"><HomeIcon name="pencil" size={20}/></span>}
            <span>{item.draft.title||'Votre annonce'}<small>À compléter{item.draft.locality?` · ${item.draft.locality}`:''}</small></span>
          </Link>)}
        {!recent.length && <p className="home-recents-empty">{loading ? 'Chargement de votre espace…' : store.unavailable ? 'Vos créations sont disponibles dans Mes vidéos.' : me ? 'Vos prochaines créations apparaîtront ici.' : 'Connectez-vous pour retrouver vos créations.'}</p>}
      </section>
      <div className="home-sidebar-bottom"><div className="home-plan"><span>{me?.rights.creditKind === 'free' ? `${me.rights.developmentRemaining} crédits gratuits` : me?.rights.creditKind === 'paid' ? 'Votre abonnement' : me?.rights.generationEnabled ? 'Accès de développement' : 'Accès anticipé'}</span><Link href="/abonnement">Découvrir les offres <HomeIcon name="arrow" size={17}/></Link></div>
        {me ? <details className="home-account"><summary><span className="home-avatar">{initials}</span><span>{accountName}</span><HomeIcon name="chevron" size={17}/></summary><div className="home-account-menu"><span>{me.agency.name}</span><Link href="/agence">Mon agence</Link><Link href="/abonnement">Mon abonnement</Link><SignOut/></div></details> : <Link className="home-guest-account" href="/connexion"><span className="home-avatar"><HomeIcon name="user" size={20}/></span><span>Se connecter</span><HomeIcon name="arrow" size={17}/></Link>}
      </div>
    </aside>
  </>;
}
