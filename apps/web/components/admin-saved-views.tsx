'use client';
import {useEffect,useState} from 'react';
import type {AdminSection} from '@bienvu/contracts';

export type AdminListFilters={q:string;status:string;from:string;to:string;agency:string};
const empty:AdminListFilters={q:'',status:'',from:'',to:'',agency:''};
const keys=Object.keys(empty) as (keyof AdminListFilters)[];
export function readAdminFilters(accountId:string,view:string,params?:URLSearchParams):AdminListFilters{
 let raw:Record<string,unknown>={};try{raw=JSON.parse(localStorage.getItem('bv:admin:filters:'+accountId+':'+view)??'{}');}catch{/* storage is optional */}
 if(params&&keys.some(k=>params.has(k)))raw=Object.fromEntries(params);
 const out={...empty};for(const key of keys){const v=raw?.[key];if(typeof v!=='string')continue;if(key==='q')out.q=v.slice(0,100);else if(key==='status'&&/^[a-z_]{0,30}$/.test(v))out.status=v;else if((key==='from'||key==='to')&&/^\d{4}-\d{2}-\d{2}$/.test(v))out[key]=v;else if(key==='agency'&&/^[a-zA-Z0-9_-]{1,64}$/.test(v))out.agency=v;}return out;
}
export function storeAdminFilters(accountId:string,view:string,filters:AdminListFilters){try{localStorage.setItem('bv:admin:filters:'+accountId+':'+view,JSON.stringify(filters));}catch{/* storage is optional */}}
type Saved={id:string;name:string;filters:AdminListFilters};
function href(view:string,filters:AdminListFilters){const p=new URLSearchParams({view});for(const [k,v] of Object.entries(filters))if(v)p.set(k,v);return '/admin?'+p;}
export function AdminSavedViews({accountId,view}:{accountId:string;view:AdminSection}){
 const [items,setItems]=useState<Saved[]>([]),[name,setName]=useState(''),[message,setMessage]=useState('');const storage='bv:admin:views:'+accountId+':'+view;
 useEffect(()=>{setMessage('');try{const raw:unknown=JSON.parse(localStorage.getItem(storage)??'[]');setItems(Array.isArray(raw)?raw.filter((s):s is Saved=>s&&typeof s==='object'&&typeof s.id==='string'&&typeof s.name==='string'&&s.filters&&keys.every(k=>typeof s.filters[k]==='string')).slice(0,12):[]);}catch{setItems([]);}},[storage]);
 function update(next:Saved[]){setItems(next);try{localStorage.setItem(storage,JSON.stringify(next));}catch{setMessage('Le navigateur ne permet pas de conserver cette vue.');}}
 function save(){if(!name.trim()||items.length>=12)return;const filters=readAdminFilters(accountId,view,new URLSearchParams(location.search));update([...items,{id:crypto.randomUUID(),name:name.trim().slice(0,50),filters}]);setName('');setMessage('Vue enregistrée sur ce navigateur.');}
 const week=new Date(Date.now()-6*86400_000).toISOString().slice(0,10);
 return <div className="ops-saved"><div className="ops-saved-links">{view==='videos'&&<a href={href(view,{...empty,status:'failed',from:week})}>Échecs cette semaine</a>}{items.map(item=><span key={item.id}><a href={href(view,item.filters)}>{item.name}</a><button type="button" aria-label={'Supprimer la vue '+item.name} onClick={()=>update(items.filter(i=>i.id!==item.id))}>×</button></span>)}</div><form onSubmit={e=>{e.preventDefault();save();}}><label className="sr-only" htmlFor="admin-saved-view-name">Nom de la vue</label><input id="admin-saved-view-name" value={name} onChange={e=>setName(e.target.value)} maxLength={50} placeholder="Nom de cette vue…"/><button className="admin-button" type="submit" disabled={!name.trim()||items.length>=12}>Enregistrer la vue</button></form>{message&&<p role="status">{message}</p>}</div>;
}
