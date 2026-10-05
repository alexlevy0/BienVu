'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {propertyFacts,propertyPrice,type PropertySummary} from '@bienvu/contracts';
import {useAccount} from './account';
import {useGenerationStore} from './generation-store';
import {HomeIcon} from './home-icons';
import {propertyRequest} from '../lib/property-client';

type Page={properties:PropertySummary[];total:number;nextCursor:string|null};
export function PropertyLibrary(){
  const {me,loading}=useAccount(),store=useGenerationStore(),owner=me?.agency.id??'guest';
  const [data,setData]=useState<{scope:string;page:Page}|null>(null),[query,setQuery]=useState(''),[search,setSearch]=useState('');
  const [filter,setFilter]=useState('all'),[sort,setSort]=useState('updated'),[layout,setLayout]=useState<'grid'|'list'>('grid');
  const [feedback,setFeedback]=useState(''),[pending,setPending]=useState<string|null>(null),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  const scopeKey=`${owner}:${search}:${filter}:${sort}`,scope=useRef(scopeKey);scope.current=scopeKey;
  const previousJobs=useRef('');
  const [archive,setArchive]=useState<PropertySummary|null>(null),dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const timer=setTimeout(()=>setSearch(query.trim()),250);return()=>clearTimeout(timer);},[query]);
  const parameters=()=>new URLSearchParams({q:search,filter,sort});
  useEffect(()=>{setData(null);setFeedback('');setArchive(null);setPending(null);setBusy(false);if(loading||!me)return;
    const controller=new AbortController();void propertyRequest<Page>(`/api/properties?${parameters()}`,{signal:controller.signal})
      .then(page=>{if(!controller.signal.aborted&&scope.current===scopeKey)setData({scope:scopeKey,page});})
      .catch(error=>{if(!controller.signal.aborted&&scope.current===scopeKey)setFeedback(error.message);});
    return()=>controller.abort();
  },[owner,loading,search,filter,sort,revision]);
  useEffect(()=>{if(!archive)return;const trigger=document.activeElement as HTMLElement|null;dialog.current?.showModal();return()=>{dialog.current?.close();trigger?.focus();};},[archive]);
  useEffect(()=>{const ready=store.jobs.map(j=>`${j.id}:${j.status}`).join('|');if(previousJobs.current&&previousJobs.current!==ready)setRevision(n=>n+1);previousJobs.current=ready;},[store.jobs]);
  useEffect(()=>{const deleted=(event:Event)=>{if((event as CustomEvent<{agencyId:string}>).detail.agencyId===owner)setRevision(n=>n+1);};
    window.addEventListener('bienvu:draft-deleted',deleted);return()=>window.removeEventListener('bienvu:draft-deleted',deleted);},[owner]);
  const page=data?.scope===scopeKey?data.page:null;
  async function more(){if(!page?.nextCursor||busy)return;setBusy(true);setFeedback('');const params=parameters();params.set('cursor',page.nextCursor);
    try{const next=await propertyRequest<Page>(`/api/properties?${params}`);if(scope.current!==scopeKey)return;
      setData(old=>old?.scope===scopeKey?{scope:scopeKey,page:{...next,properties:[...old.page.properties,...next.properties.filter(p=>!old.page.properties.some(o=>o.id===p.id))]}}:old);
    }catch(error){if(scope.current===scopeKey)setFeedback(error instanceof Error?error.message:'Chargement interrompu.');}finally{if(scope.current===scopeKey)setBusy(false);}}
  async function archiveProperty(property:PropertySummary){setArchive(null);setPending(property.id);setFeedback('');
    try{await propertyRequest(`/api/properties/${encodeURIComponent(property.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({archived:!property.archived})});
      if(scope.current===scopeKey){setRevision(n=>n+1);await store.refresh();}
    }catch(error){if(scope.current===scopeKey)setFeedback(error instanceof Error?error.message:'Modification interrompue.');}finally{if(scope.current===scopeKey)setPending(null);}}
  const guestJobs=store.jobs.filter(j=>!search||`${j.title} ${j.locality??''}`.toLocaleLowerCase('fr-FR').includes(search.toLocaleLowerCase('fr-FR')));
  return <section className="property-library" aria-labelledby="property-library-title">
    <header className="property-library-heading"><div><h1 id="property-library-title">Mes biens</h1><p>Vos biens et tous leurs contenus, au même endroit.</p></div>
      {me?.role!=='viewer'&&<Link className="property-primary" href="/?manuel=1"><HomeIcon name="plus" size={22}/>Ajouter un bien</Link>}</header>
    <label className="property-search"><HomeIcon name="search" size={22}/><span className="sr-only">Rechercher un bien, une ville, une référence</span>
      <input maxLength={80} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Rechercher un bien, une ville, une référence…"/></label>
    <div className="property-toolbar"><div className="property-filters" role="group" aria-label="Filtrer les biens">{([['all','Tous les biens'],['sale','À vendre'],['rent','À louer'],['archived','Archivés']] as const).map(([value,label])=>
      <button type="button" key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}</div>
      <div className="property-view-options"><div className="property-layout" role="group" aria-label="Affichage des biens"><button type="button" aria-label="Vue grille" aria-pressed={layout==='grid'} onClick={()=>setLayout('grid')}><HomeIcon name="grid" size={20}/></button>
        <button type="button" aria-label="Vue liste" aria-pressed={layout==='list'} onClick={()=>setLayout('list')}><HomeIcon name="list" size={20}/></button></div>
        <label className="property-sort"><span className="sr-only">Trier les biens</span><select value={sort} onChange={event=>setSort(event.target.value)}><option value="updated">Modifiés récemment</option><option value="newest">Ajoutés récemment</option><option value="oldest">Les plus anciens</option><option value="title">Nom du bien</option></select><HomeIcon name="chevron" size={16}/></label></div></div>
    {feedback&&<p className="property-feedback" role="alert">{feedback} <button type="button" onClick={()=>setRevision(n=>n+1)}>Réessayer</button></p>}
    {loading||me&&!page&&!feedback?<p className="property-notice" role="status">Chargement de vos biens…</p>:null}
    {!loading&&!me&&<><p className="property-notice">Vos essais restent disponibles dans ce navigateur. <Link href="/connexion?next=%2Fbiens">Connectez-vous</Link> pour retrouver vos biens et tous leurs contenus.</p>
      {filter==='all'&&<div className={`property-grid${layout==='list'?' is-list':''}`}>{guestJobs.map(job=><article className="property-card" key={job.id}><Link className="property-cover" href={`/historique/${job.id}`}><img src={`/api/trial/${job.id}/source-photo`} alt="" loading="lazy"/><span className="property-badge">Essai</span></Link><div className="property-card-body"><h2><Link href={`/historique/${job.id}`}>{job.title}</Link></h2><p className="property-card-facts">{job.locality}</p><p className="property-card-counts">{job.status==='ready'?'1 vidéo':job.status==='failed'?'Création à reprendre':'Vidéo en préparation'}</p><Link className="property-open" href={`/historique/${job.id}`}>Ouvrir mon essai <HomeIcon name="arrow" size={18}/></Link></div></article>)}</div>}
      {(!guestJobs.length||filter!=='all')&&<div className="property-empty"><HomeIcon name="house" size={34}/><h2>Votre prochain bien commence ici.</h2><p>Ajoutez une annonce et préparez ses contenus.</p><Link className="property-primary" href="/?manuel=1">Ajouter un bien <HomeIcon name="plus" size={18}/></Link></div>}</>}
    {me&&page&&<>{page.properties.length===0?<div className="property-empty"><HomeIcon name={filter==='archived'?'archive':'house'} size={34}/><h2>{search||filter!=='all'?'Aucun bien dans cette sélection.':'Votre premier bien vous attend.'}</h2><p>{search||filter!=='all'?'Essayez une autre recherche ou un autre filtre.':'Importez votre annonce ou ajoutez vos informations et vos photos.'}</p>{me.role!=='viewer'&&filter==='all'&&!search&&<Link className="property-primary" href="/?manuel=1">Ajouter un bien <HomeIcon name="plus" size={18}/></Link>}</div>:
      <div className={`property-grid${layout==='list'?' is-list':''}`}>{page.properties.map(property=>{
        const href=`/biens/${encodeURIComponent(property.id)}`,count=property.videoCount+property.visualCount+property.textCount;
        return <article className="property-card" key={property.id}><div className="property-cover"><Link href={href} aria-label={`Ouvrir ${property.title}`}>{property.coverUrl?<img src={property.coverUrl} alt="" loading="lazy" onError={event=>{event.currentTarget.style.visibility='hidden';}}/>:<span className="property-cover-empty"><HomeIcon name="house" size={38}/></span>}</Link>
          <span className={`property-badge${property.fields.transaction==='rent'?' is-rent':''}`}>{property.archived?'Archivé':property.fields.transaction==='rent'?'À louer':property.fields.transaction==='sale'?'À vendre':'À compléter'}</span>
          <details className="property-card-menu"><summary aria-label={`Actions pour ${property.title}`}><HomeIcon name="more" size={19}/></summary><div><Link href={href}>Ouvrir le bien</Link>{me.role!=='viewer'&&<button type="button" disabled={pending===property.id} onClick={()=>setArchive(property)}><HomeIcon name="archive" size={16}/>{property.archived?'Restaurer le bien':'Archiver le bien'}</button>}</div></details></div>
          <div className="property-card-body"><h2><Link href={href}>{property.title}</Link></h2><p className="property-card-facts">{propertyFacts(property.fields)||'Informations à compléter'}</p>
            {propertyPrice(property.fields)&&<strong className="property-card-price">{propertyPrice(property.fields)}</strong>}
            <p className="property-card-counts">{[property.videoCount?`${property.videoCount} vidéo${property.videoCount>1?'s':''}`:null,
              property.visualCount?`${property.visualCount} visuel`:null,property.textCount?`${property.textCount} texte`:null,property.draftCount?`${property.draftCount} brouillon${property.draftCount>1?'s':''}`:null].filter(Boolean).join(' · ')||'Vos contenus apparaîtront ici'}</p>
            {property.attentionCount>0&&<p className="property-attention"><span aria-hidden="true">!</span>{property.attentionCount} contenu{property.attentionCount>1?'s':''} à reprendre</p>}
            {property.thumbnails.length>0&&<div className="property-thumbnails" aria-hidden="true">{property.thumbnails.map(photo=><img key={photo.id} src={photo.url} alt="" loading="lazy"/>)}{property.photoCount>3&&<span>+{property.photoCount-3}</span>}</div>}
            <Link className="property-open" href={href}>Ouvrir le bien <HomeIcon name="arrow" size={17}/></Link><span className="sr-only">{count} contenus · {property.reference}</span>
          </div></article>;
      })}</div>}
      {page.nextCursor&&<button className="property-more" type="button" disabled={busy} onClick={()=>void more()}>{busy?'Chargement…':'Afficher plus de biens'}</button>}</>}
    {archive&&me&&<dialog className="property-dialog" ref={dialog} onCancel={()=>setArchive(null)} aria-labelledby="property-archive-title"><h2 id="property-archive-title">{archive.archived?'Restaurer ce bien ?':'Archiver ce bien ?'}</h2><p>« {archive.title} » {archive.archived?'réapparaîtra dans vos biens actifs.':'sera déplacé dans les archives. Ses photos, vidéos et publications seront conservées.'}</p><div className="property-dialog-actions"><button className="property-button" type="button" onClick={()=>setArchive(null)}>Annuler</button><button className="property-primary" type="button" onClick={()=>void archiveProperty(archive)}>{archive.archived?'Restaurer':'Archiver'}</button></div></dialog>}
  </section>;
}
