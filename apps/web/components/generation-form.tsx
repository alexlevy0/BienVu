'use client';
import Link from 'next/link';
import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {ImportUrl, publicErrors, type CreationDraftView, type NormalizedListing, type PublicErrorCode} from '@bienvu/contracts';
import {Icon} from './icon';
import {useAccount} from './account';
import {ManualListingForm} from './manual-listing-form';
import {readListingDraft, clearListingDraft} from '../lib/listing-draft';
import {GenerationProgress,generationActive,useGenerationProgress} from './generation-progress';
import type {GenerationRequest} from '@bienvu/contracts';
import {ImportCoverage} from './import-coverage';
import {requestGeneration} from '../lib/generation-client';
import {useSubtitlePreference} from './video-settings';

export type ImportView = {id: string; sourceKind: 'url' | 'manual'; sourceUrl: string | null; status: 'importing' | 'needs_input' | 'ready' | 'failed'; errorCode: PublicErrorCode | null;
  createdAt: string; expiresAt: string; listing: NormalizedListing | null; draft?:CreationDraftView|null;
  title?: string | null; transaction?: 'sale' | 'rent' | null};
const message = (code?: PublicErrorCode | null) => code && code in publicErrors ? publicErrors[code][1] : 'L’import n’a pas abouti. Réessayez.';
export function GenerationForm() {
  const {me, loading} = useAccount();
  const {subtitlesEnabled,voiceEnabled,durationSeconds,aspectRatio}=useSubtitlePreference();
  const [url, setUrl] = useState(''), [feedback, setFeedback] = useState(''), [busy, setBusy] = useState(false);
  const [imports, setImports] = useState<ImportView[]>([]), [result, setResult] = useState<ImportView | null>(null);
  const [manualOpen, setManualOpen] = useState(false), [manualBusy, setManualBusy] = useState(false);
  const {job,setJob,unavailable}=useGenerationProgress(me?.agency.id);
  const working = busy || manualBusy || generationActive(job);
  const pending = useRef<{url: string; key: string} | null>(null);
  useEffect(() => {
    const draft = readListingDraft();
    if (draft?.kind === 'url') setUrl(draft.url);
    if (draft?.kind === 'manual') setManualOpen(true);
  }, []);
  const refresh = useCallback(async () => {
    if (!me) return;
    try {const response = await fetch('/api/imports', {cache: 'no-store'}); if (response.ok) setImports((await response.json() as {imports: ImportView[]}).imports);} catch { /* le retour d'import reste visible */ }
  }, [me]);
  useEffect(() => {setImports([]); setResult(null); void refresh();}, [refresh]);
  async function show(id: string) {
    setFeedback('');
    try {const response = await fetch(`/api/imports/${id}`, {cache: 'no-store'}); const value = await response.json() as ImportView & {error?: {code?: PublicErrorCode}};
      if (!response.ok) throw new Error(message(value.error?.code));
      setResult(value); if (value.sourceUrl) setUrl(value.sourceUrl); pending.current = null;
    } catch (error) {setFeedback(error instanceof Error ? error.message : message());}
  }
  async function generate(input:GenerationRequest) {
    setJob(await requestGeneration(me!.agency.id,{...input,subtitlesEnabled,voiceEnabled,durationSeconds,aspectRatio}));
  }
  async function generateSaved(id:string){if(working)return;setBusy(true);setFeedback('');try{await generate({listingId:id});}catch(error){setFeedback(error instanceof Error?error.message:message());}finally{setBusy(false);}}
  async function submit(event: FormEvent) {
    event.preventDefault(); if (working) return;
    const parsed = ImportUrl.safeParse(url);
    if (!parsed.success) {setFeedback('Saisissez le lien HTTPS public d’une annonce.'); return;}
    setBusy(true); setFeedback(''); setResult(null);
    if (!pending.current || pending.current.url !== parsed.data) pending.current = {url: parsed.data, key: crypto.randomUUID()};
    try {
      const response = await fetch('/api/imports', {method: 'POST', headers: {'Content-Type': 'application/json', 'Idempotency-Key': pending.current.key},
        body: JSON.stringify({url: parsed.data}), signal: AbortSignal.timeout(75_000)});
      const value = await response.json() as ImportView & {error?: {code?: PublicErrorCode}};
      if (!response.ok) throw new Error(message(value.error?.code));
      setResult(value); if (value.status === 'ready'||value.status==='failed') pending.current = null;
      if (value.status === 'ready') clearListingDraft();
      if(value.status==='ready'&&me?.rights.generationEnabled)await generate({listingId:value.id});
      await refresh();
    } catch (error) {setFeedback(error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'La réponse tarde. Consultez vos imports avant de réessayer.'); await refresh();}
    finally {setBusy(false);}
  }
  if (loading) return <p role="status">Chargement de votre espace…</p>;
  if (!me) return <div className="information-note"><p>Connectez-vous pour importer une annonce dans votre espace privé.</p><Link className="button primary" href="/connexion">Se connecter <Icon name="arrow" size={16}/></Link></div>;
  const listing = result?.listing, facts = listing?.facts;
  return <>
    <p className="field-help">{me.rights.generationEnabled?`${me.rights.creditKind==='free'?'Compte gratuit':'Votre quota'} · ${me.rights.developmentRemaining} vidéo(s) disponible(s).`:'La génération est momentanément fermée. Vous pouvez préparer vos annonces.'}</p>
    {me.rights.renewalAt&&<p className="field-help">Renouvellement le {new Date(me.rights.renewalAt).toLocaleDateString('fr-FR')}.</p>}
    {me.rights.importRetryAt&&<p className="information-note" role="status">La limite des imports de test est atteinte. Les nouvelles annonces seront disponibles à partir du {new Date(me.rights.importRetryAt).toLocaleString('fr-FR')}. Vos annonces déjà enregistrées restent utilisables.</p>}
    {job&&<GenerationProgress job={job} unavailable={unavailable}/>}
    <form className="generation-form" onSubmit={submit} noValidate>
      <label htmlFor="listing-url">Le lien de votre annonce</label>
      <div className={`url-field ${feedback ? 'invalid' : ''}`}><Icon name="link"/>
        <input id="listing-url" name="url" type="url" inputMode="url" autoComplete="off" spellCheck={false}
          placeholder="https://votre-agence.fr/annonce/…" value={url} disabled={working}
          onChange={event => {setUrl(event.target.value); setFeedback(''); pending.current = null;}}
          aria-invalid={Boolean(feedback)} aria-describedby="url-help url-feedback"/>
      </div>
      <p id="url-help" className="field-help">Un lien public du bien que vous êtes autorisé à utiliser. Vos données restent privées.</p>
      <ImportCoverage url={url}/>
      <p id="url-feedback" role="alert" className="form-feedback error">{feedback}</p>
      <div className="generation-action"><button className="button primary" disabled={working||Boolean(me.rights.importRetryAt)} type="submit">
        {busy ? 'Préparation…' : me.rights.generationEnabled ? 'Créer ma vidéo' : 'Importer l’annonce'}<Icon name="arrow" size={18}/></button></div>
      {busy && <p className="field-help" role="status">Lecture de l’annonce et vérification de la galerie…</p>}
    </form>
    <button className="text-button manual-toggle" type="button" aria-expanded={manualOpen} aria-controls="manual-listing-panel" disabled={working}
      onClick={() => setManualOpen(open => !open)}><span aria-hidden="true">{manualOpen ? '−' : '+'}</span> Saisir mon annonce manuellement</button>
    <div id="manual-listing-panel" hidden={!manualOpen}>
      <ManualListingForm generate={me.rights.generationEnabled} busy={working} setBusy={setManualBusy} onCreated={async value => {setResult(value); setFeedback(''); setManualOpen(false); clearListingDraft(); await refresh(); if(me.rights.generationEnabled)await generate({listingId:value.id});}}/>
    </div>
    {result && <section className="import-result" aria-live="polite">
      {result.status === 'failed' && <><h3>Cette annonce n’a pas pu être enregistrée.</h3><p className="form-feedback error">{message(result.errorCode)}</p><p className="field-help">Essayez un autre lien du même bien ou utilisez la saisie manuelle ci-dessus.</p></>}
      {result.status === 'importing' && <><p>{result.sourceKind === 'manual' ? 'Cette saisie est inachevée. Terminez l’envoi dans le formulaire ouvert, ou recommencez une saisie.' : 'Votre import est en cours.'}</p><button className="text-button" onClick={() => void show(result.id)}>Actualiser son état</button></>}
      {result.status==='needs_input'&&<><h3>Annonce à compléter</h3><p>Les informations et les photos valides sont conservées. Complétez seulement ce qui manque avant de créer la vidéo.</p>
        <Link className="button primary" href={`/?draft=${encodeURIComponent(result.id)}`}>Continuer mon annonce <Icon name="arrow" size={18}/></Link></>}
      {listing && facts && <><span className="section-kicker">{listing.sourceKind === 'manual' ? 'ANNONCE SAISIE · PRIVÉ' : 'ANNONCE IMPORTÉE · PRIVÉ'}</span>
        <h3>{facts.title.value ?? 'Annonce enregistrée'}</h3>
        {listing.sourceKind === 'manual' && <p className="field-help">Informations et photos fournies par votre agence.</p>}
        <p>{listing.transaction === 'rent' ? 'Location' : 'Vente'} · {facts.locality.value}
          {facts.area.value !== null && ` · ${new Intl.NumberFormat('fr-FR').format(facts.area.value)} m²`}{facts.rooms?.value != null && ` · ${facts.rooms.value} pièces`}</p>
        {facts.price.value !== null && <p className="import-price">{new Intl.NumberFormat('fr-FR', {style: 'currency', currency: 'EUR', maximumFractionDigits: 2}).format(facts.price.value.amountCents / 100)}
          {facts.price.value.period === 'month' && ` / mois · charges ${facts.price.value.charges === 'included' ? 'comprises' : 'non comprises'}`}</p>}
        <div className="import-gallery">{listing.photos.map((photo, index) => <img key={photo.id} src={`/api/imports/${result.id}/photos/${photo.id}`}
          width={photo.width} height={photo.height} loading="lazy" alt={`Photo ${index + 1} du bien`}/>)}</div>
        <div className="import-description"><h4>Description du bien</h4>
          {listing.description ? <><p className="import-description-text">{listing.description.text}</p>
            {listing.description.truncated && <p className="field-help">La description est très longue. Consultez l’annonce source pour lire la suite.</p>}</>
            : <p className="field-help">La description n’est pas disponible dans cet import.</p>}
        </div>
        {listing.warnings.map(warning => <p className="field-help" key={warning}>{warning}</p>)}
        <p className="field-help">{listing.photos.length} photos enregistrées · Conservation jusqu’au {new Date(result.expiresAt).toLocaleDateString('fr-FR')}.</p>
        {me.rights.generationEnabled&&<button className="button primary" disabled={working||me.rights.developmentRemaining===0} onClick={()=>void generateSaved(result.id)}>Créer la vidéo de cette annonce</button>}
        {listing.canonicalUrl && <a className="text-button" href={listing.canonicalUrl} target="_blank" rel="noopener noreferrer">Consulter l’annonce source</a>}
      </>}
    </section>}
    {imports.length > 0 && <section className="recent-imports"><h3>Vos dernières annonces</h3><ul>{imports.slice(0, 10).map(item => <li key={item.id}><button type="button" disabled={working} onClick={() => void show(item.id)}>
      <span>{item.title ? `${item.transaction === 'rent' ? 'Location' : 'Vente'} · ${item.title}` : item.sourceUrl ? new URL(item.sourceUrl).hostname : 'Saisie manuelle'}</span><span>{item.status === 'ready' ? 'Enregistrée' : item.status === 'failed' ? 'Échec' : item.status==='needs_input'?'À compléter':'En cours'}</span></button></li>)}</ul></section>}
  </>;
}
