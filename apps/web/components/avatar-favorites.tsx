'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { runMotion } from '../lib/view-motion';
import { AvatarFavorites, AvatarFavoriteUpdate } from '@bienvu/contracts';

type FavoritesState = {
  authenticated: boolean;
  ids: string[];
  loading: boolean;
  ready: boolean;
  busy: ReadonlySet<string>;
  error: string;
  refresh(): void;
  toggle(id: string): Promise<void>;
};
const anonymous: FavoritesState = {
  authenticated: false,
  ids: [],
  loading: false,
  ready: false,
  busy: new Set(),
  error: '',
  refresh() {},
  async toggle() {},
};
const FavoritesContext = createContext<FavoritesState | null>(null);
type Snapshot = { owner: string; ids: string[]; ready: boolean; loading: boolean; busy: Set<string>; error: string };
const empty = (owner: string): Snapshot => ({
  owner,
  ids: [],
  ready: false,
  loading: true,
  busy: new Set(),
  error: '',
});

export function AvatarFavoritesProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
  const [state, setState] = useState<Snapshot>(() => empty(userId ?? ''));
  const owner = useRef(userId);
  owner.current = userId;
  const read = useRef<AbortController | null>(null),
    writes = useRef(new Map<string, AbortController>());
  const change = useCallback((id: string, update: (current: Snapshot) => Snapshot) => {
    if (owner.current === id) setState((current) => update(current.owner === id ? current : empty(id)));
  }, []);
  const refresh = useCallback(() => {
    if (!userId || writes.current.size) return;
    read.current?.abort();
    const controller = new AbortController();
    read.current = controller;
    change(userId, (current) => ({ ...current, loading: true, error: '' }));
    void fetch('/api/avatars/favorites', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw Error();
        const result = AvatarFavorites.parse(await response.json());
        if (!controller.signal.aborted)
          change(userId, (current) => ({ ...current, ids: result.ids, ready: true, loading: false }));
      })
      .catch(() => {
        if (!controller.signal.aborted)
          change(userId, (current) => ({
            ...current,
            loading: false,
            error: 'Vos favoris sont momentanément indisponibles. Réessayez.',
          }));
      });
  }, [userId, change]);
  useEffect(() => {
    setState(empty(userId ?? ''));
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      read.current?.abort();
      for (const controller of writes.current.values()) controller.abort();
      writes.current.clear();
      window.removeEventListener('focus', refresh);
    };
  }, [userId, refresh]);
  const visible = userId && state.owner === userId ? state : empty(userId ?? '');
  async function toggle(lookId: string) {
    if (!userId || !visible.ready || visible.loading || writes.current.has(lookId)) return;
    const favorite = !visible.ids.includes(lookId),
      controller = new AbortController();
    writes.current.set(lookId, controller);
    change(userId, (current) => ({ ...current, error: '', busy: new Set([...current.busy, lookId]) }));
    try {
      const response = await fetch('/api/avatars/favorites', {
        method: 'PUT',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lookId, favorite }),
      });
      if (!response.ok) throw Error();
      const result = AvatarFavoriteUpdate.parse(await response.json());
      if (result.lookId !== lookId || result.favorite !== favorite) throw Error();
      if (!controller.signal.aborted)
        runMotion('bv-list', () =>
          change(userId, (current) => ({
            ...current,
            ids: favorite ? [...new Set([...current.ids, lookId])] : current.ids.filter((id) => id !== lookId),
          })),
        );
    } catch {
      if (!controller.signal.aborted)
        change(userId, (current) => ({
          ...current,
          error: 'Ce favori n’a pas pu être enregistré. Réessayez ou actualisez vos favoris.',
        }));
    } finally {
      if (!controller.signal.aborted) {
        writes.current.delete(lookId);
        change(userId, (current) => ({ ...current, busy: new Set([...current.busy].filter((id) => id !== lookId)) }));
      }
    }
  }
  return (
    <FavoritesContext.Provider
      value={
        userId
          ? {
              authenticated: true,
              ids: visible.ids,
              loading: visible.loading,
              ready: visible.ready,
              busy: visible.busy,
              error: visible.error,
              refresh,
              toggle,
            }
          : anonymous
      }
    >
      {children}
    </FavoritesContext.Provider>
  );
}
export function useAvatarFavorites() {
  return useContext(FavoritesContext) ?? anonymous;
}
