'use client';
import {useEffect,useRef,useState} from 'react';
import {homepageSlots,type HomepageAdmin,type HomepageAsset,type HomepageCandidate,type HomepageLibrary,type HomepageSource,type HomepageSlot} from '@bienvu/contracts';
import {HomepageMediaProvider,useHomepageMedia,homeClock} from './homepage-media';
import {HomeIcon} from './home-icons';

type Slot=typeof homepageSlots[number];
const groups=[...new Set(homepageSlots.map(slot=>slot.group))];
const labels={photo:'Photo importée',video:'Vidéo complète',animation:'Vidéo IA',library:'Vidéo IA conservée'};
async function request<T>(url:string,init?:RequestInit):Promise<T>{
 const response=await fetch(url,{cache:'no-store',...init}),body=await response.json() as {fields?:Record<string,string>;error?:{code?:string}};
 if(!response.ok)throw Object.assign(new Error(body.fields?.media??(body.error?.code==='CONFLICT'?'La sélection a été modifiée dans un autre onglet. La dernière version a été rechargée.':body.error?.code==='NOT_FOUND'?'Ce fichier n’est plus disponible. Choisissez un autre média.':'Le chargement a échoué. Vous pouvez réessayer.')),{code:body.error?.code});
 return body as T;
}
function thumb(asset:HomepageAsset){return asset.kind==='image'?asset.url:asset.posterUrl;}
function SlotCard({slot,asset,busy,onChoose,onReset}:{slot:Slot;asset?:HomepageAsset;busy:boolean;onChoose():void;onReset():void}){
 const media=useHomepageMedia(slot.id),poster=media.kind==='image'?media.src:media.poster;
 return <article className="admin-home-slot" data-home-slot={slot.id}>
  <div className="admin-home-slot-visual">{poster?<img src={poster} alt="" loading="lazy"/>:<span><HomeIcon name="video" size={32}/></span>}<span className="admin-home-kind">{slot.kind==='image'?'Photo':slot.kind==='video'?'Vidéo':'Photo ou vidéo'}</span></div>
  <div className="admin-home-slot-copy"><h4>{slot.label}</h4><p>{asset?asset.title:media.custom?(slot.id.endsWith('.video')?'Vidéo du visuel choisi':'Couverture de la vidéo choisie'):'Visuel par défaut'}</p>{asset?.agency&&<small>{asset.agency}{asset.durationMs?` · ${homeClock(asset.durationMs/1000)}`:''}</small>}
   <div className="admin-home-slot-actions"><button className="admin-button" type="button" onClick={onChoose} disabled={busy}>Choisir</button>{asset&&<button type="button" className="admin-home-reset" onClick={onReset} disabled={busy}>Par défaut</button>}</div>
  </div>
 </article>;
}
export function AdminHomepage(){
 const [state,setState]=useState<HomepageAdmin|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [slot,setSlot]=useState<Slot|null>(null),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[kind,setKind]=useState('all'),[page,setPage]=useState<HomepageLibrary|null>(null),[libraryBusy,setLibraryBusy]=useState(false),[more,setMore]=useState(false),[libraryError,setLibraryError]=useState(''),[retry,setRetry]=useState(0),[preview,setPreview]=useState<HomepageCandidate|null>(null);
 const dialog=useRef<HTMLDialogElement>(null),pending=useRef<{action:'assign';revision:number;slot:HomepageSlot;source:HomepageSource|null;requestId:string}|null>(null),morePending=useRef(false);
 async function reload(){const value=await request<HomepageAdmin>('/api/admin/homepage');setState(value);return value;}
 useEffect(()=>{const controller=new AbortController();void request<HomepageAdmin>('/api/admin/homepage',{signal:controller.signal}).then(setState).catch(cause=>{if(!controller.signal.aborted)setError(cause.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[]);
 useEffect(()=>{const timer=setTimeout(()=>setSearch(query.trim()),250);return()=>clearTimeout(timer);},[query]);
 useEffect(()=>{
  if(!slot)return;const modal=dialog.current,trigger=document.activeElement instanceof HTMLElement?document.activeElement:null;
  modal?.showModal();return()=>{modal?.close();trigger?.focus();};
 },[slot]);
 useEffect(()=>{
  if(!slot)return;const controller=new AbortController();setLibraryBusy(true);setLibraryError('');setPage(null);setPreview(null);
  const params=new URLSearchParams({section:'library',kind,q:search});
  void request<HomepageLibrary>('/api/admin/homepage?'+params,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setPage(value);}).catch(cause=>{if(!controller.signal.aborted)setLibraryError(cause.message);}).finally(()=>{if(!controller.signal.aborted)setLibraryBusy(false);});return()=>controller.abort();
 },[slot,kind,search,retry]);
 function choose(value:Slot){setError('');setQuery('');setSearch('');setKind(value.kind==='image'?'photo':value.kind==='video'?'video':'all');setSlot(value);setPreview(null);}
 async function assign(source:HomepageSource|null,target=slot){
  if(!target||!state||saving)return;setSaving(true);setError('');setLibraryError('');setNotice('');
  const same=pending.current&&pending.current.slot===target.id&&pending.current.revision===state.revision&&JSON.stringify(pending.current.source)===JSON.stringify(source);
  const command=same?pending.current!:{action:'assign' as const,revision:state.revision,slot:target.id,source,requestId:crypto.randomUUID()};pending.current=command;
  try{setState(await request<HomepageAdmin>('/api/admin/homepage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)}));pending.current=null;setSlot(null);setNotice('Sélection enregistrée dans le brouillon. Ouvrez l’aperçu avant de publier.');}
  catch(cause){const failure=cause as Error&{code?:string};if(failure.code==='CONFLICT'){pending.current=null;await reload().catch(()=>{});}if(slot)setLibraryError(failure.message);else setError(failure.message);}
  finally{setSaving(false);}
 }
 async function apply(action:'publish'|'discard'){
  if(!state||saving)return;setSaving(true);setError('');setNotice('');
  try{setState(await request<HomepageAdmin>('/api/admin/homepage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,revision:state.revision})}));pending.current=null;setNotice(action==='publish'?'Les visuels sont publiés sur la page d’accueil.':'Le brouillon reprend les visuels actuellement publiés.');}
  catch(cause){const failure=cause as Error&{code?:string};if(failure.code==='CONFLICT')await reload().catch(()=>{});setError(failure.message);}finally{setSaving(false);}
 }
 async function loadMore(){
  if(!page?.nextCursor||morePending.current)return;morePending.current=true;setMore(true);setLibraryError('');
  const cursor=page.nextCursor,params=new URLSearchParams({section:'library',kind,q:search,cursor});
  try{const next=await request<HomepageLibrary>('/api/admin/homepage?'+params);setPage(before=>before?.nextCursor===cursor?{...next,items:[...before.items,...next.items]}:before);}
  catch(cause){setLibraryError((cause as Error).message);}finally{morePending.current=false;setMore(false);}
 }
 const changed=state&&homepageSlots.some(s=>(state.draft[s.id]??null)!==(state.published[s.id]??null));
 const config={version:state?.revision??0,slots:Object.fromEntries(homepageSlots.flatMap(s=>{const id=state?.draft[s.id],asset=id?state?.assets[id]:null;return asset?[[s.id,asset]]:[];}))};
 return <section className="admin-home" aria-label="Visuels de la page d’accueil">
  <div className="admin-home-toolbar"><div><h2>La page d’accueil, à votre image.</h2><p>Choisissez parmi les médias de toutes les agences. Les sélections restent privées jusqu’à leur publication.</p><small>{state?.publishedAt?'Dernière publication : '+new Date(state.publishedAt).toLocaleString('fr-FR'):'Les visuels par défaut sont actuellement en ligne.'}</small></div>
   <div className="admin-home-tools"><a className="admin-button" href="/?homePreview=1" target="_blank" rel="noopener">Aperçu du brouillon <HomeIcon name="external" size={16}/></a><button type="button" className="admin-button" disabled={!changed||saving} onClick={()=>void apply('discard')}>Annuler les changements</button><button type="button" className="admin-button admin-button-dark" disabled={!changed||saving} onClick={()=>void apply('publish')}>{saving?'Enregistrement…':'Publier les visuels'}</button></div>
  </div>
  {notice&&<p className="admin-notice" role="status">{notice}</p>}{error&&<p className="admin-error" role="alert">{error}{!state&&<button type="button" className="admin-button" onClick={()=>void reload().then(()=>setError('')).catch(cause=>setError(cause.message))}>Réessayer</button>}</p>}
  {loading?<p role="status" className="admin-loading">Chargement des visuels…</p>:state&&<HomepageMediaProvider config={config}>{groups.map(group=><section className="admin-home-group" key={group}><h3>{group}</h3><div className="admin-home-slots">{homepageSlots.filter(s=>s.group===group).map(s=><SlotCard key={s.id} slot={s} asset={state.draft[s.id]?state.assets[state.draft[s.id]!]:undefined} busy={saving} onChoose={()=>choose(s)} onReset={()=>void assign(null,s)}/>)}</div></section>)}</HomepageMediaProvider>}
  <p className="admin-home-note">Les médias publiés sont conservés pour la page d’accueil, même si l’annonce ou le fichier d’origine est retiré. Une vidéo sélectionnée fournit aussi sa couverture lorsqu’aucun visuel distinct n’est choisi.</p>
  {slot&&<dialog ref={dialog} className="admin-dialog admin-home-picker" aria-labelledby="admin-home-picker-title" onCancel={event=>{if(saving)event.preventDefault();else setSlot(null);}} onClick={event=>{if(event.target===event.currentTarget&&!saving)setSlot(null);}}>
   <div className="admin-dialog-top"><div><span className="admin-eyebrow">TOUTE LA BANQUE BIENVU</span><h2 id="admin-home-picker-title">{slot.label}</h2></div><button type="button" className="admin-close" disabled={saving} aria-label="Fermer le sélecteur de médias" onClick={()=>setSlot(null)}><HomeIcon name="close"/></button></div>
   <div className="admin-home-picker-filters"><label><span className="sr-only">Rechercher un média</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} maxLength={120} placeholder="Annonce, agence, ville ou identifiant…" disabled={saving}/></label><label><span className="sr-only">Type de média</span><select value={kind} onChange={event=>setKind(event.target.value)} disabled={saving}>
    {slot.kind==='visual'&&<option value="all">Tous les médias</option>}{slot.kind!=='video'&&<option value="photo">Photos importées</option>}{slot.kind!=='image'&&<><option value="video">Vidéos complètes</option><option value="animation">Vidéos IA</option></>}
   </select></label><span>{page?`${page.total} média${page.total>1?'s':''}`:'Toutes les agences'}</span></div>
   {libraryError&&<p role="alert" className="admin-error">{libraryError}<button type="button" className="admin-button" disabled={saving} onClick={()=>setRetry(n=>n+1)}>Réessayer le chargement</button></p>}
   {preview&&<div className="admin-home-source-preview"><div>{preview.kind==='video'?<video key={preview.url} src={preview.url} poster={preview.posterUrl??undefined} controls autoPlay playsInline preload="metadata"/>:<img src={preview.url} alt={preview.title}/>}</div><div><strong>{preview.title}</strong><p>{preview.agency??'Agence BienVu'}{preview.locality?` · ${preview.locality}`:''}</p><small>{labels[preview.source.kind]}{preview.durationMs?` · ${homeClock(preview.durationMs/1000)}`:''}</small><button type="button" className="admin-button admin-button-dark" disabled={saving||!preview.available} onClick={()=>void assign(preview.source)}>{saving?'Copie du média…':'Utiliser ce média'}</button><button type="button" className="admin-home-reset" disabled={saving} onClick={()=>setPreview(null)}>Fermer l’aperçu</button></div></div>}
   {libraryBusy?<p role="status" className="admin-loading">Recherche des médias…</p>:<div className="admin-home-library">{page?.items.map(item=><article key={item.source.kind+item.id} className={!item.available?'is-unavailable':''}>
    <button type="button" className="admin-home-library-preview" disabled={!item.available||saving} onClick={()=>setPreview(item)} aria-label={`Prévisualiser ${item.title}`}>{thumb(item)&&item.available?<img src={thumb(item)!} alt="" loading="lazy"/>:<HomeIcon name={item.kind==='video'?'video':'image'} size={34}/>}<span>{item.available?(item.kind==='video'?'Lire l’aperçu':'Agrandir'):'Fichier indisponible'}</span></button>
    <div className="admin-home-library-copy"><small>{labels[item.source.kind]}{item.durationMs?` · ${homeClock(item.durationMs/1000)}`:''}</small><strong title={item.title}>{item.title}</strong><p>{item.agency??'Agence BienVu'}{item.locality?` · ${item.locality}`:''}</p><button type="button" className="admin-button" disabled={!item.available||saving} onClick={()=>void assign(item.source)}>Choisir ce média</button></div>
   </article>)}</div>}
   {!libraryBusy&&page?.total===0&&<p className="admin-loading">Aucun média ne correspond à votre recherche.</p>}
   {page?.nextCursor&&<div className="admin-home-more"><button type="button" className="admin-button" disabled={more||saving} onClick={()=>void loadMore()}>{more?'Chargement…':'Voir plus de médias'}</button></div>}
   <p className="admin-home-note">Choisir un média l’ajoute au brouillon de la page d’accueil. La publication se fait ensuite avec « Publier les visuels ».</p>
  </dialog>}
 </section>;
}
