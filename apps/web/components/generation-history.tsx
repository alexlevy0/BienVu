'use client';
import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';
import {GenerationView, publicErrors, type PublicErrorCode} from '@bienvu/contracts';
import {useAccount} from './account';
import {generationActive} from './generation-progress';
import {HomeIcon} from './home-icons';
import {anonymousGenerationScope,useGenerationStore} from './generation-store';
import {ProblemReport} from './problem-report';
import {DraftActions} from './draft-actions';

type Status = 'all' | 'ready' | 'active';
type Sort = 'newest' | 'oldest';
type Share = {id: string; jobId: string};
const date = (value: string) => new Date(value).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short', year: 'numeric'});
const labels: Record<GenerationView['status'], string> = {queued: 'En attente', importing: 'Lecture de l’annonce',
  scripting: 'Rédaction du texte', voicing: 'Création de la voix', rendering: 'Assemblage de la vidéo',
  retry_wait: 'Reprise en attente', ready: 'Terminée', failed: 'Échec'};

async function responseValue(response: Response) {
  const value = await response.json() as {error?: {code?: PublicErrorCode}; id?: string; url?: string};
  if (!response.ok) {
    const code = value.error?.code;
    throw new Error(code && code in publicErrors ? publicErrors[code][1] : 'Cette action a échoué. Réessayez.');
  }
  return value;
}

export function GenerationHistory() {
  const {me, loading} = useAccount();
  const generationStore=useGenerationStore();
  const owner=me?.agency.id??anonymousGenerationScope;
  const [jobs, setJobs] = useState<GenerationView[]>([]), [jobsOwner,setJobsOwner]=useState<string|null>(null),
    [shares, setShares] = useState<Record<string, Share>>({});
  const [query, setQuery] = useState(''), [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status>('all'), [sort, setSort] = useState<Sort>('newest');
  const [cursor, setCursor] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false), [feedback, setFeedback] = useState('');
  const [preview, setPreview] = useState<GenerationView | null>(null), [confirm, setConfirm] = useState<GenerationView | null>(null);
  const [action, setAction] = useState<string | null>(null), [revision, setRevision] = useState(0);
  const previewDialog = useRef<HTMLDialogElement>(null), shareDialog = useRef<HTMLDialogElement>(null), requestVersion = useRef(0);
  useEffect(() => {const timer = setTimeout(() => setSearch(query.trim()), 250); return () => clearTimeout(timer);}, [query]);
  const parameters = () => new URLSearchParams({q: search, status, sort});

  useEffect(() => {
    const version = ++requestVersion.current, controller = new AbortController();
    setJobs([]);setJobsOwner(null);setPreview(null);setConfirm(null);setShares({}); setCursor(null); setLoaded(false); setFeedback('');
    if (loading) return () => controller.abort();
    if (!me) {setJobsOwner(anonymousGenerationScope);void generationStore.refresh();return () => controller.abort();}
    void (async () => {
      try {
        const [history, published] = await Promise.all([
          fetch(`/api/generations?${parameters()}`, {cache: 'no-store', signal: controller.signal}),
          fetch('/api/generations/shares', {cache: 'no-store', signal: controller.signal}),
        ]);
        if (!history.ok || !published.ok) throw new Error('Impossible de charger vos vidéos pour le moment.');
        const data = await history.json() as {jobs: unknown[]; nextCursor: string | null};
        const shared = await published.json() as {shares: Share[]};
        if (version !== requestVersion.current || controller.signal.aborted) return;
        setJobs(data.jobs.map(value => GenerationView.parse(value)));setJobsOwner(me.agency.id);
        setShares(Object.fromEntries(shared.shares.map(value => [value.jobId, value])));
        setCursor(data.nextCursor); setLoaded(true);
      } catch (error) {
        if (!controller.signal.aborted && version === requestVersion.current)
          setFeedback(error instanceof Error ? error.message : 'Impossible de charger vos vidéos.');
      }
    })();
    return () => controller.abort();
  }, [me?.agency.id, loading, search, status, sort, revision]);

  useEffect(()=>{if(!me)return;
    setJobs(current=>current.map(job=>generationStore.jobs.find(fresh=>fresh.id===job.id)??job));
  },[generationStore.jobs,me?.agency.id]);
  useEffect(() => {
    if (!preview) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previewDialog.current?.showModal();
    return () => {previewDialog.current?.close(); trigger?.focus();};
  }, [preview]);
  useEffect(() => {
    if (!confirm) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    shareDialog.current?.showModal();
    return () => {shareDialog.current?.close(); trigger?.focus();};
  }, [confirm]);

  async function more() {
    if (!cursor || busy) return;
    const version = requestVersion.current; setBusy(true); setFeedback('');
    try {
      const params = parameters(); params.set('cursor', cursor);
      const response = await fetch(`/api/generations?${params}`, {cache: 'no-store'});
      if (!response.ok) throw new Error('Impossible de charger les vidéos précédentes.');
      const data = await response.json() as {jobs: unknown[]; nextCursor: string | null};
      if (version !== requestVersion.current) return;
      setJobs(old => [...old, ...data.jobs.map(value => GenerationView.parse(value)).filter(value => !old.some(item => item.id === value.id))]);
      setCursor(data.nextCursor);
    } catch (error) {if (version === requestVersion.current) setFeedback(error instanceof Error ? error.message : 'Chargement interrompu.');}
    finally {setBusy(false);}
  }
  async function publish(job: GenerationView) {
    setConfirm(null); setAction(job.id); setFeedback('');
    try {
      const value = await responseValue(await fetch(`/api/generations/${job.id}/share`, {method: 'POST'}));
      setShares(old => ({...old, [job.id]: {id: value.id!, jobId: job.id}}));
    } catch (error) {setFeedback(error instanceof Error ? error.message : 'Publication interrompue.');}
    finally {setAction(null);}
  }
  async function unpublish(job: GenerationView) {
    setAction(job.id); setFeedback('');
    try {
      await responseValue(await fetch(`/api/generations/${job.id}/share`, {method: 'DELETE'}));
      setShares(old => {const next = {...old}; delete next[job.id]; return next;});
    } catch (error) {setFeedback(error instanceof Error ? error.message : 'Retrait interrompu.');}
    finally {setAction(null);}
  }
  async function retry(job: GenerationView) {
    setAction(job.id); setFeedback('');
    try {await responseValue(await fetch(`/api/generations/${job.id}/retry`, {method: 'POST'})); setRevision(value => value + 1);}
    catch (error) {setFeedback(error instanceof Error ? error.message : 'Reprise interrompue.');} finally {setAction(null);}
  }
  async function connect(job:GenerationView){
    setAction(job.id);setFeedback('');
    try{const value=await responseValue(await fetch(`/api/trial/${job.id}/login`,{method:'POST'}));
      window.location.assign(value.url??'/connexion?trial=1');}
    catch(error){setFeedback(error instanceof Error?error.message:'Ouverture interrompue.');setAction(null);}
  }
  const visibleJobs=me?(jobsOwner===owner?jobs:[]):generationStore.jobs.filter(job=>
    (status==='all'||(status==='ready'?job.status==='ready':generationActive(job)))&&
    (!search||job.title.toLocaleLowerCase('fr-FR').includes(search.toLocaleLowerCase('fr-FR'))))
    .sort((a,b)=>sort==='oldest'?a.createdAt.localeCompare(b.createdAt):b.createdAt.localeCompare(a.createdAt));
  const visiblePreview=jobsOwner===owner?preview:null;
  const visibleConfirm=me&&jobsOwner===owner?confirm:null;
  const historyLoaded=me?loaded:!generationStore.loading;
  const historyFeedback=feedback||(!me&&generationStore.unavailable?'Impossible de charger vos essais pour le moment.':'');
  const poster=(job:GenerationView)=>job.ownership==='anonymous'?`/api/trial/${job.id}/source-photo`:`/api/generations/${job.id}/poster`;
  const visibleDrafts=status==='ready'?[]:generationStore.drafts.filter(draft=>
    !search||`${draft.title??''} ${draft.locality??''}`.toLocaleLowerCase('fr-FR').includes(search.toLocaleLowerCase('fr-FR')))
    .sort((a,b)=>sort==='oldest'?a.createdAt.localeCompare(b.createdAt):b.createdAt.localeCompare(a.createdAt));

  return <section className="video-library" aria-labelledby="history-title">
    <div className="video-library-heading"><div><h1 id="history-title" tabIndex={-1}>Mes vidéos</h1><p>Toutes vos créations, au même endroit.</p></div><Link href="/" className="video-library-create"><HomeIcon name="plus" size={26}/>Créer une vidéo</Link></div>
    {loading ? <p role="status" className="video-library-status">Chargement de votre espace…</p> : <>
      {!me&&<p className="video-library-status">Retrouvez ici les essais créés dans ce navigateur. Connectez-vous pour les enregistrer dans votre compte.</p>}
      <div className="video-library-toolbar"><label className="video-library-search"><HomeIcon name="search" size={24}/><span className="sr-only">Rechercher une vidéo</span><input value={query} maxLength={80} onChange={event => setQuery(event.target.value)} placeholder="Rechercher une vidéo…"/></label>
        <div className="video-library-tabs" role="group" aria-label="Filtrer les vidéos">{([['all','Toutes'],['ready','Terminées'],['active','En cours']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={status===value} onClick={() => setStatus(value)}>{label}</button>)}</div>
        <label className="video-library-sort"><span className="sr-only">Ordre des vidéos</span><select value={sort} onChange={event => setSort(event.target.value as Sort)}><option value="newest">Les plus récentes</option><option value="oldest">Les plus anciennes</option></select><HomeIcon name="chevron" size={17}/></label>
      </div>
      {historyFeedback && <p className="video-library-feedback" role="alert">{historyFeedback} <button type="button" onClick={() => setRevision(value => value + 1)}>Réessayer</button></p>}
      {!historyLoaded && !historyFeedback && <p className="video-library-status" role="status">Chargement de vos vidéos…</p>}
      {visibleDrafts.length>0&&<section className="video-library-drafts" aria-label="Annonces à compléter"><h2>Annonces à compléter</h2>
        <div>{visibleDrafts.map(draft=><article key={draft.id}>
          {draft.previewPhotoId?<img src={`/api/imports/${draft.id}/photos/${draft.previewPhotoId}`} alt="Photo du bien à compléter"/>:
            <span className="video-library-draft-placeholder"><HomeIcon name="pencil" size={30}/></span>}
          <div className="video-library-draft-content"><h3>{draft.title||'Votre annonce'}</h3><p>À compléter{draft.locality?` · ${draft.locality}`:''}</p>
            <Link href={`/?draft=${encodeURIComponent(draft.id)}`}>Continuer mon annonce <HomeIcon name="arrow" size={17}/></Link></div>
          {me&&<DraftActions draft={draft} agencyId={me.agency.id} placement="history"/>}
        </article>)}</div></section>}
      {historyLoaded && !historyFeedback && visibleJobs.length===0&&visibleDrafts.length===0 && <div className="video-library-empty"><h2>{search || status!=='all' ? 'Aucune vidéo trouvée.' : 'Votre première vidéo vous attend.'}</h2><p>{search || status!=='all' ? 'Essayez une autre recherche ou un autre filtre.' : 'Vos créations apparaîtront ici dès leur démarrage.'}</p>{!search && status==='all' && <Link href="/" className="video-library-create">Créer une vidéo <HomeIcon name="arrow" size={18}/></Link>}</div>}
      <div className="video-library-grid">{visibleJobs.map(job => {
        const ready = job.status === 'ready', expired = ready && !job.videoUrl, shared = shares[job.id];
        return <article className="video-library-card" id={`video-${job.id}`} key={job.id}>
          <div className="video-library-poster"><img key={`${job.id}:${job.status}`} src={poster(job)} alt={`Photo du bien : ${job.title}`} loading="lazy" onError={event => {event.currentTarget.style.display='none';}}/>
            {job.durationSeconds && <span className="video-library-duration">{`0:${String(Math.round(job.durationSeconds)).padStart(2,'0')}`}</span>}
            {job.videoUrl ? <button className="video-library-play" type="button" onClick={() => setPreview(job)} aria-label={`Lire ${job.title}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7V5Z"/></svg></button>
              : generationActive(job) && <div className="video-library-progress"><div className="video-library-spinner" aria-hidden="true"/><strong>Création en cours</strong><span>{labels[job.status]}</span><div className="video-library-progress-track" role="progressbar" aria-label="Étape de création" aria-valuetext={labels[job.status]}><span className="video-progress-indeterminate"/></div></div>}
          </div>
          <h2>{job.title}</h2>
          <div className="video-library-meta"><span><i className={`video-library-status-dot${job.status==='failed'?' failed':generationActive(job)?' working':''}`}/>{expired?'Expirée':labels[job.status]}</span><span>{date(job.createdAt)}</span><span><HomeIcon name={shared?'globe':'lock'} size={18}/>{shared?'Publique':'Privée'}</span></div>
          {ready && <p className="video-library-expiry">{expired ? 'Le fichier n’est plus disponible.' : `Disponible jusqu’au ${date(job.expiresAt)} · Voix de synthèse`}</p>}
          {job.status==='failed' && <p className="video-library-expiry">{publicErrors[job.errorCode as PublicErrorCode]?.[1]??'La création n’a pas abouti.'}</p>}
          <div className="video-library-actions">{job.downloadUrl ? <a href={job.downloadUrl} download className="video-library-download"><HomeIcon name="download" size={21}/>Télécharger</a> : job.masterAccess==='locked'&&ready&&!expired ? job.ownership==='anonymous'?<button type="button" disabled={action===job.id} className="video-library-download" onClick={()=>void connect(job)}>{action===job.id?'Ouverture…':'Télécharger sans filigrane'}</button>:<Link className="video-library-download" href={`/historique/${job.id}`}>Télécharger sans filigrane</Link> : <span className="video-library-pending">{expired?'Vidéo expirée':job.status==='failed'?'Création interrompue':'Vidéo en préparation'}</span>}
            {job.videoUrl && <button type="button" className="video-library-view" aria-label={`Prévisualiser ${job.title}`} onClick={() => setPreview(job)}><HomeIcon name="eye" size={23}/></button>}</div>
          {shared ? <div className="video-library-share"><Link href={`/explorer/${shared.id}`}>Voir la page publique <HomeIcon name="arrow" size={18}/></Link><button type="button" disabled={action===job.id} onClick={() => void unpublish(job)}>Retirer</button></div>
            : job.downloadUrl ? <button type="button" className="video-library-share-link" disabled={action===job.id} onClick={() => setConfirm(job)}>Publier dans Explorer <HomeIcon name="arrow" size={18}/></button>
              : me&&job.retryAllowed ? <button type="button" className="video-library-share-link" disabled={action===job.id} onClick={() => void retry(job)}>Relancer le démarrage <HomeIcon name="arrow" size={18}/></button> : null}
          {['ready','failed'].includes(job.status)&&<ProblemReport jobId={job.id} anonymous={job.ownership==='anonymous'}/>}
        </article>;
      })}</div>
      {cursor && <button className="video-library-more" type="button" disabled={busy} onClick={() => void more()}>{busy?'Chargement…':'Afficher les vidéos précédentes'}</button>}
    </>}
    {visiblePreview && <dialog ref={previewDialog} className="video-library-dialog" onCancel={() => setPreview(null)}><button className="video-library-close" type="button" onClick={() => setPreview(null)} aria-label="Fermer">×</button><h2>{visiblePreview.title}</h2><video src={visiblePreview.videoUrl!} controls autoPlay playsInline preload="metadata" poster={poster(visiblePreview)} aria-label={`Vidéo : ${visiblePreview.title}`}/><p>{visiblePreview.ownership==='anonymous'?'Aperçu avec filigrane':'Vidéo privée'} · Disponible jusqu’au {date(visiblePreview.expiresAt)}.</p></dialog>}
    {visibleConfirm && <dialog ref={shareDialog} className="video-library-dialog video-library-confirm" onCancel={() => setConfirm(null)}><button className="video-library-close" type="button" onClick={() => setConfirm(null)} aria-label="Fermer">×</button><h2>Publier cette vidéo ?</h2><p>« {visibleConfirm.title} » sera visible et lisible par tous dans Explorer, avec les photos du bien, votre identité et vos coordonnées d’agence. Le lien public restera actif jusqu’au {date(visibleConfirm.expiresAt)}, sauf si vous le retirez avant.</p><div><button type="button" onClick={() => setConfirm(null)}>Annuler</button><button type="button" className="video-library-create" onClick={() => void publish(visibleConfirm)}>Publier dans Explorer</button></div></dialog>}
  </section>;
}
