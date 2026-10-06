'use client';
import {useEffect,useRef,useState} from 'react';
import {AdminVoices,VoiceSample,type VoiceCatalog} from '@bienvu/contracts';
import {editorResponse} from '../lib/editor-client';
import {useAccount} from './account';
import {HomeIcon} from './home-icons';

const providers=[{id:'cartesia',name:'Cartesia',model:'Sonic 3.6 · Français parisien'},{id:'fish',name:'Fish Audio',model:'S2.1 Pro Free'},{id:'google',name:'Google',model:'Chirp 3 HD'}] as const;
export function AdminVoiceLibrary(){
  const {refreshVoices}=useAccount(),[data,setData]=useState<AdminVoices|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),
    [text,setText]=useState(''),[listing,setListing]=useState(''),[query,setQuery]=useState(''),[busy,setBusy]=useState(''),
    [sample,setSample]=useState<VoiceSample|null>(null),[playing,setPlaying]=useState(false),
    alive=useRef(true),audio=useRef<HTMLAudioElement>(null),pending=useRef(false),[readySample,setReadySample]=useState(false);
  useEffect(()=>{alive.current=true;const controller=new AbortController();
    void fetch('/api/admin/voices',{cache:'no-store',signal:controller.signal}).then(r=>editorResponse(r)).then(value=>{
      if(controller.signal.aborted)return;const next=AdminVoices.parse(value);setData(next);
      if(next.listings[0]){setListing(next.listings[0].id);setText(next.listings[0].text);}
    }).catch(cause=>{if(!controller.signal.aborted)setError(cause.message);});
    return()=>{alive.current=false;controller.abort();audio.current?.pause();};},[]);
  function changeText(value:string){audio.current?.pause();setPlaying(false);setSample(null);setText(value);}
  async function listen(voice:VoiceCatalog['defaultVoice']){
    if(pending.current||!text.trim())return;pending.current=true;setBusy(voice);setError('');setNotice('');
    audio.current?.pause();setPlaying(false);setReadySample(false);
    try{const next=VoiceSample.parse(await editorResponse(await fetch('/api/admin/voices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({voice,text})})));
      if(!alive.current)return;setSample(next);setReadySample(true);setNotice(next.cached?'Extrait conservé : aucun nouvel appel au fournisseur.':'Extrait prêt. Cliquez sur Lecture pour écouter.');
      const player=audio.current;if(player){player.src=next.url;player.load();try{await player.play();if(alive.current)setPlaying(true);}catch{/* Manual playback remains available if the browser requires a gesture. */}}
      const updated=AdminVoices.parse(await editorResponse(await fetch('/api/admin/voices',{cache:'no-store'})));if(alive.current)setData(updated);
    }catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'L’écoute a échoué.');}
    finally{pending.current=false;if(alive.current)setBusy('');}
  }
  async function choose(voice:VoiceCatalog['defaultVoice']){
    if(!data||pending.current)return;pending.current=true;setBusy(voice);setError('');setNotice('');
    try{const next=AdminVoices.parse(await editorResponse(await fetch('/api/admin/voices',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({voice,revision:data.catalog.revision})})));
      if(!alive.current)return;setData(next);await refreshVoices();if(alive.current)setNotice('Voix par défaut enregistrée pour les nouvelles vidéos.');
    }catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'La modification a échoué.');}
    finally{pending.current=false;if(alive.current)setBusy('');}
  }
  return <div className="admin-voices">
    <section className="admin-card admin-voices-intro"><div><h3>Votre voix, votre signature</h3><p>Comparez les voix sur le même texte d’une annonce, puis choisissez celle proposée pour les nouveaux projets. Les vidéos et brouillons existants conservent leur choix.</p></div>
      {data&&<div className="admin-voices-quota"><strong>{data.usage.remaining.toLocaleString('fr-FR')} / 20 000</strong><span>caractères disponibles · Cartesia Free</span><small>Plafond interne sur 31 jours glissants, partagé avec les vidéos et les extraits. Le solde du compte Cartesia peut différer.</small></div>}</section>
    {error&&<p className="admin-error" role="alert">{error}</p>}{notice&&<p className="admin-notice" role="status">{notice}</p>}
    {!data?<p role="status">Chargement des voix…</p>:<>
      <section className="admin-card admin-voices-script"><h3>Le texte de votre comparaison</h3>
        <label>Partir d’une annonce enregistrée<select value={listing} disabled={Boolean(busy)} onChange={event=>{setListing(event.target.value);const found=data.listings.find(l=>l.id===event.target.value);if(found)changeText(found.text);}}>
          <option value="">Choisir une annonce</option>{data.listings.map(l=><option key={l.id} value={l.id}>{l.title||'Annonce sans titre'}</option>)}
        </select></label>
        <label>Texte lu par toutes les voix<textarea rows={5} maxLength={1000} value={text} disabled={Boolean(busy)} onChange={event=>{setListing('');changeText(event.target.value);}} placeholder="Sélectionnez une annonce ou collez son texte…"/></label>
        <div className="admin-voices-script-meta"><span>{text.length} / 1 000 caractères</span><span>Les écoutes répétées du même extrait sont gratuites.</span></div>
        <audio ref={audio} controls preload="none" hidden={!sample} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onError={()=>{if(readySample)setError('Le fichier audio ne peut pas être lu.');}}/>
        {sample&&<small>{data.catalog.voices.find(v=>v.id===sample.voice)?.name} · {(sample.durationMs/1000).toLocaleString('fr-FR',{maximumFractionDigits:1})} s{playing?' · Lecture en cours':''}</small>}
      </section>
      <label className="admin-search"><HomeIcon name="search" size={18}/><span className="sr-only">Rechercher une voix</span><input type="search" value={query} maxLength={80} onChange={event=>setQuery(event.target.value)} placeholder="Rechercher une voix ou un fournisseur…"/></label>
      {providers.map(provider=>{const voices=data.catalog.voices.filter(v=>v.provider===provider.id&&`${v.name} ${provider.name}`.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr')));
        return voices.length>0&&<section key={provider.id} className="admin-voices-provider"><div className="admin-voices-heading"><h3>{provider.name}</h3><span>{provider.model} · {voices.length} voix</span></div>
          <div className="admin-voices-grid">{voices.map(voice=><article key={voice.id} className={`admin-card admin-voice-card${data.catalog.defaultVoice===voice.id?' is-default':''}`}>
            <div className="admin-voice-name"><h4>{voice.name}</h4>{data.catalog.defaultVoice===voice.id&&<span className="admin-badge">Par défaut</span>}</div><p>{voice.accent}</p>
            {!voice.available&&<small>Fournisseur non configuré</small>}
            <div className="admin-voice-actions"><button type="button" className="admin-button" disabled={!voice.available||!text.trim()||Boolean(busy)} onClick={()=>void listen(voice.id)}><HomeIcon name="play" size={16}/>{busy===voice.id?'Patientez…':'Écouter l’annonce'}</button>
              <button type="button" className="admin-text-button" disabled={!voice.available||Boolean(busy)||data.catalog.defaultVoice===voice.id} onClick={()=>void choose(voice.id)}>{data.catalog.defaultVoice===voice.id?'Voix par défaut':'Choisir par défaut'}</button></div>
          </article>)}</div></section>;})}
    </>}
  </div>;
}
