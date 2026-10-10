'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {PromotionCode,promotionErrors,type PromotionPreview} from '@bienvu/contracts';

const storageKey='bienvu:subscription-promotion';
export function SubscriptionPromotion({agencyId,disabled,onApplied}:{agencyId?:string;disabled:boolean;onApplied:(value:PromotionPreview|null)=>void}) {
  const [open,setOpen]=useState(false),[code,setCode]=useState(''),[preview,setPreview]=useState<PromotionPreview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const controller=useRef<AbortController|null>(null),apply=useRef(onApplied);apply.current=onApplied;
  function clear(){controller.current?.abort();setPreview(null);apply.current(null);setError('');setBusy(false);try{sessionStorage.removeItem(storageKey);}catch{}}
  async function validate(input:string){
    controller.current?.abort();const c=new AbortController();controller.current=c;setBusy(true);setError('');setPreview(null);apply.current(null);
    try{
      const normalized=PromotionCode.safeParse(input);if(!normalized.success)throw Error(promotionErrors.invalid);
      const r=await fetch('/api/billing/promotion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:normalized.data}),signal:c.signal});
      const data=await r.json() as PromotionPreview&{fields?:{promotion?:string}};
      if(!r.ok)throw Error(r.status===429?'Trop d’essais. Patientez une minute.':promotionErrors[data.fields?.promotion??'']??'Vérification momentanément indisponible.');
      if(c.signal.aborted)return;setPreview(data);setCode(data.code);apply.current(data);
      try{sessionStorage.setItem(storageKey,JSON.stringify({code:data.code,expires:Date.now()+86400_000}));}catch{}
    }catch(cause){if(!c.signal.aborted){setError(cause instanceof Error?cause.message:'Vérification interrompue.');try{sessionStorage.removeItem(storageKey);}catch{}}}
    finally{if(!c.signal.aborted)setBusy(false);}
  }
  useEffect(()=>{
    let stored:{code:string;expires:number}|null=null;try{stored=JSON.parse(sessionStorage.getItem(storageKey)??'null');}catch{}
    controller.current?.abort();setPreview(null);apply.current(null);setBusy(false);setError('');try{
      if(stored&&stored.expires>Date.now()&&PromotionCode.safeParse(stored.code).success){setOpen(true);setCode(stored.code);void validate(stored.code);}
    }catch{}
    return()=>controller.current?.abort();
  // Revalidate when the selected agency changes, including after sign-in.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[agencyId]);
  function submit(e:FormEvent){e.preventDefault();if(!disabled&&!busy)void validate(code);}
  return <section className="offers-promotion" aria-label="Code bonus d’abonnement">
    <button className="offers-promotion-toggle" type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>J’ai un code bonus <span aria-hidden="true">{open?'−':'+'}</span></button>
    {open&&<><form onSubmit={submit}><label htmlFor="subscription-promotion-code">Code bonus</label><div><input id="subscription-promotion-code" value={code} maxLength={32} autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={disabled} placeholder="Votre code" onChange={e=>{clear();setCode(e.target.value);}}/><button className="offers-action offers-action-outline" type="submit" disabled={disabled||busy||!code.trim()}>{busy?'Vérification…':'Appliquer'}</button>{preview&&<button type="button" className="offers-promotion-remove" onClick={()=>{clear();setCode('');}} disabled={disabled}>Retirer</button>}</div></form>
      <p>Code facultatif · +20 % de crédits sur la première mensualité payée. Prix inchangé. Un bonus d’abonnement par agence, sans cumul. Les recharges ne sont pas concernées.</p>
      {preview&&<p role="status" className="offers-promotion-success">Code {preview.code} appliqué. Le bonus est indiqué sur les offres éligibles ci-dessous. Il sera valable pendant la première mensualité, sans report.</p>}
      {error&&<p role="alert" className="offers-payment-error">{error}</p>}
    </>}
  </section>;
}
