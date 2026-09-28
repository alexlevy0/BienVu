'use client';
import {useEffect, useRef, useState, type FormEvent} from 'react';
import {DESCRIPTION_MAX_CHARACTERS, ManualListingInput, MANUAL_PHOTO_LIMITS, publicErrors, type PublicErrorCode} from '@bienvu/contracts';
import type {ImportView} from './generation-form';

type SelectedPhoto = {id: string; file: File; preview: string};
class FormFailure extends Error {}
const labels: Record<string, string> = {title: 'titre', locality: 'localisation', propertyType: 'type de bien', description: 'description',
  priceCents: 'prix', charges: 'charges', area: 'surface', rooms: 'nombre de pièces', photos: 'photos'};
export function ManualListingForm({busy, setBusy, onCreated}: {
  busy: boolean; setBusy(value: boolean): void; onCreated(value: ImportView): Promise<void>;
}) {
  const [transaction, setTransaction] = useState('sale'), [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({}), [feedback, setFeedback] = useState(''), [progress, setProgress] = useState('');
  const selected = useRef(photos), pending = useRef<{fingerprint: string; key: string} | null>(null);
  selected.current = photos;
  useEffect(() => () => selected.current.forEach(photo => URL.revokeObjectURL(photo.preview)), []);
  function addPhotos(files: FileList | null) {
    if (!files) return;
    const added = Array.from(files), all = [...photos.map(p => p.file), ...added];
    const failure = all.length > MANUAL_PHOTO_LIMITS.maximum ? 'Choisissez 12 photos maximum.'
      : added.some(f => !['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) ? 'Utilisez des photos JPEG, PNG ou WebP.'
      : added.some(f => !f.size || f.size > MANUAL_PHOTO_LIMITS.fileBytes) ? 'Chaque photo doit peser moins de 10 Mo.'
      : all.reduce((sum, f) => sum + f.size, 0) > MANUAL_PHOTO_LIMITS.totalBytes ? 'Les photos dépassent 50 Mo au total.' : '';
    setErrors(previous => ({...previous, photos: failure})); setFeedback('');
    if (!failure) setPhotos(current => [...current, ...added.map(file => ({id: crypto.randomUUID(), file, preview: URL.createObjectURL(file)}))]);
  }
  async function send(path: string, options: RequestInit) {
    const response = await fetch(path, {...options, signal: AbortSignal.timeout(30_000)});
    const value = await response.json() as ImportView & {error?: {code: PublicErrorCode}; fields?: Record<string, string>};
    if (!response.ok) {
      if (value.fields) setErrors(value.fields);
      throw new FormFailure(value.error?.code && value.error.code in publicErrors ? publicErrors[value.error.code][1] : 'L’enregistrement a échoué. Réessayez.');
    }
    return value;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget, data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? '').trim();
    const number = (name: string) => {
      const value = text(name).replace(/\s/g, '');
      return !value ? null : /^\d+(?:[.,]\d{1,2})?$/.test(value) ? Number(value.replace(',', '.')) : NaN;
    };
    setErrors({}); setFeedback(''); setBusy(true); setProgress('Préparation des photos…');
    try {
      const files = [];
      for (const photo of photos) {
        const digest = await crypto.subtle.digest('SHA-256', await photo.file.arrayBuffer());
        files.push({hash: Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join(''), size: photo.file.size, mime: photo.file.type});
      }
      const price = number('priceCents');
      const parsed = ManualListingInput.safeParse({title: text('title'), propertyType: text('propertyType'), transaction,
        locality: text('locality'), description: text('description'), priceCents: price === null ? null : Math.round(price * 100),
        charges: transaction === 'rent' ? text('charges') || null : null, area: number('area'), rooms: number('rooms'), photos: files});
      if (!parsed.success) {
        const fields: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const field = String(issue.path[0] ?? 'form');
          fields[field] = issue.code === 'custom' ? issue.message : field === 'photos' ? 'Ajoutez au moins 3 photos différentes du bien.'
            : field === 'title' ? 'Indiquez un titre de 3 à 200 caractères.' : field === 'locality' ? 'Indiquez une localisation de 2 à 200 caractères.'
            : field === 'propertyType' ? 'Choisissez le type de bien.' : field === 'description' ? 'Limitez la description à 20 000 caractères.'
            : field === 'rooms' ? 'Indiquez un nombre entier de 1 à 100.' : 'Indiquez un montant ou une surface valide, supérieur à zéro.';
        }
        setErrors(fields); throw new FormFailure('Vérifiez les champs indiqués avant d’enregistrer.');
      }
      const fingerprint = JSON.stringify(parsed.data);
      if (pending.current?.fingerprint !== fingerprint) pending.current = {fingerprint, key: crypto.randomUUID()};
      const draft = await send('/api/imports/manual', {method: 'POST', headers: {'Content-Type': 'application/json', 'Idempotency-Key': pending.current.key}, body: fingerprint});
      let result = draft;
      if (draft.status !== 'ready') {
        for (const [index, photo] of photos.entries()) {
          setProgress(`Envoi et vérification de la photo ${index + 1} sur ${photos.length}…`);
          await send(`/api/imports/${draft.id}/uploads/${index}`, {method: 'PUT', headers: {'Content-Type': photo.file.type}, body: photo.file});
        }
        setProgress('Enregistrement de votre annonce…');
        result = await send(`/api/imports/${draft.id}/complete`, {method: 'POST'});
      }
      await onCreated(result); pending.current = null;
      form.reset(); setTransaction('sale'); photos.forEach(photo => URL.revokeObjectURL(photo.preview)); setPhotos([]);
    } catch (error) {setFeedback(error instanceof FormFailure ? error.message : 'L’envoi a été interrompu. Réessayez avec les mêmes informations et photos.');}
    finally {setBusy(false); setProgress('');}
  }
  const error = (name: string) => errors[name] ? <p id={`manual-${name}-error`} className="form-feedback error">{errors[name]}</p> : null;
  const attributes = (name: string) => ({id: `manual-${name}`, name, 'aria-invalid': Boolean(errors[name]), 'aria-describedby': errors[name] ? `manual-${name}-error` : undefined});
  return <form className="manual-listing-form" onSubmit={submit} noValidate onChange={({target}) => {
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
      if (target.name) setErrors(current => ({...current, [target.name]: '', ...(target.name === 'transaction' ? {charges: ''} : {})}));
      setFeedback('');
    }
  }}>
    <h3>Ajoutez votre annonce</h3><p className="field-help">Renseignez le bien et ajoutez vos photos. Le titre, le type et la localisation sont obligatoires.</p>
    <fieldset disabled={busy} className="manual-fields">
      <div className="manual-wide"><label htmlFor="manual-title">Titre de l’annonce</label><input {...attributes('title')} required maxLength={200} placeholder="Appartement lumineux avec terrasse"/>{error('title')}</div>
      <div><label htmlFor="manual-propertyType">Type de bien</label><select {...attributes('propertyType')} required defaultValue=""><option value="" disabled>Choisir un type</option><option value="apartment">Appartement</option><option value="house">Maison</option><option value="other">Autre bien</option></select>{error('propertyType')}</div>
      <div><label htmlFor="manual-transaction">Transaction</label><select id="manual-transaction" name="transaction" value={transaction} onChange={e => setTransaction(e.target.value)}><option value="sale">Vente</option><option value="rent">Location</option></select></div>
      <div className="manual-wide"><label htmlFor="manual-locality">Ville ou localisation</label><input {...attributes('locality')} required maxLength={200} placeholder="Lyon 6e, quartier des Brotteaux"/>{error('locality')}</div>
      <div><label htmlFor="manual-priceCents">{transaction === 'rent' ? 'Loyer mensuel (€)' : 'Prix de vente (€)'} <span>facultatif</span></label><input {...attributes('priceCents')} inputMode="decimal" placeholder={transaction === 'rent' ? '950' : '280 000'}/>{error('priceCents')}</div>
      {transaction === 'rent' && <div><label htmlFor="manual-charges">Charges du loyer</label><select {...attributes('charges')} defaultValue=""><option value="">Préciser si loyer renseigné</option><option value="included">Charges comprises</option><option value="excluded">Charges non comprises</option></select>{error('charges')}</div>}
      <div><label htmlFor="manual-area">Surface (m²) <span>facultatif</span></label><input {...attributes('area')} inputMode="decimal" placeholder="65"/>{error('area')}</div>
      <div><label htmlFor="manual-rooms">Nombre de pièces <span>facultatif</span></label><input {...attributes('rooms')} inputMode="numeric" placeholder="3"/>{error('rooms')}</div>
      <div className="manual-wide"><label htmlFor="manual-description">Description du bien <span>facultatif</span></label><textarea {...attributes('description')} rows={6} maxLength={DESCRIPTION_MAX_CHARACTERS} placeholder="Décrivez les espaces et les atouts de votre bien…"/>{error('description')}</div>
      <div className="manual-wide"><label htmlFor="manual-photos">Photos du bien</label>
        <p id="manual-photos-help" className="field-help">3 à 12 photos différentes, JPEG, PNG ou WebP. 10 Mo par photo, 50 Mo au total. Minimum 640 × 360 pixels, maximum 16 millions de pixels.</p>
        <div className="manual-upload"><span aria-hidden="true">Ajouter des photos</span>
          <input id="manual-photos" type="file" multiple accept="image/jpeg,image/png,image/webp" aria-invalid={Boolean(errors.photos)} aria-describedby="manual-photos-help manual-photo-feedback"
            onChange={e => {addPhotos(e.target.files); e.target.value = '';}}/>
        </div>
        <p id="manual-photo-feedback" className="form-feedback error">{errors.photos}</p>
        {photos.length > 0 && <><p className="field-help">{`${photos.length} photo${photos.length > 1 ? 's' : ''} sélectionnée${photos.length > 1 ? 's' : ''}`}</p><ol className="manual-photos">{photos.map((photo, index) => <li key={photo.id}>
          <img src={photo.preview} alt={`Aperçu de la photo ${index + 1}`}/><span title={photo.file.name}>{photo.file.name}</span>
          <button type="button" aria-label={`Retirer la photo ${index + 1}`} onClick={() => {URL.revokeObjectURL(photo.preview); setPhotos(current => current.filter(p => p.id !== photo.id)); setErrors(current => ({...current, photos: ''}));}}>Retirer</button>
        </li>)}</ol></>}
      </div>
    </fieldset>
    <p className="field-help">Ajoutez uniquement les informations et photos du bien que vous êtes autorisé à utiliser.</p>
    {feedback && <div className="form-feedback error" role="alert"><p>{feedback}</p>{Object.entries(errors).filter(([, value]) => value).map(([name, value]) => <p key={name}>{labels[name] ?? name} : {value}</p>)}</div>}
    {progress && <p role="status" className="field-help">{progress}</p>}
    <button className="button primary" type="submit" disabled={busy}>{progress ? 'Enregistrement en cours…' : 'Enregistrer mon annonce'}</button>
  </form>;
}
