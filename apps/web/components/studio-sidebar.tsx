'use client';
import Link from 'next/link';
import {useEffect, useId, useLayoutEffect, useRef, useState, type SyntheticEvent} from 'react';
import {createPortal} from 'react-dom';
import {SignOut, useAccount} from './account';
import {HomeIcon, HomeWordmark} from './home-icons';
import {useGenerationStore} from './generation-store';
import {DraftActions} from './draft-actions';
import {useSiteFeatures} from './site-features';
import './studio-sidebar.css';
import {NotificationSettingsButton} from './browser-notifications';


export function StudioSidebar({active}: {active: 'create' | 'videos' | 'explore' | 'agency' | 'showcase' | 'offers' | 'projects' | 'admin' | 'editor' | 'social'}) {
  const {me, loading} = useAccount();
  const features=useSiteFeatures();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed,setCollapsed]=useState(false);
  const [tooltip,setTooltip]=useState<{label:string;top:number;left:number}|null>(null);
  const tooltipId=useId(),account=useRef<HTMLDetailsElement>(null);
  const store=useGenerationStore();
  const guestCredits=store.guestCredits;
  const recent=[...store.jobs.map(job=>({kind:'job' as const,createdAt:job.createdAt,job})),
    ...store.drafts.map(draft=>({kind:'draft' as const,createdAt:draft.createdAt,draft}))]
    .sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const sidebar = useRef<HTMLElement>(null), menuButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(()=>{
    const apply=(value:boolean)=>{document.documentElement.dataset.bienvuSidebar=value?'collapsed':'expanded';setCollapsed(value);setTooltip(null);};
    let saved=document.documentElement.dataset.bienvuSidebar==='collapsed';
    try{saved=localStorage.getItem('bienvu:sidebar:collapsed')==='1';}catch{}
    apply(saved);
    const storage=(event:StorageEvent)=>{if(event.key==='bienvu:sidebar:collapsed'||event.key===null)apply(event.newValue==='1');};
    window.addEventListener('storage',storage);
    return()=>window.removeEventListener('storage',storage);
  },[]);
  useEffect(()=>{
    const screen=matchMedia('(max-width:900px)');
    const resize=()=>{setTooltip(null);if(!screen.matches)setMenuOpen(false);};
    const scroll=()=>setTooltip(null);
    screen.addEventListener('change',resize);window.addEventListener('resize',scroll);document.addEventListener('scroll',scroll,true);
    const outside=(event:PointerEvent)=>{if(account.current?.open&&event.target instanceof Node&&!account.current.contains(event.target))account.current.open=false;};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setTooltip(null);if(account.current?.open){account.current.open=false;account.current.querySelector('summary')?.focus();}}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{screen.removeEventListener('change',resize);window.removeEventListener('resize',scroll);document.removeEventListener('scroll',scroll,true);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[]);
  const tips=(label:string)=>{
    const show=(event:SyntheticEvent<HTMLElement>)=>{
      if(!collapsed||!matchMedia('(min-width:901px)').matches)return;
      const rect=event.currentTarget.getBoundingClientRect();
      setTooltip({label,top:Math.min(innerHeight-28,Math.max(28,rect.top+rect.height/2)),left:(sidebar.current?.getBoundingClientRect().right??rect.right)+16});
    };
    return {onMouseEnter:show,onMouseLeave:()=>setTooltip(null),onFocus:show,onBlur:()=>setTooltip(null),'aria-describedby':tooltip?.label===label?tooltipId:undefined};
  };
  const toggleCollapsed=()=>{
    const next=!collapsed;setCollapsed(next);setTooltip(null);
    document.documentElement.dataset.bienvuSidebar=next?'collapsed':'expanded';
    if(account.current)account.current.open=false;
    try{localStorage.setItem('bienvu:sidebar:collapsed',next?'1':'0');}catch{/* The navigation remains usable when storage is unavailable. */}
  };
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
  const closeMenu = () => {setMenuOpen(false);setTooltip(null);if(menuOpen)menuButton.current?.focus({preventScroll:true});};
  const initials = me?.user.name.trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'BV';
  const accountName = me?.user.name.trim().split(/\s+/)[0] || 'Mon compte';
  const item = (href: string, name: string, icon: 'plus' | 'video' | 'compass' | 'house' | 'building' | 'globe' | 'folder' | 'clapper' | 'calendar', section: typeof active) =>
    <Link className={`home-nav-item${active === section ? ' home-nav-active' : ''}`} href={href} prefetch={false} aria-label={name} {...tips(name)}
      aria-current={active === section ? 'page' : undefined} onClick={() => {closeMenu();if(active==='create'&&section==='create')window.dispatchEvent(new Event('bienvu:new-video'));}}>
      <HomeIcon name={icon} size={section === 'create' ? 28 : 26}/><span className="home-nav-label">{name}</span>
      {section === 'editor' && <span className="home-nav-badge"><HomeIcon name="sparkle" size={12} filled/>Nouveau</span>}
    </Link>;
  return <>
    <header className="home-mobile-header"><Link href="/" aria-label="BienVu, accueil"><HomeWordmark/></Link><button ref={menuButton} type="button" aria-expanded={menuOpen} aria-controls="home-sidebar" aria-label={menuOpen ? 'Fermer la navigation' : 'Ouvrir la navigation'} onClick={() => setMenuOpen(value => !value)}><HomeIcon name={menuOpen ? 'close' : 'menu'}/></button></header>
    <button type="button" className={`home-menu-backdrop${menuOpen?' home-menu-backdrop-open':''}`} aria-label="Fermer la navigation" aria-hidden={!menuOpen} onClick={closeMenu} tabIndex={-1}/>
    <aside id="home-sidebar" ref={sidebar} className={`home-sidebar${menuOpen ? ' home-sidebar-open' : ''}`} aria-label="Votre studio BienVu" role={menuOpen?'dialog':undefined} aria-modal={menuOpen?true:undefined}>
      <div className="home-sidebar-header"><Link className="home-brand-link" href="/" aria-label="BienVu, accueil" onClick={closeMenu} {...tips('BienVu, accueil')}><HomeWordmark/></Link>
        <button type="button" className="home-sidebar-toggle" aria-label={collapsed?'Déplier la navigation':'Replier la navigation'} aria-expanded={!collapsed} aria-controls="home-sidebar" onClick={toggleCollapsed} {...tips('Déplier la navigation')}><HomeIcon name="collapse" size={17}/></button>
        <button type="button" className="home-sidebar-mobile-close" aria-label="Fermer la navigation" onClick={()=>{closeMenu();menuButton.current?.focus();}}><HomeIcon name="close" size={20}/></button>
      </div>
      <div className="home-sidebar-scroll">
      <nav className="home-navigation" aria-label="Navigation principale" data-analytics-public>
        {item('/', 'Créer une vidéo', 'plus', 'create')}
        {item('/biens', 'Mes biens', 'house', 'videos')}
        {features.explorer&&item('/explorer', 'Explorer', 'compass', 'explore')}
        {item('/agence', 'Mon agence', 'building', 'agency')}
        {me&&item('/ma-vitrine', 'Ma vitrine', 'globe', 'showcase')}
        {item('/editeur', 'Éditeur', 'clapper', 'editor')}
        {me&&item('/projets', 'Dossiers & modèles', 'folder', 'projects')}
        {item('/publications', 'Publications', 'calendar', 'social')}
      </nav>
      <section className="home-recents" aria-labelledby="home-recents-title"><h2 id="home-recents-title">RÉCENTS</h2>
        {me&&store.properties.length?store.properties.slice(0,12).map(property=><Link className="home-recent-link" key={property.id} href={`/biens/${encodeURIComponent(property.id)}`} onClick={closeMenu} aria-label={property.title} {...tips(property.title)}>
          {property.coverUrl?<img src={property.coverUrl} alt="" loading="lazy" decoding="async" onError={event=>{event.currentTarget.style.visibility='hidden';}}/>:<span className="home-recent-placeholder"><HomeIcon name="house" size={20}/></span>}
          <span className="home-sidebar-copy">{property.title}<small>{property.fields.locality||'Informations à compléter'}</small></span></Link>):recent.map(item => item.kind==='job'?<Link className="home-recent-link" key={`job:${item.job.id}`}
          href={me?`/biens/${encodeURIComponent(`job:${item.job.id}`)}`:`/historique/${encodeURIComponent(item.job.id)}`} onClick={closeMenu} aria-label={item.job.title||'Votre annonce'} {...tips(item.job.title||'Votre annonce')}>
          <img src={`/api/${item.job.ownership==='anonymous'?'trial':'generations'}/${item.job.id}/source-photo`} alt="" loading="lazy" decoding="async" onError={event=>{event.currentTarget.style.display='none';}}/>
          <span className="home-sidebar-copy">{item.job.title||'Votre annonce'}<small>{item.job.status==='ready'?'Prête':item.job.status==='failed'?'Échec':'En cours'}
            {item.job.locality?` · ${item.job.locality}`:''}</small></span></Link>
          :<div className="home-recent-row" key={`draft:${item.draft.id}`}><Link className="home-recent-link" href={`/biens/${encodeURIComponent(`listing:${item.draft.id}`)}`} onClick={closeMenu} aria-label={item.draft.title||'Votre annonce'} {...tips(item.draft.title||'Votre annonce')}>
            {item.draft.previewPhotoId?<img src={`/api/imports/${item.draft.id}/photos/${item.draft.previewPhotoId}`} alt="" loading="lazy" decoding="async"
              onError={event=>{event.currentTarget.style.display='none';}}/>:<span className="home-recent-placeholder"><HomeIcon name="pencil" size={20}/></span>}
            <span className="home-sidebar-copy">{item.draft.title||'Votre annonce'}<small>À compléter{item.draft.locality?` · ${item.draft.locality}`:''}</small></span>
          </Link>{me&&<DraftActions draft={item.draft} agencyId={me.agency.id}/>}</div>)}
        {!recent.length&&!store.properties.length && <p className="home-recents-empty">{loading||store.loading ? 'Chargement de votre espace…' : store.unavailable ? 'Vos créations sont disponibles dans Mes biens.' : me ? 'Vos prochains biens apparaîtront ici.' : 'Vos essais apparaîtront ici.'}</p>}
      </section>
      </div>
      <div className="home-sidebar-bottom"><div className="home-plan"><span aria-live="polite">{loading?'Chargement de vos crédits…':me?`${me.rights.developmentRemaining} crédit${me.rights.developmentRemaining>1?'s':''} disponible${me.rights.developmentRemaining>1?'s':''}`:`${guestCredits} crédit d’essai disponible`}</span>{Boolean(me?.rights.creditReserved)&&<small>{me!.rights.creditReserved} crédit(s) réservé(s)</small>}<Link href="/abonnement" className={active === 'offers' ? 'home-plan-link-active' : undefined} aria-current={active === 'offers' ? 'page' : undefined} aria-label="Découvrir les offres" {...tips(`Découvrir les offres · ${me?me.rights.developmentRemaining:guestCredits} crédit(s) disponibles`)}><span className="home-plan-icon"><HomeIcon name="coins" size={23}/></span><span className="home-sidebar-copy">Découvrir les offres</span><HomeIcon name="arrow" size={17}/></Link></div>
        {me ? <details ref={account} className="home-account"><summary aria-label={`Compte de ${accountName}`} {...tips(`Compte de ${accountName}`)} onClick={()=>setTooltip(null)}><span className="home-avatar">{initials}</span><span className="home-sidebar-copy">{accountName}</span><HomeIcon name="chevron" size={17}/></summary><div className="home-account-menu"><span>{me.agency.name}</span><Link href="/agence">Mon agence</Link><Link href="/abonnement#facturation">Abonnement et factures</Link><Link href="/equipe">Mon équipe</Link><NotificationSettingsButton/>{me.isSuperAdmin&&<Link href="/admin" aria-current={active==='admin'?'page':undefined}>Super admin</Link>}{me.isAdmin&&!me.isSuperAdmin&&<Link href="/admin" aria-current={active==='admin'?'page':undefined}>Admin</Link>}<SignOut/></div></details> : <Link className="home-guest-account" href="/connexion" aria-label="Se connecter" {...tips('Se connecter')}><span className="home-avatar"><HomeIcon name="user" size={20}/></span><span className="home-sidebar-copy">Se connecter</span><HomeIcon name="arrow" size={17}/></Link>}
      </div>
    </aside>
    {tooltip&&createPortal(<div id={tooltipId} className="home-sidebar-tooltip" role="tooltip" style={{top:tooltip.top,left:tooltip.left}}>{tooltip.label}</div>,document.body)}
  </>;
}
