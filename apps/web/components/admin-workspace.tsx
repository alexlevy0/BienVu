'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  AdminTask,
  WorkspaceDocument,
  ConfigurationKind,
  configurationHistory,
  workspaceRead,
  workspaceSearch,
} from '../lib/admin-workspace';
import type { adminCustomerHealth } from '../lib/admin-customer-health';
import { workspaceRequest, workspaceSave, patchPreferences, readPreferences } from './admin-workspace-client';
import {
  prepareBrowserNotifications,
  saveBrowserSubscription,
  notificationCapability,
} from '../lib/browser-notification-client';
import { OpsCard, OpsBadge, OpsForm, adminDate, adminVideoHref, adminAgencyHref } from './admin-operations';

type Overview = Extract<Awaited<ReturnType<typeof workspaceRead>>, { tasks: unknown }>;
type Target = { targetKind: AdminTask['targetKind']; target: string; title?: string };
export function useWorkspace<T>(section: string, params: Record<string, string> = {}, interval = 0) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(true),
    [tick, setTick] = useState(0);
  const key = JSON.stringify(params),
    lastKey = useRef('');
  useEffect(() => {
    const c = new AbortController();
    setBusy(true);
    setError('');
    if (lastKey.current !== section + key) {
      lastKey.current = section + key;
      setData(null);
    }
    void workspaceRequest<T>(section, JSON.parse(key), c.signal)
      .then(setData)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [section, key, tick]);
  useEffect(() => {
    if (!interval) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') setTick((v) => v + 1);
    }, interval);
    return () => clearInterval(t);
  }, [interval]);
  return { data, error, busy, refresh: () => setTick((v) => v + 1) };
}
export function AdminCommandSearch() {
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null),
    [query, setQuery] = useState(''),
    [items, setItems] = useState<Awaited<ReturnType<typeof workspaceSearch>>>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(0);
  const open = useCallback(() => {
    dialog.current?.showModal();
    input.current?.focus();
  }, []);
  useEffect(() => {
    if (items[selected])
      document.getElementById('admin-search-result-' + selected)?.scrollIntoView({ block: 'nearest' });
  }, [selected, items]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (dialog.current?.open) dialog.current.close();
        else open();
      }
    }
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [open]);
  useEffect(() => {
    setItems([]);
    setSelected(0);
    setError('');
    if (query.trim().length < 2) {
      setBusy(false);
      return;
    }
    const c = new AbortController();
    setBusy(true);
    const timer = setTimeout(() => {
      void workspaceRequest<{ items: Awaited<ReturnType<typeof workspaceSearch>> }>(
        'search',
        { q: query.trim() },
        c.signal,
      )
        .then((r) => setItems(r.items))
        .catch((e) => {
          if (!c.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!c.signal.aborted) setBusy(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [query]);
  return (
    <>
      <button type="button" className="admin-command-trigger" onClick={open}>
        <span>⌕ Rechercher une vidéo, une agence, un compte…</span>
        <kbd>⌘ K</kbd>
      </button>
      {/** biome-ignore lint/a11y/useKeyWithClickEvents: Native dialog keyboard handling and close buttons provide dismissal; this handler only handles backdrop clicks. */}
      <dialog
        ref={dialog}
        className="admin-command-dialog"
        aria-labelledby="admin-command-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
        onClose={() => {
          setQuery('');
          setItems([]);
        }}
      >
        <div className="admin-command-heading">
          <h2 id="admin-command-title">Retrouver un dossier</h2>
          <button
            className="admin-close"
            type="button"
            aria-label="Fermer la recherche"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </div>
        <label className="sr-only" htmlFor="admin-command-input">
          Nom, email ou identifiant
        </label>
        <input
          id="admin-command-input"
          ref={input}
          type="search"
          value={query}
          maxLength={100}
          placeholder="Nom, e-mail ou identifiant de vidéo…"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={items.length > 0}
          aria-activedescendant={items[selected] ? 'admin-search-result-' + selected : undefined}
          aria-controls="admin-command-results"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSelected((v) => Math.min(v + 1, items.length - 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSelected((v) => Math.max(0, v - 1));
            }
            if (e.key === 'Enter' && items[selected]) location.assign(items[selected].href);
          }}
        />
        <p className="admin-muted" role="status">
          {error ||
            (busy
              ? 'Recherche…'
              : query.trim().length < 2
                ? 'Saisissez au moins deux caractères.'
                : items.length
                  ? `${items.length} résultat(s) · ↑ ↓ pour parcourir · Entrée pour ouvrir`
                  : 'Aucun dossier trouvé.')}
        </p>
        <div id="admin-command-results" role="listbox" aria-label="Résultats de recherche">
          {items.map((r, i) => (
            <a
              id={'admin-search-result-' + i}
              role="option"
              aria-selected={i === selected}
              key={r.kind + r.id}
              className={'admin-command-result' + (i === selected ? ' is-active' : '')}
              href={r.href}
              onFocus={() => setSelected(i)}
            >
              <span>
                <strong>{r.title}</strong>
                <small>{r.subtitle}</small>
              </span>
              <span>
                {
                  (
                    { video: 'Vidéo', agency: 'Agence', user: 'Compte', report: 'Signalement' } as Record<
                      string,
                      string
                    >
                  )[r.kind]
                }{' '}
                →
              </span>
            </a>
          ))}
        </div>
      </dialog>
    </>
  );
}
export function AdminSyncStatus() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const f = () => setFailed(true);
    window.addEventListener('bienvu:admin-sync-error', f);
    return () => window.removeEventListener('bienvu:admin-sync-error', f);
  }, []);
  return failed ? (
    <p className="admin-error" role="status">
      La synchronisation des dernières préférences a été interrompue. Les filtres et favoris gardent une copie sur ce
      navigateur.
    </p>
  ) : null;
}
export function AdminAlertPreference() {
  const [enabled, setEnabled] = useState<boolean | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void readPreferences()
      .then((d) => {
        if (live) setEnabled(d?.value.alerts ?? false);
      })
      .catch(() => {
        if (live) setError('Préférence de notification indisponible.');
      });
    return () => {
      live = false;
    };
  }, []);
  async function toggle() {
    setBusy(true);
    setError('');
    try {
      if (!enabled) {
        if (notificationCapability() !== 'supported')
          throw Error('Activez ces notifications depuis un navigateur compatible.');
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') throw Error('Autorisez les notifications dans votre navigateur.');
        const { registration, applicationKey } = await prepareBrowserNotifications();
        const subscription =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey }));
        await saveBrowserSubscription(subscription, { watchPending: false });
      }
      const next = !enabled;
      await patchPreferences((p) => ({ ...p, alerts: next }));
      setEnabled(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Activation interrompue.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-alert-preference">
      <button
        type="button"
        className="admin-button"
        disabled={busy || enabled === null}
        aria-pressed={enabled ?? false}
        onClick={() => void toggle()}
      >
        {busy ? 'Activation…' : enabled ? 'Notifications admin activées ✓' : 'Activer les alertes navigateur'}
      </button>
      {error && (
        <small role="alert" className="admin-error">
          {error}
        </small>
      )}
    </div>
  );
}
function taskHref(t: AdminTask, restricted = false) {
  if (restricted)
    return (
      '/admin?view=' +
      (t.targetKind === 'agency' ? 'agencies' : 'videos') +
      (t.targetKind === 'incident' ? '&status=failed' : '&q=' + encodeURIComponent(t.target))
    );
  return t.targetKind === 'video'
    ? adminVideoHref(t.target)
    : t.targetKind === 'agency'
      ? adminAgencyHref(t.target)
      : '/admin?view=incidents';
}
const taskLabels = {
  open: 'À traiter',
  doing: 'En cours',
  done: 'Terminé',
  normal: 'Normale',
  high: 'Haute',
  urgent: 'Urgente',
};
export function CreateAdminTask({
  target,
  children = 'Créer un dossier de suivi',
}: {
  target: Target;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className="admin-button"
      onClick={() => window.dispatchEvent(new CustomEvent('bienvu:admin-task', { detail: target }))}
    >
      {children}
    </button>
  );
}
export function AdminWorkspaceBoard({
  target,
  showAlerts = true,
  compact = false,
  restricted = false,
}: {
  target?: Target;
  showAlerts?: boolean;
  compact?: boolean;
  restricted?: boolean;
}) {
  const { data, error, refresh } = useWorkspace<Overview>('overview', {}, 60000),
    [mine, setMine] = useState(false),
    [showDone, setShowDone] = useState(false),
    [showSnoozed, setShowSnoozed] = useState(false),
    [editing, setEditing] = useState<WorkspaceDocument<AdminTask> | null>(null),
    [draft, setDraft] = useState<Target | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    function open(e: Event) {
      setEditing(null);
      setDraft((e as CustomEvent<Target>).detail);
      dialog.current?.showModal();
    }
    window.addEventListener('bienvu:admin-task', open);
    return () => window.removeEventListener('bienvu:admin-task', open);
  }, []);
  const visible = (data?.tasks ?? [])
    .filter(
      (d) =>
        (!target || (d.value.target === target.target && d.value.targetKind === target.targetKind)) &&
        (!mine || d.value.assignee === data?.actorId) &&
        (showDone || d.value.status !== 'done') &&
        (showSnoozed || !d.value.snoozedUntil || Date.parse(d.value.snoozedUntil) <= Date.now()),
    )
    .sort(
      (a, b) =>
        ({ urgent: 0, high: 1, normal: 2 })[a.value.priority] - { urgent: 0, high: 1, normal: 2 }[b.value.priority] ||
        (a.value.due ?? '9999').localeCompare(b.value.due ?? '9999'),
    );
  return (
    <div className="admin-workspace-board">
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      <div className={showAlerts ? 'ops-grid' : ''}>
        <OpsCard
          title={target ? 'Suivi de ce dossier' : 'Dossiers de suivi'}
          note="Responsable, priorité et échéance. Le report masque temporairement un dossier sans le clôturer."
        >
          <div className="admin-workspace-tools">
            <label>
              <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Mes dossiers
            </label>
            <label>
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Terminés
            </label>
            <label>
              <input type="checkbox" checked={showSnoozed} onChange={(e) => setShowSnoozed(e.target.checked)} />{' '}
              Reportés
            </label>
            <button
              className="admin-button"
              type="button"
              disabled={!data}
              onClick={() => {
                setEditing(null);
                setDraft(target ?? { targetKind: 'video', target: '' });
                dialog.current?.showModal();
              }}
            >
              Nouveau dossier
            </button>
          </div>
          {!data && !error && <p role="status">Chargement du suivi…</p>}
          {data && !visible.length && <p>Aucun dossier pour ces critères.</p>}
          {visible.slice(0, compact ? 5 : 100).map((d) => (
            <article key={d.key} className="admin-task-row">
              <div>
                <a href={taskHref(d.value, restricted)}>
                  <strong>{d.value.title}</strong>
                </a>
                <small>
                  {d.value.assignee
                    ? (data?.people.find((p) => p.id === d.value.assignee)?.name ?? 'Ancien responsable')
                    : 'Non attribué'}{' '}
                  · {taskLabels[d.value.status]} · priorité {taskLabels[d.value.priority].toLowerCase()}
                </small>
                {d.value.due && (
                  <small
                    className={
                      d.value.status !== 'done' && d.value.due < new Date().toISOString().slice(0, 10)
                        ? 'admin-error'
                        : ''
                    }
                  >
                    Échéance : {new Date(d.value.due + 'T12:00:00').toLocaleDateString('fr-FR')}
                  </small>
                )}
                {d.value.snoozedUntil && <small>Reporté jusqu’au {adminDate(d.value.snoozedUntil)}</small>}
                {d.value.note && <p>{d.value.note}</p>}
              </div>
              <button
                type="button"
                className="admin-row-button"
                onClick={() => {
                  setEditing(d);
                  setDraft({ target: d.value.target, targetKind: d.value.targetKind });
                  dialog.current?.showModal();
                }}
              >
                Modifier →
              </button>
            </article>
          ))}
          {data && (
            <p className="admin-muted">
              {visible.length} dossier(s) correspondant(s) parmi les {data.tasks.length} dossiers chargés, avec priorité
              aux suivis ouverts. Actualisation toutes les minutes.
            </p>
          )}
        </OpsCard>
        {showAlerts && (
          <OpsCard
            title="Alertes du service"
            note="Détection automatique chaque minute. Une alerte reste regroupée jusqu’à sa résolution."
          >
            {data?.alerts.length ? (
              data.alerts.slice(0, compact ? 5 : 30).map((a) => (
                <a className="ops-action" key={a.id} href={a.href}>
                  <span>
                    <strong>{a.title}</strong>
                    <small>{a.body}</small>
                    <small>{adminDate(a.at)}</small>
                  </span>
                  <OpsBadge value={a.resolvedAt ? 'resolved' : 'open'} />
                </a>
              ))
            ) : (
              <p>Aucune alerte enregistrée.</p>
            )}
            <AdminAlertPreference />
          </OpsCard>
        )}
      </div>
      <dialog ref={dialog} className="admin-task-dialog" aria-labelledby="admin-task-title">
        <div className="admin-command-heading">
          <h2 id="admin-task-title">{editing ? 'Modifier le suivi' : 'Nouveau dossier'}</h2>
          <button
            className="admin-close"
            aria-label="Fermer le dossier"
            type="button"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </div>
        {draft && data && (
          <TaskForm
            key={(editing?.key ?? 'new') + ':' + (editing?.revision ?? 0) + ':' + draft.target}
            target={draft}
            entry={editing}
            people={data.people}
            onSaved={() => {
              dialog.current?.close();
              setDraft(null);
              refresh();
            }}
          />
        )}
      </dialog>
    </div>
  );
}
function TaskForm({
  target,
  entry,
  people,
  onSaved,
}: {
  target: Target;
  entry: WorkspaceDocument<AdminTask> | null;
  people: Overview['people'];
  onSaved: () => void;
}) {
  const t = entry?.value;
  return (
    <OpsForm
      button="Enregistrer le suivi"
      onSave={async (f) => {
        const snooze = String(f.get('snooze'));
        await workspaceSave({
          action: 'task',
          id: entry?.key.slice(5) ?? crypto.randomUUID(),
          revision: entry?.revision ?? 0,
          value: {
            title: String(f.get('title')),
            targetKind: String(f.get('kind')),
            target: String(f.get('target')),
            assignee: String(f.get('assignee')) || null,
            priority: String(f.get('priority')),
            status: String(f.get('status')),
            due: String(f.get('due')) || null,
            snoozedUntil:
              snooze === 'keep'
                ? (t?.snoozedUntil ?? null)
                : snooze === '0'
                  ? null
                  : new Date(Date.now() + Number(snooze) * 86400000).toISOString(),
            note: String(f.get('note')),
          },
        });
        onSaved();
      }}
    >
      <label>
        Objet
        <input
          name="title"
          required
          minLength={3}
          maxLength={150}
          defaultValue={t?.title ?? target.title ?? ''}
          placeholder="Ex. Vérifier les animations manquantes"
        />
      </label>
      <div className="admin-workspace-fields">
        <label>
          Type
          <select name="kind" defaultValue={target.targetKind}>
            <option value="video">Vidéo</option>
            <option value="agency">Agence</option>
            <option value="incident">Incident</option>
          </select>
        </label>
        <label>
          Identifiant
          <input name="target" required maxLength={200} defaultValue={target.target} />
        </label>
      </div>
      <div className="admin-workspace-fields">
        <label>
          Responsable
          <select name="assignee" defaultValue={t?.assignee ?? ''}>
            <option value="">Non attribué</option>
            {people.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name} · {p.email}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priorité
          <select name="priority" defaultValue={t?.priority ?? 'normal'}>
            {(['normal', 'high', 'urgent'] as const).map((v) => (
              <option value={v} key={v}>
                {taskLabels[v]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="admin-workspace-fields">
        <label>
          État
          <select name="status" defaultValue={t?.status ?? 'open'}>
            {(['open', 'doing', 'done'] as const).map((v) => (
              <option value={v} key={v}>
                {taskLabels[v]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Échéance
          <input type="date" name="due" defaultValue={t?.due ?? ''} />
        </label>
        <label>
          Reporter
          <select name="snooze" defaultValue={t?.snoozedUntil ? 'keep' : '0'}>
            {t?.snoozedUntil && <option value="keep">Conserver le report</option>}
            <option value="0">Visible maintenant</option>
            <option value="1">Demain</option>
            <option value="3">Dans 3 jours</option>
            <option value="7">Dans une semaine</option>
          </select>
        </label>
      </div>
      <label>
        Contexte
        <textarea name="note" rows={3} maxLength={1500} defaultValue={t?.note ?? ''} />
      </label>
    </OpsForm>
  );
}
export function AdminAlertRules() {
  const { data, error, refresh } = useWorkspace<Overview>('overview');
  const defaults = {
    enabled: true,
    stallMinutes: 20,
    failurePercent: 30,
    minimumJobs: 5,
    runwayCredits: 100,
    cooldownMinutes: 60,
  };
  const r = data?.rules?.value ?? defaults;
  return (
    <OpsCard title="Règles d’alerte">
      <details className="ops-details">
        <summary>Configurer les seuils et les notifications</summary>
        {error && (
          <p role="alert" className="admin-error">
            {error}
          </p>
        )}
        {data && (
          <OpsForm
            key={data.rules?.revision ?? 0}
            onSave={async (f) => {
              const value = {
                enabled: f.get('enabled') === 'on',
                stallMinutes: Number(f.get('stallMinutes')),
                failurePercent: Number(f.get('failurePercent')),
                minimumJobs: Number(f.get('minimumJobs')),
                runwayCredits: Number(f.get('runwayCredits')),
                cooldownMinutes: Number(f.get('cooldownMinutes')),
              };
              await workspaceSave({ action: 'rules', revision: data.rules?.revision ?? 0, value });
              refresh();
            }}
          >
            <label className="admin-check">
              <input type="checkbox" name="enabled" defaultChecked={r.enabled} /> Activer la détection
            </label>
            <div className="admin-workspace-fields">
              {[
                ['stallMinutes', 'Attente / immobilité (minutes)', 5, 120],
                ['failurePercent', 'Seuil d’échec (%)', 5, 100],
                ['minimumJobs', 'Minimum de vidéos terminées sur 30 min', 3, 100],
                ['runwayCredits', 'Seuil Runway (crédits API)', 0, 100000],
                ['cooldownMinutes', 'Délai entre notifications similaires (minutes)', 15, 1440],
              ].map(([key, label, min, max]) => (
                <label key={String(key)}>
                  {label}
                  <input
                    type="number"
                    name={String(key)}
                    min={Number(min)}
                    max={Number(max)}
                    required
                    defaultValue={r[key as keyof typeof r] as number}
                  />
                </label>
              ))}
            </div>
          </OpsForm>
        )}
        <p className="admin-muted">
          Les alertes restent visibles dans le panel. Les notifications nécessitent l’activation personnelle sur un
          navigateur compatible ; leur acceptation par le service push ne garantit pas leur affichage par le système.
        </p>
      </details>
    </OpsCard>
  );
}
export function AdminAudience({ id }: { id: string }) {
  type Data = { document: WorkspaceDocument<{ audience: 'client' | 'internal' | 'demo'; reason: string }> | null };
  const { data, error, refresh } = useWorkspace<Data>('audience', { id });
  const [notice, setNotice] = useState('');
  return (
    <OpsCard
      title="Classification du compte"
      note="Les comptes internes et les démonstrations sont exclus du filtre « Clients ». Les comptes administrateurs configurés sont automatiquement internes."
    >
      {error && <p className="admin-error">{error}</p>}
      {notice && (
        <p role="status" className="admin-notice">
          {notice}
        </p>
      )}
      {data && (
        <OpsForm
          key={data.document?.revision ?? 0}
          onSave={async (f) => {
            await workspaceSave({
              action: 'audience',
              id,
              revision: data.document?.revision ?? 0,
              value: { audience: String(f.get('audience')), reason: String(f.get('reason')) },
            });
            refresh();
            setNotice(
              'Classification enregistrée. Les indicateurs utiliseront cette classification à leur prochaine lecture.',
            );
          }}
        >
          <label>
            Usage du compte
            <select name="audience" defaultValue={data.document?.value.audience ?? 'client'}>
              <option value="client">Client</option>
              <option value="internal">Interne / tests</option>
              <option value="demo">Démonstration</option>
            </select>
          </label>
          <label>
            Motif
            <input
              name="reason"
              required
              minLength={5}
              maxLength={500}
              placeholder="Ex. Compte de démonstration commerciale"
            />
          </label>
        </OpsForm>
      )}
      {data?.document && (
        <small>
          Dernière décision : {data.document.value.reason} · {data.document.actor}
        </small>
      )}
    </OpsCard>
  );
}
export function AdminConfigurationVersions() {
  type Data = Awaited<ReturnType<typeof configurationHistory>>;
  const [kind, setKind] = useState<ConfigurationKind>('features'),
    [selected, setSelected] = useState(''),
    [notice, setNotice] = useState('');
  const { data, error, refresh } = useWorkspace<Data>('configuration', { kind });
  const version = data?.history.find((h) => h.id === selected);
  const diffs =
    version && data
      ? Object.keys({ ...data.current.value, ...version.value }).filter(
          (k) =>
            JSON.stringify(data.current.value[k as keyof typeof data.current.value]) !==
            JSON.stringify(version.value[k]),
        )
      : [];
  return (
    <OpsCard
      title="Versions des configurations"
      note="La restauration crée une nouvelle version. Les vidéos et réglages déjà figés restent inchangés."
    >
      <div className="admin-workspace-fields">
        <label>
          Configuration
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as ConfigurationKind);
              setSelected('');
              setNotice('');
            }}
          >
            <option value="features">Fonctionnalités</option>
            <option value="queue">Capacités de génération</option>
            <option value="map">Carte par défaut</option>
            <option value="avatars">Avatars IA</option>
          </select>
        </label>
        <label>
          Version à examiner
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Choisir une version…</option>
            {data?.history.map((v) => (
              <option value={v.id} key={v.id}>
                {adminDate(v.at)} · {v.actor ?? 'Administrateur'}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="admin-notice">
          {notice}
        </p>
      )}
      {data && !data.history.length && <p>Aucune modification historique pour cette configuration.</p>}
      {version && data && (
        <>
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Réglage</th>
                  <th>Actuellement · v{data.current.revision}</th>
                  <th>Après restauration</th>
                </tr>
              </thead>
              <tbody>
                {diffs.map((k) => (
                  <tr key={k}>
                    <th scope="row">{configFieldLabel(k)}</th>
                    <td>{JSON.stringify(data.current.value[k as keyof typeof data.current.value]) ?? '—'}</td>
                    <td>{JSON.stringify(version.value[k]) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {diffs.length ? (
            <OpsForm
              button="Restaurer cette configuration"
              onSave={async (f) => {
                await workspaceSave({
                  action: 'restore',
                  kind,
                  eventId: version.id,
                  revision: data.current.revision,
                  reason: String(f.get('reason')),
                });
                setSelected('');
                refresh();
                setNotice('Nouvelle version enregistrée et restauration documentée dans le journal.');
              }}
            >
              <label>
                Motif de restauration
                <input name="reason" minLength={5} maxLength={500} required />
              </label>
              <p className="admin-muted">
                Ces valeurs s’appliqueront aux prochaines opérations. Les limites et la disponibilité sont revalidées au
                moment de l’enregistrement.
              </p>
            </OpsForm>
          ) : (
            <p>Cette version correspond déjà aux valeurs actuelles.</p>
          )}
        </>
      )}
    </OpsCard>
  );
}
function configFieldLabel(key: string) {
  return (
    (
      {
        explorer: 'Explorer',
        enabled: 'Activé',
        concurrent: 'Capacité simultanée',
        allowPremium: 'Avatars premium',
        defaultLookId: 'Avatar par défaut',
        maxSeconds: 'Durée maximale',
        monthlyUsd: 'Budget mensuel ($)',
        perVideoUsd: 'Plafond par vidéo ($)',
        preparationConcurrency: 'Préparations simultanées',
        perAgencyConcurrency: 'Simultanéité par agence',
        renderConcurrency: 'Assemblages simultanés',
        runwayConcurrency: 'Limite Runway',
        maxPending: 'File globale',
        maxPerAgency: 'File par agence',
        maxWaitMinutes: 'Attente maximale (minutes)',
      } as Record<string, string>
    )[key] ?? key
  );
}
export function AdminRecovery({ id }: { id: string }) {
  type Data = Extract<Awaited<ReturnType<typeof workspaceRead>>, { known: unknown }>;
  const { data, error, refresh } = useWorkspace<Data>('recovery', { id }, 15000);
  return (
    <OpsCard
      title="Récupération guidée"
      note="Vérifie les tâches existantes et récupère les clips disponibles. Les tâches connues sont réutilisées ; aucune deuxième animation IA n’est achetée."
    >
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      {data && (
        <>
          <p>
            {data.known.filter((t) => t.taskId).length} tâche(s) avec identifiant fournisseur ;{' '}
            {data.known.filter((t) => !t.taskId).length} résultat(s) de création sans identifiant vérifiable.
          </p>
          <p className="admin-muted">
            Une préparation encore active peut réutiliser les clips récupérés. Pour une vidéo déjà assemblée, les clips
            rejoignent la bibliothèque réutilisable : son fichier actuel reste inchangé. Une animation réellement
            échouée ou une sortie expirée ne peut pas être récupérée ainsi. Un lancement encore en attente reprend sa
            génération initiale, avec sa réservation existante.
          </p>
          {data.requests.some((r) => ['pending', 'working'].includes(r.state)) ? (
            <p role="status" className="admin-notice">
              Vérification en attente ou en cours. Le traitement reprend automatiquement côté serveur.
            </p>
          ) : !data.canRecover ? (
            <p>
              Aucune tâche existante récupérable pour cette vidéo. Les éléments sans identifiant fournisseur ne sont pas
              soumis à nouveau.
            </p>
          ) : (
            <OpsForm
              button="Vérifier et récupérer les éléments disponibles"
              onSave={async (f) => {
                await workspaceSave({ action: 'recover', id, reason: String(f.get('reason')) });
                refresh();
              }}
            >
              <label>
                Motif
                <input
                  name="reason"
                  required
                  minLength={5}
                  maxLength={1000}
                  placeholder="Ex. Retrouver les animations après un délai d’attente"
                />
              </label>
            </OpsForm>
          )}
          {data.requests.map((r) => (
            <article className="ops-note" key={r.id}>
              <OpsBadge value={r.state} />
              <small>
                {adminDate(r.at)} · {r.reason}
              </small>
              <p>{r.result?.message ?? 'Vérification programmée.'}</p>
            </article>
          ))}
        </>
      )}
    </OpsCard>
  );
}
export function AdminCustomerHealth() {
  const { data, error } = useWorkspace<Awaited<ReturnType<typeof adminCustomerHealth>>>('health');
  return (
    <OpsCard
      title="Agences à accompagner"
      note="Clients uniquement. Signaux explicables : au moins deux échecs sur 14 jours, aucune première vidéo après 3 jours, ou plus de 14 jours sans vidéo après au moins deux réussites. Ces signaux ne prédisent pas une résiliation."
    >
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Lecture des signaux…</p>}
      {data && !data.items.length && <p>Aucune agence ne correspond actuellement à ces signaux.</p>}
      {data?.items.map((a) => (
        <article className="admin-task-row" key={a.id}>
          <div>
            <a href={adminAgencyHref(a.id)}>
              <strong>{a.agency}</strong>
            </a>
            <small>{a.email}</small>
            <p>
              {a.signal === 'failures'
                ? `${a.failures} échecs sur les 14 derniers jours.`
                : a.signal === 'first_video'
                  ? `Inscription le ${adminDate(a.joinedAt)}, aucune vidéo prête.`
                  : `Dernière vidéo prête le ${adminDate(a.lastReady)} · ${a.ready} réussites.`}
            </p>
          </div>
          <CreateAdminTask target={{ targetKind: 'agency', target: a.id, title: 'Accompagner ' + a.agency }}>
            Préparer un suivi →
          </CreateAdminTask>
        </article>
      ))}
      {data && (
        <p className="admin-muted">Jusqu’à 100 agences prioritaires. Aucun message n’est envoyé automatiquement.</p>
      )}
    </OpsCard>
  );
}
