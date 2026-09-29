'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {GenerationView,publicErrors,type PublicErrorCode} from '@bienvu/contracts';
import {generationActive} from './generation-progress';
// The token lives only in memory. The HttpOnly session is the ownership proof.
type Turnstile={render:(container:HTMLElement,options:Record<string,unknown>)=>string;remove:(id:string)=>void;reset:(id:string)=>void};
declare global {interface Window {turnstile?:Turnstile}}
let scriptLoading:Promise<void>|undefined;
function loadTurnstile(){return scriptLoading??=(new Promise<void>((resolve,reject)=>{
  if(window.turnstile){resolve();return;}
  const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
  script.onload=()=>resolve();script.onerror=()=>{scriptLoading=undefined;reject(new Error('Vérification indisponible. Réessayez.'));};document.head.appendChild(script);
}));}
type TrialReply={error?:{message?:string};enabled:boolean;siteKey:string|null;used:boolean;job:unknown};
async function value(response:Response){const body=await response.json() as TrialReply;if(!response.ok)throw new Error(body.error?.message??'La demande a été interrompue. Réessayez.');return body;}
export function useAnonymousTrial(enabled:boolean) {
  const [job,setJob]=useState<GenerationView|null>(null),[siteKey,setSiteKey]=useState<string|null>(null),[available,setAvailable]=useState(false),[used,setUsed]=useState(false),[failure,setFailure]=useState(''),[loaded,setLoaded]=useState(false);
  const [token,setToken]=useState(''),[challenge,setChallenge]=useState(false),[widgetVersion,setWidgetVersion]=useState(0);
  const lock=useRef(false),intent=useRef<{url:string;key:string}|null>(null);
  const refresh=useCallback(async()=>{try{const data=await value(await fetch('/api/trial',{cache:'no-store'}));setAvailable(data.enabled);setSiteKey(data.siteKey);setUsed(data.used);setJob(data.job?GenerationView.parse(data.job):null);setLoaded(true);setFailure('');}catch{setFailure('Impossible de retrouver votre essai. Réessayez.');setLoaded(true);}},[]);
  useEffect(()=>{if(enabled)void refresh();},[enabled,refresh]);
  useEffect(()=>{if(!enabled||!job||!generationActive(job)||job.ownership==='owned')return;const timer=setInterval(()=>void refresh(),4000);return()=>clearInterval(timer);},[enabled,job?.id,job?.status,job?.ownership,refresh]);
  async function start(url:string,verifiedToken?:string) {
    if(lock.current)return;setFailure('');
    if(!loaded){setFailure('Votre navigateur est en cours de vérification. Réessayez dans un instant.');return;}
    if(!available){setFailure(publicErrors.ANONYMOUS_UNAVAILABLE[1]);return;}
    if(used){setFailure(publicErrors.TRIAL_USED[1]);return;}
    if(job&&generationActive(job)){return;}
    const currentToken=verifiedToken??token;
    if(!currentToken&&!intent.current){setChallenge(true);return;}
    if(intent.current?.url!==url)intent.current={url,key:crypto.randomUUID()};
    if(!intent.current)intent.current={url,key:crypto.randomUUID()};
    lock.current=true;
    try{
      const response=await fetch('/api/trial',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':intent.current.key},body:JSON.stringify({url,turnstileToken:currentToken})});
      const body=await response.json() as {error?:{code?:string;message?:string}};if(!response.ok){if(body.error?.code==='BOT_VERIFICATION_FAILED'){intent.current=null;setChallenge(true);}throw new Error(body.error?.message??'La création n’a pas démarré. Réessayez.');}
      setJob(GenerationView.parse(body));setChallenge(false);intent.current=null;
    }catch(e){setFailure(e instanceof Error?e.message:'La connexion a été interrompue. Réessayez pour retrouver votre demande.');}
    finally{setToken('');setWidgetVersion(n=>n+1);lock.current=false;}
  }
  return {job,siteKey,available,used,failure,challenge,setChallenge,widgetVersion,setWidgetVersion,loaded,token,setToken,setFailure,start,refresh};
}
export function TrialChallenge({siteKey,version,onToken,onError,purpose='trial'}:{siteKey:string;version:number;onToken:(token:string)=>void;
  onError:(text:string)=>void;purpose?:'trial'|'description'}) {
  const container=useRef<HTMLDivElement>(null);
  const callbacks=useRef({onToken,onError});
  useEffect(()=>{callbacks.current={onToken,onError};},[onToken,onError]);
  useEffect(()=>{let disposed=false,id:string|undefined;void loadTurnstile().then(()=>{
    if(disposed||!container.current||!window.turnstile)return;
    id=window.turnstile.render(container.current,{sitekey:siteKey,action:'anonymous_trial',theme:'light',size:'flexible',
      callback:(token:string)=>callbacks.current.onToken(token),
      'expired-callback':()=>callbacks.current.onToken(''),
      'error-callback':()=>{callbacks.current.onToken('');callbacks.current.onError('La vérification a échoué. Rechargez-la et réessayez.');}});
  }).catch(e=>{if(!disposed)callbacks.current.onError(e.message);});
  return()=>{disposed=true;if(id)window.turnstile?.remove(id);};},[siteKey,version]);
  return <div className="trial-challenge"><p>{purpose==='description'?'Vérifiez que vous êtes humain pour préparer votre annonce.':'Vérifiez que vous êtes humain pour lancer la création.'}</p><div ref={container}/></div>;
}
const steps:Record<GenerationView['status'],string>={queued:'Votre vidéo attend son démarrage',importing:'Lecture de l’annonce',scripting:'Rédaction de la narration',voicing:'Création de la voix off',rendering:'Préparation de la vidéo',retry_wait:'Reprise en attente',ready:'Votre vidéo est prête',failed:'La création n’a pas abouti'};
export function AnonymousTrialResult({job}:{job:GenerationView}) {
  const [failure,setFailure]=useState(''),[busy,setBusy]=useState(false);
  async function connect(){setBusy(true);setFailure('');try{await value(await fetch(`/api/trial/${job.id}/login`,{method:'POST'}));window.location.assign('/connexion?trial=1');}catch(e){setFailure(e instanceof Error?e.message:'Réessayez.');setBusy(false);}}
  const expired=job.retention!=='available'||new Date(job.expiresAt).getTime()<=Date.now();
  return <section className="trial-result" aria-label="Votre essai"><h3 aria-live="polite">{expired?'Cet essai a expiré':steps[job.status]}</h3>
    {expired?<p>Votre aperçu n’est plus disponible. Aucun nouveau traitement n’a été lancé.</p>:job.ownership==='owned'?<p>Cette vidéo a été enregistrée dans un compte. <Link href="/essai/recuperer">Retrouver ma vidéo</Link></p>:<>
      {generationActive(job)&&<><ol className="generation-steps" aria-label="Étapes de création">{(['importing','scripting','voicing','rendering'] as const).map((s,i)=><li key={s} aria-current={job.stage===s?'step':undefined}>{i+1}. {['Annonce','Texte','Voix','Vidéo'][i]}</li>)}</ol><p>Vous pouvez revenir sur cette page depuis ce navigateur. Votre vidéo y sera conservée.</p><button type="button" className="text-button" disabled={busy} onClick={()=>void connect()}>Me connecter pendant la création</button></>}
      {job.status==='failed'&&<p role="alert">{publicErrors[job.errorCode as PublicErrorCode]?.[1]??publicErrors.GENERATION_FAILED[1]}</p>}
      {job.videoUrl&&<><video className="generated-video" src={job.videoUrl} controls playsInline preload="metadata" controlsList="nodownload" aria-label="Aperçu complet de votre vidéo avec filigrane"/>
        <p className="field-help">Voix de synthèse · Aperçu disponible jusqu’au {new Date(job.expiresAt).toLocaleString('fr-FR')}.</p><button className="home-primary-button" type="button" disabled={busy} onClick={()=>void connect()}>{busy?'Ouverture…':'Télécharger sans filigrane'}</button><p>Créez votre compte gratuitement pour récupérer votre vidéo.</p></>}
    </>}{failure&&<p role="alert">{failure}</p>}
  </section>;
}
