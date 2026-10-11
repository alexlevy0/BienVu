'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {AdminGenerationQueue,GenerationQueueSettings,DEFAULT_GENERATION_QUEUE,MAX_RENDER_SERVERS,type GenerationQueueResource} from '@bienvu/contracts';
import {HomeIcon} from './home-icons';

const labels:Record<GenerationQueueResource,string>={preparation:'Préparation',avatar:'HeyGen',runway:'Runway',render:'Assemblage'};
const fields=[
  ['preparationConcurrency','Vidéos en préparation',1,20],['perAgencyConcurrency','Préparations par agence',1,5],
  ['renderConcurrency','Serveurs de rendu simultanés',1,MAX_RENDER_SERVERS],['runwayConcurrency','Plafond des animations Runway',1,20],
  ['maxPending','Demandes en cours maximum',1,200],['maxPerAgency','Demandes en cours par agence',1,10],
  ['maxWaitMinutes','Attente maximum par étape (minutes)',1,20],
] as const;
export function AdminGenerationQueueSettings(){
  const [data,setData]=useState<AdminGenerationQueue|null>(null),[settings,setSettings]=useState({...DEFAULT_GENERATION_QUEUE}),
    [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[reload,setReload]=useState(0);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');
    void fetch('/api/admin/generation-queue',{cache:'no-store',signal:controller.signal}).then(async response=>{
      if(!response.ok)throw Error('Impossible de lire la file de génération.');
      const result=AdminGenerationQueue.parse(await response.json());setData(result);setSettings(result.settings);
    }).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Chargement interrompu.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
  },[reload]);
  const valid=GenerationQueueSettings.safeParse(settings).success,changed=Boolean(data&&JSON.stringify(settings)!==JSON.stringify(data.settings));
  async function submit(refresh=false){if(!data||busy||!refresh&&(!valid||!changed))return;setBusy(true);setError('');setMessage('');
    try{const response=await fetch('/api/admin/generation-queue',{method:refresh?'POST':'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(refresh?{action:'refresh-runway'}:{settings,revision:data.revision})});
      if(!response.ok)throw Error(response.status===409?'Les réglages ont changé. Actualisez avant d’enregistrer.':'La demande n’a pas abouti. Réessayez.');
      const result=AdminGenerationQueue.parse(await response.json());setData(result);if(!refresh)setSettings(result.settings);
      setMessage(refresh?result.runway.error?'Runway n’a pas répondu. Le parallélisme reste limité à 1 par sécurité.':result.runway.checkedAt?'Limites du compte Runway actualisées.':'Runway n’est pas configuré. La limite reste à 1 en attendant sa vérification.':'Réglages enregistrés. Les traitements actifs finiront avant la réduction éventuelle des limites.');
    }catch(cause){setError(cause instanceof Error?cause.message:'La demande n’a pas abouti.');}finally{setBusy(false);}
  }
  return <section className="admin-card admin-video-map-settings" aria-labelledby="admin-generation-queue-title">
    <div className="admin-card-heading"><h3 id="admin-generation-queue-title"><HomeIcon name="settings" size={20}/>File et générations simultanées</h3>
      <button className="admin-button" type="button" disabled={busy||loading} onClick={()=>setReload(n=>n+1)}>Actualiser</button></div>
    <p className="admin-muted">Chaque rendu utilise 4 cœurs. Les serveurs démarrent lorsque l’assemblage est prêt et s’arrêtent à la fin. Les réservations de crédits et le budget mensuel restent contrôlés.</p>
    {loading?<p role="status">Lecture de la file…</p>:data&&<>
      <div className="admin-table-scroll"><table className="admin-table"><caption className="sr-only">Occupation des étapes de génération</caption><thead><tr><th>Étape</th><th>En cours</th><th>En attente</th><th>Limite effective</th></tr></thead>
        <tbody>{data.usage.map(u=><tr key={u.resource}><th scope="row">{labels[u.resource]}</th><td>{u.active}</td><td>{u.waiting}</td><td>{u.concurrency}</td></tr>)}</tbody></table></div>
      <p className="admin-muted">Compte Runway : {data.runway.concurrency} animation(s) simultanée(s), {data.runway.dailyLimit} sur 24 heures glissantes.
        {data.runway.checkedAt?` Dernière lecture : ${new Date(data.runway.checkedAt).toLocaleString('fr-FR')}.`:' En attente de vérification ; limite effective de 1.'}
        {' '}La limite effective est le minimum entre votre plafond et celui du compte. HeyGen utilise la limite définie dans Avatars IA.</p>
      <form className="admin-video-map-form" onSubmit={(e:FormEvent)=>{e.preventDefault();void submit();}}>
        <fieldset className="admin-video-map-fields" disabled={busy}><legend className="sr-only">Capacité des générations</legend>
          {fields.map(([key,label,min,max])=><label className="admin-field" key={key}>{label}<input type="number" min={min} max={max} step="1" required
            value={Number.isFinite(settings[key])?settings[key]:''} onChange={e=>{setSettings(s=>({...s,[key]:e.target.value===''?NaN:Number(e.target.value)}));setMessage('');}}/></label>)}
        </fieldset>
        {!valid&&<p className="admin-error">Vérifiez les bornes : la concurrence par agence doit rester dans les limites globales et dans son nombre de demandes.</p>}
        <div className="admin-budget-actions"><button className="admin-button admin-button-dark" type="submit" disabled={busy||!valid||!changed}>{busy?'Enregistrement…':'Enregistrer les limites'}</button>
          <button className="admin-button" type="button" disabled={busy} onClick={()=>void submit(true)}>Relire les limites Runway</button></div>
      </form>
    </>}
    {error&&<p className="admin-error" role="alert">{error}</p>}{message&&<p className="admin-notice" role="status">{message}</p>}
  </section>;
}
