'use client';
import {useEffect,useState} from 'react';

const groups=[
 {name:'Pilotage',ids:['overview','performance','incidents','retention']},
 {name:'Production',ids:['videos','imports','ai-quality']},
 {name:'Clients & support',ids:['agencies','users','reports','mailbox']},
 {name:'Finances',ids:['subscriptions','quotas','commercial','finance','costs','pricing','promotions']},
 {name:'Contenus & acquisition',ids:['homepage','avatars','voices','music','traffic','seo']},
 {name:'Service & configuration',ids:['providers','system','changes','audit']},
];
export function AdminNavigation<T extends string>({tabs,view,choose,accountId}:{tabs:{id:T;label:string}[];view:T;choose:(view:T)=>void;accountId:string|null}){
 const [favorites,setFavorites]=useState<string[]>([]),[ready,setReady]=useState(false),[search,setSearch]=useState('');
 useEffect(()=>{if(!accountId)return;try{const stored:unknown=JSON.parse(localStorage.getItem('bv:admin:favorites:'+accountId)??'[]');if(Array.isArray(stored))setFavorites(stored.filter((id):id is string=>typeof id==='string'&&tabs.some(t=>t.id===id)));}catch{/* unavailable storage */}setReady(true);},[accountId]);
 function toggle(id:T){const next=favorites.includes(id)?favorites.filter(v=>v!==id):[...favorites,id];setFavorites(next);try{if(accountId)localStorage.setItem('bv:admin:favorites:'+accountId,JSON.stringify(next));}catch{/* local preference only */}}
 const matches=(id:string)=>tabs.some(t=>t.id===id&&t.label.toLocaleLowerCase('fr').includes(search.toLocaleLowerCase('fr')));
 const item=(id:string)=>{const t=tabs.find(t=>t.id===id);if(!t||!matches(id))return null;return <div className="admin-nav-item" key={id}><button type="button" aria-current={view===id?'page':undefined} onClick={()=>{choose(t.id);setSearch('');}}>{t.label}</button><button type="button" className="admin-nav-star" disabled={!ready} aria-pressed={favorites.includes(id)} aria-label={(favorites.includes(id)?'Retirer des favoris : ':'Ajouter aux favoris : ')+t.label} onClick={()=>toggle(t.id)}>{favorites.includes(id)?'★':'☆'}</button></div>;};
 return <nav className="admin-navigation" aria-label="Rubriques d’administration"><label className="admin-nav-search"><span className="sr-only">Trouver une rubrique</span><input type="search" placeholder="Trouver une rubrique…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
 {!!favorites.filter(matches).length&&<section><h2>Vos favoris</h2><div>{favorites.map(item)}</div></section>}
 <div className="admin-nav-groups">{groups.filter(g=>g.ids.some(matches)).map(group=><details key={group.name} open={search!==''||group.ids.includes(view)}><summary>{group.name}<span>{group.ids.filter(matches).length}</span></summary><div>{group.ids.map(item)}</div></details>)}</div>
 {!tabs.some(t=>matches(t.id))&&<p>Aucune rubrique trouvée.</p>}</nav>;
}
