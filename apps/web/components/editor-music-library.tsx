'use client';
import {useEffect,useState} from 'react';
import {MusicLibraryPage,MUSIC_DRAG_TYPE} from '@bienvu/contracts';
import {editorResponse} from '../lib/editor-client';
import {HomeIcon} from './home-icons';
import {MusicWaveform,musicTime} from './music-waveform';

export function EditorMusicLibrary({busy,playing,onAdd,onPreview}:{busy:boolean;playing:boolean;onAdd(id:string):Promise<void>;onPreview():void}){
  const [page,setPage]=useState<MusicLibraryPage|null>(null),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[loading,setLoading]=useState(true),
    [more,setMore]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0),[preview,setPreview]=useState<string|null>(null);
  useEffect(()=>{const timer=setTimeout(()=>setSearch(query.trim()),250);return()=>clearTimeout(timer);},[query]);
  useEffect(()=>{if(playing)setPreview(null);},[playing]);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');setPreview(null);
    void fetch('/api/music-library?'+new URLSearchParams({q:search}),{cache:'no-store',signal:controller.signal})
      .then(r=>editorResponse(r)).then(value=>{if(!controller.signal.aborted)setPage(MusicLibraryPage.parse(value));})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();},[search,retry]);
  async function moreTracks(){if(!page?.nextCursor||more)return;setMore(true);try{
    const next=MusicLibraryPage.parse(await editorResponse(await fetch('/api/music-library?'+new URLSearchParams({q:search,cursor:page.nextCursor}),{cache:'no-store'})));
    setPage(before=>before?{...next,items:[...before.items,...next.items.filter(t=>!before.items.some(p=>p.id===t.id))]}:next);
  }catch(cause){setError(cause instanceof Error?cause.message:'Chargement interrompu.');}finally{setMore(false);}}
  return <section className="editor-music-library" aria-label="Banque de musiques"><h3>Banque de musiques</h3><p className="editor-media-hint">Écoutez un morceau, puis glissez-le sur la piste Musique. Vous pouvez aussi l’ajouter avec le bouton +.</p>
    <label className="editor-music-search"><HomeIcon name="search" size={16}/><span className="sr-only">Rechercher une musique</span><input type="search" maxLength={100} placeholder="Rechercher…" value={query} onChange={event=>setQuery(event.target.value)}/></label>
    {loading?<p className="editor-media-hint" role="status">Chargement des musiques…</p>:error?<p className="editor-error" role="alert">{error} <button type="button" onClick={()=>setRetry(n=>n+1)}>Réessayer</button></p>:!page?.items.length?<p className="editor-media-hint">{search?'Aucune musique ne correspond.':'Les musiques publiées par BienVu apparaîtront ici. Vous pouvez importer votre propre piste ci-dessous.'}</p>:<div className="editor-music-sources">{page.items.map(track=><article key={track.id} draggable={!busy} data-music-source={track.id} className="editor-music-source"
      onDragStart={event=>{event.dataTransfer.setData(MUSIC_DRAG_TYPE,track.id);event.dataTransfer.effectAllowed='copy';setPreview(null);}}>
      <div><strong>{track.name}</strong><small>{musicTime(track.durationMs)}{track.description?` · ${track.description}`:''}</small></div>
      <MusicWaveform peaks={track.waveform}/><div className="editor-music-source-actions"><button type="button" aria-label={`${preview===track.id?'Arrêter':'Écouter'} ${track.name}`} onClick={()=>{onPreview();setPreview(value=>value===track.id?null:track.id);}}><HomeIcon name={preview===track.id?'pause':'play'} size={16}/>{preview===track.id?'Arrêter':'Écouter'}</button>
        <button type="button" disabled={busy} aria-label={`Ajouter ${track.name} à la vidéo`} onClick={()=>{setPreview(null);void onAdd(track.id);}}><HomeIcon name="plus" size={16}/>Ajouter</button></div>
    </article>)}</div>}
    {page?.nextCursor&&<button type="button" className="editor-import" disabled={more} onClick={()=>void moreTracks()}>{more?'Chargement…':'Plus de musiques'}</button>}
    {preview&&<audio key={preview} autoPlay controls className="editor-music-library-player" src={`/api/music-library/${preview}/audio`} onEnded={()=>setPreview(null)} onError={()=>{setPreview(null);setError('Cette piste ne peut pas être lue.');}}/>}
  </section>;
}
