'use client';
import { useEffect, useState } from 'react';
import type { WorkspaceDocument } from '../lib/admin-workspace';
import { workspaceRequest, workspaceSave, syncFilters } from './admin-workspace-client';

export type AdminListFilters = { q: string; status: string; from: string; to: string; agency: string };
const empty: AdminListFilters = { q: '', status: '', from: '', to: '', agency: '' };
const keys = Object.keys(empty) as (keyof AdminListFilters)[];
export function readAdminFilters(accountId: string, view: string, params?: URLSearchParams): AdminListFilters {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(localStorage.getItem('bv:admin:filters:' + accountId + ':' + view) ?? '{}');
  } catch {
    /* storage is optional */
  }
  if (params && keys.some((k) => params.has(k))) raw = Object.fromEntries(params);
  const out = { ...empty };
  for (const key of keys) {
    const v = raw?.[key];
    if (typeof v !== 'string') continue;
    if (key === 'q') out.q = v.slice(0, 100);
    else if (key === 'status' && /^[a-z_]{0,30}$/.test(v)) out.status = v;
    else if ((key === 'from' || key === 'to') && /^\d{4}-\d{2}-\d{2}$/.test(v)) out[key] = v;
    else if (key === 'agency' && /^[a-zA-Z0-9_-]{1,64}$/.test(v)) out.agency = v;
  }
  return out;
}
export function storeAdminFilters(accountId: string, view: string, filters: AdminListFilters) {
  syncFilters(accountId, view, filters);
  try {
    localStorage.setItem('bv:admin:filters:' + accountId + ':' + view, JSON.stringify(filters));
  } catch {
    /* storage is optional */
  }
}
type Saved = WorkspaceDocument<{ name: string; href: string; shared: boolean; deleted: boolean }>;
export function AdminSavedViews({ accountId, view }: { accountId: string; view: string }) {
  const [items, setItems] = useState<Saved[]>([]),
    [name, setName] = useState(''),
    [shared, setShared] = useState(false),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    void workspaceRequest<{ items: Saved[] }>('views', {}, c.signal)
      .then(async (r) => {
        if (c.signal.aborted) return;
        let legacy: unknown = [];
        try {
          legacy = JSON.parse(localStorage.getItem('bv:admin:views:' + accountId + ':' + view) ?? '[]');
        } catch {}
        if (Array.isArray(legacy)) {
          for (const item of legacy.slice(0, 12)) {
            if (
              !item ||
              typeof item.id !== 'string' ||
              !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) ||
              typeof item.name !== 'string' ||
              !item.filters ||
              r.items.some((d) => d.key === 'view:' + item.id)
            )
              continue;
            const p = new URLSearchParams({ view });
            for (const key of keys)
              if (typeof item.filters[key] === 'string' && item.filters[key]) p.set(key, item.filters[key]);
            await workspaceSave({
              action: 'view',
              id: item.id,
              revision: 0,
              value: { name: item.name.slice(0, 60), href: '/admin?' + p, shared: false, deleted: false },
            });
          }
          if (legacy.length) {
            r = await workspaceRequest<{ items: Saved[] }>('views', {}, c.signal);
            localStorage.removeItem('bv:admin:views:' + accountId + ':' + view);
          }
        }
        if (!c.signal.aborted) setItems(r.items);
      })
      .catch((e) => {
        if (!c.signal.aborted) setMessage(e.message);
      });
    return () => c.abort();
  }, [accountId, view, tick]);
  async function save() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await workspaceSave({
        action: 'view',
        id: crypto.randomUUID(),
        revision: 0,
        value: { name: name.trim(), href: location.pathname + location.search, shared, deleted: false },
      });
      setName('');
      setTick((n) => n + 1);
      setMessage(shared ? 'Vue partagée avec l’équipe.' : 'Vue enregistrée et synchronisée.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Enregistrement interrompu.');
    } finally {
      setBusy(false);
    }
  }
  async function remove(d: Saved) {
    setBusy(true);
    try {
      await workspaceSave({
        action: 'view',
        id: d.key.slice(5),
        revision: d.revision,
        value: { ...d.value, deleted: true },
      });
      setTick((v) => v + 1);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Suppression interrompue.');
    } finally {
      setBusy(false);
    }
  }
  const current = items.filter((i) => {
    try {
      return new URL(i.value.href, location.origin).searchParams.get('view') === view;
    } catch {
      return false;
    }
  });
  return (
    <div className="ops-saved">
      <div className="ops-saved-links">
        {view === 'videos' && (
          <a
            href={
              '/admin?view=videos&status=failed&from=' + new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)
            }
          >
            Échecs cette semaine
          </a>
        )}
        {current.map((item) => (
          <span key={item.key}>
            <a href={item.value.href}>
              {item.value.name}
              {item.value.shared ? ' · équipe' : ''}
            </a>
            {(!item.owner || item.owner === accountId) && (
              <button
                disabled={busy}
                type="button"
                aria-label={'Supprimer la vue ' + item.value.name}
                onClick={() => void remove(item)}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="sr-only" htmlFor="admin-saved-view-name">
          Nom de la vue
        </label>
        <input
          id="admin-saved-view-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          minLength={2}
          placeholder="Nom de cette vue…"
        />
        <label>
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Partager
        </label>
        <button className="admin-button" type="submit" disabled={busy || name.trim().length < 2}>
          Enregistrer la vue
        </button>
      </form>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
