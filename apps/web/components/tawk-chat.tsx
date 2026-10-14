'use client';

import {useEffect,useState} from 'react';
import {usePathname,useSearchParams} from 'next/navigation';
import Script from 'next/script';
import {prepareTawkChat,openTawkChat,resumeTawkChat,suspendTawkChat,tawkChatAllowed,TAWK_EMBED_URL} from '../lib/tawk-chat';
import '../app/tawk-chat.css';

export function TawkChat(){
  const pathname=usePathname(),params=useSearchParams();
  const [prepared,setPrepared]=useState(false),[ready,setReady]=useState(false),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0),[allowed,setAllowed]=useState(false);
  useEffect(()=>{
    const changed=()=>{const permitted=tawkChatAllowed(window.location.href);setAllowed(permitted);
      if(permitted)resumeTawkChat();else suspendTawkChat();};
    changed();
    window.addEventListener('hashchange',changed);window.addEventListener('popstate',changed);
    return()=>{window.removeEventListener('hashchange',changed);window.removeEventListener('popstate',changed);};
  },[pathname,params]);
  function open(){
    prepareTawkChat(()=>setReady(true));openTawkChat();
    if(failed){setRetry(value=>value+1);setFailed(false);}
    setPrepared(true);
  }
  return <>
    {allowed&&!ready&&<button type="button" className="tawk-chat-launcher" aria-label={failed?'Réessayer l’ouverture du chat BienVu':prepared?'Ouverture du chat BienVu…':'Discuter avec BienVu'} disabled={prepared&&!failed} onClick={open}>
      {prepared&&!failed?<span className="tawk-chat-loading" aria-hidden="true"/>:<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><path fill="currentColor" d="M16 3a12 12 0 0 0-5 23l-1 4 6-3A12 12 0 0 0 16 3Z"/><path d="M11 19c3 2 7 2 10 0" stroke="#e1e9da" strokeWidth="2" strokeLinecap="round" fill="none"/></svg>}
    </button>}
    {prepared&&<Script id={`bienvu-tawk-chat${retry?`-${retry}`:''}`} src={TAWK_EMBED_URL+(retry?`?bienvu_retry=${retry}`:'')} strategy="afterInteractive" charSet="UTF-8" crossOrigin="anonymous" referrerPolicy="no-referrer" onError={()=>{setReady(false);setFailed(true);}}/>}
  </>;
}
