'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {AdminVideoMapSettings,DEFAULT_VIDEO_MAP,VideoMapDefaults,type MapView} from '@bienvu/contracts';
import {HomeIcon} from './home-icons';

export function AdminVideoMapDefaults(){
  const [data,setData]=useState<AdminVideoMapSettings|null>(null),[settings,setSettings]=useState<VideoMapDefaults>({...DEFAULT_VIDEO_MAP}),
    [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[reload,setReload]=useState(0);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');
    void fetch('/api/admin/video-map',{cache:'no-store',signal:controller.signal}).then(async response=>{
      if(!response.ok)throw Error('Les réglages de carte n’ont pas pu être chargés.');
      const result=AdminVideoMapSettings.parse(await response.json());setData(result);setSettings(result.settings);
    }).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Chargement interrompu.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
  },[reload]);
  const patch=(value:Partial<VideoMapDefaults>)=>{setSettings(current=>({...current,...value}));setMessage('');};
  const changed=Boolean(data&&JSON.stringify(settings)!==JSON.stringify(data.settings)),valid=VideoMapDefaults.safeParse(settings).success;
  async function save(event:FormEvent){event.preventDefault();if(!data||!valid||!changed||saving)return;setSaving(true);setError('');setMessage('');
    try{const response=await fetch('/api/admin/video-map',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({settings,revision:data.revision})});
      if(!response.ok)throw Error(response.status===409?'Ces réglages ont été modifiés ailleurs. Rechargez-les avant d’enregistrer.':response.status===429?'Trop de modifications. Patientez une minute.':'Enregistrement impossible. Vérifiez votre connexion.');
      const result=AdminVideoMapSettings.parse(await response.json());setData(result);setSettings(result.settings);setMessage('Réglages enregistrés. Ils s’appliqueront aux prochaines générations.');
    }catch(cause){setError(cause instanceof Error?cause.message:'Enregistrement interrompu.');}finally{setSaving(false);}
  }
  return <section className="admin-card admin-video-map-settings" aria-labelledby="admin-video-map-title">
    <div className="admin-card-heading"><h3 id="admin-video-map-title"><HomeIcon name="pin" size={20}/>Map par défaut</h3>{data&&<span>Révision {data.revision}</span>}</div>
    <p className="admin-muted">Ajoutez automatiquement une séquence de carte aux nouvelles vidéos, à partir de la ville du bien. Disponible pour les annonces importées, la saisie manuelle et les essais sans compte.</p>
    {loading?<p role="status">Chargement des réglages…</p>:data&&<form onSubmit={save} className="admin-video-map-form">
      <label className="admin-budget-pause"><input type="checkbox" checked={settings.enabled} disabled={saving} onChange={event=>patch({enabled:event.target.checked})}/>Activer la carte par défaut</label>
      <fieldset disabled={saving} className="admin-video-map-fields"><legend className="sr-only">Réglages de la carte par défaut</legend>
        <label className="admin-field">Vue<select value={settings.view} onChange={event=>patch({view:event.target.value as MapView})}><option value="satellite">Satellite · vue aérienne</option><option value="plan">Plan · sans satellite</option><option value="buildings-3d">Bâtiments en 3D</option></select></label>
        <label className="admin-field">Emplacement<select value={settings.position} onChange={event=>patch({position:event.target.value as 'start'|'end'})}><option value="start">Au début</option><option value="end">À la fin</option></select></label>
        <label className="admin-field">Durée<select value={settings.durationSeconds} onChange={event=>patch({durationSeconds:Number(event.target.value)})}>{[3,4,5].map(n=><option key={n} value={n}>{n} secondes</option>)}</select><small>Incluse dans la durée totale de la vidéo.</small></label>
        {(['zoomStart','zoomEnd'] as const).map((field,index)=><label className="admin-field" key={field}>{index?'Zoom à l’arrivée':'Zoom au départ'}
          <input type="number" min="12" max="18" step="0.25" required value={Number.isFinite(settings[field])?settings[field]:''} onChange={event=>patch({[field]:event.target.value===''?NaN:Number(event.target.value)})}/>
          <input type="range" aria-label={index?'Zoom à l’arrivée : curseur':'Zoom au départ : curseur'} min="12" max="18" step="0.25" value={Number.isFinite(settings[field])?settings[field]:12} onChange={event=>patch({[field]:Number(event.target.value)})}/></label>)}
      </fieldset>
      <p className="admin-muted">Un zoom plus bas montre une zone plus large. Les clients peuvent désactiver la carte, ajuster ses réglages ou confirmer un repère précis dans Personnaliser → Carte. Une ville introuvable ou ambiguë laisse la vidéo sans carte. Les projets de l’éditeur conservent leur timeline.</p>
      <div className="admin-video-map-actions"><button type="submit" className="admin-button admin-button-dark" disabled={saving||!valid||!changed}>{saving?'Enregistrement…':'Enregistrer les réglages'}</button>
        <button type="button" className="admin-button" disabled={saving} onClick={()=>{setSettings({...DEFAULT_VIDEO_MAP});setMessage('');}}>Satellite · 12 → 14,5</button>
        <button type="button" className="admin-button" disabled={saving} onClick={()=>{setReload(n=>n+1);setMessage('');}}>Recharger</button></div>
    </form>}
    {error&&<p className="admin-error" role="alert">{error}{!data&&!loading&&<button type="button" className="admin-button" onClick={()=>setReload(n=>n+1)}>Réessayer</button>}</p>}
    {message&&<p className="admin-notice" role="status">{message}</p>}
  </section>;
}
