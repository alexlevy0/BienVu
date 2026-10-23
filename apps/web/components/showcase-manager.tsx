'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ShowcaseConfig,
  ShowcasePropertySettings,
  ShowcaseSlug,
  defaultShowcaseProperty,
  propertyFacts,
  propertyPrice,
  type ShowcasePrivate,
  type ShowcaseAction,
} from '@bienvu/contracts';
import { useAccount } from './account';
import { HomeIcon } from './home-icons';
import { ShowcaseShare } from './showcase-public-client';
import { showcaseRequest, showcaseInitials } from '../lib/showcase-client';

type Candidate = ShowcasePrivate['properties'][number];
type Item = ShowcasePrivate['items'][number];
type Tab = 'presentation' | 'properties' | 'leads' | 'statistics';
const status = { draft: 'Brouillon', published: 'Publiée', offline: 'Hors ligne' };
const leadStatus = { new: 'Nouvelle', in_progress: 'En cours', treated: 'Traitée' };
const delivery = {
  pending: 'Notification en attente',
  sending: 'Notification en cours',
  sent: 'Notification envoyée',
  failed: 'Échec de la notification',
  disabled: 'Consultable dans BienVu · notification désactivée',
};
function guardEdits(dirty: boolean) {
  if (!dirty) return true;
  return window.confirm('Des modifications ne sont pas enregistrées. Quitter sans les enregistrer ?');
}
function useEditWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const leave = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (
        !link ||
        link.target === '_blank' ||
        link.getAttribute('href')?.startsWith('#') ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      if (new URL(link.href).href === window.location.href) return;
      if (!guardEdits(true)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', leave, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', leave, true);
    };
  }, [dirty]);
}
async function resizeUpload(file: File) {
  if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 10 * 1024 * 1024)
    throw new Error('Choisissez une image JPEG ou PNG de moins de 10 Mo.');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width < 16 || bitmap.height < 16) throw new Error('Cette image est trop petite.');
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height)),
      canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Le navigateur ne peut pas préparer cette image.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.88),
    );
    if (!blob || blob.size > 2 * 1024 * 1024)
      throw new Error('Cette image est trop lourde après préparation. Choisissez une version plus légère.');
    return blob;
  } finally {
    bitmap.close();
  }
}

export function ShowcaseManager() {
  const { me, loading } = useAccount();
  if (loading)
    return (
      <div className="vitrine-manager-loading" role="status">
        <HomeIcon name="globe" size={30} />
        <span>Chargement de votre vitrine…</span>
      </div>
    );
  if (!me)
    return (
      <section className="vitrine-empty">
        <HomeIcon name="globe" size={44} />
        <h1>Votre agence. Votre vitrine.</h1>
        <p>Connectez-vous pour choisir les biens que vous souhaitez présenter au public.</p>
        <Link className="showcase-primary" href="/connexion?next=%2Fma-vitrine">
          Se connecter →
        </Link>
      </section>
    );
  return <ShowcaseWorkspace key={me.agency.id} agencyId={me.agency.id} />;
}
function ShowcaseWorkspace({ agencyId }: { agencyId: string }) {
  const [data, setData] = useState<ShowcasePrivate | null>(null),
    [config, setConfig] = useState<ShowcaseConfig | null>(null),
    [tab, setTab] = useState<Tab>('presentation'),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(''),
    [loading, setLoading] = useState(true),
    [query, setQuery] = useState(''),
    [days, setDays] = useState<7 | 30>(30),
    [editing, setEditing] = useState<string | null>(null),
    [itemDirty, setItemDirty] = useState(false),
    [slugAvailable, setSlugAvailable] = useState<boolean | null>(null),
    [revision, setRevision] = useState(0);
  const params = useRef(new URLSearchParams()),
    active = useRef(true),
    editor = useRef<HTMLElement | null>(null),
    focusEditor = useRef(false);
  const dirty = Boolean(config && data && JSON.stringify(config) !== JSON.stringify(data.draft));
  useEditWarning(dirty || itemDirty);
  useEffect(() => {
    active.current = true;
    const selected = new URLSearchParams(window.location.search).get('bien');
    if (selected) {
      params.current.set('propertyId', selected);
      setEditing(selected);
      setTab('properties');
    } else if (window.location.hash === '#demandes') setTab('leads');
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void showcaseRequest<ShowcasePrivate>(`/api/vitrine?${params.current}`, { signal: controller.signal })
      .then((value) => {
        if (controller.signal.aborted) return;
        setData(value);
        setConfig((previous) => previous ?? value.draft);
        setError('');
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [agencyId, revision]);
  const draftSlug = config?.slug,
    publishedSlug = data?.draft.slug;
  useEffect(() => {
    setSlugAvailable(null);
    if (draftSlug === undefined || publishedSlug === undefined || draftSlug === publishedSlug) return;
    const parsed = ShowcaseSlug.safeParse(draftSlug);
    if (!parsed.success) return;
    const controller = new AbortController(),
      timer = setTimeout(() => {
        void showcaseRequest<{ available: boolean }>(`/api/vitrine?slug=${encodeURIComponent(parsed.data)}`, {
          signal: controller.signal,
        })
          .then((value) => setSlugAvailable(value.available))
          .catch(() => {});
      }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [draftSlug, publishedSlug]);
  useEffect(() => {
    if (!focusEditor.current || loading || tab !== 'properties' || !editor.current) return;
    focusEditor.current = false;
    editor.current.focus({ preventScroll: true });
    editor.current.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [data, editing, loading, tab]);
  async function reload(replaceConfig = false) {
    const value = await showcaseRequest<ShowcasePrivate>(`/api/vitrine?${params.current}`);
    if (!active.current) return;
    setData(value);
    if (replaceConfig) setConfig(value.draft);
    return value;
  }
  async function action(value: ShowcaseAction, message: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await showcaseRequest('/api/vitrine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      });
      await reload(value.action === 'save');
      if (active.current) {
        setNotice(message);
        window.dispatchEvent(new CustomEvent('bienvu:showcase-updated', { detail: { agencyId } }));
      }
    } catch (cause) {
      if (active.current)
        setError(cause instanceof Error ? cause.message : 'La modification a échoué. Votre saisie est conservée.');
    } finally {
      if (active.current) setBusy(false);
    }
  }
  function change<K extends keyof ShowcaseConfig>(key: K, value: ShowcaseConfig[K]) {
    setConfig((old) => (old ? { ...old, [key]: value } : old));
    setNotice('');
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!config || !data) return;
    const parsed = ShowcaseConfig.safeParse({
      ...config,
      sectors: config.sectors.map((s) => s.trim()).filter(Boolean),
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => `${issue.path.join(' · ')} : ${issue.message}`).join(' '));
      return;
    }
    await action(
      { action: 'save', version: data.version, config: parsed.data },
      'Présentation enregistrée en brouillon. Publiez les modifications pour les afficher au public.',
    );
  }
  async function upload(file: File | undefined, kind: 'logo' | 'cover') {
    if (!file) return;
    setUploading(kind);
    setError('');
    try {
      const blob = await resizeUpload(file),
        result = await showcaseRequest<{ asset: { id: string; url: string } }>(`/api/vitrine/assets?kind=${kind}`, {
          method: 'POST',
          headers: { 'Content-Type': blob.type },
          body: blob,
        });
      if (active.current) change(kind === 'logo' ? 'logoAssetId' : 'coverAssetId', result.asset.id);
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : 'L’image n’a pas pu être ajoutée.');
    } finally {
      if (active.current) setUploading('');
    }
  }
  function switchTab(next: Tab) {
    if (itemDirty && !guardEdits(true)) return;
    setItemDirty(false);
    setEditing(null);
    setTab(next);
  }
  function completeProperty(item: Item) {
    if (!guardEdits(itemDirty)) return;
    params.current.delete('q');
    params.current.delete('cursor');
    params.current.set('propertyId', item.propertyId);
    focusEditor.current = true;
    setLoading(true);
    setItemDirty(false);
    setError('');
    setEditing(item.groupId ?? item.propertyId);
    setTab('properties');
    setRevision((v) => v + 1);
  }
  async function search(event: FormEvent) {
    event.preventDefault();
    if (!guardEdits(itemDirty)) return;
    params.current.delete('propertyId');
    params.current.delete('cursor');
    params.current.set('q', query);
    setEditing(null);
    setItemDirty(false);
    setRevision((v) => v + 1);
  }
  async function more() {
    if (!data?.nextCursor || busy) return;
    setBusy(true);
    try {
      const p = new URLSearchParams(params.current);
      p.set('cursor', data.nextCursor);
      const value = await showcaseRequest<ShowcasePrivate>(`/api/vitrine?${p}`);
      if (active.current)
        setData((old) =>
          old ? { ...old, properties: [...old.properties, ...value.properties], nextCursor: value.nextCursor } : value,
        );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data || !config)
    return (
      <section className="vitrine-empty">
        <h1>Ma vitrine</h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button type="button" onClick={() => setRevision((v) => v + 1)}>
              Réessayer
            </button>
          </>
        ) : (
          <p role="status">Préparation de votre brouillon…</p>
        )}
      </section>
    );
  const publicSlug = data.published?.slug ?? config.slug,
    publicUrl = `/agences/${publicSlug}`,
    selected = data.items.filter((i) => !i.removed),
    incomplete = selected.filter((i) => i.issues.length),
    propertiesReady = selected.length > 0 && !incomplete.length,
    canPublish = data.canConfigure && propertiesReady && !dirty && !itemDirty && !busy && !loading;
  const identityReady = Boolean(
    config.name.trim() &&
      (config.phone || config.email || config.website) &&
      ShowcaseSlug.safeParse(config.slug).success,
  );
  return (
    <div className="vitrine-manager" data-analytics-sensitive>
      <header className="vitrine-heading">
        <div>
          <span className="vitrine-eyebrow">VOTRE AGENCE, EN LIGNE</span>
          <div className="vitrine-title-line">
            <h1>Ma vitrine</h1>
            <span className={`vitrine-status is-${data.status}`}>
              <i />
              {status[data.status]}
            </span>
          </div>
          <p>Une galerie de vos biens. Une adresse qui vous ressemble.</p>
        </div>
        <div className="vitrine-heading-actions">
          <Link className="vitrine-preview-button" href="/ma-vitrine/apercu" target="_blank">
            <HomeIcon name="eye" size={18} />
            Prévisualiser
          </Link>
          {data.canConfigure && (
            <button
              type="button"
              className="showcase-primary"
              disabled={!canPublish}
              onClick={() =>
                void action(
                  { action: 'publish', version: data.version },
                  'Votre vitrine et les modifications enregistrées sont publiées.',
                )
              }
            >
              {busy
                ? 'Enregistrement…'
                : data.status === 'published'
                  ? 'Publier les modifications'
                  : 'Publier ma vitrine'}{' '}
              <HomeIcon name="arrow" size={17} />
            </button>
          )}
        </div>
      </header>
      <section className="vitrine-publication">
        <div>
          <span className="vitrine-url-symbol">
            <HomeIcon name="globe" size={23} />
          </span>
          <span>
            <small>VOTRE ADRESSE PUBLIQUE</small>
            <strong>bienvu.online{publicUrl}</strong>
            <p>
              {data.status === 'published'
                ? 'Votre vitrine est en ligne. Les changements enregistrés restent en brouillon jusqu’à publication.'
                : 'Votre vitrine est privée. Publiez-la quand votre présentation et vos biens sont prêts.'}
            </p>
          </span>
        </div>
        <nav aria-label="Actions de ma vitrine">
          <ShowcaseShare href={publicUrl} />
          {data.status === 'published' && (
            <>
              <Link href={publicUrl} target="_blank">
                Voir ma vitrine <HomeIcon name="external" size={15} />
              </Link>
              {data.canConfigure && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void action(
                      { action: 'offline', version: data.version },
                      'Votre vitrine est hors ligne. Ses fiches et médias publics sont désormais inaccessibles.',
                    )
                  }
                >
                  Mettre hors ligne
                </button>
              )}
            </>
          )}
        </nav>
        {(dirty || itemDirty) && (
          <p className="vitrine-draft-note">
            <HomeIcon name="pencil" size={14} />
            Des modifications ne sont pas enregistrées. Enregistrez-les avant de prévisualiser ou de publier.
          </p>
        )}
        {!selected.length && (
          <p className="vitrine-draft-note">
            Choisissez au moins un bien et ses photos publiques pour publier votre vitrine.
          </p>
        )}
      </section>
      <ol className="vitrine-steps">
        <li className={identityReady ? 'is-ready' : ''}>
          <button type="button" onClick={() => switchTab('presentation')}>
            <span>{identityReady ? <HomeIcon name="check" size={15} /> : '01'}</span>
            <div>
              <strong>Personnalisez</strong>
              <small>L’identité de votre agence</small>
            </div>
          </button>
        </li>
        <li className={propertiesReady ? 'is-ready' : ''}>
          <button type="button" onClick={() => switchTab('properties')}>
            <span>{propertiesReady ? <HomeIcon name="check" size={15} /> : '02'}</span>
            <div>
              <strong>Sélectionnez</strong>
              <small>{incomplete.length ? 'Vos biens restent à compléter' : 'Vos biens et leurs médias'}</small>
            </div>
          </button>
        </li>
        <li className={data.status === 'published' ? 'is-ready' : ''}>
          <Link href="/ma-vitrine/apercu" target="_blank">
            <span>{data.status === 'published' ? <HomeIcon name="check" size={15} /> : '03'}</span>
            <div>
              <strong>Prévisualisez et partagez</strong>
              <small>Une publication à votre rythme</small>
            </div>
          </Link>
        </li>
      </ol>
      <nav className="vitrine-tabs" aria-label="Rubriques de ma vitrine">
        {(
          [
            ['presentation', 'Personnalisation', 'palette'],
            ['properties', `Biens (${selected.length})`, 'house'],
            ['leads', 'Demandes', 'mail'],
            ['statistics', 'Statistiques', 'grid'],
          ] as [Tab, string, Parameters<typeof HomeIcon>[0]['name']][]
        ).map(([value, label, icon]) => (
          <button
            key={value}
            type="button"
            aria-current={tab === value ? 'page' : undefined}
            onClick={() => switchTab(value)}
          >
            <HomeIcon name={icon} size={17} />
            {label}
          </button>
        ))}
      </nav>
      {incomplete.length > 0 && (
        <section className="vitrine-publication-issues" aria-labelledby="vitrine-publication-issues-title">
          <header>
            <HomeIcon name="image" size={22} />
            <div>
              <h2 id="vitrine-publication-issues-title">
                {incomplete.length} bien{incomplete.length > 1 ? 's' : ''} à compléter avant publication
              </h2>
              {incomplete.some((item) => !item.draft.photos.length) && (
                <p>
                  Le logo et la couverture habillent votre agence. Choisissez aussi les photos publiques de chaque bien
                  dans l’onglet Biens.
                </p>
              )}
            </div>
          </header>
          <ul>
            {incomplete.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  {item.issues.map((issue) => (
                    <p key={issue}>{issue}</p>
                  ))}
                </div>
                {data.canEdit && (
                  <button type="button" disabled={busy || loading} onClick={() => completeProperty(item)}>
                    {item.draft.photos.length ? 'Compléter ce bien' : 'Choisir les photos du bien'}{' '}
                    <HomeIcon name="arrow" size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && (
        <div className="vitrine-alert" role="alert">
          {error}
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!guardEdits(dirty || itemDirty)) return;
              setItemDirty(false);
              setEditing(null);
              try {
                await reload(true);
                setError('');
              } catch (cause) {
                setError((cause as Error).message);
              }
            }}
          >
            Actualiser les données
          </button>
        </div>
      )}
      {notice && (
        <p className="vitrine-notice" role="status">
          <HomeIcon name="check" size={18} />
          {notice}
        </p>
      )}
      <div className={`vitrine-workspace-layout${tab === 'presentation' ? ' has-preview' : ''}`}>
        <div className="vitrine-main-panel">
          {tab === 'presentation' && (
            <form className="vitrine-config" onSubmit={save}>
              <header className="vitrine-panel-intro">
                <h2>Votre agence. Votre style.</h2>
                <p>
                  Composez votre présentation publique. Les informations de « Mon agence » et vos vidéos restent
                  inchangées.
                </p>
              </header>
              <fieldset disabled={!data.canConfigure || busy || Boolean(uploading)}>
                <legend className="sr-only">Présentation de l’agence</legend>
                <section className="vitrine-form-card">
                  <header>
                    <span>
                      <HomeIcon name="building" size={20} />
                    </span>
                    <div>
                      <h3>L’identité de votre agence</h3>
                      <p>Le nom et l’adresse que vos visiteurs retrouveront.</p>
                    </div>
                  </header>
                  <label>
                    Nom public de l’agence
                    <input
                      required
                      maxLength={100}
                      value={config.name}
                      onChange={(e) => change('name', e.target.value)}
                    />
                  </label>
                  <label>
                    Adresse publique
                    <span className="vitrine-url-input">
                      <span>bienvu.online/agences/</span>
                      <input
                        required
                        minLength={3}
                        maxLength={70}
                        pattern="[a-z0-9]+(-[a-z0-9]+)*"
                        value={config.slug}
                        onChange={(e) => change('slug', e.target.value.toLowerCase())}
                      />
                    </span>
                    <small className={slugAvailable === false ? 'vitrine-issue' : ''} role="status">
                      {slugAvailable === false
                        ? 'Cette adresse est déjà utilisée.'
                        : slugAvailable === true
                          ? 'Cette adresse est disponible.'
                          : 'Lettres minuscules, chiffres et tirets. Vos anciens liens publiés seront redirigés.'}
                    </small>
                  </label>
                </section>
                <section className="vitrine-form-card">
                  <header>
                    <span>
                      <HomeIcon name="image" size={20} />
                    </span>
                    <div>
                      <h3>Une première impression soignée</h3>
                      <p>Une couverture panoramique, votre logo et votre couleur.</p>
                    </div>
                  </header>
                  <div className="vitrine-upload-grid">
                    {(['cover', 'logo'] as const).map((kind) => {
                      const asset = kind === 'logo' ? config.logoAssetId : config.coverAssetId;
                      return (
                        <div className={`vitrine-upload is-${kind}`} key={kind}>
                          <div>
                            {asset ? (
                              <img
                                src={`/api/vitrine/assets/${asset}`}
                                alt={kind === 'logo' ? 'Votre logo' : 'Votre couverture'}
                              />
                            ) : kind === 'logo' ? (
                              <span className="vitrine-upload-monogram">{showcaseInitials(config.name)}</span>
                            ) : (
                              <span className="vitrine-upload-placeholder">
                                <HomeIcon name="image" size={30} />
                                <small>Votre image de couverture</small>
                              </span>
                            )}
                          </div>
                          <label className="vitrine-file-label">
                            {uploading === kind
                              ? 'Préparation de l’image…'
                              : kind === 'logo'
                                ? 'Choisir un logo'
                                : 'Choisir une couverture'}
                            <HomeIcon name="upload" size={15} />
                            <input
                              type="file"
                              accept="image/jpeg,image/png"
                              onChange={(e) => void upload(e.target.files?.[0], kind)}
                            />
                          </label>
                          {asset && (
                            <button
                              type="button"
                              className="vitrine-upload-remove"
                              aria-label={kind === 'logo' ? 'Retirer le logo' : 'Retirer la couverture'}
                              onClick={() => change(kind === 'logo' ? 'logoAssetId' : 'coverAssetId', null)}
                            >
                              <HomeIcon name="trash" size={15} />
                            </button>
                          )}
                          <small>
                            {kind === 'cover'
                              ? 'Une image large mettra votre agence en valeur.'
                              : 'Un logo sur fond transparent est idéal.'}
                          </small>
                        </div>
                      );
                    })}
                  </div>
                  <label className="vitrine-color-label">
                    Couleur d’accent
                    <div>
                      <input type="color" value={config.accent} onChange={(e) => change('accent', e.target.value)} />
                      <span>{config.accent.toUpperCase()}</span>
                      <small>Pour les boutons et les touches de couleur.</small>
                    </div>
                  </label>
                  <p className="vitrine-muted">Images JPEG ou PNG · 10 Mo maximum · optimisées à l’ajout.</p>
                </section>
                <section className="vitrine-form-card">
                  <header>
                    <span>
                      <HomeIcon name="pencil" size={20} />
                    </span>
                    <div>
                      <h3>Quelques mots sur vous</h3>
                      <p>Votre signature et ce qui fait la différence.</p>
                    </div>
                  </header>
                  <label>
                    Accroche
                    <input
                      maxLength={180}
                      placeholder="Des biens à vivre, des vidéos à découvrir."
                      value={config.tagline}
                      onChange={(e) => change('tagline', e.target.value)}
                    />
                  </label>
                  <label>
                    Présentation
                    <textarea
                      rows={4}
                      maxLength={4000}
                      placeholder="Présentez votre agence et la manière dont vous accompagnez vos clients…"
                      value={config.description}
                      onChange={(e) => change('description', e.target.value)}
                    />
                  </label>
                  <div className="vitrine-form-grid">
                    <label>
                      Ville
                      <input maxLength={100} value={config.city} onChange={(e) => change('city', e.target.value)} />
                    </label>
                    <label>
                      Secteurs
                      <textarea
                        rows={2}
                        placeholder="Un secteur par ligne"
                        value={config.sectors.join('\n')}
                        onChange={(e) => change('sectors', e.target.value.split('\n').slice(0, 12))}
                      />
                      <small>Un secteur par ligne, 12 maximum.</small>
                    </label>
                  </div>
                </section>
                <section className="vitrine-form-card">
                  <header>
                    <span>
                      <HomeIcon name="mail" size={20} />
                    </span>
                    <div>
                      <h3>Gardons le contact</h3>
                      <p>Les coordonnées accessibles à vos visiteurs.</p>
                    </div>
                  </header>
                  <div className="vitrine-form-grid">
                    <label>
                      Téléphone public
                      <input
                        type="tel"
                        maxLength={25}
                        value={config.phone ?? ''}
                        onChange={(e) => change('phone', e.target.value || null)}
                      />
                    </label>
                    <label>
                      E-mail public
                      <input
                        type="email"
                        maxLength={254}
                        value={config.email ?? ''}
                        onChange={(e) => change('email', e.target.value || null)}
                      />
                    </label>
                  </div>
                  <label>
                    Site internet
                    <input
                      type="url"
                      maxLength={2048}
                      placeholder="https://…"
                      value={config.website ?? ''}
                      onChange={(e) => change('website', e.target.value || null)}
                    />
                  </label>
                  <details>
                    <summary>Réseaux sociaux et adresse professionnelle</summary>
                    <div className="vitrine-form-grid">
                      {Object.entries(config.socials).map(([network, url]) => (
                        <label key={network}>
                          {network[0].toUpperCase() + network.slice(1)}
                          <input
                            type="url"
                            maxLength={2048}
                            placeholder="https://…"
                            value={url ?? ''}
                            onChange={(e) =>
                              change('socials', { ...config.socials, [network]: e.target.value || null })
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <label>
                      Adresse professionnelle
                      <input
                        maxLength={300}
                        value={config.address}
                        onChange={(e) => change('address', e.target.value)}
                      />
                    </label>
                    <label className="vitrine-check">
                      <input
                        type="checkbox"
                        checked={config.showAddress}
                        onChange={(e) => change('showAddress', e.target.checked)}
                      />
                      <span>
                        Afficher cette adresse sur la vitrine publique
                        <small>Laissez cette option désactivée pour afficher uniquement votre ville.</small>
                      </span>
                    </label>
                  </details>
                </section>
                <section className="vitrine-form-card">
                  <header>
                    <span>
                      <HomeIcon name="settings" size={20} />
                    </span>
                    <div>
                      <h3>Votre vitrine au quotidien</h3>
                      <p>Les références à conserver et les demandes à suivre.</p>
                    </div>
                  </header>
                  <label className="vitrine-check">
                    <input
                      type="checkbox"
                      checked={config.keepSold}
                      onChange={(e) => change('keepSold', e.target.checked)}
                    />
                    <span>
                      Conserver les biens vendus ou loués
                      <small>Ils restent présentés comme références, avec leur statut affiché.</small>
                    </span>
                  </label>
                  <label className="vitrine-check">
                    <input
                      type="checkbox"
                      checked={config.notifications}
                      onChange={(e) => change('notifications', e.target.checked)}
                    />
                    <span>
                      Recevoir les nouvelles demandes par e-mail
                      <small>Les notifications sont envoyées à l’adresse publique de votre agence.</small>
                    </span>
                  </label>
                  <p className="vitrine-muted">
                    {data.emailConfigured
                      ? 'Toutes les demandes restent consultables dans la rubrique Demandes.'
                      : 'L’envoi d’e-mails n’est pas configuré. Les demandes restent accessibles dans BienVu.'}
                  </p>
                </section>
                <div className="vitrine-savebar">
                  <span>
                    <HomeIcon name={dirty ? 'pencil' : 'check'} size={16} />
                    {dirty ? 'Modifications à enregistrer' : 'Votre brouillon est enregistré'}
                  </span>
                  <button type="submit" className="showcase-primary" disabled={!dirty || slugAvailable === false}>
                    Enregistrer le brouillon <HomeIcon name="check" size={17} />
                  </button>
                </div>
              </fieldset>
              {!data.canConfigure && (
                <p className="vitrine-muted">
                  La présentation et la publication globale sont réservées au propriétaire et aux administrateurs de
                  l’agence.
                </p>
              )}
            </form>
          )}
          {tab === 'properties' && (
            <section className="vitrine-properties">
              <header>
                <h2>Le bon choix de biens. Et de médias.</h2>
                <p>
                  La vitrine et Explorer sont indépendants. Les nouveaux médias restent privés jusqu’à votre sélection
                  et votre publication explicites.
                </p>
                <p className="vitrine-muted">
                  Le prix, les caractéristiques et la description d’un bien publié suivent les modifications faites dans
                  Mes biens. Une vidéo dont les informations sont devenues obsolètes est remplacée par la photo de
                  couverture.
                </p>
              </header>
              {selected.length > 0 && (
                <details className="vitrine-selected" open>
                  <summary>
                    Votre sélection · {selected.length} bien{selected.length > 1 ? 's' : ''}
                  </summary>
                  {selected.map((item) => (
                    <div className="vitrine-selected-row" key={item.id}>
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {item.published && data.status === 'published'
                            ? 'Publié'
                            : item.issues.length
                              ? 'Brouillon à compléter'
                              : 'Prêt à publier'}
                          {item.draft.settings.featured ? ' · À la une' : ''}
                        </small>
                        {item.issues.map((issue) => (
                          <small className="vitrine-issue" key={issue}>
                            {issue}
                          </small>
                        ))}
                        {item.videoOutdated && (
                          <small className="vitrine-issue">
                            La vidéo affiche d’anciennes informations. La fiche utilisera les photos.
                          </small>
                        )}
                      </span>
                      <div>
                        <Link href={`/ma-vitrine/apercu?bien=${item.id}`} target="_blank">
                          Prévisualiser
                        </Link>
                        <button type="button" disabled={busy || loading} onClick={() => completeProperty(item)}>
                          Choisir les médias
                        </button>
                        {data.canEdit && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void action(
                                { action: 'property-remove', version: data.version, id: item.id },
                                'Le bien est retiré de la vitrine. Ses contenus privés et sa publication dans Explorer sont conservés.',
                              )
                            }
                          >
                            Retirer de la vitrine
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </details>
              )}
              <form className="vitrine-property-search" onSubmit={search}>
                <label>
                  Rechercher dans Mes biens
                  <input
                    type="search"
                    maxLength={80}
                    value={query}
                    placeholder="Un bien, une ville…"
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <button type="submit" disabled={busy}>
                  Rechercher
                </button>
                {params.current.has('propertyId') && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!guardEdits(itemDirty)) return;
                      params.current.delete('propertyId');
                      setEditing(null);
                      setItemDirty(false);
                      setRevision((v) => v + 1);
                    }}
                  >
                    Voir tous les biens
                  </button>
                )}
              </form>
              <div className="vitrine-candidates">
                {data.properties.map((property) => {
                  const item = data.items.find((i) => i.groupId === property.id),
                    opened =
                      editing === property.id ||
                      (params.current.has('propertyId') && data.properties.length === 1 && editing !== null);
                  return (
                    <article
                      key={property.id}
                      ref={opened ? editor : undefined}
                      tabIndex={opened ? -1 : undefined}
                      className={`vitrine-candidate${opened ? ' is-open' : ''}`}
                    >
                      <header>
                        {property.photos[0] ? (
                          <img src={property.photos[0].url} alt="" loading="lazy" decoding="async" />
                        ) : (
                          <HomeIcon name="house" size={32} />
                        )}
                        <span>
                          <h3>{property.title}</h3>
                          <p>{propertyFacts(property.fields)}</p>
                          <strong>{propertyPrice(property.fields) || 'Prix à compléter'}</strong>
                          <small>
                            {property.archived
                              ? 'Archivé'
                              : item && !item.removed
                                ? item.published && data.status === 'published'
                                  ? 'Visible sur la vitrine'
                                  : item.issues.length
                                    ? 'Brouillon à compléter'
                                    : 'Prêt à publier'
                                : 'Privé · Non sélectionné'}
                          </small>
                        </span>
                        <button
                          type="button"
                          disabled={busy || loading}
                          onClick={() => {
                            if (!guardEdits(itemDirty)) return;
                            setItemDirty(false);
                            setEditing(opened ? null : property.id);
                          }}
                        >
                          {' '}
                          {opened ? 'Fermer' : 'Choisir les médias'} <HomeIcon name="chevron" size={18} />
                        </button>
                      </header>
                      {opened && (
                        <ShowcasePropertyEditor
                          key={`${property.id}:${item?.updatedAt ?? ''}`}
                          property={property}
                          item={item}
                          data={data}
                          busy={busy || loading}
                          onDirty={setItemDirty}
                          save={async (settings) => {
                            await action(
                              { action: 'property-save', version: data.version, propertyId: property.id, settings },
                              settings.photoIds.length
                                ? 'Choix des médias enregistré en brouillon. Publiez le bien ou les modifications de la vitrine.'
                                : 'Bien enregistré en brouillon. Choisissez encore ses photos publiques avant de le publier.',
                            );
                          }}
                          publish={async () => {
                            if (!item) return;
                            await action(
                              { action: 'property-publish', version: data.version, id: item.id },
                              'Ce bien et les médias sélectionnés sont publiés sur votre vitrine.',
                            );
                          }}
                        />
                      )}
                    </article>
                  );
                })}
              </div>
              {!data.properties.length && !loading && (
                <div className="vitrine-empty">
                  <h3>Aucun bien dans cette sélection.</h3>
                  <p>Ajoutez votre premier bien ou essayez une autre recherche.</p>
                  <Link href="/">Ajouter un bien →</Link>
                </div>
              )}
              {loading && <p role="status">Chargement des biens…</p>}
              {data.nextCursor && (
                <button type="button" className="vitrine-more" disabled={busy} onClick={() => void more()}>
                  Voir plus de biens
                </button>
              )}
            </section>
          )}
          {tab === 'leads' && (
            <section className="vitrine-leads">
              <header>
                <h2>Des projets à accompagner.</h2>
                <p>
                  Chaque demande est enregistrée avant l’envoi de sa notification. Un e-mail échoué ne fait pas perdre
                  le message.
                </p>
              </header>
              {!data.leads.length ? (
                <div className="vitrine-empty">
                  <HomeIcon name="mail" size={36} />
                  <h3>Aucune demande pour le moment.</h3>
                  <p>Les messages envoyés depuis votre vitrine apparaîtront ici.</p>
                </div>
              ) : (
                data.leads.map((lead) => (
                  <article className="vitrine-lead ph-no-capture" key={lead.id} data-analytics-sensitive>
                    <header>
                      <div>
                        <strong>{lead.name}</strong>
                        <small>{new Date(lead.createdAt).toLocaleString('fr-FR')}</small>
                      </div>
                      <span>{leadStatus[lead.status]}</span>
                    </header>
                    <p className="vitrine-lead-property">
                      {lead.propertyTitle ? `À propos de : ${lead.propertyTitle}` : 'Demande générale'}
                    </p>
                    <p className="vitrine-lead-message">{lead.message}</p>
                    <div className="vitrine-lead-contacts">
                      <a href={`mailto:${lead.email}`}>{lead.email}</a>
                      {lead.phone && <a href={`tel:${lead.phone.replace(/[^+\d]/g, '')}`}>{lead.phone}</a>}
                    </div>
                    <footer>
                      <small>{delivery[lead.notification]}</small>
                      {data.canEdit && (
                        <label>
                          Statut
                          <select
                            value={lead.status}
                            disabled={busy}
                            onChange={(e) =>
                              void action(
                                { action: 'lead', id: lead.id, status: e.target.value as keyof typeof leadStatus },
                                'Statut de la demande mis à jour.',
                              )
                            }
                          >
                            <option value="new">Nouvelle</option>
                            <option value="in_progress">En cours</option>
                            <option value="treated">Traitée</option>
                          </select>
                        </label>
                      )}
                      {data.canEdit && lead.notification === 'failed' && data.emailConfigured && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void action(
                              { action: 'lead-retry', id: lead.id },
                              'Une nouvelle tentative de notification est programmée.',
                            )
                          }
                        >
                          Réessayer la notification
                        </button>
                      )}
                      {data.canConfigure && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm('Supprimer cette demande et ses coordonnées ?'))
                              void action({ action: 'lead-delete', id: lead.id }, 'Demande supprimée.');
                          }}
                        >
                          Supprimer
                        </button>
                      )}
                    </footer>
                  </article>
                ))
              )}
              {data.nextLeadCursor && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const p = new URLSearchParams(params.current);
                      p.set('leadCursor', data.nextLeadCursor!);
                      const next = await showcaseRequest<ShowcasePrivate>(`/api/vitrine?${p}`);
                      if (active.current)
                        setData((old) =>
                          old
                            ? { ...old, leads: [...old.leads, ...next.leads], nextLeadCursor: next.nextLeadCursor }
                            : next,
                        );
                    } catch (cause) {
                      setError((cause as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Voir les demandes précédentes
                </button>
              )}
            </section>
          )}
          {tab === 'statistics' && (
            <section className="vitrine-statistics">
              <header>
                <h2>Votre vitrine, en chiffres.</h2>
                <div role="group" aria-label="Période des statistiques">
                  {([7, 30] as const).map((value) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={days === value}
                      disabled={busy}
                      onClick={() => {
                        setDays(value);
                        params.current.set('days', String(value));
                        setRevision((v) => v + 1);
                      }}
                    >
                      {value} jours
                    </button>
                  ))}
                </div>
              </header>
              <div className="vitrine-stats-grid">
                {[
                  [data.stats.agencyViews, 'Vues de la vitrine'],
                  [data.stats.propertyViews, 'Vues des fiches'],
                  [data.stats.contactClicks, 'Clics de contact'],
                  [data.stats.requests, 'Demandes reçues'],
                ].map(([value, label]) => (
                  <article key={label}>
                    <span>{label}</span>
                    <strong>{Number(value).toLocaleString('fr-FR')}</strong>
                  </article>
                ))}
              </div>
              <p className="vitrine-muted">
                Les vues et clics sont mesurés avec le consentement des visiteurs. Les aperçus, visites des membres de
                votre agence et robots identifiés sont exclus. Un clic sur « Appeler » ne garantit pas un appel : les
                demandes correspondent aux formulaires réellement enregistrés, même si leur notification échoue ou si le
                message est ensuite supprimé.
              </p>
            </section>
          )}
        </div>
        {tab === 'presentation' && <ShowcaseDesignPreview config={config} data={data} dirty={dirty} />}
      </div>
    </div>
  );
}

function ShowcaseDesignPreview({
  config,
  data,
  dirty,
}: {
  config: ShowcaseConfig;
  data: ShowcasePrivate;
  dirty: boolean;
}) {
  const selected = data.items.filter((item) => !item.removed),
    identityReady = Boolean(config.name.trim() && (config.phone || config.email || config.website)),
    photosReady =
      selected.length > 0 &&
      selected.every(
        (item) =>
          item.draft.photos.length > 0 &&
          item.draft.photos.some((photo) => photo.sourceHash === item.draft.settings.coverPhotoId),
      );
  return (
    <aside className="vitrine-design-preview" aria-label="Aperçu de votre présentation">
      <header>
        <span>
          <HomeIcon name="eye" size={17} />
          Votre vitrine, en un clin d’œil
        </span>
        <small>{dirty ? 'Modifications en cours' : 'Brouillon enregistré'}</small>
      </header>
      <div className="vitrine-mini-site" style={{ '--vitrine-preview-accent': config.accent } as React.CSSProperties}>
        <div className="vitrine-mini-nav">
          <strong>{config.name || 'Votre agence'}</strong>
          <span>Nos biens</span>
        </div>
        <div className="vitrine-mini-cover">
          {config.coverAssetId ? (
            <img src={`/api/vitrine/assets/${config.coverAssetId}`} alt="Couverture en cours de configuration" />
          ) : (
            <HomeIcon name="image" size={30} />
          )}
        </div>
        <div className="vitrine-mini-identity">
          <div>
            {config.logoAssetId ? (
              <img src={`/api/vitrine/assets/${config.logoAssetId}`} alt="Logo en cours de configuration" />
            ) : (
              <span>{showcaseInitials(config.name)}</span>
            )}
          </div>
          <span>
            <strong>{config.name || 'Votre agence'}</strong>
            <small>{config.city || 'Votre secteur'}</small>
          </span>
        </div>
        <p>{config.tagline || 'Des biens à vivre, des vidéos à découvrir.'}</p>
        <h3>Trouvez votre prochain chez-vous.</h3>
        {selected.length ? (
          <div className="vitrine-mini-gallery">
            {selected.slice(0, 3).map((item) => {
              const photo =
                item.draft.photos.find((photo) => photo.sourceHash === item.draft.settings.coverPhotoId) ??
                item.draft.photos[0];
              return (
                <div key={item.id}>
                  {photo ? (
                    <img src={`/api/vitrine/assets/${photo.id}`} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <HomeIcon name="house" size={25} />
                  )}
                  <span>{item.title}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="vitrine-mini-empty">
            <HomeIcon name="house" size={24} />
            <span>Vos biens apparaîtront ici après sélection.</span>
          </div>
        )}
      </div>
      <p className="vitrine-preview-caption">
        Aperçu de votre identité et de votre sélection.
        {dirty ? ' La prévisualisation complète utilise le dernier brouillon enregistré.' : ''}
      </p>
      <Link className="vitrine-preview-full" href="/ma-vitrine/apercu" target="_blank">
        Voir l’aperçu complet <HomeIcon name="external" size={16} />
      </Link>
      <div className="vitrine-ready-checklist">
        <h3>Avant de partager</h3>
        <span className={identityReady ? 'is-ready' : ''}>
          <HomeIcon name={identityReady ? 'check' : 'building'} size={16} />
          Un nom et un moyen de contact
        </span>
        <span className={selected.length ? 'is-ready' : ''}>
          <HomeIcon name={selected.length ? 'check' : 'house'} size={16} />
          Au moins un bien sélectionné
        </span>
        <span className={photosReady ? 'is-ready' : ''}>
          <HomeIcon name={photosReady ? 'check' : 'image'} size={16} />
          Les photos et la couverture de chaque bien
        </span>
        <span className={!dirty ? 'is-ready' : ''}>
          <HomeIcon name={!dirty ? 'check' : 'pencil'} size={16} />
          Les modifications enregistrées
        </span>
        <small>Vous choisissez quand rendre votre vitrine publique.</small>
      </div>
    </aside>
  );
}

function ShowcasePropertyEditor({
  property,
  item,
  data,
  busy,
  onDirty,
  save,
  publish,
}: {
  property: Candidate;
  item?: Item;
  data: ShowcasePrivate;
  busy: boolean;
  onDirty: (dirty: boolean) => void;
  save: (value: ShowcasePropertySettings) => Promise<void>;
  publish: () => Promise<void>;
}) {
  const initial = item?.draft.settings ?? defaultShowcaseProperty(),
    [settings, setSettings] = useState(initial),
    [validation, setValidation] = useState(''),
    [photoLimit, setPhotoLimit] = useState(12),
    dirty = JSON.stringify(initial) !== JSON.stringify(settings);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  function change<K extends keyof ShowcasePropertySettings>(key: K, value: ShowcasePropertySettings[K]) {
    setSettings((old) => ({ ...old, [key]: value }));
    setValidation('');
  }
  function selectPhoto(id: string) {
    setSettings((old) => {
      const included = old.photoIds.includes(id),
        ids = included ? old.photoIds.filter((p) => p !== id) : [...old.photoIds, id];
      return {
        ...old,
        photoIds: ids,
        coverPhotoId: included && old.coverPhotoId === id ? (ids[0] ?? null) : (old.coverPhotoId ?? id),
      };
    });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = ShowcasePropertySettings.safeParse(settings);
    if (!parsed.success) {
      setValidation('Vérifiez la sélection des photos et les informations de publication.');
      return;
    }
    await save(parsed.data);
  }
  const videoUrl = settings.videoJobId
    ? item?.draft.video?.jobId === settings.videoJobId
      ? `/api/vitrine/assets/${item.draft.video.id}`
      : property.videos.find((v) => v.id === settings.videoJobId)?.videoUrl
    : null;
  return (
    <form className="vitrine-property-editor" onSubmit={submit}>
      <h3>Photos publiques de ce bien</h3>
      <p>
        Choisissez uniquement les médias que vous souhaitez rendre publics. Aucune génération ni aucun crédit ne sont
        nécessaires.
      </p>
      <p className="vitrine-muted">
        Cochez au moins une photo. La première choisie sert de couverture du bien ; vous pouvez en choisir une autre
        ensuite.
      </p>
      <p className="vitrine-muted">
        Les fichiers sont publiés tels quels : vérifiez que leurs images, voix et cartes ne dévoilent pas une adresse ou
        une information que vous souhaitez garder privée.
      </p>
      <fieldset disabled={busy || !data.canEdit || property.archived}>
        <legend className="sr-only">Médias publics et informations du bien</legend>
        <p className="vitrine-muted" role="status">
          {settings.photoIds.length} / 12 photos sélectionnées
        </p>
        <div className="vitrine-photo-choices">
          {property.photos.slice(0, photoLimit).map((photo, index) => {
            const copy = item?.draft.photos.find((p) => p.sourceHash === photo.id);
            return (
              <div className={settings.photoIds.includes(photo.id) ? 'is-selected' : ''} key={photo.id}>
                <label>
                  <img
                    src={copy ? `/api/vitrine/assets/${copy.id}` : photo.url}
                    alt={`Vue ${index + 1} de ${property.title}`}
                    loading="lazy"
                    decoding="async"
                  />
                  <input
                    type="checkbox"
                    disabled={!settings.photoIds.includes(photo.id) && settings.photoIds.length >= 12}
                    checked={settings.photoIds.includes(photo.id)}
                    onChange={() => selectPhoto(photo.id)}
                  />
                  <span>Photo {index + 1}</span>
                </label>
                <button
                  type="button"
                  disabled={!settings.photoIds.includes(photo.id)}
                  aria-pressed={settings.coverPhotoId === photo.id}
                  onClick={() => change('coverPhotoId', photo.id)}
                >
                  {settings.coverPhotoId === photo.id ? 'Couverture du bien' : 'Choisir en couverture'}
                </button>
              </div>
            );
          })}
        </div>
        {property.photos.length > photoLimit && (
          <button type="button" onClick={() => setPhotoLimit((n) => n + 12)}>
            Voir les autres photos
          </button>
        )}
        {!property.photos.length && (
          <p className="vitrine-issue">
            Ce bien n’a pas de photo disponible. Ajoutez-en dans{' '}
            <Link href={`/biens/${encodeURIComponent(property.id)}`}>Mes biens</Link>.
          </p>
        )}
        <label>
          Vidéo principale
          <select value={settings.videoJobId ?? ''} onChange={(e) => change('videoJobId', e.target.value || null)}>
            <option value="">Photos uniquement · Aucune vidéo</option>
            {property.videos
              .filter((v) => v.ready)
              .map((v, i) => (
                <option key={v.id} value={v.id}>
                  {v.title} · {v.aspectRatio} · {i + 1}
                </option>
              ))}
          </select>
          <small>Seules les vidéos terminées et accessibles à votre agence peuvent être sélectionnées.</small>
        </label>
        {videoUrl && (
          <p>
            <a href={videoUrl} target="_blank" rel="noopener noreferrer">
              Voir la vidéo choisie ↗
            </a>
          </p>
        )}
        <div className="vitrine-form-grid">
          <label>
            Disponibilité
            <select
              value={settings.status}
              onChange={(e) => change('status', e.target.value as ShowcasePropertySettings['status'])}
            >
              <option value="available">Disponible</option>
              <option value="under_offer">Sous compromis</option>
              <option value="sold">Vendu</option>
              <option value="rented">Loué</option>
            </select>
          </label>
          <label>
            Ordre dans le catalogue
            <input
              type="number"
              min={0}
              max={499}
              value={settings.order}
              onChange={(e) => change('order', Number(e.target.value))}
            />
          </label>
        </div>
        <label className="vitrine-check">
          <input type="checkbox" checked={settings.featured} onChange={(e) => change('featured', e.target.checked)} />
          Mettre ce bien à la une
        </label>
        <details>
          <summary>Localisation précise, énergie et mentions de l’annonce</summary>
          <p className="vitrine-muted">
            Renseignez uniquement les informations confirmées. La commune de Mes biens sera affichée ; l’adresse précise
            reste privée par défaut.
          </p>
          <label>
            Adresse précise
            <input maxLength={300} value={settings.address} onChange={(e) => change('address', e.target.value)} />
          </label>
          <label className="vitrine-check">
            <input
              type="checkbox"
              checked={settings.showAddress}
              onChange={(e) => change('showAddress', e.target.checked)}
            />
            Autoriser la publication de cette adresse précise
          </label>
          <div className="vitrine-form-grid">
            {(['dpe', 'ges'] as const).map((kind) => (
              <label key={kind}>
                {kind.toUpperCase()}
                <select
                  value={settings[kind] ?? ''}
                  onChange={(e) => change(kind, (e.target.value as ShowcasePropertySettings[typeof kind]) || null)}
                >
                  <option value="">Non renseigné</option>
                  {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                  <option value="not_applicable">Non applicable</option>
                </select>
              </label>
            ))}
          </div>
          <label>
            Mentions d’annonce<small>Honoraires, copropriété, charges, conditions de location, risques…</small>
            <textarea
              maxLength={4000}
              rows={4}
              value={settings.legal}
              onChange={(e) => change('legal', e.target.value)}
            />
          </label>
        </details>
        {validation && <p role="alert">{validation}</p>}
        {item?.issues.map((issue) => (
          <p className="vitrine-issue" key={issue}>
            {issue}
          </p>
        ))}
        {item?.videoOutdated && (
          <p className="vitrine-issue">
            La vidéo sélectionnée contient d’anciennes informations. Publiez les photos ou préparez une nouvelle vidéo
            dans <Link href={`/biens/${encodeURIComponent(property.id)}`}>Mes biens</Link>.
          </p>
        )}
        <div className="vitrine-editor-actions">
          <button type="submit" className="showcase-primary" disabled={!dirty && !item?.removed}>
            Enregistrer la sélection
          </button>
          {item && !dirty && data.status === 'published' && (
            <button type="button" disabled={Boolean(item.issues.length)} onClick={() => void publish()}>
              {item.published ? 'Publier ces modifications' : 'Publier sur ma vitrine'} →
            </button>
          )}
          <Link href={`/biens/${encodeURIComponent(property.id)}`}>Ouvrir dans Mes biens ↗</Link>
        </div>
      </fieldset>
    </form>
  );
}
