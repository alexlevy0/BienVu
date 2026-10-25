'use client';

import {
  CreationDraftView,
  type CreationFields,
  defaultVideoCustomization,
  emptyVehicleValues,
  frenchVoices,
  GeneratableListing,
  GenerationView,
  generationCreditCost,
  ImportUrl,
  type PublicErrorCode,
  publicErrors,
  type VehicleValues,
  type VideoCustomization,
  type VideoDuration,
  vehicleValues,
  videoStyles,
} from '@bienvu/contracts';
import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { BetaVoiceChoice } from '../lib/beta-preferences';
import { requestGeneration } from '../lib/generation-client';
import { inspectManualPhotos } from '../lib/manual-photos';
import { analyticsFetch as fetch } from '../lib/product-analytics';
import { useAccount } from './account';
import { AvatarControls } from './avatar-controls';
import { ConversationGeneration } from './conversation-generation';
import { useGenerationStore } from './generation-store';
import { HomeIcon } from './home-icons';
import { useSubtitlePreference } from './video-settings';

const vehicleFields = [
  ['make', 'Marque', 'text'],
  ['model', 'Modèle / version', 'text'],
  ['year', 'Année', 'number'],
  ['mileageKm', 'Kilométrage (km)', 'number'],
  ['fuel', 'Énergie', 'text'],
  ['transmission', 'Boîte de vitesses', 'text'],
  ['powerHp', 'Puissance (ch DIN)', 'number'],
] as const;
async function json(response: Response) {
  const raw: unknown = await response.json();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Réponse du studio invalide.');
  const value = raw as Record<string, unknown>;
  if (!response.ok) {
    const failure =
      value.error && typeof value.error === 'object'
        ? (value.error as { code?: PublicErrorCode; message?: string })
        : {};
    throw new Error(
      failure.message ??
        (failure.code && publicErrors[failure.code]?.[1]) ??
        'Cette opération n’a pas abouti. Réessayez.',
    );
  }
  return value;
}
export function AutoCreate({
  onLayoutChange,
  voiceChoice,
  studioPath = '/beta',
}: {
  onLayoutChange(active: boolean): void;
  voiceChoice?: BetaVoiceChoice | null;
  studioPath?: '/' | '/beta';
}) {
  const { me, loading, defaultVoice, resolveDefaultVoice } = useAccount(),
    store = useGenerationStore();
  const {
    durationSeconds: duration,
    setDurationSeconds: setDuration,
    aspectRatio: aspect,
    setAspectRatio: setAspect,
    voiceEnabled: voice,
    setVoiceEnabled: setVoice,
    subtitlesEnabled: subtitles,
    setSubtitlesEnabled: setSubtitles,
  } = useSubtitlePreference();
  const [url, setUrl] = useState(''),
    [draft, setDraft] = useState<CreationDraftView | null>(null),
    [fields, setFields] = useState<CreationFields | null>(null),
    [vehicle, setVehicle] = useState<VehicleValues>(emptyVehicleValues),
    [settings, setSettings] = useState<VideoCustomization>(() => ({
      ...defaultVideoCustomization(me?.agency, defaultVoice),
      mapDisabled: true,
    }));
  const [options, setOptions] = useState(false),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [jobId, setJobId] = useState<string | null>(null),
    [completed, setCompleted] = useState(false);
  const lock = useRef(false),
    controller = useRef<AbortController | null>(null),
    importKey = useRef({ url: '', key: '' }),
    manualKey = useRef(crypto.randomUUID()),
    cloneKey = useRef({ id: '', key: '' }),
    pendingUploads = useRef(new Map<string, { slot: number; id: string }>());
  const job = store.jobs.find((j) => j.id === jobId) ?? null;
  useEffect(() => {
    controller.current = new AbortController();
    return () => controller.current?.abort();
  }, []);
  useEffect(() => {
    const fresh = () => {
      if (lock.current) return;
      setDraft(null);
      setFields(null);
      setVehicle(emptyVehicleValues());
      setJobId(null);
      setEditing(false);
      setCompleted(false);
      setUrl('');
      setError('');
      setOptions(false);
      manualKey.current = crypto.randomUUID();
      cloneKey.current = { id: '', key: '' };
      importKey.current = { url: '', key: '' };
      pendingUploads.current.clear();
      const location = new URL(window.location.href);
      location.searchParams.delete('draft');
      location.searchParams.delete('job');
      window.history.replaceState(null, '', location.pathname + location.search);
      setSettings((s) => ({ ...s, photoOrder: undefined, runwayPhotos: [], narration: undefined }));
    };
    window.addEventListener('bienvu:new-video', fresh);
    return () => window.removeEventListener('bienvu:new-video', fresh);
  }, []);
  useEffect(() => onLayoutChange(editing || Boolean(jobId)), [editing, jobId, onLayoutChange]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: An explicit voice choice applies once; later settings edits remain authoritative.
  useEffect(() => {
    if (voiceChoice) {
      setSettings((s) => ({ ...s, voice: voiceChoice.voice }));
      setVoice(true);
    }
  }, [voiceChoice?.revision]);
  function accept(next: CreationDraftView) {
    if (next.data.category !== 'vehicle' || !next.data.vehicle)
      throw new Error('Ce lien ne correspond pas à une annonce automobile.');
    setDraft(next);
    setFields(next.data.fields);
    setVehicle(vehicleValues(next.data.vehicle));
    setEditing(true);
    setCompleted(false);
    const location = new URL(window.location.href);
    location.searchParams.set('mode', 'auto');
    location.searchParams.set('draft', next.id);
    window.history.replaceState(null, '', location.pathname + location.search);
    setSettings((s) => ({
      ...s,
      ...next.data.videoCustomization,
      photoOrder: next.photos.slice(0, 12).map((p) => p.sourceOrder),
      ...(next.data.videoCustomization?.photoOrder ? { photoOrder: next.data.videoCustomization.photoOrder } : {}),
      runwayPhotos: next.data.videoCustomization?.runwayPhotos ?? [],
      mapDisabled: true,
    }));
  }
  // Resume only when the agency changes; later edits must not restore over the form.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Agency identity controls restoration; accept only uses stable state setters.
  useEffect(() => {
    if (!me) return;
    const jobId = new URLSearchParams(window.location.search).get('job');
    if (jobId && /^[a-zA-Z0-9_-]{1,64}$/.test(jobId)) {
      const abort = new AbortController();
      void fetch(`/api/generations/${jobId}`, { signal: abort.signal, cache: 'no-store' })
        .then(json)
        .then((raw) => {
          if (!abort.signal.aborted) {
            store.setJob(GenerationView.parse(raw), me.agency.id);
            setJobId(jobId);
          }
        })
        .catch((cause) => {
          if (!abort.signal.aborted) setError(cause.message);
        });
      return () => abort.abort();
    }
    const id = new URLSearchParams(window.location.search).get('draft');
    if (!id || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) return;
    const abort = new AbortController();
    void fetch(`/api/imports/${id}/draft`, { signal: abort.signal, cache: 'no-store' })
      .then(json)
      .then((value) => {
        if (!abort.signal.aborted) {
          const next = CreationDraftView.parse(value);
          if (next.data.category !== 'vehicle') {
            window.location.replace(`${studioPath}?mode=immo&draft=${encodeURIComponent(next.id)}`);
            return;
          }
          accept(next);
        }
      })
      .catch((cause) => {
        if (!abort.signal.aborted) setError(cause.message);
      });
    return () => abort.abort();
  }, [me?.agency.id]);
  async function run(label: string, action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    setError('');
    try {
      await action();
    } catch (cause) {
      if (!controller.current?.signal.aborted) setError(cause instanceof Error ? cause.message : 'Réessayez.');
    } finally {
      lock.current = false;
      setBusy('');
    }
  }
  function post(path: string, body: unknown, key?: string) {
    return fetch(path, {
      method: 'POST',
      signal: controller.current?.signal,
      headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
      body: JSON.stringify(body),
    }).then(json);
  }
  async function manual() {
    if (!me) {
      setEditing(true);
      return;
    }
    accept(CreationDraftView.parse(await post('/api/imports/draft', { category: 'vehicle' }, manualKey.current)));
    setSettings((s) => ({ ...s, voice: voiceChoice?.voice ?? defaultVoice }));
  }
  async function importAd(event: FormEvent) {
    event.preventDefault();
    if (!me) {
      setEditing(true);
      return;
    }
    await run('Lecture de votre annonce…', async () => {
      const valid = ImportUrl.safeParse(url);
      if (!valid.success) throw Error('Collez le lien HTTPS d’une annonce automobile.');
      if (importKey.current.url !== valid.data) importKey.current = { url: valid.data, key: crypto.randomUUID() };
      let result = await post('/api/imports', { url: valid.data }, importKey.current.key);
      const deadline = Date.now() + 70_000;
      while (result.status === 'importing' && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        result = await fetch(`/api/imports/${result.id}`, {
          signal: controller.current?.signal,
          cache: 'no-store',
        }).then(json);
      }
      if (result.status === 'needs_input') accept(CreationDraftView.parse(result.draft));
      else if (result.status === 'ready') {
        const listing = GeneratableListing.parse(result.listing);
        if (listing.category !== 'vehicle')
          throw Error('Ce lien correspond à une annonce immobilière. Utilisez le mode Immobilier.');
        if (cloneKey.current.id !== result.id) cloneKey.current = { id: String(result.id), key: crypto.randomUUID() };
        accept(CreationDraftView.parse(await post(`/api/imports/${result.id}/customize`, {}, cloneKey.current.key)));
      } else {
        const code = result.errorCode as PublicErrorCode;
        throw Error(
          result.status === 'importing'
            ? 'La lecture prend plus de temps. Réessayez avec ce même lien pour reprendre l’import.'
            : `${publicErrors[code]?.[1] ?? 'Le site ne permet pas la lecture de cette annonce.'} Vous pouvez utiliser la saisie manuelle et vos photos.`,
        );
      }
      const resolved = await resolveDefaultVoice();
      setSettings((s) => ({ ...s, voice: voiceChoice?.voice ?? resolved }));
      void store.refreshDrafts();
    });
  }
  async function save() {
    if (!draft || !fields) throw Error('Ouvrez d’abord une annonce.');
    const next = CreationDraftView.parse(
      await fetch(`/api/imports/${draft.id}/draft`, {
        method: 'PATCH',
        signal: controller.current?.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: draft.version,
          changes: fields,
          confirm: [],
          vehicle,
          videoCustomization: settings,
        }),
      }).then(json),
    );
    setDraft(next);
    return next;
  }
  async function upload(files: FileList | null) {
    if (!files || !draft) return;
    await run('Ajout de vos photos…', async () => {
      const checked = await inspectManualPhotos(
        Array.from(files),
        draft.photos.map((p) => p.sizeBytes),
      );
      if (checked.issues.length) throw Error(checked.issues.join(' '));
      let current = draft;
      for (const file of checked.accepted) {
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))]
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        let pending = pendingUploads.current.get(hash);
        if (!pending) {
          const used = new Set(current.photos.map((p) => p.sourceOrder));
          const slot = Array.from({ length: 12 }, (_, i) => i).find((i) => !used.has(i));
          if (slot === undefined) throw Error('12 photos maximum.');
          pending = { slot, id: crypto.randomUUID() };
          pendingUploads.current.set(hash, pending);
        }
        await fetch(`/api/imports/${draft.id}/uploads/${pending.slot}`, {
          method: 'PUT',
          signal: controller.current?.signal,
          headers: { 'Content-Type': file.type, 'X-Upload-ID': pending.id },
          body: file,
        }).then(json);
        current = CreationDraftView.parse(
          await fetch(`/api/imports/${draft.id}/draft`, { signal: controller.current?.signal, cache: 'no-store' }).then(
            json,
          ),
        );
        setDraft(current);
        pendingUploads.current.delete(hash);
      }
      setSettings((s) => ({ ...s, photoOrder: current.photos.map((p) => p.sourceOrder) }));
      void store.refreshDrafts();
    });
  }
  async function generate() {
    if (!me || !draft) return;
    await run('Préparation de votre vidéo…', async () => {
      if (!completed) {
        const saved = await save();
        await post(`/api/imports/${draft.id}/complete`, { version: saved.version });
        setCompleted(true);
      }
      const next: GenerationView = await requestGeneration(me.agency.id, {
        listingId: draft.id,
        durationSeconds: duration,
        aspectRatio: aspect,
        voiceEnabled: voice,
        subtitlesEnabled: subtitles,
        customization: settings,
      });
      store.setJob(next, me.agency.id);
      setJobId(next.id);
      const location = new URL(window.location.href);
      location.searchParams.set('job', next.id);
      location.searchParams.delete('draft');
      window.history.replaceState(null, '', location.pathname + location.search);
      setEditing(false);
      void store.refreshDrafts();
    });
  }
  const selected = settings.photoOrder ?? draft?.photos.map((p) => p.sourceOrder) ?? [],
    cost = generationCreditCost(settings, duration);
  function movePhoto(slot: number, delta: number) {
    const at = selected.indexOf(slot),
      next = [...selected],
      target = at + delta;
    if (at < 0 || target < 0 || target >= next.length) return;
    [next[at], next[target]] = [next[target], next[at]];
    setSettings((s) => ({ ...s, photoOrder: next }));
  }
  return (
    <div className="auto-create" id="auto-create">
      {jobId ? (
        <>
          <ConversationGeneration
            job={job}
            request={{ kind: 'url', text: fields?.title ?? 'Votre annonce automobile' }}
            sending={!job}
            anonymous={false}
            onRefresh={store.refresh}
            aspectRatio={aspect}
          />
          <button
            className="auto-text-button"
            type="button"
            onClick={() => {
              setJobId(null);
              setEditing(true);
            }}
          >
            Revenir à mon annonce
          </button>
        </>
      ) : (
        <>
          {!editing && (
            <form className="auto-composer" onSubmit={importAd}>
              <div className="auto-composer-line">
                <HomeIcon name="link" size={20} />
                <input
                  id="home-listing-url"
                  type="url"
                  required
                  value={url}
                  disabled={Boolean(busy)}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Collez un lien d’annonce (La Centrale, AutoScout24…)"
                  aria-label="Lien de votre annonce automobile"
                />
                <button type="submit" className="auto-primary" disabled={loading || Boolean(busy)}>
                  {busy || 'Créer ma vidéo'} <HomeIcon name="arrow" size={17} />
                </button>
              </div>
              <small className="auto-cost">À partir de 1 crédit</small>
              <div className="auto-composer-tools">
                <span>
                  <HomeIcon name="link" size={15} /> Lien d’annonce
                </span>
                <button type="button" disabled={Boolean(busy)} onClick={() => void run('Ouverture…', manual)}>
                  <HomeIcon name="pencil" size={15} /> Saisie manuelle
                </button>
                <button type="button" aria-expanded={options} onClick={() => setOptions(!options)}>
                  <HomeIcon name="settings" size={15} /> Réglages <HomeIcon name="chevron" size={13} />
                </button>
              </div>
            </form>
          )}
          {editing && (
            <div className="auto-review">
              <div className="auto-review-heading">
                <div>
                  <span className="beta-eyebrow">VOTRE ANNONCE AUTO</span>
                  <h2>Un dernier coup d’œil.</h2>
                </div>
                <button
                  className="auto-text-button"
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => setEditing(false)}
                >
                  Retour à l’accueil
                </button>
              </div>
              {!me ? (
                <div className="auto-signin">
                  <p>Connectez-vous pour importer votre véhicule, retrouver vos photos et créer sa vidéo.</p>
                  <Link
                    className="auto-primary"
                    href={`/connexion?next=${encodeURIComponent(studioPath + '?mode=auto')}`}
                  >
                    Se connecter <HomeIcon name="arrow" size={17} />
                  </Link>
                </div>
              ) : (
                fields &&
                draft && (
                  <>
                    <p className="auto-review-help">
                      Vérifiez les informations de l’annonce. Les champs inconnus peuvent rester vides ; ils seront omis
                      de la vidéo.
                    </p>
                    {draft.data.warnings.length > 0 && (
                      <ul className="auto-warnings">
                        {draft.data.warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    )}
                    <fieldset disabled={Boolean(busy) || completed}>
                      <legend>Les informations du véhicule</legend>
                      <div className="auto-fields">
                        <label className="auto-field-wide">
                          Titre de l’annonce
                          <input
                            required
                            maxLength={200}
                            value={fields.title ?? ''}
                            onChange={(e) => setFields({ ...fields, title: e.target.value || null })}
                          />
                        </label>
                        {vehicleFields.map(([key, label, type]) => (
                          <label key={key}>
                            {label}
                            <input
                              type={type}
                              min={key === 'year' ? 1886 : 0}
                              max={
                                key === 'year'
                                  ? 2100
                                  : key === 'powerHp'
                                    ? 3000
                                    : key === 'mileageKm'
                                      ? 5000000
                                      : undefined
                              }
                              maxLength={100}
                              value={vehicle[key] ?? ''}
                              onChange={(e) =>
                                setVehicle({
                                  ...vehicle,
                                  [key]:
                                    e.target.value === ''
                                      ? null
                                      : type === 'number'
                                        ? Number(e.target.value)
                                        : e.target.value,
                                })
                              }
                            />
                          </label>
                        ))}
                        <label>
                          Prix de vente (€)
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={fields.priceCents === null ? '' : fields.priceCents / 100}
                            onChange={(e) =>
                              setFields({
                                ...fields,
                                priceCents: e.target.value === '' ? null : Math.round(Number(e.target.value) * 100),
                              })
                            }
                          />
                        </label>
                        <label>
                          Ville
                          <input
                            maxLength={200}
                            value={fields.locality ?? ''}
                            onChange={(e) => setFields({ ...fields, locality: e.target.value || null })}
                          />
                        </label>
                        <label className="auto-field-wide">
                          Description et points à signaler
                          <textarea
                            rows={3}
                            maxLength={20000}
                            value={fields.description ?? ''}
                            onChange={(e) => setFields({ ...fields, description: e.target.value || null })}
                          />
                        </label>
                      </div>
                    </fieldset>
                    <div className="auto-gallery-heading">
                      <h3>Les photos du véhicule</h3>
                      <span>{selected.length} sélectionnées · 3 à 12</span>
                    </div>
                    <div className="auto-photos">
                      {[...draft.photos]
                        .sort(
                          (a, b) =>
                            (selected.indexOf(a.sourceOrder) < 0 ? 1000 : selected.indexOf(a.sourceOrder)) -
                            (selected.indexOf(b.sourceOrder) < 0 ? 1000 : selected.indexOf(b.sourceOrder)),
                        )
                        .map((photo) => (
                          <div className="auto-photo" key={photo.id}>
                            <button
                              type="button"
                              disabled={
                                Boolean(busy) ||
                                completed ||
                                (!selected.includes(photo.sourceOrder) && selected.length >= 12)
                              }
                              aria-pressed={selected.includes(photo.sourceOrder)}
                              aria-label={`Sélectionner la photo ${photo.sourceOrder + 1}`}
                              onClick={() =>
                                setSettings((s) => ({
                                  ...s,
                                  photoOrder: selected.includes(photo.sourceOrder)
                                    ? selected.filter((i) => i !== photo.sourceOrder)
                                    : [...selected, photo.sourceOrder],
                                  runwayPhotos: (s.runwayPhotos ?? []).filter((i) => i !== photo.sourceOrder),
                                }))
                              }
                            >
                              <img
                                src={`/api/imports/${draft.id}/photos/${photo.id}`}
                                alt={`Vue du véhicule ${photo.sourceOrder + 1}`}
                                width={160}
                                height={110}
                              />
                              <span>
                                {selected.includes(photo.sourceOrder) ? selected.indexOf(photo.sourceOrder) + 1 : '+'}
                              </span>
                            </button>
                            <label>
                              <input
                                type="checkbox"
                                disabled={Boolean(busy) || completed || !selected.includes(photo.sourceOrder)}
                                checked={settings.runwayPhotos?.includes(photo.sourceOrder) ?? false}
                                onChange={(e) =>
                                  setSettings((s) => ({
                                    ...s,
                                    runwayPhotos: e.target.checked
                                      ? [...(s.runwayPhotos ?? []), photo.sourceOrder]
                                      : (s.runwayPhotos ?? []).filter((i) => i !== photo.sourceOrder),
                                  }))
                                }
                              />{' '}
                              Animer · 1 crédit
                            </label>
                            <div className="auto-photo-order">
                              <button
                                type="button"
                                aria-label={`Avancer la photo ${photo.sourceOrder + 1}`}
                                disabled={Boolean(busy) || completed || selected.indexOf(photo.sourceOrder) <= 0}
                                onClick={() => movePhoto(photo.sourceOrder, -1)}
                              >
                                ←
                              </button>
                              <button
                                type="button"
                                aria-label={`Reculer la photo ${photo.sourceOrder + 1}`}
                                disabled={
                                  Boolean(busy) ||
                                  completed ||
                                  !selected.includes(photo.sourceOrder) ||
                                  selected.indexOf(photo.sourceOrder) === selected.length - 1
                                }
                                onClick={() => movePhoto(photo.sourceOrder, 1)}
                              >
                                →
                              </button>
                            </div>
                          </div>
                        ))}
                      {!completed && (
                        <label className="auto-upload">
                          <HomeIcon name="plus" size={24} />
                          <span>Ajouter des photos</span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            disabled={Boolean(busy) || draft.photos.length >= 12}
                            onChange={(e) => {
                              void upload(e.target.files);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      )}
                    </div>
                    <p className="auto-photo-help">
                      Photos réelles uniquement · JPEG, PNG ou WebP · 10 Mo par photo. Les animations IA sont des effets
                      visuels.
                    </p>
                    <button
                      className="auto-text-button"
                      type="button"
                      aria-expanded={options}
                      onClick={() => setOptions(!options)}
                    >
                      <HomeIcon name="settings" size={17} /> Réglages de ma vidéo <HomeIcon name="chevron" size={14} />
                    </button>
                  </>
                )
              )}
            </div>
          )}
          {options && (!editing || me) && (
            <div className="auto-settings">
              <fieldset disabled={Boolean(busy) || completed}>
                <legend>Votre vidéo, à votre façon</legend>
                <div className="auto-fields">
                  <label>
                    Durée
                    <select value={duration} onChange={(e) => setDuration(Number(e.target.value) as VideoDuration)}>
                      {[20, 30, 40].map((n) => (
                        <option key={n} value={n}>
                          {n} secondes
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Format
                    <select value={aspect} onChange={(e) => setAspect(e.target.value as typeof aspect)}>
                      <option value="9:16">Vertical · Reels, Story, TikTok</option>
                      <option value="16:9">Horizontal · YouTube, site web</option>
                    </select>
                  </label>
                  <label>
                    Style
                    <select
                      value={settings.style}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, style: e.target.value as VideoCustomization['style'] }))
                      }
                    >
                      {videoStyles.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Voix
                    <select
                      value={settings.voice}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, voice: e.target.value as VideoCustomization['voice'] }))
                      }
                    >
                      {frenchVoices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="auto-checks">
                  <label>
                    <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> Voix off
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={subtitles}
                      disabled={!voice}
                      onChange={(e) => setSubtitles(e.target.checked)}
                    />{' '}
                    Sous-titres
                  </label>
                </div>
                {me && (
                  <AvatarControls
                    avatar={settings.avatar}
                    onChange={(avatar) => setSettings((s) => ({ ...s, avatar }))}
                    voice={settings.voice}
                    voiceEnabled={voice}
                    onEnableVoice={() => setVoice(true)}
                    authenticated
                    durationSeconds={duration}
                    busy={Boolean(busy) || completed}
                  />
                )}
              </fieldset>
            </div>
          )}
          {editing && me && draft && (
            <div className="auto-submit">
              <button
                className="auto-text-button"
                type="button"
                disabled={Boolean(busy) || completed}
                onClick={() =>
                  void run('Enregistrement…', async () => {
                    await save();
                    void store.refreshDrafts();
                  })
                }
              >
                Enregistrer le brouillon
              </button>
              <button
                className="auto-primary"
                type="button"
                disabled={Boolean(busy) || selected.length < 3 || !fields?.title}
                onClick={() => void generate()}
              >
                {busy || `Créer ma vidéo · ${cost} crédit${cost > 1 ? 's' : ''}`} <HomeIcon name="arrow" size={18} />
              </button>
            </div>
          )}
        </>
      )}
      {busy && !editing && (
        <p className="auto-feedback" role="status">
          {busy}
        </p>
      )}
      {error && (
        <p className="auto-feedback auto-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
