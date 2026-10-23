'use client';
import { useEffect, useState } from 'react';
import { readPreferences, patchPreferences } from './admin-workspace-client';

const groups = [
  { name: 'Pilotage', ids: ['overview', 'performance', 'incidents', 'retention'] },
  { name: 'Production', ids: ['videos', 'imports', 'ai-quality'] },
  { name: 'Clients & support', ids: ['agencies', 'users', 'reports', 'mailbox'] },
  { name: 'Finances', ids: ['subscriptions', 'quotas', 'commercial', 'finance', 'costs', 'pricing', 'promotions'] },
  { name: 'Contenus & acquisition', ids: ['homepage', 'avatars', 'voices', 'music', 'traffic', 'seo'] },
  { name: 'Service & configuration', ids: ['providers', 'system', 'changes', 'audit'] },
];
export function AdminNavigation<T extends string>({
  tabs,
  view,
  choose,
  accountId,
}: {
  tabs: { id: T; label: string }[];
  view: T;
  choose: (view: T) => void;
  accountId: string | null;
}) {
  const [favorites, setFavorites] = useState<string[]>([]),
    [ready, setReady] = useState(false),
    [search, setSearch] = useState('');
  useEffect(() => {
    if (!accountId) return;
    let live = true;
    setReady(false);
    void readPreferences()
      .then((d) => {
        if (!live) return;
        let legacy: string[] = [];
        try {
          const raw = JSON.parse(localStorage.getItem('bv:admin:favorites:' + accountId) ?? '[]');
          if (Array.isArray(raw)) legacy = raw.filter((v) => typeof v === 'string' && tabs.some((t) => t.id === v));
        } catch {}
        const ids = d?.value.favorites ?? legacy;
        if (!d && legacy.length)
          void patchPreferences((p) => ({ ...p, favorites: p.favorites.length ? p.favorites : legacy })).catch(() =>
            window.dispatchEvent(new CustomEvent('bienvu:admin-sync-error')),
          );
        setFavorites(ids.filter((id) => tabs.some((t) => t.id === id)));
        setReady(true);
      })
      .catch(() => {
        if (!live) return;
        try {
          const v = JSON.parse(localStorage.getItem('bv:admin:favorites:' + accountId) ?? '[]');
          if (Array.isArray(v)) setFavorites(v.filter((id) => typeof id === 'string' && tabs.some((t) => t.id === id)));
        } catch {}
        setReady(true);
      });
    return () => {
      live = false;
    };
  }, [accountId, tabs]);
  function toggle(id: T) {
    const next = favorites.includes(id) ? favorites.filter((v) => v !== id) : [...favorites, id];
    const adding = !favorites.includes(id);
    setFavorites(next);
    setReady(false);
    try {
      if (accountId) localStorage.setItem('bv:admin:favorites:' + accountId, JSON.stringify(next));
    } catch {}
    void patchPreferences((p) => ({
      ...p,
      favorites: adding ? [...new Set([...p.favorites, id])] : p.favorites.filter((v) => v !== id),
    }))
      .then((d) => setFavorites(d.value.favorites.filter((id) => tabs.some((t) => t.id === id))))
      .catch(() => {
        window.dispatchEvent(new CustomEvent('bienvu:admin-sync-error'));
      })
      .finally(() => setReady(true));
  }
  const matches = (id: string) =>
    tabs.some((t) => t.id === id && t.label.toLocaleLowerCase('fr').includes(search.toLocaleLowerCase('fr')));
  const item = (id: string) => {
    const t = tabs.find((t) => t.id === id);
    if (!t || !matches(id)) return null;
    return (
      <div className="admin-nav-item" key={id}>
        <button
          type="button"
          aria-current={view === id ? 'page' : undefined}
          onClick={() => {
            choose(t.id);
            setSearch('');
          }}
        >
          {t.label}
        </button>
        <button
          type="button"
          className="admin-nav-star"
          disabled={!ready}
          aria-pressed={favorites.includes(id)}
          aria-label={(favorites.includes(id) ? 'Retirer des favoris : ' : 'Ajouter aux favoris : ') + t.label}
          onClick={() => toggle(t.id)}
        >
          {favorites.includes(id) ? '★' : '☆'}
        </button>
      </div>
    );
  };
  return (
    <nav className="admin-navigation" aria-label="Rubriques d’administration">
      <label className="admin-nav-search">
        <span className="sr-only">Trouver une rubrique</span>
        <input
          type="search"
          placeholder="Trouver une rubrique…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {!!favorites.filter(matches).length && (
        <section>
          <h2>Vos favoris</h2>
          <div>{favorites.map(item)}</div>
        </section>
      )}
      <div className="admin-nav-groups">
        {groups
          .filter((g) => g.ids.some(matches))
          .map((group) => (
            <details key={group.name} open={search !== '' || group.ids.includes(view)}>
              <summary>
                {group.name}
                <span>{group.ids.filter(matches).length}</span>
              </summary>
              <div>{group.ids.map(item)}</div>
            </details>
          ))}
      </div>
      {!tabs.some((t) => matches(t.id)) && <p>Aucune rubrique trouvée.</p>}
    </nav>
  );
}
