'use client';
import {trackProductEvent} from '../lib/product-analytics';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {SocialPublication,type GenerationView,type SocialConnection,type SocialPublication as Publication} from '@bienvu/contracts';
import {HomeIcon} from './home-icons';
import {NetworkMark} from './social-connections';
import {socialRequest,socialJson,socialConnectionsData,socialLocalDate,socialTimezone} from '../lib/social-client';
import './social.css';

export function SocialPublishDialog({job,onClose,onPublished}:{job:GenerationView;onClose:()=>void;onPublished?:(post:Publication)=>void}){
  const dialog=useRef<HTMLDialogElement>(null),key=useRef(crypto.randomUUID());
  const [connections,setConnections]=useState<SocialConnection[]>([]),[selected,setSelected]=useState<string[]>([]),[loaded,setLoaded]=useState(false),[configured,setConfigured]=useState(false);
  const [caption,setCaption]=useState(job.title),[mode,setMode]=useState<'now'|'later'>('now'),[when,setWhen]=useState(socialLocalDate(new Date(Date.now()+3600000)));
  const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState(''),[result,setResult]=useState<Publication|null>(null);
  const timezone=socialTimezone();
  useEffect(()=>{const trigger=document.activeElement instanceof HTMLElement?document.activeElement:null;dialog.current?.showModal();
    const controller=new AbortController();
    void Promise.all([socialRequest('/api/social/connections',{signal:controller.signal}),socialRequest(`/api/social/caption/${job.id}`,{signal:controller.signal})]).then(([accounts,text])=>{
      if(controller.signal.aborted)return;setConnections(socialConnectionsData(accounts));setConfigured(accounts.configured===true);setCaption(String(text.caption));setLoaded(true);
    }).catch(error=>{if(!controller.signal.aborted){setFeedback(error.message);setLoaded(true);}});
    return()=>{controller.abort();dialog.current?.close();trigger?.focus();};
  },[job.id]);
  const eligible=(connection:SocialConnection)=>connection.status==='active'&&!(connection.platform==='facebook'&&job.aspectRatio==='16:9');
  async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);setFeedback('');
    const platforms=new Set(connections.filter(c=>selected.includes(c.id)).map(c=>c.platform));
    const properties={mode,platform:platforms.size>1?'both':[...platforms][0],destination_count:selected.length};
    trackProductEvent('publication_requested',properties,key.current);
    try{const scheduledAt=mode==='later'?new Date(when).toISOString():null;
      const value=await socialRequest('/api/social/publications',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key.current},body:JSON.stringify({jobId:job.id,connectionIds:selected,caption,scheduledAt,timezone})});
      const post=SocialPublication.parse(value.publication);setResult(post);onPublished?.(post);
      trackProductEvent('publication_created',properties,post.id);
    }catch(error){trackProductEvent('publication_failed',properties,key.current);setFeedback(error instanceof Error?error.message:'La publication n’a pas été préparée.');}finally{setBusy(false);}
  }
  function changed(){key.current=crypto.randomUUID();setFeedback('');}
  return <dialog ref={dialog} className="social-dialog social-compose-dialog" onCancel={event=>{if(busy)event.preventDefault();else onClose();}} aria-labelledby="social-compose-title">
    <button type="button" className="social-dialog-close" disabled={busy} onClick={onClose} aria-label="Fermer"><HomeIcon name="close"/></button>
    <span className="social-kicker">VOTRE VIDÉO, PRÊTE À PARTAGER</span><h2 id="social-compose-title">{result?'Publication préparée':'Publier sur vos réseaux'}</h2>
    {result?<div className="social-publish-success"><HomeIcon name="check" size={32}/><p>{mode==='later'?`Votre vidéo sera publiée le ${new Date(result.scheduledAt).toLocaleString('fr-FR',{timeZone:timezone})}.`:'Votre vidéo est en attente d’envoi. Le calendrier affichera le résultat sur chaque réseau.'}</p>
      <p>La diffusion continue même lorsque vous fermez BienVu.</p><Link href={`/publications?post=${result.id}`} className="social-button primary">Voir la publication <HomeIcon name="arrow" size={18}/></Link></div>
      :<form onSubmit={event=>void submit(event)}><div className="social-compose-grid"><div className="social-compose-preview"><video src={job.videoUrl!} controls playsInline preload="metadata" aria-label={`Vidéo à publier : ${job.title}`}/><strong>{job.title}</strong><small>Version déjà exportée · {job.aspectRatio??'9:16'} · {Math.round(job.durationSeconds??20)} s</small></div>
        <div><fieldset disabled={busy||!loaded}><legend>Où publier ?</legend><div className="social-account-choices">{connections.map(connection=><label key={connection.id} className={!eligible(connection)?'social-account-unavailable':''}><input type="checkbox" disabled={!eligible(connection)||busy} checked={selected.includes(connection.id)} onChange={event=>{changed();setSelected(old=>event.target.checked?[...old,connection.id]:old.filter(id=>id!==connection.id));}}/><NetworkMark platform={connection.platform}/><span><strong>{connection.username?`@${connection.username}`:connection.name}</strong><small>{connection.platform==='instagram'?'Instagram Reels':'Facebook Reels'}{connection.status!=='active'?' · À reconnecter':connection.platform==='facebook'&&job.aspectRatio==='16:9'?' · Vidéo verticale nécessaire':''}</small></span></label>)}</div></fieldset>
          {loaded&&!connections.length&&<p className="social-notice">Connectez vos réseaux dans <Link href="/agence#reseaux">Mon agence</Link> pour publier cette vidéo.</p>}
          {!configured&&loaded&&<p className="social-notice">La publication sur les réseaux est en cours d’activation.</p>}
          <label className="social-field">Légende<textarea value={caption} maxLength={2200} disabled={busy||!loaded} rows={6} onChange={event=>{changed();setCaption(event.target.value);}}/><small>{caption.length} / 2 200 caractères · Proposition d’après l’annonce, modifiable.</small></label>
          <fieldset disabled={busy}><legend>Quand publier ?</legend><div className="social-mode"><label><input type="radio" name="social-time" checked={mode==='now'} onChange={()=>{changed();setMode('now');}}/>Maintenant</label><label><input type="radio" name="social-time" checked={mode==='later'} onChange={()=>{changed();setMode('later');}}/>Programmer</label></div></fieldset>
          {mode==='later'&&<label className="social-field">Date et heure<input type="datetime-local" value={when} required disabled={busy} min={socialLocalDate(new Date(Date.now()+120000))} max={socialLocalDate(new Date(Date.now()+30*86400000))} onChange={event=>{changed();setWhen(event.target.value);}}/><small>Fuseau : {timezone} · Jusqu’à 30 jours à l’avance.</small></label>}
        </div></div>
        <p className="social-notice">Aucun crédit supplémentaire. Cette version de la vidéo est conservée pour la publication.</p>
        {feedback&&<p className="social-feedback" role="alert">{feedback}</p>}<div className="social-dialog-actions"><button className="social-button" disabled={busy} type="button" onClick={onClose}>Annuler</button><button className="social-button primary" disabled={busy||!loaded||!configured||!selected.length} type="submit">{busy?'Préparation…':mode==='later'?'Programmer la publication':'Publier maintenant'}<HomeIcon name="arrow" size={18}/></button></div>
      </form>}
  </dialog>;
}
