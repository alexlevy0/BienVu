'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {useAccount} from './account';
import {editorResponse} from '../lib/editor-client';
type Role='owner'|'admin'|'editor'|'viewer';
type Team={role:Role;members:{id:string;name:string;email:string;role:Role}[];invitations:{id:string;email:string;role:Role;status:string;expiresAt:string}[];memberships:{id:string;name:string;role:Role}[]};
const names:Record<Role,string>={owner:'Propriétaire',admin:'Administrateur',editor:'Éditeur',viewer:'Lecteur'};
export function TeamPanel(){
 const {me,loading}=useAccount(),params=useSearchParams(),token=params.get('invitation'),[team,setTeam]=useState<Team|null>(null),[email,setEmail]=useState(''),[role,setRole]=useState<Role>('editor'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[link,setLink]=useState('');
 const load=()=>fetch('/api/team',{cache:'no-store'}).then(r=>editorResponse<Team>(r)).then(setTeam);
 useEffect(()=>{if(me)void load().catch(()=>setError('L’équipe ne peut pas être chargée.'));},[me?.agency.id]);
 async function act(body:unknown){setBusy(true);setError('');try{const value=await editorResponse<{url?:string;agencyId?:string}>(await fetch('/api/team',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
  if(value.agencyId){location.assign('/equipe');return;}if(value.url)setLink(new URL(value.url,location.origin).href);await load();setEmail('');
 }catch(e){setError(e instanceof Error?e.message:'Action indisponible.');}finally{setBusy(false);}}
 if(loading)return <p>Chargement de votre équipe…</p>;
 if(!me)return <p>Connectez-vous avec l’adresse à laquelle l’invitation est destinée. <Link href={'/connexion?next='+encodeURIComponent('/equipe'+(token?'?invitation='+token:''))}>Se connecter →</Link></p>;
 const manage=team&&['owner','admin'].includes(team.role);
 return <div className="workspace-page"><header><p className="workspace-eyebrow">COLLABORER</p><h1>Votre équipe, dans le même studio.</h1><p>Chaque agence garde ses médias, crédits et dossiers dans son espace.</p></header>
 {error&&<p className="workspace-error" role="alert">{error}</p>}
 {token&&<section className="workspace-share"><p>Accepter cette invitation avec <strong>{me.user.email}</strong>. L’adresse doit correspondre à celle de l’invitation.</p><button type="button" disabled={busy} onClick={()=>void act({action:'accept',token})}>Rejoindre l’agence</button></section>}
 <section className="team-workspace"><h2>Agence active</h2><label>Votre espace<select value={me.agency.id} disabled={busy} onChange={e=>void act({action:'switch',agencyId:e.target.value})}>{team?.memberships.map(m=><option key={m.id} value={m.id}>{m.name} · {names[m.role]}</option>)}</select></label><p>{names[team?.role??'owner']} · Jusqu’à 20 membres par agence.</p></section>
 {manage&&<form className="workspace-form" onSubmit={e=>{e.preventDefault();void act({action:'invite',email,role});}}><label>Adresse du collaborateur<input type="email" value={email} maxLength={254} onChange={e=>setEmail(e.target.value)} required/></label><label>Accès<select value={role} onChange={e=>setRole(e.target.value as Role)}>{(['viewer','editor',...(team?.role==='owner'?['admin']:[])] as Role[]).map(r=><option key={r} value={r}>{names[r]}</option>)}</select></label><button disabled={busy}>Créer une invitation</button></form>}
 {link&&<div className="workspace-share"><label>Lien privé à transmettre au collaborateur<input readOnly value={link} onFocus={e=>e.target.select()}/></label><button type="button" onClick={()=>void navigator.clipboard.writeText(link).catch(()=>setError('Sélectionnez le lien pour le copier.'))}>Copier</button><p>Invitation valable 7 jours. Aucun e-mail n’est envoyé automatiquement.</p></div>}
 <h2>Membres</h2><div className="workspace-cards">{team?.members.map(m=><section key={m.id}><h3>{m.name}</h3><p>{m.email}</p>{manage&&m.role!=='owner'&&(team.role==='owner'||m.role!=='admin')?<><label>Rôle<select value={m.role} disabled={busy} onChange={e=>void act({action:'role',userId:m.id,role:e.target.value})}>{(['viewer','editor',...(team.role==='owner'?['admin']:[])] as Role[]).map(r=><option key={r} value={r}>{names[r]}</option>)}</select></label><button type="button" disabled={busy} onClick={()=>void act({action:'remove',userId:m.id})}>Retirer de l’équipe</button></>:<span>{names[m.role]}</span>}</section>)}</div>
 {manage&&<><h2>Invitations</h2><div className="workspace-cards">{team?.invitations.map(i=><section key={i.id}><h3>{i.email}</h3><p>{names[i.role]} · {i.status==='pending'?'En attente':i.status==='accepted'?'Acceptée':'Révoquée'}</p><small>Expire le {new Date(i.expiresAt).toLocaleDateString('fr-FR')}</small>{i.status==='pending'&&<button type="button" disabled={busy} onClick={()=>void act({action:'revoke',id:i.id})}>Révoquer</button>}</section>)}</div></>}
 <p>Le lecteur consulte les créations. L’éditeur crée et exporte avec les crédits de l’agence. L’administrateur gère aussi la charte, l’abonnement et les membres. Seul le propriétaire peut nommer un administrateur.</p></div>;
}
