'use client';
import {useRef,useState} from 'react';

const categories=[['photos','Photos'],['voice','Voix off'],['facts','Texte ou informations'],['technical','Problème technique'],['other','Autre']] as const;
export function ProblemReport({jobId,anonymous=false}:{jobId:string;anonymous?:boolean}){
  const [open,setOpen]=useState(false),[category,setCategory]=useState('photos'),[comment,setComment]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[received,setReceived]=useState(false);
  const pending=useRef<{fingerprint:string;key:string}|null>(null);
  async function send(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(busy||!comment.trim())return;
    const body={category,comment:comment.trim()},fingerprint=JSON.stringify(body);
    if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,key:crypto.randomUUID()};
    setBusy(true);setError('');try{const response=await fetch(`/api/${anonymous?'trial':'generations'}/${jobId}/report`,{
      method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':pending.current.key},body:fingerprint});
      if(!response.ok)throw new Error('Le signalement n’a pas été enregistré. Réessayez.');
      setReceived(true);setOpen(false);pending.current=null;
    }catch(e){setError(e instanceof Error?e.message:'Réessayez.');}finally{setBusy(false);}}
  return <div className="problem-report">
    {received?<p role="status">Signalement reçu.</p>:<>
      <button type="button" className="problem-report-link" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>Signaler un problème</button>
      {open&&<form onSubmit={event=>void send(event)}><label htmlFor={`report-category-${jobId}`}>Catégorie</label>
        <select id={`report-category-${jobId}`} value={category} onChange={event=>setCategory(event.target.value)}>
          {categories.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select>
        <label htmlFor={`report-comment-${jobId}`}>Décrivez le problème</label>
        <textarea id={`report-comment-${jobId}`} required minLength={1} maxLength={1000} rows={3} value={comment}
          onChange={event=>setComment(event.target.value)} aria-describedby={`report-help-${jobId}`}/>
        <small id={`report-help-${jobId}`}>{comment.length}/1 000 caractères</small>
        {error&&<p role="alert">{error}</p>}
        <button type="submit" disabled={busy||!comment.trim()}>{busy?'Envoi…':'Envoyer le signalement'}</button>
      </form>}
    </>}
  </div>;
}
