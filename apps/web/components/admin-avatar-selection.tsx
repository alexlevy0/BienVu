'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AvatarPublication,
  AvatarGallery,
  AvatarLook,
  avatarPresenters,
  groupAvatarPublication,
  addAvatarGroupToPublication,
  type AvatarPresenter,
  type AdminAvatarData,
  type AvatarPublication as Publication,
} from '@bienvu/contracts';
import { AvatarPortrait } from './avatar-portrait';
import { AvatarPresenterCard, useAvatarPreview } from './avatar-presenter-card';
import { AvatarVariantsDialog } from './avatar-variants-dialog';
import { loadAdminAvatarGroup } from '../lib/avatar-group-selection';
import { HomeIcon } from './home-icons';
import '../app/avatar-selection.css';

const draftKey = 'bienvu:admin-avatar-selection:v2';
type Props = {
  data: AdminAvatarData;
  busy: boolean;
  onMutate(method: string, body: unknown): Promise<AdminAvatarData | null>;
};
export function AdminAvatarSelection({ data, busy: externalBusy, onMutate }: Props) {
  const [groupBusy, setGroupBusy] = useState(false),
    [groupNotice, setGroupNotice] = useState(''),
    operation = useRef<AbortController | null>(null);
  const busy = externalBusy || groupBusy;
  const [tab, setTab] = useState<'selection' | 'catalogue'>('selection'),
    [draft, setDraft] = useState<Publication>(data.publication),
    [base, setBase] = useState(data.publicationRevision);
  const [query, setQuery] = useState(''),
    [gender, setGender] = useState('all'),
    [type, setType] = useState('all'),
    [availability, setAvailability] = useState('all');
  const [page, setPage] = useState<AvatarGallery | null>(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [catalogVersion, setCatalogVersion] = useState(0);
  const [extraLooks, setExtraLooks] = useState<AvatarLook[]>([]),
    [drag, setDrag] = useState<string | null>(null),
    [offset, setOffset] = useState(0),
    [group, setGroup] = useState<AvatarPresenter | null>(null);
  const [previewSelection, setPreviewSelection] = useState(false),
    restored = useRef(false),
    playback = useAvatarPreview(busy);
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.publication),
    conflict = base !== data.publicationRevision;
  const looks = useMemo(
      () => new Map([...extraLooks, ...data.looks, ...(page?.looks ?? [])].map((look) => [look.id, look])),
      [extraLooks, data.looks, page?.looks],
    ),
    selected = useMemo(() => new Set(draft.groups.flatMap((group) => group.lookIds)), [draft.groups]);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const stored = JSON.parse(
          sessionStorage.getItem(draftKey) ?? sessionStorage.getItem('bienvu:admin-avatar-selection:v1') ?? 'null',
        ),
        value = AvatarPublication.safeParse(stored?.publication);
      if (
        stored?.revision === data.publicationRevision &&
        Date.now() - stored.at >= 0 &&
        Date.now() - stored.at < 86400000 &&
        value.success
      ) {
        const members = new Set(value.data.groups.flatMap((group) => group.lookIds)),
          saved = (Array.isArray(stored.looks) ? stored.looks : []).slice(0, 5000).flatMap((entry: unknown) => {
            const parsed = AvatarLook.safeParse(entry);
            if (!parsed.success || !members.has(parsed.data.id)) return [];
            const look = parsed.data,
              prefix = '/api/avatars/' + look.id + '/media?';
            return [look.thumbnail, look.preview].every((url) => !url || url.startsWith(prefix)) ? [look] : [];
          });
        setDraft(groupAvatarPublication(value.data, [...saved, ...data.identities, ...data.looks]));
        setExtraLooks(saved);
      }
    } catch {}
  }, [data.publicationRevision, data.identities, data.looks]);
  useEffect(() => () => operation.current?.abort(), []);
  useEffect(() => {
    setDraft((current) => {
      const grouped = groupAvatarPublication(current, [
        ...extraLooks,
        ...data.identities,
        ...data.looks,
        ...(page?.looks ?? []),
      ]);
      return JSON.stringify(grouped) === JSON.stringify(current) ? current : grouped;
    });
  }, [data.identities, data.looks, page?.looks, extraLooks]);
  useEffect(() => {
    if (!restored.current) return;
    try {
      if (dirty)
        sessionStorage.setItem(
          draftKey,
          JSON.stringify({
            revision: base,
            publication: draft,
            looks: [...looks.values()].filter((look) => selected.has(look.id)),
            at: Date.now(),
          }),
        );
      else sessionStorage.removeItem(draftKey);
    } catch {}
  }, [draft, base, dirty, extraLooks, looks, selected]);
  useEffect(() => {
    if (data.publicationRevision !== base && !dirty) {
      setBase(data.publicationRevision);
      setDraft(data.publication);
    }
  }, [data.publicationRevision, data.publication, base, dirty]);
  useEffect(() => {
    setOffset(0);
  }, [query, gender, type, availability]);
  useEffect(() => {
    if (tab !== 'catalogue') return;
    const controller = new AbortController();
    setPending(true);
    setError('');
    const timeout = setTimeout(() => {
      void fetch(
        '/api/admin/avatars?' +
          new URLSearchParams({ catalog: '1', query, gender, type, availability, offset: String(offset) }),
        { cache: 'no-store', signal: controller.signal },
      )
        .then(async (response) => {
          if (!response.ok) throw Error();
          const next = AvatarGallery.parse(await response.json());
          if (!controller.signal.aborted) setPage(next);
        })
        .catch(() => {
          if (!controller.signal.aborted) setError('Le catalogue n’a pas pu être chargé. Réessayez.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setPending(false);
        });
    }, 250);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [tab, query, gender, type, availability, offset, catalogVersion]);
  function update(next: Publication) {
    setDraft(next);
    setPreviewSelection(false);
    setError('');
  }
  function remove(ids: string[]) {
    const groups = draft.groups.filter((group) => !ids.includes(group.id));
    update({
      groups,
      defaultLookId: groups.some((group) => group.lookIds.includes(draft.defaultLookId ?? ''))
        ? draft.defaultLookId
        : (groups[0]?.lookIds[0] ?? null),
    });
  }
  function move(id: string, index: number) {
    const groups = [...draft.groups],
      at = groups.findIndex((group) => group.id === id);
    if (at < 0 || index < 0 || index >= groups.length) return;
    const [item] = groups.splice(at, 1);
    groups.splice(index, 0, item);
    update({ ...draft, groups });
  }
  async function choose(look: AvatarLook) {
    if (busy) return;
    if (selected.has(look.id)) {
      const groups = draft.groups
        .map((group) => ({ ...group, lookIds: group.lookIds.filter((id) => id !== look.id) }))
        .filter((group) => group.lookIds.length);
      update({
        groups,
        defaultLookId: draft.defaultLookId === look.id ? (groups[0]?.lookIds[0] ?? null) : draft.defaultLookId,
      });
      return;
    }
    const id = look.groupId ?? look.id,
      existing = draft.groups.find((group) => group.id === id);
    if (existing?.lookIds.length === 256 || selected.size >= 5000 || (!existing && draft.groups.length === 200)) {
      setError('La sélection a atteint sa capacité. Retirez des apparences avant d’en ajouter.');
      throw Error('LIMIT');
    }
    if (!look.enabled) {
      const result = await onMutate('PATCH', { enableLooks: [look.id] });
      if (!result) throw Error('UPDATE_FAILED');
    }
    const saved = { ...look, enabled: true };
    setExtraLooks((current) => [...current.filter((item) => item.id !== look.id), saved]);
    const groups = existing
      ? draft.groups.map((group) => (group.id === id ? { ...group, lookIds: [...group.lookIds, look.id] } : group))
      : [
          ...draft.groups,
          { id, name: look.groupName ?? look.name.slice(0, 100), lookIds: [look.id], recommended: false },
        ];
    update({ groups, defaultLookId: draft.defaultLookId ?? look.id });
    setCatalogVersion((value) => value + 1);
  }
  async function addGroup(presenter: AvatarPresenter) {
    if (busy || operation.current) return false;
    const controller = new AbortController();
    operation.current = controller;
    setGroupBusy(true);
    setError('');
    setGroupNotice('');
    playback.stop();
    try {
      const all = await loadAdminAvatarGroup(presenter.id, controller.signal),
        compatible = all.filter(
          (look) =>
            look.ownership === 'public' &&
            (look.engines.includes('avatar_iii') || (data.settings.allowPremium && look.engines.includes('avatar_iv'))),
        );
      if (!compatible.length) throw Error('Ce groupe ne contient aucune apparence compatible avec vos réglages.');
      const next = addAvatarGroupToPublication(draft, presenter.id, compatible),
        inactive = compatible.filter((look) => !look.enabled);
      for (let offset = 0; offset < inactive.length; offset += 100) {
        if (controller.signal.aborted) return false;
        const result = await onMutate('PATCH', {
          enableLooks: inactive.slice(offset, offset + 100).map((look) => look.id),
        });
        if (!result) throw Error('Le groupe n’a pas pu être préparé. Réessayez : les ajouts restent en brouillon.');
      }
      if (controller.signal.aborted) return false;
      const ids = new Set(compatible.map((look) => look.id));
      setExtraLooks((current) => [
        ...current.filter((look) => !ids.has(look.id)),
        ...compatible.map((look) => ({ ...look, enabled: true })),
      ]);
      update(next);
      setCatalogVersion((value) => value + 1);
      setGroupNotice(
        `${presenter.name} : ${compatible.length} apparences compatibles dans votre brouillon.${all.length > compatible.length ? ` ${all.length - compatible.length} apparence(s) incompatible(s) écartée(s).` : ''} Publiez la sélection pour les proposer aux utilisateurs.`,
      );
      return true;
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error && cause.name === 'ZodError'
            ? 'La sélection dépasse sa capacité ou un nom de groupe manque. Vérifiez votre sélection avant de réessayer.'
            : cause instanceof Error
              ? cause.message
              : 'Le groupe n’a pas pu être ajouté.',
        );
      return false;
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        setGroupBusy(false);
      }
    }
  }
  async function changeLook(
    look: AvatarLook,
    enabled: boolean,
    transparency = look.transparency,
    verified = look.transparentVerified,
  ) {
    const result = await onMutate('PATCH', {
      lookId: look.id,
      enabled,
      transparentVerified: verified,
      transparency: transparency ?? null,
    });
    if (!result) throw Error('UPDATE_FAILED');
    setExtraLooks((current) => [
      ...current.filter((item) => item.id !== look.id),
      { ...look, enabled, transparency, transparentVerified: verified },
    ]);
    setCatalogVersion((value) => value + 1);
  }
  async function publish() {
    const parsed = AvatarPublication.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    const result = await onMutate('PATCH', { publication: parsed.data, revision: base });
    if (!result) return;
    setBase(result.publicationRevision);
    setDraft(result.publication);
    setError('');
    window.dispatchEvent(new Event('bienvu:avatars-published'));
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('bienvu-avatar-publication');
      channel.postMessage('published');
      channel.close();
    }
  }
  function open(presenter: AvatarPresenter) {
    playback.stop();
    setGroup(presenter);
  }
  return (
    <section className="admin-card avatar-publication-admin">
      <header className="avatar-publication-heading">
        <div>
          <h3>La sélection BienVu</h3>
          <p>
            Un présentateur par identité HeyGen. Choisissez ses apparences, puis publiez la même sélection dans
            Personnaliser et sur /avatar.
          </p>
        </div>
        <a href="/avatar" target="_blank" rel="noreferrer">
          Voir la page publique ↗
        </a>
      </header>
      <div className="avatar-publication-summary">
        <span>
          <strong>{draft.groups.length}</strong> groupes HeyGen
        </span>
        <span>
          <strong>{selected.size}</strong> apparences
        </span>
        <span>
          <strong>{draft.groups.filter((group) => group.recommended).length}</strong> recommandés
        </span>
        <small>{dirty ? 'Modifications non publiées' : 'Sélection publiée'}</small>
      </div>
      <div className="avatar-publication-tabs" role="group" aria-label="Gestion de la sélection">
        <button
          type="button"
          aria-pressed={tab === 'selection'}
          onClick={() => {
            playback.stop();
            setTab('selection');
          }}
        >
          Ma sélection ({draft.groups.length})
        </button>
        <button
          type="button"
          aria-pressed={tab === 'catalogue'}
          onClick={() => {
            playback.stop();
            setTab('catalogue');
          }}
        >
          Catalogue HeyGen
        </button>
        <small>{data.catalogTotal} apparences synchronisées</small>
      </div>
      {conflict && (
        <p className="admin-error" role="alert">
          La sélection publiée a changé ailleurs. Votre brouillon est conservé. Rechargez la sélection publiée avant de
          la modifier à nouveau.
        </p>
      )}
      {groupNotice && (
        <p className="admin-notice" role="status">
          {groupNotice}
        </p>
      )}
      {groupBusy && (
        <p className="admin-notice" role="status">
          Préparation de toutes les apparences compatibles du groupe…
        </p>
      )}
      {error && (
        <p className="admin-error" role="alert">
          {error}{' '}
          <button type="button" onClick={() => setCatalogVersion((value) => value + 1)}>
            Réessayer
          </button>
        </p>
      )}
      {tab === 'selection' ? (
        <>
          <div className="avatar-publication-toolbar">
            <label>
              Présentateur par défaut
              <select
                aria-label="Présentateur par défaut de la sélection"
                value={draft.defaultLookId ?? ''}
                disabled={busy}
                onChange={(event) => update({ ...draft, defaultLookId: event.target.value || null })}
              >
                <option value="" disabled={draft.groups.length > 0}>
                  Aucun présentateur
                </option>
                {draft.groups.map((group) => (
                  <optgroup key={group.id} label={`${group.name} · ${group.lookIds.length} apparence(s)`}>
                    {group.lookIds.map((id) => (
                      <option key={id} value={id}>
                        {looks.get(id)?.name ?? id}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <button type="button" className="admin-button" onClick={() => setPreviewSelection((value) => !value)}>
              {previewSelection ? 'Fermer l’aperçu' : 'Prévisualiser la sélection'}
            </button>
            <button type="button" className="admin-button" onClick={() => setTab('catalogue')}>
              Ajouter des groupes
            </button>
          </div>
          <p className="admin-muted">
            Les tenues sont regroupées automatiquement par identité HeyGen. Ouvrez une fiche pour gérer ses variantes.
            Glissez les lignes pour définir leur ordre ; les favoris du client restent prioritaires.
          </p>
          {previewSelection && (
            <div role="group" className="avatar-publication-preview" aria-label="Aperçu de la sélection à publier">
              {draft.groups.map((group) => {
                const look = looks.get(group.lookIds[0]);
                return (
                  <div key={group.id}>
                    {look && <AvatarPortrait look={look} />}
                    <strong>{group.name}</strong>
                    <small>{group.lookIds.length} apparence(s)</small>
                  </div>
                );
              })}
            </div>
          )}
          <ol className="avatar-admin-selected-groups">
            {draft.groups.map((group, index) => {
              const entries = group.lookIds.flatMap((id) => (looks.has(id) ? [looks.get(id)!] : [])),
                presenter = { ...group, looks: entries, total: group.lookIds.length };
              return (
                <li
                  key={group.id}
                  draggable={!busy}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', group.id);
                    setDrag(group.id);
                  }}
                  onDragEnd={() => setDrag(null)}
                  onDragOver={(event) => {
                    if (drag) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (drag) move(drag, index);
                    setDrag(null);
                  }}
                  className={drag === group.id ? 'is-dragging' : undefined}
                >
                  {entries.length > 0 ? (
                    <AvatarPresenterCard
                      presenter={presenter}
                      busy={busy}
                      onOpen={open}
                      playback={playback}
                      onAddGroup={(entry) => void addGroup(entry)}
                      groupActionLabel="Compléter le groupe"
                    />
                  ) : (
                    <div className="admin-notice">
                      {group.name} · Les apparences de ce groupe sont actuellement indisponibles.
                    </div>
                  )}
                  <div className="avatar-admin-group-controls">
                    <label>
                      Nom affiché
                      <input
                        aria-label={`Nom affiché du présentateur ${index + 1}`}
                        maxLength={100}
                        value={group.name}
                        disabled={busy}
                        onChange={(event) =>
                          update({
                            ...draft,
                            groups: draft.groups.map((item) =>
                              item.id === group.id ? { ...item, name: event.target.value } : item,
                            ),
                          })
                        }
                      />
                    </label>
                    <small className="avatar-admin-provider-id" title={group.id}>
                      ID HeyGen : {group.id}
                    </small>
                    <button
                      type="button"
                      className="avatar-publication-recommend"
                      aria-pressed={group.recommended}
                      disabled={busy}
                      onClick={() =>
                        update({
                          ...draft,
                          groups: draft.groups.map((item) =>
                            item.id === group.id ? { ...item, recommended: !item.recommended } : item,
                          ),
                        })
                      }
                    >
                      <HomeIcon name="sparkle" size={15} />
                      {group.recommended ? 'Recommandé' : 'Recommander'}
                    </button>
                    <div className="avatar-admin-group-order">
                      <span>
                        {index + 1} / {draft.groups.length}
                      </span>
                      <button
                        type="button"
                        aria-label={`Monter ${group.name}`}
                        disabled={busy || index === 0}
                        onClick={() => move(group.id, index - 1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Descendre ${group.name}`}
                        disabled={busy || index === draft.groups.length - 1}
                        onClick={() => move(group.id, index + 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        aria-label={`Retirer le groupe ${group.name}`}
                        disabled={busy}
                        onClick={() => remove([group.id])}
                      >
                        <HomeIcon name="close" size={15} />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {!draft.groups.length && (
            <p className="admin-notice">
              Votre sélection est vide. Ajoutez un groupe entier depuis le catalogue ou choisissez ses apparences.
            </p>
          )}
        </>
      ) : (
        <>
          <div className="avatar-publication-toolbar avatar-publication-filters">
            <input
              type="search"
              aria-label="Rechercher dans le catalogue HeyGen"
              placeholder="Prénom ou tenue…"
              maxLength={100}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select
              aria-label="Genre dans le catalogue"
              value={gender}
              onChange={(event) => setGender(event.target.value)}
            >
              <option value="all">Tous les profils</option>
              <option value="female">Présentatrices</option>
              <option value="male">Présentateurs</option>
              <option value="unknown">Non renseigné</option>
            </select>
            <select aria-label="Type dans le catalogue" value={type} onChange={(event) => setType(event.target.value)}>
              <option value="all">Tous les types</option>
              <option value="studio_avatar">Studio</option>
              <option value="photo_avatar">Photo</option>
              <option value="digital_twin">Vidéo</option>
            </select>
            <select
              aria-label="Disponibilité du catalogue"
              value={availability}
              onChange={(event) => setAvailability(event.target.value)}
            >
              <option value="all">Tous les états</option>
              <option value="available">Activés techniquement</option>
              <option value="unavailable">Non activés / incompatibles</option>
            </select>
          </div>
          <p className="admin-muted" role="status">
            {pending
              ? 'Chargement…'
              : `${page?.total ?? 0} groupes HeyGen · Ouvrez une fiche pour sélectionner ses apparences.`}
          </p>
          <div className="avatar-selection-grid avatar-admin-catalogue" aria-busy={pending}>
            {avatarPresenters(page?.looks ?? []).map((presenter) => (
              <AvatarPresenterCard
                key={presenter.id}
                presenter={presenter}
                busy={busy || pending}
                onOpen={open}
                playback={playback}
                onAddGroup={(entry) => void addGroup(entry)}
                groupActionLabel={
                  draft.groups.some((group) => group.id === presenter.id)
                    ? 'Compléter le groupe'
                    : 'Ajouter le groupe entier'
                }
              />
            ))}
          </div>
          <div className="avatar-publication-pagination">
            <button
              type="button"
              className="admin-button"
              disabled={pending || offset === 0}
              onClick={() => setOffset((value) => Math.max(0, value - 32))}
            >
              Précédents
            </button>
            <span>
              {page?.total
                ? `${offset + 1}–${Math.min(offset + 32, page.total)} sur ${page.total} groupes`
                : 'Aucun résultat'}
            </span>
            <button
              type="button"
              className="admin-button"
              disabled={pending || !page?.hasMore}
              onClick={() => setOffset((value) => value + 32)}
            >
              Suivants
            </button>
          </div>
        </>
      )}
      <div className="avatar-publication-save">
        <p>
          <strong>{dirty ? 'Votre sélection comporte des modifications.' : 'Votre sélection est publiée.'}</strong>
          <span>Les changements de sélection conservent les vidéos et les choix déjà enregistrés.</span>
        </p>
        <button
          type="button"
          className="admin-button"
          disabled={busy || (!dirty && !conflict)}
          onClick={() => {
            setDraft(data.publication);
            setBase(data.publicationRevision);
            setError('');
          }}
        >
          Reprendre la sélection publiée
        </button>
        <button
          type="button"
          className="admin-button admin-button-dark"
          disabled={busy || !dirty || conflict || !AvatarPublication.safeParse(draft).success}
          onClick={() => void publish()}
        >
          {busy ? 'Publication…' : 'Publier la sélection'}
        </button>
      </div>
      {group && (
        <AvatarVariantsDialog
          key={group.id}
          presenter={group}
          remote="admin"
          selectedIds={selected}
          allowPremium={data.settings.allowPremium}
          busy={busy}
          onClose={() => setGroup(null)}
          onChoose={choose}
          onAddGroup={() => addGroup(group)}
          onAvailability={(look, enabled) => changeLook(look, enabled)}
          onTransparency={(look, value) =>
            changeLook(look, look.enabled, value === 'auto' ? undefined : value, value === 'supported')
          }
        />
      )}
    </section>
  );
}
