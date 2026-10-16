'use client';
import {useEffect,useRef,useState} from 'react';
import {AdminAvatarData,AvatarSettings} from '@bienvu/contracts';
import {editorResponse} from '../lib/editor-client';
import {AdminAvatarSelection} from './admin-avatar-selection';

export function AdminAvatars(){
  const [data,setData]=useState<AdminAvatarData|null>(null),[settings,setSettings]=useState<AvatarSettings|null>(null),
    [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[type,setType]=useState('studio_avatar'),[token,setToken]=useState<string|null>(null),alive=useRef(true);
  async function load(){const value=AdminAvatarData.parse(await editorResponse(await fetch('/api/admin/avatars',{cache:'no-store'})));if(alive.current){setData(value);setSettings(value.settings);}return value;}
  useEffect(()=>{alive.current=true;void load().catch(cause=>{if(alive.current)setError(cause.message);});return()=>{alive.current=false;};},[]);
  async function mutate(method:string,body:unknown):Promise<AdminAvatarData|null>{if(busy)return null;setBusy(true);setError('');setNotice('');
    try{const result=await editorResponse<{imported?:number;nextToken?:string|null}>(await fetch('/api/admin/avatars',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
      if(!alive.current)return null;
      if(method==='POST'&&result.imported!==undefined){setToken(result.nextToken??null);setNotice(`${result.imported} apparences synchronisées dans le catalogue administrateur. La sélection publique reste inchangée.`);}
      else setNotice(method==='POST'?'Les traitements existants ont été vérifiés.':body&&typeof body==='object'&&'publication' in body?'La sélection est publiée dans Personnaliser et sur /avatar.':'Réglages enregistrés.');
      return await load();
    }catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'Opération interrompue.');return null;}finally{if(alive.current)setBusy(false);}
  }
  return <div className="admin-avatars">
    <section className="admin-card"><h3>Avatars IA · HeyGen</h3><p>Option désactivée dans les nouveaux projets. Tarif BienVu : <strong>+1 crédit pour un ou deux passages</strong>, ou <strong>+1 crédit par tranche de 10 secondes</strong> sur toute la vidéo (20 s : +2, 30 s : +3, 40 s : +4). L’audio de la voix off existante est envoyé au fournisseur ; aucun appel OpenAI supplémentaire.</p>
      {data&&<div className="admin-avatar-kpis"><div><strong>{data.wallet?.balance!==null&&data.wallet?.balance!==undefined?`${data.wallet.balance.toFixed(2)} $`:'Indisponible'}</strong><span>Solde API</span></div><div><strong>{data.usage.reservedUsd.toFixed(3)} $ / {data.settings.monthlyUsd} $</strong><span>Budget réservé ce mois</span></div><div><strong>{data.usage.ready} / {data.usage.reused}</strong><span>Clips prêts / réutilisés</span></div><div><strong>{data.usage.active} / {data.usage.uncertain}</strong><span>En cours / à vérifier</span></div></div>}
      {data?.wallet?.autoReload&&<p className="admin-error" role="alert">La recharge automatique HeyGen est activée. Le budget interne de BienVu reste appliqué.</p>}
      {data&&!data.connected&&<p className="admin-notice">La clé API ou l’activation serveur manque. Vous pouvez préparer le catalogue et les réglages.</p>}
    </section>
    {error&&<p className="admin-error" role="alert">{error}</p>}{notice&&<p className="admin-notice" role="status">{notice}</p>}
    {!data||!settings?<p role="status">Chargement des présentateurs…</p>:<>
      <AdminAvatarSelection data={data} busy={busy} onMutate={mutate}/>
      <details className="admin-card avatar-operational-settings"><summary>Disponibilité, budgets et synchronisation</summary>
      <form onSubmit={e=>{e.preventDefault();void mutate('PATCH',{settings,revision:data.revision});}}><h3>Disponibilité et limites</h3>
        <label className="admin-budget-pause"><input type="checkbox" checked={settings.enabled} disabled={busy||!data.connected} onChange={e=>setSettings({...settings,enabled:e.target.checked})}/>Proposer l’option Avatar IA</label>
        <div className="avatar-fields">
          {([['maxSeconds','Durée maximale des passages courts (s)',3,8,1],['monthlyUsd','Budget mensuel ($)',0,10000,.01],['perVideoUsd','Budget par vidéo ($)',.05,10,.01],['concurrent','Clips simultanés',1,10,1],['priceIII','Avatar III ($ / minute)',.01,100,.01],['priceIVPhoto','Avatar IV photo ($ / minute)',.01,100,.01],['priceIVStudio','Avatar IV studio ($ / minute)',.01,100,.01]] as const).map(([key,label,min,max,step])=><label key={key}>{label}<input type="number" required min={min} max={max} step={step} disabled={busy} value={Number.isFinite(settings[key])?settings[key]:''} onChange={e=>setSettings({...settings,[key]:e.target.value===''?NaN:Number(e.target.value)})}/></label>)}
        </div>
        <label className="admin-budget-pause"><input type="checkbox" checked={settings.allowPremium} disabled={busy} onChange={e=>setSettings({...settings,allowPremium:e.target.checked})}/>Autoriser Avatar IV (coût fournisseur plus élevé)</label>
        <p className="admin-muted">Le budget comptabilise les appels dès leur lancement et conserve les montants incertains. Les durées sont arrondies au-dessus. Les frais affichés sont estimés ; rapprochez les factures HeyGen dans Rentabilité pour le coût réel. Les vidéos conservent leurs réglages au lancement.</p>
        <button className="admin-button admin-button-dark" disabled={busy||!AvatarSettings.safeParse(settings).success||JSON.stringify(settings)===JSON.stringify(data.settings)}>Enregistrer</button>
      </form>
      <div className="admin-avatar-toolbar"><select aria-label="Type de présentateur à synchroniser" value={type} disabled={busy} onChange={event=>{setType(event.target.value);setToken(null);}}><option value="studio_avatar">Avatars studio</option><option value="photo_avatar">Avatars photo</option><option value="digital_twin">Avatars vidéo</option></select><button type="button" className="admin-button" disabled={busy} onClick={()=>void mutate('POST',{action:'sync',type})}>Synchroniser 50 apparences</button>{token&&<button type="button" className="admin-button" disabled={busy} onClick={()=>void mutate('POST',{action:'sync',type,token})}>Charger les suivants</button>}</div><p className="admin-muted">Les nouveautés rejoignent uniquement le catalogue administrateur. Ajoutez-les à votre sélection puis publiez pour les proposer aux clients.</p></details>
      <section className="admin-card"><h3>Derniers traitements</h3><div className="admin-table-wrap"><table><thead><tr><th>Vidéo / passage</th><th>Moteur</th><th>État</th><th>Estimation ($)</th><th>Diagnostic</th></tr></thead><tbody>{data.tasks.map(t=><tr key={t.id}><td>{t.jobId.slice(0,8)} · {t.moment==='full'?'Toute la vidéo':t.moment==='intro'?'Ouverture':'Conclusion'}</td><td>{t.engine==='avatar_iii'?'Avatar III':'Avatar IV'}</td><td>{t.reused?'Réutilisé':t.state}</td><td>{t.estimatedUsd.toFixed(4)}</td><td>{t.error??'—'}</td></tr>)}</tbody></table></div><button className="admin-button" disabled={busy} onClick={()=>void load().catch(c=>setError(c.message))}>Actualiser</button> <button className="admin-button" disabled={busy} onClick={()=>void mutate('POST',{action:'reconcile'})}>Vérifier les tâches en attente</button></section>
    </>}
  </div>;
}
