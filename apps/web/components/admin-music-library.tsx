'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {LibraryMusic,MusicLibraryPage,MusicMetadata,type LibraryMusic as Track} from '@bienvu/contracts';
import {editorMusicWav,editorResponse} from '../lib/editor-client';
import {HomeIcon} from './home-icons';
import {MusicWaveform,musicTime} from './music-waveform';

export function AdminMusicLibrary(){
  const [page,setPage]=useState<MusicLibraryPage|null>(null),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[reload,setReload]=useState(0),
    [loading,setLoading]=useState(true),[more,setMore]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),
    [phase,setPhase]=useState(''),[file,setFile]=useState<File|null>(null),[name,setName]=useState(''),[description,setDescription]=useState(''),
    [license,setLicense]=useState(''),[dragging,setDragging]=useState(false),[editing,setEditing]=useState<Track|null>(null),[saving,setSaving]=useState(false),
    [preview,setPreview]=useState<string|null>(null),input=useRef<HTMLInputElement>(null),uploadId=useRef(''),audio=useRef<HTMLAudioElement>(null);
  useEffect(()=>{const timer=setTimeout(()=>setSearch(query.trim()),250);return()=>clearTimeout(timer);},[query]);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');
    void fetch('/api/admin/music?'+new URLSearchParams({q:search}),{cache:'no-store',signal:controller.signal})
      .then(r=>editorResponse(r)).then(value=>{if(!controller.signal.aborted)setPage(MusicLibraryPage.parse(value));})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();},[search,reload]);
  function selectFile(value?:File){if(!value)return;setFile(value);uploadId.current=crypto.randomUUID();
    setName(value.name.replace(/\.[^.]+$/,'').slice(0,100));setNotice('');setError('');}
  async function upload(event:FormEvent){event.preventDefault();if(!file||phase)return;setError('');setNotice('');
    const metadata=MusicMetadata.safeParse({name,description,license});if(!metadata.success){setError('Indiquez un titre et la licence ou l’origine de la musique.');return;}
    try{setPhase('Préparation de la piste audio…');const wav=await editorMusicWav(file);setPhase('Envoi dans la banque…');
      await editorResponse(await fetch(`/api/admin/music/${uploadId.current}/audio`,{method:'PUT',
        headers:{'Content-Type':'audio/wav','X-Music-Metadata':encodeURIComponent(JSON.stringify(metadata.data))},body:wav}));
      setFile(null);setName('');setDescription('');setLicense('');setReload(n=>n+1);setNotice('Musique publiée. Elle est disponible dans l’onglet Audio de l’Éditeur.');
    }catch(cause){setError(cause instanceof Error?cause.message:'L’envoi a échoué. Vous pouvez réessayer.');}finally{setPhase('');}
  }
  async function update(track:Track){if(saving)return;setSaving(true);setError('');setNotice('');
    try{const value=LibraryMusic.parse(await editorResponse(await fetch(`/api/admin/music/${track.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:track.name,description:track.description,license:track.license,active:track.active,revision:track.revision})})));
      setPage(before=>before?{...before,items:before.items.map(t=>t.id===value.id?value:t)}:before);setEditing(null);
      setNotice(value.active?'Musique disponible dans l’Éditeur.':'Musique masquée. Les projets qui l’utilisent la conservent.');
    }catch(cause){setError(cause instanceof Error?cause.message:'La modification a échoué.');}finally{setSaving(false);}
  }
  async function loadMore(){if(!page?.nextCursor||more)return;setMore(true);try{
    const next=MusicLibraryPage.parse(await editorResponse(await fetch('/api/admin/music?'+new URLSearchParams({q:search,cursor:page.nextCursor}),{cache:'no-store'})));
    setPage(before=>before?{...next,items:[...before.items,...next.items.filter(t=>!before.items.some(p=>p.id===t.id))]}:next);
  }catch(cause){setError(cause instanceof Error?cause.message:'Chargement interrompu.');}finally{setMore(false);}}
  return <div className="admin-music-library">
    <p className="admin-music-intro">Publiez vos musiques autorisées pour les rendre disponibles à toutes les agences dans l’Éditeur. La musique est incluse, sans crédit supplémentaire.</p>
    <form className="admin-music-upload" onSubmit={event=>void upload(event)}>
      <div className={`admin-music-drop${dragging?' is-dragging':''}`} onDragOver={event=>{if(event.dataTransfer.types.includes('Files')&&!phase){event.preventDefault();setDragging(true);}}}
        onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setDragging(false);}}
        onDrop={event=>{event.preventDefault();setDragging(false);if(!phase)selectFile(event.dataTransfer.files[0]);}}>
        <HomeIcon name="music" size={28}/><strong>{file?file.name:'Glissez une musique ici'}</strong>
        <span>Audio ou vidéo avec une piste audio · 50 Mo · 5 minutes maximum</span>
        <button className="admin-button" type="button" disabled={Boolean(phase)} onClick={()=>input.current?.click()}><HomeIcon name="upload" size={17}/>{file?'Changer de fichier':'Choisir un fichier'}</button>
        <input ref={input} hidden type="file" accept="audio/*,video/mp4,video/webm,video/quicktime" onChange={event=>{selectFile(event.target.files?.[0]);event.target.value='';}}/>
      </div>
      <div className="admin-music-upload-fields"><label>Titre<input required disabled={Boolean(phase)} maxLength={100} value={name} onChange={event=>setName(event.target.value)} placeholder="Ambiance douce"/></label>
        <label>Description <span>(facultatif)</span><textarea disabled={Boolean(phase)} maxLength={300} value={description} onChange={event=>setDescription(event.target.value)} placeholder="Piano calme, visite lumineuse…"/></label>
        <label>Licence ou origine autorisée<input required disabled={Boolean(phase)} maxLength={300} value={license} onChange={event=>setLicense(event.target.value)} placeholder="Votre licence, bibliothèque ou composition originale"/></label>
        <button className="admin-button admin-button-dark" disabled={!file||Boolean(phase)} type="submit">{phase||'Publier la musique'}</button>
      </div>
    </form>
    {error&&<p className="admin-error" role="alert">{error}</p>}{notice&&<p className="admin-notice" role="status">{notice}</p>}{phase&&<p role="status">{phase}</p>}
    <label className="admin-search admin-music-search"><HomeIcon name="search" size={18}/><span className="sr-only">Rechercher dans la banque</span><input type="search" maxLength={100} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Rechercher une musique…"/></label>
    {loading?<p role="status">Chargement de la banque…</p>:page&&!page.items.length?<p className="admin-empty">{search?'Aucune musique ne correspond.':'Votre banque est vide. Ajoutez votre premier morceau ci-dessus.'}</p>:<div className="admin-music-grid">{page?.items.map(track=><article key={track.id} className={`admin-music-card${track.active?'':' is-hidden'}`}>
      <div className="admin-music-card-heading"><h3>{track.name}</h3><span className="admin-badge">{track.active?'Disponible':'Masquée'}</span></div>
      <MusicWaveform peaks={track.waveform}/><p>{musicTime(track.durationMs)}{track.description?` · ${track.description}`:''}</p><small>{track.license}</small>
      <div className="admin-music-card-actions"><button type="button" className="admin-button" onClick={()=>setPreview(value=>value===track.id?null:track.id)}><HomeIcon name={preview===track.id?'pause':'play'} size={16}/>{preview===track.id?'Arrêter':'Écouter'}</button>
        <button type="button" className="admin-button" disabled={saving} onClick={()=>setEditing(track)}>Modifier</button>
        <button type="button" className="admin-button" disabled={saving} onClick={()=>void update({...track,active:!track.active})}>{track.active?'Masquer':'Rendre disponible'}</button></div>
    </article>)}</div>}
    {page?.nextCursor&&<button type="button" className="admin-button" disabled={more} onClick={()=>void loadMore()}>{more?'Chargement…':'Voir plus de musiques'}</button>}
    {preview&&<audio key={preview} ref={audio} autoPlay controls className="admin-music-player" src={`/api/admin/music/${preview}/audio`} onEnded={()=>setPreview(null)} onError={()=>{setPreview(null);setError('Cette piste ne peut pas être lue.');}}/>}
    {editing&&<form className="admin-music-edit" aria-label="Modifier une musique" onSubmit={event=>{event.preventDefault();void update(editing);}}>
      <h3>Modifier « {editing.name} »</h3><label>Titre<input required maxLength={100} value={editing.name} onChange={event=>setEditing({...editing,name:event.target.value})}/></label>
      <label>Description<textarea maxLength={300} value={editing.description} onChange={event=>setEditing({...editing,description:event.target.value})}/></label>
      <label>Licence ou origine<input required maxLength={300} value={editing.license} onChange={event=>setEditing({...editing,license:event.target.value})}/></label>
      <div><button type="button" className="admin-button" onClick={()=>setEditing(null)} disabled={saving}>Annuler</button> <button className="admin-button admin-button-dark" type="submit" disabled={saving}>Enregistrer</button></div>
    </form>}
  </div>;
}
