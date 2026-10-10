'use client';

import {useEffect,useState} from 'react';
import {usePathname,useSearchParams} from 'next/navigation';
import Script from 'next/script';
import {prepareTawkChat,resumeTawkChat,suspendTawkChat,tawkChatAllowed,TAWK_EMBED_URL} from '../lib/tawk-chat';

export function TawkChat(){
  const pathname=usePathname(),params=useSearchParams();
  const [prepared,setPrepared]=useState(false);
  useEffect(()=>{
    if(!tawkChatAllowed(window.location.href)){suspendTawkChat();return;}
    prepareTawkChat();setPrepared(true);resumeTawkChat();
    const changed=()=>{if(tawkChatAllowed(window.location.href))resumeTawkChat();else suspendTawkChat();};
    window.addEventListener('hashchange',changed);window.addEventListener('popstate',changed);
    return()=>{window.removeEventListener('hashchange',changed);window.removeEventListener('popstate',changed);};
  },[pathname,params]);
  if(!prepared)return null;
  return <Script id="bienvu-tawk-chat" src={TAWK_EMBED_URL} strategy="lazyOnload" charSet="UTF-8" crossOrigin="anonymous" referrerPolicy="no-referrer"/>;
}
