'use client';
import {useEffect,useId,useState} from 'react';
import type {GenerationView} from '@bienvu/contracts';
import './generation-map-confirmation.css';

export function GenerationMapConfirmation({job,onRefresh}:{job:GenerationView;onRefresh?:()=>Promise<void>}){
  const confirmation=job.mapConfirmation,id=useId();
  const [selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false),[feedback,setFeedback]=useState(''),[expired,setExpired]=useState(false);
  useEffect(()=>{setSelected('');setSaved(false);setFeedback('');setExpired(false);},[job.id,confirmation?.expiresAt]);
  useEffect(()=>{if(!confirmation)return;const tick=()=>setExpired(Date.now()>=Date.parse(confirmation.expiresAt));tick();
    const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[confirmation?.expiresAt]);
  if(!confirmation)return null;
  async function confirm(candidateId:string|null){
    setBusy(true);setFeedback('');
    try{
      const response=await fetch(`/api/${job.ownership==='anonymous'?'trial':'generations'}/${encodeURIComponent(job.id)}/map`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidateId})});
      if(!response.ok){const reply=await response.json() as {error?:{code?:string}};
        if(reply.error?.code==='CONFLICT'){setExpired(true);throw new Error('La sélection est déjà terminée. Le suivi va s’actualiser.');}
        throw new Error('La confirmation n’a pas abouti. Votre choix est conservé ; réessayez.');}
      setSaved(true);setFeedback(candidateId===null?'Choix enregistré. La vidéo continue sans carte.':'Ville confirmée. Préparation de la carte…');
      try{await onRefresh?.();}catch{/* The regular job poll reconciles a committed choice. */}
    }catch(cause){setFeedback(cause instanceof Error?cause.message:'Connexion interrompue. Votre choix est conservé ; réessayez.');}
    finally{setBusy(false);}
  }
  return <div className="generation-map-confirmation" onClick={e=>e.stopPropagation()}>
    {saved?<p role="status">{feedback}</p>:<>
      <label htmlFor={id}>Quelle ville souhaitez-vous montrer ?</label>
      <select id={id} value={selected} disabled={busy||expired} onChange={e=>setSelected(e.target.value)}>
        <option value="">Choisir la bonne ville…</option>{confirmation.options.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
      <div className="generation-map-confirmation-actions"><button type="button" disabled={!selected||busy||expired} onClick={()=>void confirm(selected)}>{busy?'Confirmation…':'Confirmer la ville'}</button>
        <button type="button" className="generation-map-skip" disabled={busy||expired} onClick={()=>void confirm(null)}>Continuer sans carte</button></div>
      <p className="generation-map-confirmation-help">{expired?'Le délai de confirmation est terminé. La vidéo va continuer sans carte.':'La génération attend votre choix. Sans réponse sous cinq minutes, elle continue sans carte.'}</p>
      {feedback&&<p role="alert">{feedback}</p>}
    </>}
  </div>;
}
