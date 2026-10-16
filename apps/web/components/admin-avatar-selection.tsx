'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {AvatarPublication,AvatarGallery,AvatarLook,avatarCutoutStatus,type AdminAvatarData,type AvatarPublication as Publication} from '@bienvu/contracts';
import {AvatarPortrait} from './avatar-portrait';
import {HomeIcon} from './home-icons';
import '../app/avatar-selection.css';

const draftKey='bienvu:admin-avatar-selection:v1';
type Props={data:AdminAvatarData;busy:boolean;onMutate(method:string,body:unknown):Promise<AdminAvatarData|null>};
export function AdminAvatarSelection({data,busy,onMutate}:Props){
  const [tab,setTab]=useState<'selection'|'catalogue'>('selection'),[draft,setDraft]=useState<Publication>(data.publication),[base,setBase]=useState(data.publicationRevision);
  const [query,setQuery]=useState(''),[gender,setGender]=useState('all'),[type,setType]=useState('all'),[availability,setAvailability]=useState('all');
  const [page,setPage]=useState<AvatarGallery|null>(null),[pending,setPending]=useState(false),[error,setError]=useState(''),[catalogVersion,setCatalogVersion]=useState(0);
  const [marked,setMarked]=useState<string[]>([]),[chosen,setChosen]=useState<string[]>([]),[preview,setPreview]=useState<string|null>(null),[previewSelection,setPreviewSelection]=useState(false);
  const [extraLooks,setExtraLooks]=useState<AvatarLook[]>([]),[drag,setDrag]=useState<string|null>(null),[offset,setOffset]=useState(0);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null),restored=useRef(false);
  const dirty=JSON.stringify(draft)!==JSON.stringify(data.publication),conflict=base!==data.publicationRevision;
  const looks=new Map([...data.looks,...extraLooks,...page?.looks??[]].map(look=>[look.id,look]));
  const selected=new Set(draft.groups.flatMap(group=>group.lookIds));
  const stop=useCallback(()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;setPreview(null);},[]);
  useEffect(()=>{
    if(restored.current)return;restored.current=true;
    try{const stored=JSON.parse(sessionStorage.getItem(draftKey)??'null'),value=AvatarPublication.safeParse(stored?.publication);
      if(stored?.revision===data.publicationRevision&&Date.now()-stored.at>=0&&Date.now()-stored.at<86400000&&value.success){
        setDraft(value.data);const members=new Set(value.data.groups.flatMap(group=>group.lookIds));
        const restoredLooks=(Array.isArray(stored.looks)?stored.looks:[]).slice(0,1600).flatMap((entry:unknown)=>{const parsed=AvatarLook.safeParse(entry);if(!parsed.success||!members.has(parsed.data.id))return [];const look=parsed.data,prefix='/api/avatars/'+look.id+'/media?';return [look.thumbnail,look.preview].every(url=>!url||url.startsWith(prefix))?[look]:[];});
        setExtraLooks(restoredLooks);
      }
    }catch{}
  },[data.publicationRevision]);
  useEffect(()=>{if(!restored.current)return;try{if(dirty)sessionStorage.setItem(draftKey,JSON.stringify({revision:base,publication:draft,looks:[...looks.values()].filter(look=>selected.has(look.id)),at:Date.now()}));else sessionStorage.removeItem(draftKey);}catch{}},[draft,base,dirty,extraLooks]);
  useEffect(()=>{if(data.publicationRevision!==base&&!dirty){setBase(data.publicationRevision);setDraft(data.publication);}},[data.publicationRevision]);
  useEffect(()=>{setOffset(0);setChosen([]);},[query,gender,type,availability]);
  useEffect(()=>{
    if(tab!=='catalogue')return;const controller=new AbortController();setPending(true);setError('');stop();
    const timeout=setTimeout(()=>{void fetch('/api/admin/avatars?'+new URLSearchParams({catalog:'1',query,gender,type,availability,offset:String(offset)}),{cache:'no-store',signal:controller.signal})
      .then(async response=>{if(!response.ok)throw Error();const next=AvatarGallery.parse(await response.json());if(!controller.signal.aborted)setPage(next);})
      .catch(()=>{if(!controller.signal.aborted)setError('Le catalogue n’a pas pu être chargé. Réessayez.');})
      .finally(()=>{if(!controller.signal.aborted)setPending(false);});},250);
    return()=>{clearTimeout(timeout);controller.abort();};
  },[tab,query,gender,type,availability,offset,catalogVersion,stop]);
  useEffect(()=>()=>stop(),[stop]);
  function hover(look:AvatarLook,pointer:string){stop();if(pointer==='mouse'&&look.preview&&!matchMedia('(prefers-reduced-motion: reduce)').matches)timer.current=setTimeout(()=>setPreview(look.id),800);}
  function update(next:Publication){setDraft(next);setPreviewSelection(false);setError('');}
  function remove(ids:string[]){const groups=draft.groups.filter(group=>!ids.includes(group.id));update({groups,defaultLookId:groups.some(group=>group.lookIds.includes(draft.defaultLookId??''))?draft.defaultLookId:groups[0]?.lookIds[0]??null});setMarked([]);}
  function move(id:string,index:number){const groups=[...draft.groups],at=groups.findIndex(group=>group.id===id);if(at<0||index<0||index>=groups.length)return;const [item]=groups.splice(at,1);groups.splice(index,0,item);update({...draft,groups});}
  function groupMarked(){
    const entries=draft.groups.filter(group=>marked.includes(group.id)),ids=entries.flatMap(group=>group.lookIds);
    if(entries.length<2||ids.length>8)return;const first=entries[0],groups=draft.groups.flatMap(group=>group.id===first.id?[{...first,lookIds:ids,recommended:entries.some(entry=>entry.recommended)}]:marked.includes(group.id)?[]:[group]);
    update({...draft,groups});setMarked([]);
  }
  function detach(groupId:string,lookId:string){
    const group=draft.groups.find(item=>item.id===groupId);if(!group||group.lookIds.length<2)return;
    const look=looks.get(lookId);update({...draft,groups:draft.groups.flatMap(item=>item.id===groupId?[{...item,lookIds:item.lookIds.filter(id=>id!==lookId)},{id:crypto.randomUUID(),name:(look?.name??'Présentateur').slice(0,100),lookIds:[lookId],recommended:false}]:[item])});
  }
  async function add(ids:string[]){
    const additions=ids.flatMap(id=>{const look=looks.get(id);return look&&!selected.has(id)&&look.ownership==='public'&&(look.engines.includes('avatar_iii')||data.settings.allowPremium&&look.engines.includes('avatar_iv'))?[look]:[];});
    if(!additions.length)return;if(draft.groups.length+additions.length>200){setError('La sélection peut contenir jusqu’à 200 présentateurs.');return;}
    const inactive=additions.filter(look=>!look.enabled);
    if(inactive.length){const result=await onMutate('PATCH',{enableLooks:inactive.map(look=>look.id)});if(!result)return;}
    setExtraLooks(current=>[...current.filter(look=>!additions.some(next=>next.id===look.id)),...additions.map(look=>({...look,enabled:true}))]);
    const groups=[...draft.groups,...additions.map(look=>({id:look.id,name:look.name.slice(0,100),lookIds:[look.id],recommended:false}))];
    update({groups,defaultLookId:draft.defaultLookId??groups[0].lookIds[0]});setChosen([]);setCatalogVersion(value=>value+1);
  }
  async function publish(){
    const parsed=AvatarPublication.safeParse(draft);if(!parsed.success){setError(parsed.error.issues[0].message);return;}
    const result=await onMutate('PATCH',{publication:parsed.data,revision:base});if(!result)return;
    setBase(result.publicationRevision);setDraft(result.publication);setMarked([]);setError('');
    window.dispatchEvent(new Event('bienvu:avatars-published'));
    if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('bienvu-avatar-publication');channel.postMessage('published');channel.close();}
  }
  return <section className="admin-card avatar-publication-admin"><header className="avatar-publication-heading"><div><h3>La sélection BienVu</h3><p>La même sélection dans Personnaliser et sur la page /avatar. Le catalogue complet reste dans l’administration.</p></div><a href="/avatar" target="_blank" rel="noreferrer">Voir la page publique ↗</a></header>
    <div className="avatar-publication-summary"><span><strong>{draft.groups.length}</strong> présentateurs</span><span><strong>{selected.size}</strong> apparences</span><span><strong>{draft.groups.filter(group=>group.recommended).length}</strong> recommandés</span><small>{dirty?'Modifications non publiées':'Sélection publiée'}</small></div>
    <div className="avatar-publication-tabs" role="group" aria-label="Gestion de la sélection"><button type="button" aria-pressed={tab==='selection'} onClick={()=>{stop();setTab('selection');}}>Ma sélection ({draft.groups.length})</button><button type="button" aria-pressed={tab==='catalogue'} onClick={()=>{stop();setTab('catalogue');}}>Catalogue HeyGen ({data.catalogTotal})</button></div>
    {conflict&&<p className="admin-error" role="alert">La sélection publiée a changé ailleurs. Votre brouillon est conservé. Rechargez la sélection publiée avant de la modifier à nouveau.</p>}
    {error&&<p className="admin-error" role="alert">{error} <button type="button" onClick={()=>setCatalogVersion(value=>value+1)}>Réessayer</button></p>}
    {tab==='selection'?<>
      <div className="avatar-publication-toolbar"><label>Présentateur par défaut<select aria-label="Présentateur par défaut de la sélection" value={draft.defaultLookId??''} disabled={busy} onChange={event=>update({...draft,defaultLookId:event.target.value||null})}><option value="" disabled={draft.groups.length>0}>Aucun présentateur</option>{draft.groups.flatMap(group=>group.lookIds.map(id=><option key={id} value={id}>{group.name}{group.lookIds.length>1?` · ${looks.get(id)?.name??id}`:''}</option>))}</select></label><button type="button" className="admin-button" onClick={()=>setPreviewSelection(value=>!value)}>{previewSelection?'Fermer l’aperçu':'Prévisualiser la sélection'}</button><button type="button" className="admin-button" onClick={()=>setTab('catalogue')}>Ajouter des présentateurs</button></div>
      <p className="admin-muted">Glissez les lignes pour les classer. Les favoris du client précèdent vos recommandations, puis les autres présentateurs dans l’ordre choisi. Regroupez uniquement les tenues d’une même personne.</p>
      {previewSelection&&<div className="avatar-publication-preview" aria-label="Aperçu de la sélection à publier">{[...draft.groups].sort((a,b)=>Number(b.recommended)-Number(a.recommended)).map(group=>{const look=looks.get(group.lookIds[0]);return <div key={group.id}>{look&&<AvatarPortrait look={look}/>}<strong>{group.name}</strong><small>{group.recommended?'Recommandé':''}{group.lookIds.length>1?` · ${group.lookIds.length} variantes`:''}</small></div>;})}</div>}
      {marked.length>0&&<div className="avatar-publication-bulk"><span>{marked.length} sélectionné(s)</span><button type="button" disabled={busy||marked.length<2||draft.groups.filter(group=>marked.includes(group.id)).flatMap(group=>group.lookIds).length>8} onClick={groupMarked}>Regrouper les variantes</button><button type="button" disabled={busy} onClick={()=>remove(marked)}>Retirer de ma sélection</button></div>}
      <ol className="avatar-publication-list">{draft.groups.map((group,index)=>{const look=looks.get(group.lookIds[0]);return <li key={group.id} draggable={!busy} onDragStart={event=>{event.dataTransfer.setData('text/plain',group.id);setDrag(group.id);}} onDragEnd={()=>setDrag(null)} onDragOver={event=>{if(drag)event.preventDefault();}} onDrop={event=>{event.preventDefault();if(drag)move(drag,index);setDrag(null);}} className={drag===group.id?'is-dragging':undefined}>
        <input type="checkbox" aria-label={`Sélectionner ${group.name} pour regrouper ou retirer`} checked={marked.includes(group.id)} onChange={event=>setMarked(current=>event.target.checked?[...current,group.id]:current.filter(id=>id!==group.id))}/>
        <span className="avatar-publication-order" aria-hidden="true">{index+1}</span>{look?<AvatarPortrait look={look}/>:<span className="avatar-publication-missing"><HomeIcon name="user"/></span>}
        <div className="avatar-publication-name"><label>Nom affiché<input aria-label={`Nom affiché du présentateur ${index+1}`} maxLength={100} value={group.name} disabled={busy} onChange={event=>update({...draft,groups:draft.groups.map(item=>item.id===group.id?{...item,name:event.target.value}:item)})}/></label><small>{group.lookIds.length} apparence{group.lookIds.length>1?'s':''}{group.lookIds.includes(draft.defaultLookId??'')?' · Par défaut':''}{!look?' · Indisponible actuellement':''}</small>
          {group.lookIds.length>1&&<details><summary>Gérer les variantes</summary>{group.lookIds.map(id=><div key={id}><span>{looks.get(id)?.name??id}</span><button type="button" disabled={busy} onClick={()=>detach(group.id,id)}>Séparer</button></div>)}</details>}
        </div><button type="button" className="avatar-publication-recommend" aria-pressed={group.recommended} disabled={busy} onClick={()=>update({...draft,groups:draft.groups.map(item=>item.id===group.id?{...item,recommended:!item.recommended}:item)})}><HomeIcon name="sparkle" size={17}/>{group.recommended?'Recommandé':'Recommander'}</button>
        <div className="avatar-publication-moves"><button type="button" aria-label={`Monter ${group.name}`} disabled={busy||index===0} onClick={()=>move(group.id,index-1)}>↑</button><button type="button" aria-label={`Descendre ${group.name}`} disabled={busy||index===draft.groups.length-1} onClick={()=>move(group.id,index+1)}>↓</button></div><button type="button" className="avatar-publication-remove" aria-label={`Retirer ${group.name} de la sélection`} disabled={busy} onClick={()=>remove([group.id])}><HomeIcon name="close" size={17}/></button>
      </li>;})}</ol>{!draft.groups.length&&<p className="admin-notice">Votre sélection est vide. Ajoutez des présentateurs depuis le catalogue. Publier cette sélection masquera tous les nouveaux choix.</p>}
    </>:<>
      <div className="avatar-publication-toolbar avatar-publication-filters"><input type="search" aria-label="Rechercher dans le catalogue HeyGen" placeholder="Nom du présentateur…" maxLength={100} value={query} onChange={event=>setQuery(event.target.value)}/><select aria-label="Genre dans le catalogue" value={gender} onChange={event=>setGender(event.target.value)}><option value="all">Tous les profils</option><option value="female">Présentatrices</option><option value="male">Présentateurs</option><option value="unknown">Non renseigné</option></select><select aria-label="Type dans le catalogue" value={type} onChange={event=>setType(event.target.value)}><option value="all">Tous les types</option><option value="studio_avatar">Studio</option><option value="photo_avatar">Photo</option><option value="digital_twin">Vidéo</option></select><select aria-label="Disponibilité du catalogue" value={availability} onChange={event=>setAvailability(event.target.value)}><option value="all">Tous les états</option><option value="available">Activés techniquement</option><option value="unavailable">Non activés / incompatibles</option></select></div>
      <div className="avatar-publication-bulk"><span>{pending?'Chargement…':`${page?.total??0} résultats`}</span><button type="button" disabled={busy||pending||!chosen.length} onClick={()=>void add(chosen)}>Ajouter les {chosen.length} avatar(s) choisis</button><small>Les ajouts restent en brouillon jusqu’à publication.</small></div>
      <div className="avatar-look-grid avatar-publication-catalogue" aria-busy={pending}>{page?.looks.map(look=>{const compatible=look.ownership==='public'&&(look.engines.includes('avatar_iii')||data.settings.allowPremium&&look.engines.includes('avatar_iv'));return <article className="avatar-look" key={look.id} onPointerEnter={event=>hover(look,event.pointerType)} onPointerLeave={stop}><AvatarPortrait look={look} playing={preview===look.id} onUnavailable={stop}/><strong>{look.name}</strong><small>{look.gender==='female'?'Présentatrice':look.gender==='male'?'Présentateur':'Profil'} · {look.enabled?'Activé':'Non activé'}</small><label><input type="checkbox" checked={selected.has(look.id)||chosen.includes(look.id)} disabled={busy||pending||selected.has(look.id)||!compatible} onChange={event=>setChosen(current=>event.target.checked?[...current,look.id]:current.filter(id=>id!==look.id))}/>{selected.has(look.id)?'Dans ma sélection':'Présélectionner'}</label>{!compatible&&<small>Ce profil n’est pas disponible avec les réglages actuels.</small>}{look.preview&&<button type="button" className="admin-button" onClick={()=>{if(timer.current)clearTimeout(timer.current);setPreview(preview===look.id?null:look.id);}}>{preview===look.id?'Arrêter l’extrait':'Voir l’extrait'}</button>}
        <label><input type="checkbox" checked={look.enabled} disabled={busy} onChange={event=>{void onMutate('PATCH',{lookId:look.id,enabled:event.target.checked,transparentVerified:look.transparentVerified,transparency:look.transparency??null}).then(result=>{if(result)setCatalogVersion(value=>value+1);});}}/>Disponible pour la génération</label><label>Silhouette sans fond<select aria-label={`Compatibilité silhouette de ${look.name}`} disabled={busy} value={look.transparency??(look.transparentVerified?'supported':'auto')} onChange={event=>{void onMutate('PATCH',{lookId:look.id,enabled:look.enabled,transparentVerified:event.target.value==='supported',transparency:event.target.value==='auto'?null:event.target.value}).then(result=>{if(result)setCatalogVersion(value=>value+1);});}}><option value="auto">À confirmer</option><option value="supported">Confirmée</option><option value="unsupported">Incompatible</option></select></label><small>{avatarCutoutStatus(look)==='supported'?'Transparence confirmée':avatarCutoutStatus(look)==='unsupported'?'Médaillon et cadre uniquement':'Aucune génération payante de vérification automatique'}</small></article>;})}</div>
      <div className="avatar-publication-pagination"><button type="button" className="admin-button" disabled={pending||offset===0} onClick={()=>{setChosen([]);setOffset(value=>Math.max(0,value-32));}}>Précédents</button><span>{page?.total?`${offset+1}–${Math.min(offset+32,page.total)} sur ${page.total}`:'Aucun résultat'}</span><button type="button" className="admin-button" disabled={pending||!page?.hasMore} onClick={()=>{setChosen([]);setOffset(value=>value+32);}}>Suivants</button></div>
    </>}
    <div className="avatar-publication-save"><p><strong>{dirty?'Votre sélection comporte des modifications.':'Votre sélection est publiée.'}</strong><span>Retirer un présentateur de cette sélection conserve les vidéos et les choix déjà enregistrés.</span></p><button type="button" className="admin-button" disabled={busy||!dirty&&!conflict} onClick={()=>{setDraft(data.publication);setBase(data.publicationRevision);setMarked([]);setError('');}}>Reprendre la sélection publiée</button><button type="button" className="admin-button admin-button-dark" disabled={busy||!dirty||conflict||!AvatarPublication.safeParse(draft).success} onClick={()=>void publish()}>{busy?'Publication…':'Publier la sélection'}</button></div>
  </section>;
}
