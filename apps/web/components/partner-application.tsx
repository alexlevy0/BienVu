'use client';
import {analyticsFetch as fetch,trackProductEvent} from '../lib/product-analytics';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {PartnerApplication,partnerActivities} from '@bienvu/contracts';
import {HomeIcon} from './home-icons';
import {TurnstileCheck} from './turnstile-check';

export function PartnerApplicationForm() {
  const [config,setConfig]=useState<{enabled:boolean;siteKey:string|null}|null>(null),[loading,setLoading]=useState(false);
  const [name,setName]=useState(''),[email,setEmail]=useState(''),[activity,setActivity]=useState(''),[token,setToken]=useState('');
  const [failure,setFailure]=useState(''),[pending,setPending]=useState(false),[received,setReceived]=useState(false),[version,setVersion]=useState(0),[challenge,setChallenge]=useState(false);
  const intent=useRef<{key:string;fingerprint:string}|null>(null),locked=useRef(false),form=useRef<HTMLFormElement>(null);
  const load=useCallback(async(signal?:AbortSignal)=>{setLoading(true);try{const response=await fetch('/api/partners/applications',{cache:'no-store',signal});
    const body=await response.json() as {enabled?:unknown;siteKey?:unknown};if(!response.ok||typeof body.enabled!=='boolean'||body.enabled&&typeof body.siteKey!=='string')throw 0;
    setConfig({enabled:body.enabled,siteKey:typeof body.siteKey==='string'?body.siteKey:null});
    setFailure(body.enabled?'':'Les candidatures sont momentanément indisponibles. Réessayez ou contactez-nous.');
  }catch{if(!signal?.aborted)setFailure('Le formulaire est momentanément indisponible. Réessayez ou contactez-nous.');}
  finally{if(!signal?.aborted)setLoading(false);}},[]);
  // Fetch the public configuration when the visitor reaches the application.
  useEffect(()=>{const controller=new AbortController(),observer=new IntersectionObserver(entries=>{
    if(entries.some(entry=>entry.isIntersecting)){void load(controller.signal);observer.disconnect();}
  },{rootMargin:'180px'});if(form.current)observer.observe(form.current);return()=>{observer.disconnect();controller.abort();};},[load]);
  async function submit(event:FormEvent) {
    event.preventDefault();if(locked.current||received)return;
    const parsed=PartnerApplication.safeParse({name,email,activity});
    if(!parsed.success){setFailure('Complétez votre nom, votre e-mail et votre activité.');return;}
    if(!config?.enabled){setFailure('Le formulaire est momentanément indisponible. Vous pouvez nous écrire à contact@bienvu.online.');if(!loading)void load();return;}
    if(!token&&!intent.current){setChallenge(true);setFailure('Confirmez la vérification ci-dessous, puis envoyez votre candidature.');return;}
    const fingerprint=JSON.stringify(parsed.data);
    if(intent.current?.fingerprint!==fingerprint){
      if(!token){setChallenge(true);setFailure('Validez la vérification avant d’envoyer votre candidature modifiée.');return;}
      intent.current={key:crypto.randomUUID(),fingerprint};
    }
    locked.current=true;setPending(true);setFailure('');
    try {
      const response=await fetch('/api/partners/applications',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':intent.current!.key},
        body:JSON.stringify({...parsed.data,turnstileToken:token})});
      const body=await response.json() as {received?:boolean;error?:{code?:string;message?:string}};
      if(!response.ok||body.received!==true){
        if(body.error?.code==='BOT_VERIFICATION_FAILED'){setChallenge(true);intent.current=null;}
        if(body.error?.code==='CONFLICT')intent.current=null;
        throw new Error(body.error?.code==='RATE_LIMITED'?'Plusieurs demandes ont été envoyées. Réessayez plus tard ou contactez-nous.':body.error?.message??'Votre candidature n’a pas été enregistrée. Réessayez.');
      }
      setReceived(true);intent.current=null;
    }catch(error){setFailure(error instanceof Error?error.message:'La connexion a été interrompue. Réessayez pour confirmer votre candidature.');}
    finally{setPending(false);locked.current=false;setToken('');setVersion(value=>value+1);}
  }
  return <form ref={form} className="partner-application-form" method="post" action="/api/partners/applications" onSubmit={submit} onFocusCapture={()=>trackProductEvent('partner_application_started',{},'form')} aria-label="Candidature au programme partenaires">
    {received?<div className="partner-application-success" role="status"><HomeIcon name="check" size={30}/><h3>Votre candidature est bien reçue.</h3>
      <p>Notre équipe vous recontactera à l’adresse {email.trim()} pour échanger sur votre activité et vos recommandations.</p></div>:<>
      <fieldset disabled={pending}><div className="partner-application-fields">
        <label htmlFor="partner-name">Votre nom<input id="partner-name" name="name" autoComplete="name" required minLength={2} maxLength={120} placeholder="Votre nom" value={name} onChange={e=>setName(e.target.value)}/></label>
        <label htmlFor="partner-email">E-mail professionnel<input id="partner-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="votre@entreprise.fr" value={email} onChange={e=>setEmail(e.target.value)}/></label>
        <label htmlFor="partner-activity" className="partner-activity">Votre activité<select id="partner-activity" name="activity" required value={activity} onChange={e=>setActivity(e.target.value)}>
          <option value="" disabled>Sélectionnez votre activité</option>{partnerActivities.map(activity=><option key={activity.value} value={activity.value}>{activity.label}</option>)}</select></label>
      </div></fieldset>
      {challenge&&config?.siteKey&&<div className="partner-bot-check"><p>Vérifiez que vous êtes humain.</p><TurnstileCheck siteKey={config.siteKey} action="partner_application" version={version} onToken={setToken} onError={setFailure}/>
        <button type="button" onClick={()=>{setToken('');setFailure('');setVersion(value=>value+1);}}>Recharger la vérification</button></div>}
      {failure&&<p className="partner-form-error" role="alert">{failure}</p>}
      {(config&&!config.enabled||!config&&failure)&&<p className="partner-form-fallback"><button type="button" disabled={loading} onClick={()=>void load()}>Réessayer</button> · <a href="mailto:contact@bienvu.online">Nous contacter</a></p>}
      <button type="submit" className="partner-submit" disabled={pending||loading||!config?.enabled}>{pending?'Envoi en cours…':'Envoyer ma candidature'}<HomeIcon name="arrow" size={18}/></button>
      <noscript><p>Activez JavaScript pour envoyer le formulaire ou <a href="mailto:contact@bienvu.online">contactez-nous par e-mail</a>.</p></noscript>
      <p className="partner-form-privacy">Vos informations servent à traiter votre candidature. <Link href="/confidentialite#donnees">Confidentialité</Link> · <a href="#conditions-programme">Conditions du programme</a></p>
    </>}
  </form>;
}
