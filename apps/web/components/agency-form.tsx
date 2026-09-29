'use client';

import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';
import {AgencyUpdate, AgencyProfile, LOGO_MAX_BYTES} from '@bienvu/contracts';
import {useAccount} from './account';
import {HomeIcon} from './home-icons';

type Fields = {name: string; phone: string; email: string; website: string; city: string;
  primaryColor: string; secondaryColor: string};
const defaults: Fields = {name: '', phone: '', email: '', website: '', city: '',
  primaryColor: '#214F43', secondaryColor: '#F3EFE6'};
const hexColor = /^#[0-9a-f]{6}$/i;
const validColor = (value: string, fallback: string) => hexColor.test(value) ? value : fallback;
function readableInk(hex: string) {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 < 155 ? '#fffefa' : '#151813';
}
function fromProfile(agency: AgencyProfile): Fields {
  return {name: agency.name, phone: agency.phone ?? '', email: agency.email ?? '',
    website: agency.website ?? '', city: agency.city ?? '',
    primaryColor: agency.primaryColor, secondaryColor: agency.secondaryColor};
}
function BrandMark({agency, name, decorative = false}: {agency: AgencyProfile; name: string; decorative?: boolean}) {
  return agency.logoAssetId
    ? <img src={`/api/agency/logo/${agency.logoAssetId}`} alt={decorative ? '' : `Logo de ${agency.name}`}/>
    : <span aria-hidden="true">{name.trim().slice(0, 1).toLocaleUpperCase('fr-FR') || 'B'}</span>;
}

export function AgencyForm() {
  const {me, loading, error, refresh, setAgency} = useAccount();
  const [values, setValues] = useState<Fields>(defaults), [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(''), [failed, setFailed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null), dialog = useRef<HTMLDialogElement>(null);
  // Un upload de logo ne remplace pas les champs du formulaire non enregistrés.
  useEffect(() => {if (me) setValues(fromProfile(me.agency));}, [me?.agency.id]);
  useEffect(() => {
    if (!previewOpen) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.showModal();
    return () => {dialog.current?.close(); trigger?.focus();};
  }, [previewOpen]);

  if (loading) return <div className="agency-studio-state" role="status">Chargement de votre agence…</div>;
  if (!me) return <div className="agency-studio-state"><h2>Retrouvez votre identité d’agence.</h2>
    <p>{error || 'Connectez-vous pour enregistrer votre nom, vos couleurs et votre logo.'}</p>
    {error ? <button type="button" onClick={() => void refresh()}>Réessayer</button>
      : <Link href="/connexion">Se connecter</Link>}</div>;
  const agency = me.agency;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFeedback(''); setFields({}); setFailed(false);
    const result = AgencyUpdate.safeParse(values);
    if (!result.success) {
      setFields(Object.fromEntries(result.error.issues.map(issue => [String(issue.path[0] ?? 'form'), issue.message])));
      setFeedback('Vérifiez les champs indiqués.'); setFailed(true); return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/agency', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(result.data)});
      const data = await response.json() as {agency?: unknown; error?: {message?: string}; fields?: Record<string, string>};
      if (!response.ok) {setFields(data.fields ?? {}); throw new Error(data.error?.message ?? 'La sauvegarde a échoué.');}
      const profile = AgencyProfile.parse(data.agency);
      setAgency(profile); setValues(fromProfile(profile));
      setFeedback('Votre identité est enregistrée pour vos prochaines vidéos.');
    } catch (cause) {setFailed(true); setFeedback(cause instanceof Error ? cause.message : 'La sauvegarde a échoué. Réessayez.');}
    finally {setBusy(false);}
  }
  async function upload(file?: File) {
    if (!file) return;
    setFeedback(''); setFailed(false);
    if (file.size > LOGO_MAX_BYTES || !['image/png', 'image/jpeg'].includes(file.type)) {
      setFailed(true); setFeedback('Choisissez un PNG ou JPEG de 2 Mo maximum.'); return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/agency/logo', {method: 'POST', headers: {'Content-Type': file.type}, body: file});
      const data = await response.json() as {agency?: unknown; error?: {message?: string}};
      if (!response.ok) throw new Error(data.error?.message ?? 'Le logo n’a pas été enregistré.');
      setAgency(AgencyProfile.parse(data.agency));
      setFeedback('Logo enregistré. Vos anciennes vidéos conservent leur apparence.');
    } catch (cause) {setFailed(true); setFeedback(cause instanceof Error ? cause.message : 'Le logo n’a pas été enregistré.');}
    finally {setBusy(false); if (fileInput.current) fileInput.current.value = '';}
  }
  function input(key: keyof Fields, label: string, type = 'text', placeholder?: string) {
    return <div className="agency-studio-field"><label htmlFor={`agency-${key}`}>{label}</label>
      <input id={`agency-${key}`} name={key} type={type} value={values[key]} placeholder={placeholder}
        maxLength={key === 'name' || key === 'city' ? 100 : key === 'phone' ? 25 : key === 'website' ? 2048 : 254}
        aria-invalid={Boolean(fields[key])} aria-describedby={fields[key] ? `agency-error-${key}` : undefined}
        onChange={event => setValues(current => ({...current, [key]: event.target.value}))}/>
      {fields[key] && <span id={`agency-error-${key}`} className="agency-studio-error">{fields[key]}</span>}</div>;
  }
  function colorField(key: 'primaryColor' | 'secondaryColor', label: string) {
    return <div className="agency-studio-field"><label htmlFor={`agency-${key}`}>{label}</label>
      <div className="agency-studio-color-control">
        <input type="color" aria-label={`Choisir la couleur ${label.toLowerCase()}`}
          value={validColor(values[key], defaults[key])} onChange={event => setValues(current => ({...current, [key]: event.target.value}))}/>
        <input id={`agency-${key}`} name={key} type="text" value={values[key]} maxLength={7}
          aria-invalid={Boolean(fields[key])} aria-describedby={fields[key] ? `agency-error-${key}` : undefined}
          onChange={event => setValues(current => ({...current, [key]: event.target.value}))}/>
      </div>
      {fields[key] && <span id={`agency-error-${key}`} className="agency-studio-error">{fields[key]}</span>}</div>;
  }

  const primary = validColor(values.primaryColor, defaults.primaryColor);
  const secondary = validColor(values.secondaryColor, defaults.secondaryColor);
  const contact = values.website.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '') || values.email.trim() || values.phone.trim();
  return <div className="agency-studio-grid">
    <form className="agency-studio-form" onSubmit={save} noValidate>
      <fieldset disabled={busy}><legend className="sr-only">Identité de l’agence</legend>
        <section className="agency-studio-section" aria-labelledby="agency-identity-title">
          <h2 id="agency-identity-title">Identité</h2>
          <div className="agency-studio-field"><span className="agency-studio-label">Logo de l’agence</span>
            <div className="agency-studio-logo-row"><div className="agency-studio-logo"><BrandMark agency={agency} name={values.name}/></div>
              <div className="agency-studio-logo-actions"><label className="agency-studio-upload">
                <HomeIcon name="upload" size={20}/>{agency.logoAssetId ? 'Remplacer le logo' : 'Importer un logo'}
                <input ref={fileInput} type="file" accept="image/png,image/jpeg" disabled={busy}
                  aria-label={agency.logoAssetId ? 'Remplacer le logo' : 'Importer un logo'}
                  onChange={event => void upload(event.target.files?.[0])}/></label>
                <p>PNG ou JPEG · 2 Mo maximum · fond transparent conseillé.</p></div>
            </div>
          </div>
          {input('name', 'Nom de l’agence', 'text', 'Le nom de votre agence')}
        </section>
        <section className="agency-studio-section" aria-labelledby="agency-colors-title">
          <h2 id="agency-colors-title">Couleurs</h2>
          <div className="agency-studio-two">{colorField('primaryColor', 'Principale')}{colorField('secondaryColor', 'Secondaire')}</div>
        </section>
        <section className="agency-studio-section" aria-labelledby="agency-contact-title">
          <h2 id="agency-contact-title">Coordonnées</h2>
          <div className="agency-studio-two">
            {input('phone', 'Téléphone', 'tel', 'Ajouter un numéro')}
            {input('email', 'E-mail', 'email', 'bonjour@votre-agence.fr')}
            {input('website', 'Site web', 'url', 'https://votre-agence.fr')}
            {input('city', 'Ville', 'text', 'Ville de votre agence')}
          </div>
        </section>
        <div className="agency-studio-actions"><p>Nom, logo, couleurs et contact s’appliqueront aux prochaines vidéos. La ville reste dans votre profil.</p>
          <button type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button></div>
      </fieldset>
      {feedback && <p className={`agency-studio-feedback${failed ? ' agency-studio-feedback-error' : ''}`}
        role={failed ? 'alert' : 'status'} aria-live="polite">{feedback}</p>}
    </form>
    <aside className="agency-studio-preview" aria-labelledby="agency-preview-title">
      <p className="agency-studio-preview-kicker">APERÇU</p><h2 id="agency-preview-title">Votre signature</h2>
      <div className="agency-studio-preview-card">
        <button className="agency-studio-preview-media" type="button" onClick={() => setPreviewOpen(true)}
          aria-label="Lire l’exemple de vidéo immobilière" aria-haspopup="dialog">
          <img src="/images/studio-home/paris.webp" alt="Appartement parisien fictif utilisé pour l’aperçu"/>
          <span className="agency-studio-preview-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 5 11 7-11 7V5Z"/></svg></span>
        </button>
        <div className="agency-studio-preview-brand" style={{backgroundColor: primary, color: readableInk(primary),
          borderTop: `4px solid ${secondary}`}}>
          <div className="agency-studio-preview-logo"><BrandMark agency={agency} name={values.name} decorative/></div>
          <div className="agency-studio-preview-copy"><strong>{values.name.trim() || 'Votre agence'}</strong>
            {values.city.trim() && <span>{values.city.trim()}</span>}
            {contact && <span>{contact}</span>}</div>
        </div>
      </div>
      <p className="agency-studio-preview-note">Exemple fictif sans voix. L’aperçu reflète vos informations saisies ; la vidéo finale utilise les photos de votre annonce.</p>
    </aside>
    {previewOpen && <dialog ref={dialog} className="agency-studio-dialog" aria-label="Exemple de vidéo immobilière"
      onCancel={() => setPreviewOpen(false)} onClick={event => {if (event.target === event.currentTarget) setPreviewOpen(false);}}>
      <button type="button" className="agency-studio-dialog-close" onClick={() => setPreviewOpen(false)} aria-label="Fermer">×</button>
      <h2>Exemple de vidéo</h2>
      <video src="/videos/studio-home/paris.mp4" poster="/images/studio-home/paris.webp" controls autoPlay playsInline preload="metadata"/>
      <p>Animation fictive sans voix. Votre nom, votre logo, vos couleurs et votre contact seront appliqués à vos prochaines créations.</p>
    </dialog>}
  </div>;
}
