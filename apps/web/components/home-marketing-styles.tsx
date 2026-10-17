'use client';
import {useEffect} from 'react';

const href=`/media/ui/home-marketing.css?v=${process.env.NEXT_PUBLIC_BIENVU_RELEASE??'development'}`;
const id='bienvu-home-marketing-css';
function loadStyles(){
 if(document.getElementById(id))return;
 const link=document.createElement('link');link.id=id;link.rel='stylesheet';link.href=href;link.media='print';link.fetchPriority='low';
 link.addEventListener('load',()=>{link.media='all';},{once:true});
 // Typography and composer overrides keep their original cascade priority.
 document.head.insertBefore(link,document.head.querySelector('style,link[rel="stylesheet"]'));
}
// Start before hydration on direct visits; the effect also covers client-side
// navigation. Only a fixed, build-versioned local asset URL enters this script.
const bootstrap=`(()=>{if(document.getElementById('${id}'))return;const l=document.createElement('link');l.id='${id}';l.rel='stylesheet';l.href=${JSON.stringify(href)};l.media='print';l.fetchPriority='low';l.addEventListener('load',()=>{l.media='all'},{once:true});document.head.insertBefore(l,document.head.querySelector('style,link[rel="stylesheet"]'))})()`;
export function HomeMarketingStyles(){
 useEffect(loadStyles,[]);
 return <><link rel="preload" href={href} as="style" fetchPriority="low"/><script dangerouslySetInnerHTML={{__html:bootstrap}}/><noscript><link rel="stylesheet" href={href}/></noscript></>;
}
