'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {useAccount} from './account';
import {HomeIcon} from './home-icons';
import type {AdminSection,AdminRow,AdminPage,AdminOverview,AdminAction,AdminVideoDetail,AdminNarrationCall,AdminTraffic} from '@bienvu/contracts';
import {AdminCommercial} from './admin-commercial';
import {AdminSeo} from './admin-seo';
import {AdminFinance,AdminVideoProfit} from './admin-finance';
import {AdminBudgetSettings} from './admin-budget-settings';
import {AdminVoiceLibrary} from './admin-voices';
import {AdminMusicLibrary} from './admin-music-library';
import {AdminHomepage} from './admin-homepage';
import {AdminMailbox} from './admin-mailbox';
import {AdminImportDiagnostic,AdminImportError,importDiagnosticKeys} from './admin-import-diagnostic';
import {AdminAttention,AdminPerformance,AdminMonthlyCosts,AdminTrafficView,type AdminTarget} from './admin-insights';

type View=AdminSection|'overview'|'system'|'traffic'|'performance'|'costs'|'commercial'|'finance'|'voices'|'music'|'homepage'|'mailbox'|'seo';
const tabs:{id:View;label:string}[]=[{id:'overview',label:'Vue d’ensemble'},{id:'videos',label:'Vidéos'},{id:'agencies',label:'Agences'},{id:'users',label:'Comptes'},
  {id:'subscriptions',label:'Abonnements'},{id:'quotas',label:'Crédits'},{id:'imports',label:'Imports & brouillons'},
  {id:'reports',label:'Signalements'},{id:'mailbox',label:'Messagerie'},{id:'voices',label:'Voix off'},{id:'music',label:'Banque de musiques'},{id:'homepage',label:'Page d’accueil'},{id:'traffic',label:'Fréquentation'},{id:'seo',label:'SEO & acquisition'},{id:'performance',label:'Performance'},{id:'costs',label:'Coûts mensuels'},{id:'commercial',label:'Conversion & recettes'},{id:'finance',label:'Rentabilité'},{id:'system',label:'Service & budget'},{id:'audit',label:'Journal'}];
const labels:Record<string,string>={ready:'Prête',failed:'Échec',active:'Actif',queued:'En attente',importing:'Import',scripting:'Rédaction',voicing:'Voix',rendering:'Assemblage',retry_wait:'Nouvel essai',
  account:'Compte',anonymous:'Anonyme',internal:'Test interne',available:'Disponible',unavailable:'Indisponible',expired:'Expiré',expiring:'Purge en cours',consumed:'Consommé',reserved:'Réservé',released:'Libéré',unfunded:'Non débité',
  new:'Nouveau',reviewing:'En traitement',closed:'Clos',free:'Gratuit',paid:'Payant',trial:'Essai',current:'Période en cours',none:'Sans abonnement',verified:'Vérifié',unverified:'Non vérifié',
  draft:'Brouillon',deleting:'Suppression',trialing:'Essai Stripe',past_due:'En retard',unpaid:'Impayé',canceled:'Résilié',paused:'Suspendu',incomplete:'Incomplet',incomplete_expired:'Incomplet expiré',
  generation_gate:'Lancements',report_status:'Signalement',quota:'Quota',monthly_budget:'Budget mensuel',photos:'Photos',voice:'Voix',facts:'Informations',technical:'Technique',other:'Autre'};
const statuses:Partial<Record<View,string[]>>={videos:['ready','failed','active','account','anonymous','internal'],agencies:['none','active','trialing','past_due','unpaid','canceled','paused','incomplete','incomplete_expired'],users:['verified','unverified'],
  subscriptions:['active','trialing','past_due','unpaid','canceled','paused','incomplete','incomplete_expired'],quotas:['current','free','paid','trial'],imports:['draft','ready','failed','importing','deleting'],reports:['new','reviewing','closed'],audit:['generation_gate','report_status','quota','monthly_budget']};
const columns:Record<AdminSection,{key:string;label:string;format?:'date'|'status'|'number'}[]>={
  videos:[{key:'title',label:'Vidéo'},{key:'agency',label:'Agence / espace'},{key:'audience',label:'Origine',format:'status'},{key:'status',label:'État',format:'status'},{key:'sortKey',label:'Création',format:'date'},{key:'retention',label:'Fichier',format:'status'}],
  agencies:[{key:'agency',label:'Agence'},{key:'email',label:'Propriétaire'},{key:'city',label:'Ville'},{key:'videos',label:'Vidéos',format:'number'},{key:'status',label:'Abonnement',format:'status'},{key:'sortKey',label:'Création',format:'date'}],
  users:[{key:'name',label:'Compte'},{key:'email',label:'E-mail'},{key:'status',label:'Vérification',format:'status'},{key:'agency',label:'Agence'},{key:'providers',label:'Connexions'},{key:'sessions',label:'Sessions',format:'number'},{key:'sortKey',label:'Inscription',format:'date'}],
  subscriptions:[{key:'agency',label:'Agence'},{key:'plan',label:'Offre'},{key:'status',label:'Statut Stripe',format:'status'},{key:'start',label:'Début',format:'date'},{key:'end',label:'Fin',format:'date'},{key:'cancelAtEnd',label:'Résiliation prévue',format:'number'}],
  quotas:[{key:'agency',label:'Agence'},{key:'status',label:'Crédit',format:'status'},{key:'quota',label:'Crédits accordés',format:'number'},{key:'consumed',label:'Utilisé',format:'number'},{key:'reserved',label:'Réservé',format:'number'},{key:'remaining',label:'Disponible',format:'number'},{key:'end',label:'Fin',format:'date'}],
  imports:[{key:'title',label:'Annonce'},{key:'agency',label:'Agence / espace'},{key:'sourceKind',label:'Source'},{key:'status',label:'État',format:'status'},{key:'photos',label:'Photos',format:'number'},{key:'error',label:'Erreur'},{key:'sortKey',label:'Création',format:'date'}],
  reports:[{key:'category',label:'Motif',format:'status'},{key:'agency',label:'Agence'},{key:'comment',label:'Message'},{key:'status',label:'Traitement',format:'status'},{key:'sortKey',label:'Date',format:'date'}],
  audit:[{key:'status',label:'Action',format:'status'},{key:'actor',label:'Administrateur'},{key:'target',label:'Cible'},{key:'before',label:'Avant'},{key:'after',label:'Après'},{key:'reason',label:'Motif'},{key:'sortKey',label:'Date',format:'date'}],
};
const date=(v:unknown)=>{if(!v)return '—';const d=new Date(String(v));return Number.isNaN(d.getTime())?'—':d.toLocaleString('fr-FR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});};
const euro=(cents:number)=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(cents/100);
const usd=(micros:number)=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'USD',minimumFractionDigits:6,maximumFractionDigits:6}).format(micros/1e6);
const num=(v:unknown)=>Number(v??0).toLocaleString('fr-FR');
const text=(v:unknown)=>v===null||v===undefined||v===''?'—':String(v);
function Badge({value}:{value:unknown}){return <span className={`admin-badge admin-badge-${String(value)}`}>{labels[String(value)]??text(value)}</span>;}
function videoFile(row:AdminRow){return Number(row.master)||Number(row.preview)?'available':['expired','expiring'].includes(String(row.retention))?row.retention:'unavailable';}
async function read<T>(url:string,signal?:AbortSignal):Promise<T>{
  const response=await fetch(url,{cache:'no-store',signal});
  if(!response.ok)throw Error(response.status===401?'Reconnectez-vous pour accéder à l’administration.':response.status===403?'Votre compte n’a pas accès à l’administration.':'Chargement interrompu. Réessayez.');
  return response.json() as Promise<T>;
}
function csv(rows:AdminRow[]){
  const keys=[...new Set(rows.flatMap(row=>Object.keys(row)))].filter(k=>k!=='sortKey');
  const cell=(value:unknown)=>{let raw=String(value??'');if(/^[\s]*[=+\-@]/.test(raw))raw="'"+raw;return '"'+raw.replaceAll('"','""')+'"';};
  const blob=new Blob(['\uFEFF'+[keys.map(cell).join(';'),...rows.map(row=>keys.map(k=>cell(row[k])).join(';'))].join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='bienvu-admin-'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function Facts({row,keys}:{row:AdminRow;keys:{key:string;label:string}[]}){return <dl className="admin-facts">{keys.map(({key,label})=><div key={key}><dt>{label}</dt><dd>{/At$|^sortKey$|^start$|^end$/.test(key)?date(row[key]):text(row[key])}</dd></div>)}</dl>;}

export function AdminPanel(){
  const {me,loading,refreshRights}=useAccount();
  const [view,setView]=useState<View>('overview'),[overview,setOverview]=useState<AdminOverview|null>(null),[page,setPage]=useState<AdminPage|null>(null);
  const [traffic,setTraffic]=useState<AdminTraffic|null>(null),[trafficDays,setTrafficDays]=useState<7|30>(30);
  const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[status,setStatus]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState(''),[agency,setAgency]=useState('');
  const [busy,setBusy]=useState(true),[more,setMore]=useState(false),[failure,setFailure]=useState(''),[message,setMessage]=useState(''),[revision,setRevision]=useState(0);
  const [selected,setSelected]=useState<AdminRow|null>(null),[detail,setDetail]=useState<AdminVideoDetail|null>(null),[detailBusy,setDetailBusy]=useState(false),[detailError,setDetailError]=useState('');
  const [pending,setPending]=useState<AdminAction|null>(null),[reason,setReason]=useState(''),[saving,setSaving]=useState(false),[actionError,setActionError]=useState('');
  const loadVersion=useRef(0),morePending=useRef(false),dialog=useRef<HTMLDialogElement>(null),actionDialog=useRef<HTMLDialogElement>(null);
  const accountId=me?.isSuperAdmin?me.user.id:null;
  useEffect(()=>{const params=new URLSearchParams(location.search),tab=params.get('view');if(tabs.some(t=>t.id===tab))setView(tab as View);const target=params.get('agency');if(target&&/^[a-zA-Z0-9_-]{1,64}$/.test(target))setAgency(target);},[]);
  useEffect(()=>{const timer=setTimeout(()=>setSearch(query.trim()),300);return()=>clearTimeout(timer);},[query]);
  const endpoint=()=>{const p=new URLSearchParams({section:view,q:search,status});if(from)p.set('from',from);if(to)p.set('to',to);if(agency)p.set('agency',agency);return '/api/admin?'+p;};
  useEffect(()=>{
    const controller=new AbortController(),version=++loadVersion.current;setPage(null);setFailure('');setBusy(true);setSelected(null);setDetail(null);setPending(null);setOverview(null);setTraffic(null);
    if(!accountId){setBusy(false);return()=>controller.abort();}
    if(view==='commercial'||view==='finance'||view==='voices'||view==='music'||view==='homepage'||view==='mailbox'||view==='seo'){setBusy(false);return()=>controller.abort();}
    if(from&&to&&from>to){setFailure('La date de fin doit suivre la date de début.');setBusy(false);return()=>controller.abort();}
    const aggregate=['overview','system','performance','costs'].includes(view);
    const url=view==='traffic'?'/api/admin?section=traffic&days='+trafficDays:aggregate?'/api/admin?section=overview':endpoint();
    void read<AdminOverview|AdminPage|AdminTraffic>(url,controller.signal).then(value=>{if(version!==loadVersion.current)return;
      if(view==='traffic')setTraffic(value as AdminTraffic);else if(aggregate)setOverview(value as AdminOverview);else setPage(value as AdminPage);
    }).catch(error=>{if(!controller.signal.aborted)setFailure(error instanceof Error?error.message:'Chargement interrompu.');}).finally(()=>{if(version===loadVersion.current)setBusy(false);});
    return()=>controller.abort();
  // endpoint is derived exclusively from these dependencies.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[view,search,status,from,to,agency,revision,accountId,trafficDays]);
  useEffect(()=>{
    if(!selected)return;const controller=new AbortController();dialog.current?.showModal();setDetail(null);setDetailError('');
    if(view!=='videos'){setDetailBusy(false);return()=>controller.abort();}setDetailBusy(true);
    void read<AdminVideoDetail>('/api/admin/jobs/'+encodeURIComponent(String(selected.id)),controller.signal).then(setDetail)
      .catch(error=>{if(!controller.signal.aborted)setDetailError(error.message);}).finally(()=>{if(!controller.signal.aborted)setDetailBusy(false);});
    return()=>controller.abort();
  },[selected,view]);
  useEffect(()=>{if(pending)actionDialog.current?.showModal();},[pending]);
  function choose(next:View){setView(next);setQuery('');setSearch('');setStatus('');setFrom('');setTo('');setAgency('');setMessage('');history.replaceState(null,'','/admin'+(next==='overview'?'':'?view='+next));}
  function focus(target:AdminTarget){choose(target.view);setStatus(target.status??'');setFrom(target.from??'');}
  async function loadMore(){
    if(!page?.nextCursor||morePending.current)return;const version=loadVersion.current;morePending.current=true;setMore(true);setFailure('');
    try{const next=await read<AdminPage>(endpoint()+'&cursor='+encodeURIComponent(page.nextCursor));if(version!==loadVersion.current)return;
      setPage(current=>current?{...next,rows:[...current.rows,...next.rows.filter(row=>!current.rows.some(existing=>existing.id===row.id))]}:next);
    }catch(error){if(version===loadVersion.current)setFailure(error instanceof Error?error.message:'Chargement interrompu.');}
    finally{morePending.current=false;setMore(false);}
  }
  function confirm(action:AdminAction){setSelected(null);dialog.current?.close();setPending(action);setReason('');setActionError('');}
  async function save(event:FormEvent){event.preventDefault();if(!pending||saving)return;setSaving(true);setActionError('');
    try{const response=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...pending,reason:reason.trim()})});
      if(!response.ok)throw Error(response.status===409?'Les données ont changé, ou le budget ou quota est inférieur aux montants déjà engagés. Actualisez puis réessayez.':response.status===429?'Trop de modifications. Patientez une minute.':'Modification refusée. Vérifiez votre connexion et le motif.');
      actionDialog.current?.close();setPending(null);setMessage('Modification enregistrée dans le journal d’administration.');setRevision(n=>n+1);void refreshRights();
    }catch(error){setActionError(error instanceof Error?error.message:'Modification interrompue.');}finally{setSaving(false);}
  }
  if(!loading&&!accountId)return <div className="admin-shell"><h1>Accès réservé</h1><p>Connectez-vous avec votre compte administrateur.</p></div>;
  const recordView=!['overview','system','traffic','performance','costs','commercial','finance','voices','music','homepage','mailbox','seo'].includes(view)?view as AdminSection:null;
  const selectedColumns=recordView?columns[recordView]:[];
  return <div className="admin-shell">
    <header className="admin-heading"><div><span className="admin-eyebrow">PILOTAGE DE BIENVU</span><h1>Super admin<span>.</span></h1><p>Votre activité, vos agences et votre service, au même endroit.</p></div><span className="admin-access"><span/>Accès privé</span></header>
    <nav className="admin-tabs" aria-label="Rubriques d’administration">{tabs.map(tab=><button key={tab.id} type="button" aria-current={view===tab.id?'page':undefined} onClick={()=>choose(tab.id)}>{tab.label}</button>)}</nav>
    <div className="admin-section-heading"><div><h2>{tabs.find(tab=>tab.id===view)?.label}</h2><p>{view==='videos'?'Toutes les générations enregistrées, y compris les échecs, essais anonymes et tests internes.':view==='subscriptions'?'Abonnements synchronisés par Stripe. Les recettes de test sont séparées des recettes réelles dans Conversion & recettes.':view==='quotas'?'Périodes de crédits des agences. Un crédit « Payant » ne constitue pas une preuve de paiement.':view==='imports'?'Annonces et brouillons encore conservés ; les imports purgés restent comptés dans l’usage.':view==='audit'?'Modifications administratives horodatées, avec leur auteur et leur motif.':view==='reports'?'Retours des utilisateurs et suivi de leur traitement.':overview?'Données relues le '+date(overview.at):'Données de l’application.'}</p></div><button className="admin-button" type="button" disabled={busy||loading} onClick={()=>setRevision(n=>n+1)}><HomeIcon name="refresh" size={17}/>Actualiser</button></div>
    {message&&<p role="status" className="admin-notice">{message}</p>}
    {view==='traffic'&&<div className="admin-period" aria-label="Période de fréquentation">{([7,30] as const).map(days=><button type="button" key={days} aria-pressed={trafficDays===days} onClick={()=>setTrafficDays(days)}>{days} jours</button>)}<span>Dates UTC · chargements HTML</span></div>}
    {recordView&&<form className="admin-filters" onSubmit={event=>event.preventDefault()}><label className="admin-search"><span className="sr-only">Rechercher</span><HomeIcon name="search" size={20}/><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Rechercher une vidéo, une agence, un e-mail…" maxLength={100}/></label>
      <label><span>Statut / origine</span><select value={status} onChange={event=>setStatus(event.target.value)}><option value="">Tous</option>{statuses[view]?.map(s=><option value={s} key={s}>{labels[s]??s}</option>)}</select></label>
      <label><span>Du (UTC)</span><input type="date" value={from} onChange={event=>setFrom(event.target.value)}/></label><label><span>Au (UTC)</span><input type="date" value={to} onChange={event=>setTo(event.target.value)}/></label>
      {agency&&<button type="button" className="admin-button" onClick={()=>setAgency('')}>Toutes les agences ×</button>}
    </form>}
    {view==='commercial'&&accountId&&<AdminCommercial key={revision}/>}
    {view==='seo'&&accountId&&<AdminSeo key={revision}/>}
    {view==='finance'&&accountId&&<AdminFinance key={revision}/>}
    {view==='voices'&&accountId&&<AdminVoiceLibrary key={revision}/>}
    {view==='music'&&accountId&&<AdminMusicLibrary key={revision}/>}
    {view==='homepage'&&accountId&&<AdminHomepage key={revision}/>}
    {view==='mailbox'&&accountId&&<AdminMailbox revision={revision}/>}
    {failure&&<p role="alert" className="admin-error">{failure}</p>}
    {busy||loading?<div className="admin-loading" role="status"><span className="admin-spinner"/>Lecture des données…</div>:<>
      {overview&&view==='overview'&&<><AdminAttention data={overview} onFocus={focus}/><Overview data={overview} choose={choose}/></>}
      {overview&&view==='system'&&<System data={overview} confirm={confirm}/>}
      {overview&&view==='performance'&&<AdminPerformance data={overview}/>}
      {overview&&view==='costs'&&<AdminMonthlyCosts data={overview}/>}
      {traffic&&view==='traffic'&&<AdminTrafficView data={traffic}/>}
      {recordView&&page&&<><div className="admin-table-toolbar"><span>{num(page.total)} résultat{page.total>1?'s':''} · {num(page.rows.length)} affiché{page.rows.length>1?'s':''}</span><button type="button" className="admin-button" disabled={!page.rows.length} onClick={()=>csv(page.rows)}><HomeIcon name="download" size={16}/>Exporter les lignes affichées</button></div>
        {!page.rows.length?<div className="admin-empty"><HomeIcon name="search" size={28}/><h3>Aucun résultat</h3><p>{view==='subscriptions'?'Aucun abonnement Stripe enregistré à ce jour. Les offres Plus et Pro sont préparées dans le produit.':'Aucun élément pour ces critères.'}</p></div>:<div className="admin-table-scroll"><table className="admin-table"><thead><tr>{selectedColumns.map(c=><th scope="col" key={c.key}>{c.label}</th>)}<th scope="col">Actions</th></tr></thead><tbody>{page.rows.map(row=><tr key={String(row.id)}>{selectedColumns.map(c=><td key={c.key}>{view==='imports'&&c.key==='error'?<AdminImportError row={row}/>:c.format==='status'?<Badge value={view==='videos'&&c.key==='retention'?videoFile(row):row[c.key]}/>:c.format==='date'?date(row[c.key]):c.format==='number'?num(row[c.key]):<span title={text(row[c.key])}>{text(row[c.key])}</span>}{c.key==='title'&&row.locality&&<small>{row.locality}</small>}{c.key==='status'&&view==='videos'&&row.status==='rendering'&&<small>{num(row.progress)} %</small>}</td>)}<td><button className="admin-row-button" type="button" onClick={()=>setSelected(row)} aria-label={'Détails de '+text(row.title??row.agency??row.email??row.id)}>Détails <HomeIcon name="arrow" size={15}/></button></td></tr>)}</tbody></table></div>}
        {page.nextCursor&&<div className="admin-pagination"><button className="admin-button" type="button" disabled={more} onClick={()=>void loadMore()}>{more?'Chargement…':'Voir les 30 suivants'}</button></div>}
      </>}
    </>}
    <dialog ref={dialog} className="admin-dialog" onClose={()=>setSelected(null)}><div className="admin-dialog-top"><span className="admin-eyebrow">{tabs.find(tab=>tab.id===view)?.label}</span><button className="admin-close" type="button" aria-label="Fermer les détails" onClick={()=>dialog.current?.close()}><HomeIcon name="close"/></button></div>
      {selected&&<><h2>{text(selected.title??selected.agency??selected.name??'Détails')}</h2>{detailBusy?<p role="status">Chargement du détail…</p>:detailError?<p role="alert" className="admin-error">{detailError}</p>:<>
        {view==='videos'&&detail&&<><div className="admin-video-detail">{Number(detail.video.master)||Number(detail.video.preview)?<video controls playsInline preload="metadata" src={'/api/admin/jobs/'+encodeURIComponent(String(selected.id))+'/video?variant='+(Number(detail.video.master)?'master':'preview')}/>:<div className="admin-video-unavailable">Fichier indisponible ou expiré.<br/>L’historique de génération reste conservé.</div>}
          <div><Badge value={detail.video.status}/><Facts row={detail.video} keys={[{key:'id',label:'ID'},{key:'email',label:'Compte'},{key:'audience',label:'Origine'},{key:'stage',label:'Étape'},{key:'error',label:'Erreur'},{key:'attempt',label:'Tentative'},{key:'credit',label:'Réservation'},{key:'creditsReserved',label:'Crédits BienVu réservés'},{key:'creditsUsed',label:'Crédits BienVu utilisés'},{key:'creditsRefunded',label:'Crédits restitués'},{key:'creditGift',label:'Essai offert'},{key:'animationsRequested',label:'Animations demandées'},{key:'createdAt',label:'Création'},{key:'sourceUrl',label:'Source'}]}/></div></div>
          <h3>Événements enregistrés</h3>{detail.events.length?<ol className="admin-timeline">{detail.events.map((e,i)=><li key={i}><strong>{text(e.event)}</strong><time>{date(e.at)}</time></li>)}</ol>:<p className="admin-muted">Aucun événement détaillé pour cette ancienne génération.</p>}
          <AdminVideoProfit jobId={String(selected.id)}/>
          <NarrationCosts calls={detail.calls}/>
          {!!detail.animations?.length&&<><h3>Animation des photos · Runway</h3><p className="admin-muted">25 crédits / clip de 5 secondes, soit 0,25 USD estimé avant taxes. Les provisions sont consommées dans les crédits prépayés, déjà comptés au budget du service. Les échecs et résultats incertains restent provisionnés.</p>
            <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Photo</th><th>Modèle</th><th>État</th><th>Crédits API Runway</th><th>Provision</th><th>Tâche API</th><th>Erreur</th></tr></thead><tbody>{detail.animations.map(a=><tr key={String(a.id)}><td>{text(a.photoId)}</td><td>{text(a.model)} · {a.mode==='mock'?'Fixture':'Réel'}</td><td>{text(a.state)}</td><td>{a.mode==='mock'?'Simulé':num(a.credits)}</td><td>{euro(Number(a.reservedCents))}</td><td>{text(a.taskId)}</td><td>{text(a.error)}</td></tr>)}</tbody></table></div></>}
          {detail.reports.length>0&&<><h3>Signalements</h3>{detail.reports.map(r=><p key={String(r.id)}><Badge value={r.status}/> {text(r.comment)}</p>)}</>}
        </>}
        {view!=='videos'&&<Facts row={selected} keys={Object.keys(selected).filter(k=>k!=='sortKey'&&(view!=='imports'||!importDiagnosticKeys.includes(k))).map(key=>({key,label:[...selectedColumns,{key:'id',label:'ID'}].find(c=>c.key===key)?.label??key}))}/>}
        {view==='imports'&&<AdminImportDiagnostic row={selected}/>}
        {view==='agencies'&&<button className="admin-button" type="button" onClick={()=>{const id=String(selected.agencyId);dialog.current?.close();choose('videos');setAgency(id);}}>Voir toutes les vidéos de cette agence <HomeIcon name="arrow" size={16}/></button>}
        {view==='reports'&&<div className="admin-dialog-actions">{['new','reviewing','closed'].filter(s=>s!==selected.status).map(s=><button className="admin-button" key={s} type="button" onClick={()=>confirm({action:'report_status',id:String(selected.id),expected:String(selected.status) as 'new'|'reviewing'|'closed',status:s as 'new'|'reviewing'|'closed',reason:'À renseigner'})}>Marquer « {labels[s]} »</button>)}</div>}
        {view==='quotas'&&<button className="admin-button admin-button-dark" type="button" disabled={String(selected.end)<=new Date().toISOString()||String(selected.start)>new Date().toISOString()} onClick={()=>confirm({action:'quota',id:String(selected.id),expected:Number(selected.quota),limit:Number(selected.quota),reason:'À renseigner'})}>Ajuster les crédits de cette période</button>}
      </>}</>}
    </dialog>
    <dialog ref={actionDialog} className="admin-dialog admin-action-dialog" onCancel={event=>{if(saving)event.preventDefault();}} onClose={()=>setPending(null)}>{pending&&<form onSubmit={event=>void save(event)}><span className="admin-eyebrow">ACTION ADMINISTRATIVE</span><h2>{pending.action==='monthly_budget'?'Modifier le budget mensuel':pending.action==='quota'?'Ajuster les crédits':pending.action==='report_status'?'Traiter le signalement':pending.enabled?'Réactiver les lancements':'Suspendre les lancements'}</h2>
      <p>{pending.action==='monthly_budget'?`Mois ${pending.month} : enveloppe ${euro(pending.envelopeCents)}, coupure ${euro(pending.ceilingCents)}. Budget ${pending.paused?'suspendu':'ouvert'}. Les dépenses et réservations restent conservées.`:pending.action==='quota'?'Le quota concerne cette période uniquement. Il doit couvrir les crédits consommés et réservés.':pending.action==='generation_gate'?'Les vidéos déjà lancées continuent. Les limites de budget et les protections du service restent appliquées.':'Le nouveau statut sera enregistré dans le journal.'}</p>
      {pending.action==='quota'&&<label className="admin-field">Nombre de crédits pour cette période<input type="number" min={1} max={1000} step={1} required value={pending.limit} onChange={event=>setPending({...pending,limit:Number(event.target.value)})}/></label>}
      <label className="admin-field">Motif de la modification (obligatoire)<textarea required minLength={5} maxLength={300} rows={3} value={reason} onChange={event=>setReason(event.target.value)} aria-describedby="admin-action-reason-help" placeholder={pending.action==='quota'?'Ex. : Augmentation du quota pour tester le service.':'Expliquez la raison de cette action…'}/>
        <small id="admin-action-reason-help" role="status">{reason.trim().length<5?'Saisissez un motif d’au moins 5 caractères pour activer la confirmation.':'Ce motif sera enregistré dans le journal d’administration.'}</small>
      </label>
      {actionError&&<p role="alert" className="admin-error">{actionError}</p>}<div className="admin-dialog-actions"><button className="admin-button" type="button" disabled={saving} onClick={()=>actionDialog.current?.close()}>Annuler</button><button className="admin-button admin-button-dark" type="submit" disabled={saving||reason.trim().length<5}>{saving?'Enregistrement…':'Confirmer la modification'}</button></div>
    </form>}</dialog>
  </div>;
}
function NarrationCosts({calls}:{calls:AdminNarrationCall[]}){
  const totals=(provider:AdminNarrationCall['provider'])=>{
    const real=calls.filter(c=>c.provider===provider&&c.mode==='real'),known=real.filter(c=>c.currency==='USD'&&c.estimatedMicros!==null);
    return {real:real.length,known:known.length,micros:known.reduce((sum,c)=>sum+c.estimatedMicros!,0)};
  };
  const openai=totals('openai'),google=totals('google'),fish=totals('fish'),cartesia=totals('cartesia');
  return <section className="admin-narration-costs" aria-label="Coût de la narration"><h3>Coût de la narration</h3>
    <div className="admin-cost-grid">{([{name:'OpenAI · rédaction',total:openai,note:'Avant remise sur les tokens en cache.'},{name:'Google · voix',total:google,note:'Avant gratuité mensuelle Google.'},{name:'Cartesia · voix',total:cartesia,note:'Sonic 3.6 · quota Free, facture à rapprocher.'},{name:'Fish Audio · voix',total:fish,note:'Modèle gratuit S2.1 Pro ; usage mesuré en octets UTF-8.'}]).map(({name,total,note})=><div className="admin-cost-card" key={name}><span>{name}</span><strong>{!total.real?'Aucun appel réel':!total.known?'Non mesuré':usd(total.micros)}</strong><small>{total.real?`${total.known} / ${total.real} appel${total.real>1?'s':''} mesuré${total.known>1?'s':''}. `:''}{note}{total.known<total.real?' Total partiel.':''}</small></div>)}
      <div className="admin-cost-card"><span>Provision des appels</span><strong>{euro(calls.reduce((sum,c)=>sum+c.reservedCents,0))}</strong><small>Réserve préventive en euros, déjà incluse dans le budget vidéo.</small></div>
    </div>
    <p className="admin-muted">Estimations enregistrées au moment des appels, en dollars US, hors taxes et conversion. La facture effective et le coût Cloudflare de cette vidéo ne sont pas connus. Une mesure absente ne vaut pas zéro.</p>
    {calls.length?<div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Fournisseur</th><th>Mode</th><th>État</th><th>Coût estimé (USD)</th><th>Provision (EUR)</th><th>Erreur</th></tr></thead><tbody>{calls.map(c=><tr key={c.id}><td>{c.provider==='openai'?'OpenAI':c.provider==='fish'?'Fish Audio':c.provider==='cartesia'?'Cartesia':'Google TTS'}</td><td>{c.mode==='real'?'Réel':'Fixture'}</td><td>{c.state==='done'?'Terminé':c.state==='failed'?'Échec':'En cours'}</td><td>{c.mode==='mock'?'Simulé · non facturé':c.estimatedMicros===null?'Non mesuré':usd(c.estimatedMicros)}</td><td>{euro(c.reservedCents)}</td><td>{text(c.error)}</td></tr>)}</tbody></table></div>:<p className="admin-muted">Aucun appel enregistré pour cette génération.</p>}
    {calls.filter(c=>c.provider==='fish').map(c=><details className="admin-request" key={c.id}><summary>Requête Fish Audio · {text(c.voice)}</summary><dl className="admin-facts">{[['Modèle',text(c.model)],['Octets UTF-8',c.inputUtf8Bytes===null?'Non mesurés':num(c.inputUtf8Bytes)],['Durée de l’appel',c.requestDurationMs===null?'Non mesurée':num(c.requestDurationMs)+' ms'],['ID de requête',text(c.providerRequestId)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details>)}
    {calls.filter(c=>c.provider==='openai').map((c,index)=><details className="admin-request" key={c.id} open={index===0}><summary>Requête OpenAI · {c.step} <span>{c.mode==='mock'?'Fixture':c.estimatedMicros===null?'Non mesuré':usd(c.estimatedMicros)}</span></summary>
      <dl className="admin-facts">{[
        ['Modèle',text(c.model)],['Tokens d’entrée',c.inputTokens===null?'Non mesurés':num(c.inputTokens)],['Dont en cache',c.cachedInputTokens===null?'Non mesurés':num(c.cachedInputTokens)],['Tokens de sortie',c.outputTokens===null?'Non mesurés':num(c.outputTokens)],
        ['Durée de l’appel',c.requestDurationMs===null?'Non mesurée':num(c.requestDurationMs)+' ms'],['Tarif enregistré',text(c.priceDate)],['Date de l’appel',date(c.at)],['ID de requête OpenAI',text(c.providerRequestId)],['ID de réponse',text(c.responseId)],
      ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p className="admin-muted">Les tokens en cache sont inclus dans les tokens d’entrée. L’estimation conservée applique le tarif d’entrée sans remise cache ; elle ne prétend pas être le montant débité.</p>
    </details>)}
  </section>;
}
function Overview({data,choose}:{data:AdminOverview;choose:(view:View)=>void}){
  const {counts}=data,metrics:[string,string,View][]=[['Agences','agencies','agencies'],['Comptes','users','users'],['Vidéos enregistrées','videos','videos'],['Vidéos prêtes','ready','videos'],['En cours','active','videos'],['Échecs','failed','videos'],['Abonnements actifs','activeSubscriptions','subscriptions'],['Signalements ouverts','openReports','reports']];
  const total=counts.videos??0,success=total?Math.round((counts.ready??0)/total*100):0,max=Math.max(1,...data.daily.map(d=>d.total));
  return <><div className="admin-metrics">{metrics.map(([label,key,view])=><button type="button" key={key} className="admin-metric" onClick={()=>choose(view)}><span>{label}<HomeIcon name="arrow" size={16}/></span><strong>{num(counts[key])}</strong></button>)}</div>
    {(counts.overdue>0||counts.delinquentSubscriptions>0)&&<p className="admin-error">{num(counts.overdue)} génération(s) au-delà de leur délai · {num(counts.delinquentSubscriptions)} abonnement(s) en retard ou impayé(s).</p>}
    <div className="admin-dashboard-grid"><section className="admin-card"><div className="admin-card-heading"><h3>Les 14 derniers jours</h3><span>{num(counts.today)} aujourd’hui</span></div><div className="admin-chart" role="img" aria-label="Nombre de générations par jour UTC">{data.daily.length?data.daily.map(day=><div key={day.day} title={`${day.day} : ${day.total} vidéos, ${day.ready} prêtes, ${day.failed} échecs`}><span>{day.total}</span><i style={{height:Math.max(4,day.total/max*126)}}/><small>{day.day.slice(8)}/{day.day.slice(5,7)}</small></div>):<p>Aucune génération récente.</p>}</div><p className="admin-muted">Tous les jobs, essais et tests internes inclus. Dates en UTC.</p></section>
      <section className="admin-card"><h3>État des générations</h3><div className="admin-success"><strong>{success}<small>%</small></strong><p>des jobs enregistrés sont prêts</p></div>{data.statuses.map(s=><div className="admin-distribution" key={s.status}><Badge value={s.status}/><div><i style={{width:`${total?s.count/total*100:0}%`}}/></div><strong>{s.count}</strong></div>)}</section>
      <Budget data={data}/><section className="admin-card"><h3>À suivre</h3><div className="admin-summary-lines"><p><span>Comptes vérifiés</span><strong>{num(counts.verifiedUsers)}</strong></p><p><span>Sessions anonymes conservées</span><strong>{num(counts.anonymousSessions)}</strong></p><p><span>Vidéos publiées</span><strong>{num(counts.publicVideos)}</strong></p><p><span>Brouillons conservés</span><strong>{num(counts.drafts)}</strong></p><p><span>Fichiers anonymes expirés</span><strong>{num(counts.expired)}</strong></p></div><button className="admin-text-button" type="button" onClick={()=>choose('system')}>Voir le service et les erreurs <HomeIcon name="arrow" size={16}/></button></section>
    </div></>;
}
function Budget({data}:{data:AdminOverview}){const b=data.budget,engaged=b?b.baselineCents+b.importsCents:0,available=b?Math.max(0,b.ceilingCents-engaged):0;return <section className="admin-card admin-budget"><div className="admin-card-heading"><h3>Budget du pilote</h3><span>{b?.month??data.at.slice(0,7)+' · Mois non ouvert'}</span></div><div className="admin-budget-total"><strong>{euro(engaged)}</strong><span>provisionnés dans D1</span></div>{b&&<><div className="admin-meter"><i style={{width:Math.min(100,engaged/Math.max(1,b.ceilingCents)*100)+'%'}}/></div><div className="admin-budget-values"><span>{euro(available)} avant la coupure</span><strong>{euro(b.ceilingCents)}</strong></div><p className="admin-muted">Enveloppe : {euro(b.envelopeCents)} · Base : {euro(b.baselineCents)} · Imports : {euro(b.importsCents)}. {b.paused?'Budget suspendu.':'Budget ouvert.'}</p></>}<p className="admin-muted">Provisions préventives, pas une facture. Les dépenses locales et les taxes doivent être rapprochées séparément. Les appels texte/voix peuvent déjà être compris dans les provisions vidéo.</p></section>;}
function System({data,confirm}:{data:AdminOverview;confirm:(action:AdminAction)=>void}){
  const switches:[string,boolean][]=[['Lancements autorisés en base',data.control?.enabled===1],['Génération configurée sur le Worker',data.config.generations],['Essais anonymes configurés',data.config.anonymousTrials&&data.policy?.enabled===1],['Quota gratuit ouvert',data.policy?.free_enabled===1],['Connexion Google configurée',data.config.google]];
  return <><div className="admin-dashboard-grid"><section className="admin-card"><h3>État du service</h3><div className="admin-summary-lines">{switches.map(([name,enabled])=><p key={name}><span>{name}</span><Badge value={enabled?'active':'paused'}/></p>)}<p><span>Import</span><strong>{data.config.imports}</strong></p><p><span>E-mails</span><strong>{data.config.email}</strong></p><p><span>Origine d’authentification</span><strong>{data.config.origin}</strong></p></div><p className="admin-muted">Configuration relue, sans appel payant de vérification aux fournisseurs.</p>{data.control&&<button className="admin-button admin-button-dark" type="button" onClick={()=>confirm({action:'generation_gate',enabled:data.control?.enabled!==1,expected:data.control?.enabled===1,reason:'À renseigner'})}>{data.control.enabled===1?'Suspendre les nouveaux lancements':'Réactiver les nouveaux lancements'}</button>}</section><Budget data={data}/>
      <section className="admin-card"><h3>Limites et usage</h3><div className="admin-summary-lines"><p><span>Imports aujourd’hui (UTC)</span><strong>{num(data.counts.importsToday)} / 20</strong></p><p><span>Imports ce mois-ci</span><strong>{num(data.counts.importsMonth)} / 60</strong></p>{data.policy&&[['Quota gratuit / mois','free_monthly'],['Générations globales / jour','global_daily'],['Générations globales / mois','global_monthly'],['Rendus simultanés','render_concurrency']].map(([label,key])=><p key={key}><span>{label}</span><strong>{num(data.policy?.[key])}</strong></p>)}<p><span>Conservation des vidéos</span><strong>Sans expiration</strong></p></div><p className="admin-muted">Les limites du pipeline et le budget continuent à s’appliquer après une réactivation.</p></section>
      <section className="admin-card"><h3>Stockage déclaré</h3><div className="admin-summary-lines">{data.storage.map(row=><p key={row.kind}><span>{row.kind} · {num(row.objects)} objets</span><strong>{(row.bytes/1024/1024).toLocaleString('fr-FR',{maximumFractionDigits:1})} Mo</strong></p>)}</div><p className="admin-muted">Métadonnées médias/imports en D1. Les artefacts de génération et les éventuels objets orphelins ne sont pas tous comptés ici. Ce total ne mesure pas le bucket R2.</p></section></div>
      <AdminBudgetSettings key={data.budget?.revision??'new'} data={data} confirm={confirm}/>
      <section className="admin-card admin-card-wide"><h3>Erreurs enregistrées</h3>{data.errors.length?<div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Code</th><th>Étape</th><th>Occurrences</th></tr></thead><tbody>{data.errors.map((e,i)=><tr key={i}><td><code>{e.code}</code></td><td>{labels[e.stage]??e.stage}</td><td>{num(e.count)}</td></tr>)}</tbody></table></div>:<p>Aucune erreur enregistrée.</p>}<p className="admin-muted">Les envois d’e-mails et les logs techniques Cloudflare ne disposent pas encore d’un historique de livraison dans l’application.</p></section>
      <section className="admin-card admin-card-wide"><h3>Texte et voix · {data.at.slice(0,7)}</h3><p className="admin-muted">{data.narrationBudget?`Sous-budget narration : ${euro(data.narrationBudget.reservedCents)} réservés / ${euro(data.narrationBudget.envelopeCents)}. ${data.narrationBudget.paused?'Suspendu.':'Ouvert.'}`:'Sous-budget non configuré pour ce mois.'}</p>{data.providers.length?<div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Fournisseur</th><th>Mode</th><th>État</th><th>Appels</th><th>Provisions</th></tr></thead><tbody>{data.providers.map((p,i)=><tr key={i}><td>{p.provider}</td><td>{p.mode==='real'?'Réel':'Fixture'}</td><td>{p.state}</td><td>{num(p.calls)}</td><td>{euro(p.reservedCents)}</td></tr>)}</tbody></table></div>:<p>Aucun appel enregistré.</p>}
        {data.costs.length>0&&<><h4>Journal des coûts (montants distincts, à rapprocher)</h4><div className="admin-summary-lines">{data.costs.map((c,i)=><p key={i}><span>{c.kind} · {c.events} événement(s)</span><strong>{(c.amountMicros/1e6).toLocaleString('fr-FR',{style:'currency',currency:c.currency})}</strong></p>)}</div></>}
      </section></>;
}
