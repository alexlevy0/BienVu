'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useEffect,useRef,useState,type ComponentProps} from 'react';
import {cachedProperty,prepareProperty} from '../lib/property-navigation';

/** Prefetch on intent; a cold click keeps its source visible for at most 250 ms. */
export function PropertyLink({owner,propertyId,children,onPointerEnter,onFocus,...props}:Omit<ComponentProps<typeof Link>,'href'|'onNavigate'>&{owner:string;propertyId:string}){
 const router=useRouter(),active=useRef(true),scope=useRef(owner),[waiting,setWaiting]=useState(false);scope.current=owner;
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const href=`/biens/${encodeURIComponent(propertyId)}`;
 const warm=()=>{void prepareProperty(owner,propertyId).catch(()=>{});};
 return <Link {...props} href={href} transitionTypes={['bv-forward']} aria-busy={waiting||undefined} onPointerEnter={event=>{onPointerEnter?.(event);warm();}} onFocus={event=>{onFocus?.(event);warm();}} onNavigate={event=>{
  if(cachedProperty(owner,propertyId))return;event.preventDefault();if(waiting)return;
  setWaiting(true);const from=window.location.href;let timer:ReturnType<typeof setTimeout>|undefined;
  void Promise.race([prepareProperty(owner,propertyId).catch(()=>null),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),250);})]).then(()=>{
   clearTimeout(timer);if(!active.current||scope.current!==owner||window.location.href!==from)return;
   setWaiting(false);router.push(href,{transitionTypes:['bv-forward']});
  });
 }}>{children}</Link>;
}
