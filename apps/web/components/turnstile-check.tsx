'use client';
import {useEffect,useRef} from 'react';

type Turnstile={render:(container:HTMLElement,options:Record<string,unknown>)=>string;remove:(id:string)=>void;reset:(id:string)=>void};
declare global {interface Window {turnstile?:Turnstile}}
let scriptLoading:Promise<void>|undefined;
function loadTurnstile(){return scriptLoading??=(new Promise<void>((resolve,reject)=>{
  if(window.turnstile){resolve();return;}
  const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
  script.onload=()=>{if(window.turnstile)resolve();else{scriptLoading=undefined;script.remove();reject(new Error('Vérification indisponible. Réessayez.'));}};
  script.onerror=()=>{scriptLoading=undefined;script.remove();reject(new Error('Vérification indisponible. Réessayez.'));};document.head.appendChild(script);
}));}
export function TurnstileCheck({siteKey,action,version,onToken,onError}:{siteKey:string;action:'anonymous_trial'|'partner_application';
  version:number;onToken:(token:string)=>void;onError:(text:string)=>void}) {
  const container=useRef<HTMLDivElement>(null),callbacks=useRef({onToken,onError});
  useEffect(()=>{callbacks.current={onToken,onError};},[onToken,onError]);
  useEffect(()=>{let disposed=false,id:string|undefined;void loadTurnstile().then(()=>{
    if(disposed||!container.current||!window.turnstile)return;
    id=window.turnstile.render(container.current,{sitekey:siteKey,action,theme:'light',size:container.current.clientWidth<300?'compact':'flexible',
      callback:(token:string)=>callbacks.current.onToken(token),
      'expired-callback':()=>callbacks.current.onToken(''),
      'error-callback':()=>{callbacks.current.onToken('');callbacks.current.onError('La vérification a échoué. Rechargez-la et réessayez.');}});
  }).catch(e=>{if(!disposed)callbacks.current.onError(e instanceof Error?e.message:'La vérification est indisponible.');});
  return()=>{disposed=true;if(id)window.turnstile?.remove(id);};},[siteKey,action,version]);
  return <div ref={container} className="turnstile-check"/>;
}
