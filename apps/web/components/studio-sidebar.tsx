'use client';
import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';
import {SignOut, useAccount} from './account';
import {HomeIcon, HomeWordmark} from './home-icons';
import {useGenerationStore} from './generation-store';
import {DraftActions} from './draft-actions';


export function StudioSidebar({active}: {active: 'create' | 'videos' | 'explore' | 'agency' | 'offers' | 'projects' | 'admin' | 'editor' | 'social'}) {
  const {me, loading} = useAccount();
  const [menuOpen, setMenuOpen] = useState(false);
  const store=useGenerationStore();
  const [guestCredits,setGuestCredits]=useState(1);
  useEffect(()=>{if(me||loading)return;const controller=new AbortController();
    void fetch('/api/trial/history',{cache:'no-store',signal:controller.signal}).then(async response=>{
      if(!response.ok)return;const data=await response.json() as {creditsRemaining?:number};
      if(Number.isInteger(data.creditsRemaining))setGuestCredits(data.creditsRemaining!);
    }).catch(()=>{});return()=>controller.abort();
  },[me?.agency.id,loading,store.jobs.map(job=>`${job.id}:${job.status}`).join(',')]);
  const recent=[...store.jobs.map(job=>({kind:'job' as const,createdAt:job.createdAt,job})),
    ...store.drafts.map(draft=>({kind:'draft' as const,createdAt:draft.createdAt,draft}))]
    .sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
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
  const item = (href: string, name: string, icon: 'plus' | 'video' | 'compass' | 'house' | 'building' | 'folder' | 'clapper' | 'calendar', section: typeof active) =>
    <Link className={`home-nav-item${active === section ? ' home-nav-active' : ''}`} href={href} prefetch={false}
      aria-current={active === section ? 'page' : undefined} onClick={() => {closeMenu();if(active==='create'&&section==='create')window.dispatchEvent(new Event('bienvu:new-video'));}}>
      <HomeIcon name={icon} size={section === 'create' ? 28 : 26}/>{name}
      {section === 'editor' && <span className="home-nav-badge"><HomeIcon name="sparkle" size={12} filled/>Nouveau</span>}
    </Link>;
  return <>
    <header className="home-mobile-header"><Link href="/" aria-label="BienVu, accueil"><HomeWordmark/></Link><button ref={menuButton} type="button" aria-expanded={menuOpen} aria-controls="home-sidebar" aria-label={menuOpen ? 'Fermer la navigation' : 'Ouvrir la navigation'} onClick={() => setMenuOpen(value => !value)}><HomeIcon name={menuOpen ? 'close' : 'menu'}/></button></header>
    <button type="button" className={`home-menu-backdrop${menuOpen?' home-menu-backdrop-open':''}`} aria-label="Fermer la navigation" aria-hidden={!menuOpen} onClick={closeMenu} tabIndex={-1}/>
    <aside id="home-sidebar" ref={sidebar} className={`home-sidebar${menuOpen ? ' home-sidebar-open' : ''}`} aria-label="Votre studio BienVu">
      <Link className="home-brand-link" href="/" aria-label="BienVu, accueil" onClick={closeMenu}><HomeWordmark/></Link>
      <nav className="home-navigation" aria-label="Navigation principale" data-analytics-public>
        {item('/', 'Créer une vidéo', 'plus', 'create')}
        {item('/biens', 'Mes biens', 'house', 'videos')}
        {item('/explorer', 'Explorer', 'compass', 'explore')}
        {item('/agence', 'Mon agence', 'building', 'agency')}
        {item('/editeur', 'Éditeur', 'clapper', 'editor')}
        {item('/projets', 'Dossiers & modèles', 'folder', 'projects')}
        {item('/publications', 'Publications', 'calendar', 'social')}
      </nav>
      <section className="home-recents" aria-labelledby="home-recents-title"><h2 id="home-recents-title">RÉCENTS</h2>
        {me&&store.properties.length?store.properties.slice(0,12).map(property=><Link className="home-recent-link" key={property.id} href={`/biens/${encodeURIComponent(property.id)}`} onClick={closeMenu}>
          {property.coverUrl?<img src={property.coverUrl} alt="" loading="lazy" decoding="async" onError={event=>{event.currentTarget.style.visibility='hidden';}}/>:<span className="home-recent-placeholder"><HomeIcon name="house" size={20}/></span>}
          <span>{property.title}<small>{property.fields.locality||'Informations à compléter'}</small></span></Link>):recent.map(item => item.kind==='job'?<Link className="home-recent-link" key={`job:${item.job.id}`}
          href={me?`/biens/${encodeURIComponent(`job:${item.job.id}`)}`:`/historique/${encodeURIComponent(item.job.id)}`} onClick={closeMenu}>
          <img src={`/api/${item.job.ownership==='anonymous'?'trial':'generations'}/${item.job.id}/source-photo`} alt="" loading="lazy" decoding="async" onError={event=>{event.currentTarget.style.display='none';}}/>
          <span>{item.job.title||'Votre annonce'}<small>{item.job.status==='ready'?'Prête':item.job.status==='failed'?'Échec':'En cours'}
            {item.job.locality?` · ${item.job.locality}`:''}</small></span></Link>
          :<div className="home-recent-row" key={`draft:${item.draft.id}`}><Link className="home-recent-link" href={`/biens/${encodeURIComponent(`listing:${item.draft.id}`)}`} onClick={closeMenu}>
            {item.draft.previewPhotoId?<img src={`/api/imports/${item.draft.id}/photos/${item.draft.previewPhotoId}`} alt="" loading="lazy" decoding="async"
              onError={event=>{event.currentTarget.style.display='none';}}/>:<span className="home-recent-placeholder"><HomeIcon name="pencil" size={20}/></span>}
            <span>{item.draft.title||'Votre annonce'}<small>À compléter{item.draft.locality?` · ${item.draft.locality}`:''}</small></span>
          </Link>{me&&<DraftActions draft={item.draft} agencyId={me.agency.id}/>}</div>)}
        {!recent.length&&!store.properties.length && <p className="home-recents-empty">{loading||store.loading ? 'Chargement de votre espace…' : store.unavailable ? 'Vos créations sont disponibles dans Mes biens.' : me ? 'Vos prochains biens apparaîtront ici.' : 'Vos essais apparaîtront ici.'}</p>}
      </section>
      <div className="home-sidebar-bottom"><div className="home-plan"><span aria-live="polite">{loading?'Chargement de vos crédits…':me?`${me.rights.developmentRemaining} crédit${me.rights.developmentRemaining>1?'s':''} disponible${me.rights.developmentRemaining>1?'s':''}`:`${guestCredits} crédit d’essai disponible`}</span>{Boolean(me?.rights.creditReserved)&&<small>{me!.rights.creditReserved} crédit(s) réservé(s)</small>}<Link href="/abonnement" className={active === 'offers' ? 'home-plan-link-active' : undefined} aria-current={active === 'offers' ? 'page' : undefined}>Découvrir les offres <HomeIcon name="arrow" size={17}/></Link></div>
        {me ? <details className="home-account"><summary><span className="home-avatar">{initials}</span><span>{accountName}</span><HomeIcon name="chevron" size={17}/></summary><div className="home-account-menu"><span>{me.agency.name}</span><Link href="/agence">Mon agence</Link><Link href="/abonnement">Mon abonnement</Link><Link href="/equipe">Mon équipe</Link>{me.isSuperAdmin&&<Link href="/admin" aria-current={active==='admin'?'page':undefined}>Super admin</Link>}<SignOut/></div></details> : <Link className="home-guest-account" href="/connexion"><span className="home-avatar"><HomeIcon name="user" size={20}/></span><span>Se connecter</span><HomeIcon name="arrow" size={17}/></Link>}
      </div>
    </aside>
  </>;
}
