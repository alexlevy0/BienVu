'use client';
import {useEffect} from 'react';
import {captureBoundaryException} from '../lib/product-analytics';

export function ErrorFallback({error,retry,global=false}:{error:Error&{digest?:string};retry:()=>void;global?:boolean}){
 useEffect(()=>{void captureBoundaryException(error,global?'react_global':'react_boundary');},[error,global]);
 return <main style={{minHeight:global?'100vh':'60vh',display:'grid',placeItems:'center',padding:'32px 20px',background:'#faf9f6',color:'#1a251c',fontFamily:'Arial, sans-serif'}}>
  <section style={{width:'100%',maxWidth:540,textAlign:'center'}}>
   <p style={{letterSpacing:3,fontSize:13,color:'#6d8065'}}>BIENVU</p>
   <h1 style={{fontFamily:'Georgia, serif',fontSize:36,fontWeight:400}}>Une interruption momentanée.</h1>
   <p style={{lineHeight:1.7,color:'#64705d'}}>La page n’a pas pu s’afficher. Vous pouvez réessayer ou revenir à l’accueil.</p>
   <div style={{display:'flex',justifyContent:'center',flexWrap:'wrap',gap:16,marginTop:24}}>
    <button type="button" onClick={retry} style={{padding:'14px 24px',background:'#203b2a',color:'white',border:0,borderRadius:8,fontSize:16,cursor:'pointer'}}>Réessayer</button>
    <a href="/" style={{padding:'14px 24px',border:'1px solid #bdcbb5',borderRadius:8,color:'inherit'}}>Retour à l’accueil</a>
   </div>
  </section>
 </main>;
}
