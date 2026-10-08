'use client';
import {trackProductEvent} from '../lib/product-analytics';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {SocialPublication,socialStatusLabels,socialErrorMessages,type SocialPublication as Publication,type SocialTarget} from '@bienvu/contracts';
import {useAccount} from './account';
import {HomeIcon} from './home-icons';
import {NetworkMark} from './social-connections';
import {socialRequest,socialJson,socialPublicationsData,socialLocalDate,socialTimezone} from '../lib/social-client';
import {socialCalendarPreview,type CalendarPublication} from '../lib/social-calendar-preview';
import './social.css';

type Filter='all'|'scheduled'|'published'|'attention';
const dayKey=(date:Date)=>socialLocalDate(date).slice(0,10);
export function SocialCalendar(){const {me,loading,error,refresh}=useAccount();
  if(loading)return <p className="social-state" role="status">Chargement des publications…</p>;
  if(!me&&error)return <section className="social-state"><p role="alert">{error}</p><button className="social-button" type="button" onClick={()=>void refresh()}>Réessayer</button></section>;
  return <CalendarPanel key={me?.agency.id??'guest-preview'} demo={!me} editable={Boolean(me&&(me.role??'owner')!=='viewer')}/>;
}
function CalendarPanel({editable,demo=false}:{editable:boolean;demo?:boolean}){
  const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1)),[posts,setPosts]=useState<CalendarPublication[]>([]),[selectedDay,setSelectedDay]=useState<string|null>(null);
  const [filter,setFilter]=useState<Filter>('all'),[feedback,setFeedback]=useState(''),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
  const previousTargets=useRef(new Map<string,string>());
  const [alerts,setAlerts]=useState(0),[configured,setConfigured]=useState(false);
  const [preview,setPreview]=useState<Publication|null>(null),[edit,setEdit]=useState<Publication|null>(null),[confirm,setConfirm]=useState<{post:Publication;target?:SocialTarget;action:'cancel'|'retry'|'confirm-published'}|null>(null);
  const [caption,setCaption]=useState(''),[when,setWhen]=useState(''),[permalink,setPermalink]=useState('');
  const previewDialog=useRef<HTMLDialogElement>(null),editDialog=useRef<HTMLDialogElement>(null),confirmDialog=useRef<HTMLDialogElement>(null),timezone=socialTimezone();
  useEffect(()=>{let active=true;const controller=new AbortController();setLoaded(false);setFeedback('');setSelectedDay(null);
    if(demo){setPosts(socialCalendarPreview(month));setAlerts(0);setConfigured(true);setLoaded(true);return;}
    const from=new Date(month.getFullYear(),month.getMonth(),1).toISOString(),to=new Date(month.getFullYear(),month.getMonth()+1,1).toISOString();
    let refreshing=false;
    async function refresh(){if(refreshing)return;refreshing=true;try{
      const collected:Publication[]=[],seen=new Set<string>();let cursor:string|null=null,value:Record<string,unknown>;
      do{value=await socialRequest(`/api/social/publications?${new URLSearchParams({from,to,...(cursor?{cursor}:{})})}`,{signal:controller.signal});
        if(!active)return;collected.push(...socialPublicationsData(value));cursor=typeof value.nextCursor==='string'?value.nextCursor:null;
        if(cursor){if(seen.has(cursor))throw new Error('Le calendrier a changé. Actualisez-le.');seen.add(cursor);}
      }while(cursor);
      for(const post of collected)for(const target of post.targets){
        const before=previousTargets.current.get(target.id);
        if(before&&before!=='published'&&target.status==='published')trackProductEvent('publication_completed',{platform:target.platform},target.id);
        previousTargets.current.set(target.id,target.status);
      }
      setPosts([...new Map(collected.map(post=>[post.id,post])).values()]);setAlerts(Number(value.alerts??0));setConfigured(value.configured===true);setLoaded(true);
    }catch(error){if(active){setFeedback(error instanceof Error?error.message:'Chargement interrompu.');setLoaded(true);}}finally{refreshing=false;}}
    void refresh();const timer=setInterval(()=>void refresh(),20000);return()=>{active=false;controller.abort();clearInterval(timer);};
  },[demo,month.getTime(),revision]);
  useEffect(()=>{if(demo)return;const id=new URLSearchParams(window.location.search).get('post');if(!id)return;const controller=new AbortController();
    void socialRequest(`/api/social/publications/${encodeURIComponent(id)}`,{signal:controller.signal}).then(value=>{if(controller.signal.aborted)return;const post=SocialPublication.parse(value.publication),date=new Date(post.scheduledAt);setMonth(new Date(date.getFullYear(),date.getMonth(),1));})
      .catch(()=>{});return()=>controller.abort();
  },[demo]);
  useEffect(()=>{if(!preview)return;previewDialog.current?.showModal();return()=>previewDialog.current?.close();},[preview]);
  useEffect(()=>{if(!edit)return;setCaption(edit.caption);setWhen(socialLocalDate(new Date(edit.scheduledAt)));editDialog.current?.showModal();return()=>editDialog.current?.close();},[edit]);
  useEffect(()=>{if(!confirm)return;setPermalink('');confirmDialog.current?.showModal();return()=>confirmDialog.current?.close();},[confirm]);
  async function mutate(post:Publication,body:unknown){if(demo||!editable)return;setBusy(true);setFeedback('');try{
    const result=await socialRequest(`/api/social/publications/${post.id}`,{method:'PATCH',...socialJson(body)}),fresh=SocialPublication.parse(result.publication);
    setPosts(old=>old.map(p=>p.id===fresh.id?fresh:p));setConfirm(null);setEdit(null);setRevision(r=>r+1);
  }catch(error){setFeedback(error instanceof Error?error.message:'La modification a échoué.');}finally{setBusy(false);}}
  const first=new Date(month.getFullYear(),month.getMonth(),1),offset=(first.getDay()+6)%7,
    days=Array.from({length:42},(_,i)=>new Date(month.getFullYear(),month.getMonth(),1-offset+i));
  const filtered=posts.filter(post=>(!selectedDay||dayKey(new Date(post.scheduledAt))===selectedDay)&&(filter==='all'||filter==='attention'&&post.targets.some(t=>['failed','uncertain'].includes(t.status))||filter==='published'&&post.targets.some(t=>t.status==='published')||filter==='scheduled'&&post.targets.some(t=>['scheduled','processing'].includes(t.status))));
  return <section className="social-calendar-page">
    <header className="social-page-heading"><div><span className="social-kicker">INSTAGRAM & FACEBOOK</span><h1>Vos publications, au bon moment.</h1><p>Un calendrier pour suivre la diffusion de vos vidéos.</p></div><Link className="social-button" href={demo?'/connexion?next=%2Fpublications':'/agence#reseaux'}><HomeIcon name="settings" size={18}/>{demo?'Connecter mes réseaux':'Gérer mes réseaux'}</Link></header>
    {demo&&<div className="social-preview-notice"><div><span className="social-kicker">APERÇU DU CALENDRIER</span><p>Explorez quelques publications d’exemple. Connectez-vous pour programmer celles de votre agence.</p></div><Link className="social-button primary" href="/connexion?next=%2Fpublications">Se connecter pour programmer <HomeIcon name="arrow" size={18}/></Link></div>}
    <div className="social-calendar-toolbar"><div className="social-month-navigation"><button className="social-button" type="button" aria-label="Mois précédent" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}>←</button><h2>{month.toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}</h2><button className="social-button" type="button" aria-label="Mois suivant" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}>→</button><button className="social-text-button" type="button" onClick={()=>setMonth(new Date(new Date().getFullYear(),new Date().getMonth(),1))}>Aujourd’hui</button></div><span className="social-muted">{timezone}</span></div>
    <div className="social-calendar-grid" aria-label="Calendrier de publication"><div className="social-calendar-weekdays">{['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(day=><span key={day}>{day}</span>)}</div><div className="social-calendar-days">{days.map(day=>{
      const key=dayKey(day),items=posts.filter(p=>dayKey(new Date(p.scheduledAt))===key),outside=day.getMonth()!==month.getMonth();
      return <button key={key} type="button" className={`${outside?'outside ':''}${selectedDay===key?'selected ':''}${key===dayKey(new Date())?'today':''}`} aria-pressed={selectedDay===key} aria-label={`${day.toLocaleDateString('fr-FR',{day:'numeric',month:'long'})}, ${items.length} publication${items.length>1?'s':''}`} onClick={()=>{if(outside)setMonth(new Date(day.getFullYear(),day.getMonth(),1));else setSelectedDay(selectedDay===key?null:key);}}><span>{day.getDate()}</span><div>{items.slice(0,2).map(post=><small key={post.id} className={post.targets.some(t=>['failed','uncertain'].includes(t.status))?'has-error':''}><i/>{post.title}</small>)}{items.length>2&&<small>+ {items.length-2} autres</small>}</div></button>;
    })}</div></div>
    <div className="social-list-toolbar"><div className="social-filters" role="group" aria-label="Filtrer les publications">{([['all','Toutes'],['scheduled','À venir'],['published','Publiées'],['attention','À vérifier']] as const).map(([value,label])=><button type="button" aria-pressed={filter===value} className={filter===value?'selected':''} key={value} onClick={()=>setFilter(value)}>{label}</button>)}</div><Link className="social-text-button" href={demo?'/connexion?next=%2Fpublications':'/biens'}>Publier une vidéo <HomeIcon name="plus" size={18}/></Link></div>
    {selectedDay&&<p className="social-day-filter">Le {new Date(selectedDay+'T12:00:00').toLocaleDateString('fr-FR')}<button className="social-text-button" type="button" onClick={()=>setSelectedDay(null)}>Afficher tout le mois</button></p>}
    {feedback&&<p role="alert" className="social-feedback">{feedback}<button className="social-text-button" type="button" onClick={()=>setRevision(r=>r+1)}>Réessayer</button></p>}
    {!configured&&loaded&&<p className="social-notice">La connexion aux réseaux sociaux est en cours d’activation.</p>}
    {!loaded?<p role="status">Chargement du calendrier…</p>:!filtered.length?<div className="social-empty"><HomeIcon name="calendar" size={36}/><h2>{posts.length?'Aucune publication dans ce filtre.':'Votre prochain bien mérite sa publication.'}</h2><p>{demo?'Parcourez les dates et les filtres pour découvrir le calendrier. Connectez-vous pour ajouter vos propres publications.':'Depuis Mes biens, choisissez « Publier sur mes réseaux », puis une date ou une diffusion immédiate.'}</p><Link className="social-button primary" href={demo?'/connexion?next=%2Fpublications':'/biens'}>{demo?'Se connecter':'Choisir une vidéo'} <HomeIcon name="arrow" size={18}/></Link></div>:<div className="social-publication-list">{filtered.map(post=><article key={post.id} className="social-publication-card" id={`publication-${post.id}`}><div className="social-publication-summary"><button className="social-publication-thumb" type="button" onClick={()=>setPreview(post)} aria-label={`Prévisualiser ${post.title}`}><img src={demo?post.thumbnail:`/api/generations/${post.jobId}/source-photo`} alt="" loading="lazy"/><HomeIcon name="play" size={22}/></button><div><h3>{post.title}</h3><p>{new Date(post.scheduledAt).toLocaleString('fr-FR',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})} · {post.aspectRatio}</p><details><summary>Voir la légende</summary><p className="social-caption">{post.caption||'Sans légende'}</p></details></div>
        {editable&&post.targets.every(t=>t.status==='scheduled')&&<div className="social-publication-controls"><button className="social-text-button" type="button" disabled={busy} onClick={()=>setEdit(post)}>Modifier</button><button className="social-text-button" type="button" disabled={busy} onClick={()=>setConfirm({post,action:'cancel'})}>Annuler</button></div>}</div>
        <div className="social-targets">{post.targets.map(target=><div className="social-target" key={target.id}><NetworkMark platform={target.platform}/><div><strong>{target.name}</strong><span className={`social-status ${target.status}`}>{socialStatusLabels[target.status]}</span>{target.errorCode&&<p>{socialErrorMessages[target.errorCode]??'Une erreur est survenue. Réessayez.'}</p>}</div>
          <div>{target.permalink&&<a className="social-text-button" href={target.permalink} target="_blank" rel="noopener noreferrer">Voir la publication <HomeIcon name="external" size={15}/></a>}
            {editable&&target.status==='failed'&&<button className="social-text-button" disabled={busy} type="button" onClick={()=>setConfirm({post,target,action:'retry'})}>Réessayer</button>}
            {editable&&target.status==='uncertain'&&<><button className="social-text-button" disabled={busy} type="button" onClick={()=>setConfirm({post,target,action:'confirm-published'})}>Déjà publiée</button><button className="social-text-button" disabled={busy} type="button" onClick={()=>setConfirm({post,target,action:'retry'})}>Vérifier et relancer</button></>}
          </div></div>)}</div>
      </article>)}</div>}
    {alerts>0&&<p className="social-muted">{alerts} diffusion{alerts>1?'s':''} à vérifier dans l’historique de l’agence.</p>}
    {preview&&<dialog ref={previewDialog} className="social-dialog social-video-dialog" aria-labelledby="social-preview-title" onCancel={()=>setPreview(null)}><button className="social-dialog-close" type="button" onClick={()=>setPreview(null)} aria-label="Fermer"><HomeIcon name="close"/></button><h2 id="social-preview-title">{preview.title}</h2><video src={preview.videoUrl} controls autoPlay playsInline/><p>{demo?'Exemple de vidéo pour découvrir le calendrier':'Version conservée pour cette publication'} · {new Date(preview.scheduledAt).toLocaleString('fr-FR')}</p>{demo&&<Link className="social-button primary" href="/connexion?next=%2Fpublications">Programmer mes vidéos <HomeIcon name="arrow" size={18}/></Link>}</dialog>}
    {edit&&<dialog ref={editDialog} className="social-dialog" aria-labelledby="social-edit-title" onCancel={event=>{if(busy)event.preventDefault();else setEdit(null);}}><h2 id="social-edit-title">Modifier la publication</h2><form onSubmit={event=>{event.preventDefault();void mutate(edit,{action:'edit',caption,scheduledAt:new Date(when).toISOString(),timezone});}}><label className="social-field">Légende<textarea rows={6} maxLength={2200} disabled={busy} value={caption} onChange={event=>setCaption(event.target.value)}/></label><label className="social-field">Date et heure<input type="datetime-local" disabled={busy} required value={when} min={socialLocalDate(new Date(Date.now()+120000))} max={socialLocalDate(new Date(Date.now()+30*86400000))} onChange={event=>setWhen(event.target.value)}/><small>{timezone}</small></label>{feedback&&<p role="alert" className="social-feedback">{feedback}</p>}<div className="social-dialog-actions"><button className="social-button" type="button" disabled={busy} onClick={()=>setEdit(null)}>Annuler</button><button className="social-button primary" disabled={busy} type="submit">Enregistrer</button></div></form></dialog>}
    {confirm&&<dialog ref={confirmDialog} className="social-dialog" aria-labelledby="social-confirm-title" onCancel={event=>{if(busy)event.preventDefault();else setConfirm(null);}}><h2 id="social-confirm-title">{confirm.action==='cancel'?'Annuler cette publication ?':confirm.action==='confirm-published'?'Confirmer la publication':'Relancer cette diffusion ?'}</h2><p>{confirm.action==='cancel'?'La vidéo ne sera pas envoyée. Vous la retrouverez dans Mes biens.':confirm.action==='confirm-published'?'Collez le lien de la publication déjà présente sur le réseau pour la retrouver dans votre calendrier.':confirm.target?.status==='uncertain'?'Vérifiez d’abord le compte sur le réseau. En confirmant, vous indiquez que cette vidéo n’a pas été publiée et autorisez un nouvel envoi.':'Seul ce réseau sera relancé. Les publications réussies restent inchangées.'}</p>
      <form onSubmit={event=>{event.preventDefault();void mutate(confirm.post,confirm.action==='cancel'?{action:'cancel'}:confirm.action==='confirm-published'?{action:'confirm-published',targetId:confirm.target!.id,permalink}:{action:'retry',targetId:confirm.target!.id,confirmedNotPublished:confirm.target?.status==='uncertain'});}}>
        {confirm.action==='confirm-published'&&<label className="social-field">Lien de la publication<input required type="url" maxLength={2048} disabled={busy} value={permalink} onChange={event=>setPermalink(event.target.value)}/></label>}
        {feedback&&<p role="alert" className="social-feedback">{feedback}</p>}<div className="social-dialog-actions"><button className="social-button" type="button" disabled={busy} onClick={()=>setConfirm(null)}>Retour</button><button className="social-button primary" type="submit" disabled={busy}>{busy?'Enregistrement…':confirm.action==='cancel'?'Annuler la publication':confirm.action==='confirm-published'?'Confirmer':'Confirmer et relancer'}</button></div>
      </form></dialog>}
  </section>;
}
