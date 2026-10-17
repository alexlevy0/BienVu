'use client';
import Link from 'next/link';
import {useState,useSyncExternalStore,ViewTransition,type ComponentProps,type ReactNode} from 'react';
import {motionName} from '../lib/view-motion-name';

// An article can appear in the featured slot, its category and related articles.
// Keep those slots distinct, then carry the clicked slot into the article header.
const origins=new Map<string,string>(),listeners=new Set<()=>void>();
function subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
function rememberOrigin(slug:string,origin:string){
  if(origins.get(slug)===origin)return;
  origins.set(slug,origin);for(const listener of listeners)listener();
}
type LinkProps=Omit<ComponentProps<typeof Link>,'href'|'prefetch'|'onNavigate'>&{slug:string;origin:string};
export function BlogLink({slug,origin,onPointerEnter,onFocus,onTouchStart,...props}:LinkProps){
  const [intent,setIntent]=useState(false);
  return <Link {...props} href={`/blog/${slug}`} prefetch={intent}
    transitionTypes={origin.startsWith('related:')?[]:['bv-forward']}
    onPointerEnter={event=>{onPointerEnter?.(event);setIntent(true);}}
    onFocus={event=>{onFocus?.(event);setIntent(true);}}
    onTouchStart={event=>{onTouchStart?.(event);setIntent(true);}}
    onNavigate={()=>rememberOrigin(slug,origin)}/>;
}
type SharedProps={slug:string;origin?:string;children:ReactNode};
function BlogSharedTransition({slug,origin,children,kind}:SharedProps&{kind:'image'|'title'}){
  const remembered=useSyncExternalStore(subscribe,()=>origins.get(slug)??'index',()=> 'index');
  return <ViewTransition name={motionName(`blog-${kind}`,`${origin??remembered}:${slug}`)} default="none" share={kind==='image'?'bv-media':'bv-text'}>{children}</ViewTransition>;
}
export function BlogCoverTransition(props:SharedProps){return <BlogSharedTransition {...props} kind="image"/>;}
export function BlogTitleTransition(props:SharedProps){return <BlogSharedTransition {...props} kind="title"/>;}
