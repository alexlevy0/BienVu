'use client';
import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';
import {AgencyUpdate, AgencyProfile, LOGO_MAX_BYTES} from '@bienvu/contracts';
import {useAccount, SignOut} from './account';
import {Icon} from './icon';

type Fields = {name: string; phone: string; email: string; website: string; primaryColor: string; secondaryColor: string};
const defaults: Fields = {name: '', phone: '', email: '', website: '', primaryColor: '#214F43', secondaryColor: '#F3EFE6'};
function fromProfile(agency: AgencyProfile): Fields {return {name: agency.name, phone: agency.phone ?? '', email: agency.email ?? '',
  website: agency.website ?? '', primaryColor: agency.primaryColor, secondaryColor: agency.secondaryColor};}
export function AgencyForm() {
  const {me, loading, error, refresh, setAgency} = useAccount();
  const [values, setValues] = useState<Fields>(defaults), [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState(''), [failed, setFailed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Un upload de logo ne remplace pas les champs du formulaire non enregistrés.
  useEffect(() => {if (me) setValues(fromProfile(me.agency));}, [me?.agency.id]);
  if (loading) return <section className="panel" role="status"><p>Chargement de votre identité…</p></section>;
  if (!me) return <section className="panel account-gate"><Icon name="lock" size={30}/><h2>Votre identité commence ici.</h2><p>{error || 'Connectez-vous pour enregistrer le nom, les couleurs et le logo de votre agence.'}</p>
    {error ? <button className="button primary" onClick={() => void refresh()}>Réessayer</button> : <Link className="button primary" href="/connexion">Se connecter</Link>}</section>;
  const agency = me.agency;
  async function save(event: React.FormEvent) {
    event.preventDefault(); setFeedback(''); setFields({}); setFailed(false);
    const result = AgencyUpdate.safeParse(values);
    if (!result.success) {
      setFields(Object.fromEntries(result.error.issues.map(issue => [String(issue.path[0] ?? 'form'), issue.message])));
      setFeedback('Vérifiez les champs indiqués.'); setFailed(true); return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/agency', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(result.data)});
      const data = await response.json() as {agency?: unknown; url: string; error?: {message?: string}; fields?: Record<string, string>};
      if (!response.ok) {setFields(data.fields ?? {}); throw new Error(data.error?.message ?? 'La sauvegarde a échoué.');}
      const profile = AgencyProfile.parse(data.agency); setAgency(profile); setValues(fromProfile(profile));
      setFeedback('Votre identité est enregistrée pour vos prochaines vidéos.');
    } catch (error) {setFailed(true); setFeedback(error instanceof Error ? error.message : 'La sauvegarde a échoué. Réessayez.');}
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
      const data = await response.json() as {agency?: unknown; url: string; error?: {message?: string}; fields?: Record<string, string>};
      if (!response.ok) throw new Error(data.error?.message ?? 'Le logo n’a pas été enregistré.');
      setAgency(AgencyProfile.parse(data.agency)); setFeedback('Votre logo est enregistré. Vos vidéos existantes conservent leur apparence.');
    } catch (error) {setFailed(true); setFeedback(error instanceof Error ? error.message : 'Le logo n’a pas été enregistré.');}
    finally {setBusy(false); if (fileInput.current) fileInput.current.value = '';}
  }
  function input(key: keyof Fields, label: string, type = 'text', placeholder?: string) {
    return <label htmlFor={`agency-${key}`}>{label}<input id={`agency-${key}`} name={key} type={type} value={values[key]} placeholder={placeholder}
      maxLength={key === 'name' ? 100 : key === 'phone' ? 25 : key === 'website' ? 2048 : 254}
      aria-invalid={Boolean(fields[key])} aria-describedby={fields[key] ? `error-${key}` : undefined}
      onChange={event => setValues(current => ({...current, [key]: event.target.value}))}/>
      {fields[key] && <span id={`error-${key}`} className="form-feedback error">{fields[key]}</span>}</label>;
  }
  return <><div className="agency-account"><span>Votre compte : {me.user.email}</span><SignOut/></div><div className="agency-grid">
    <section className="panel"><h2>Les essentiels</h2><p>Un nom et au moins un moyen de contact. Le reste est à votre image.</p>
      <form onSubmit={save} noValidate><fieldset disabled={busy} className="agency-fields"><legend className="sr-only">Identité de l’agence</legend>
        {input('name', 'Nom de l’agence *', 'text', 'Le nom de votre agence')}
        <div className="fields-row">{input('email', 'Adresse e-mail', 'email', 'contact@votre-agence.fr')}{input('phone', 'Téléphone', 'tel', '01 00 00 00 00')}</div>
        {input('website', 'Site internet', 'url', 'https://votre-agence.fr')}<p className="field-help">Renseignez au moins l’un de ces trois contacts. * Champ obligatoire.</p>
        <div className="fields-row color-fields">{input('primaryColor', 'Couleur principale', 'text', '#214F43')}{input('secondaryColor', 'Couleur secondaire', 'text', '#F3EFE6')}</div>
        <div className="color-pickers"><label>Choisir la couleur principale<input aria-label="Palette principale" type="color" value={/^#[0-9a-f]{6}$/i.test(values.primaryColor) ? values.primaryColor : defaults.primaryColor} onChange={e => setValues(v => ({...v, primaryColor: e.target.value}))}/></label>
          <label>Choisir la couleur secondaire<input aria-label="Palette secondaire" type="color" value={/^#[0-9a-f]{6}$/i.test(values.secondaryColor) ? values.secondaryColor : defaults.secondaryColor} onChange={e => setValues(v => ({...v, secondaryColor: e.target.value}))}/></label></div>
        <button type="submit" className="button primary">{busy ? 'Enregistrement…' : 'Enregistrer mon identité'}<Icon name="arrow" size={18}/></button>
      </fieldset></form><p className={`form-feedback ${failed ? 'error' : 'valid'}`} role={failed ? 'alert' : 'status'} aria-live="polite">{feedback}</p>
      <div className="logo-section"><h3>Votre logo <span className="optional">Facultatif</span></h3><div className="logo-placeholder">
        {agency.logoAssetId ? <img className="agency-logo" src={`/api/agency/logo/${agency.logoAssetId}`} alt={`Logo de ${agency.name}`} width={160} height={100}/> : <><Icon name="building" size={28}/><span>Un nom suffit pour commencer.</span></>}
        <label className="button secondary logo-upload">{agency.logoAssetId ? 'Remplacer le logo' : 'Ajouter un logo'}<input ref={fileInput} type="file" accept="image/png,image/jpeg" disabled={busy} onChange={event => void upload(event.target.files?.[0])}/></label>
        <small>PNG ou JPEG · 2 Mo maximum · 16 à 1 024 px par côté.</small></div><p className="field-help">L’ajout du logo est enregistré immédiatement. Les anciennes versions sont conservées pour vos vidéos existantes.</p></div>
    </section><aside className="panel brand-panel"><p className="section-kicker">VOTRE SIGNATURE</p><h2>Une identité.<br/>Toutes vos vidéos.</h2>
      <div className="brand-example" style={{background: /^#[0-9a-f]{6}$/i.test(values.primaryColor) ? values.primaryColor : defaults.primaryColor,
        color: /^#[0-9a-f]{6}$/i.test(values.secondaryColor) ? values.secondaryColor : defaults.secondaryColor}}>
        <span>{values.name || 'VOTRE AGENCE'}</span><strong>Des lieux.<br/>Des vies.<br/>Votre signature.</strong><span className="example-label">Aperçu de votre identité</span></div>
      <p className="field-help">Vos réglages s’appliquent aux futures créations. Ils ne modifient aucune vidéo déjà créée et ne consomment aucun crédit.</p>
      <div className="information-note"><strong>Votre espace prend forme.</strong><p>La génération et l’essai vidéo seront ouverts après les vérifications du service.</p></div></aside></div></>;
}
