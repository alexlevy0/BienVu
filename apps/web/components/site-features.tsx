'use client';
import { createContext, startTransition, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_SITE_FEATURES, PublicSiteFeatures, type SiteFeatures } from '@bienvu/contracts';

const Context = createContext<SiteFeatures>(DEFAULT_SITE_FEATURES);
export const siteFeaturesChanged = 'bienvu:site-features-changed';
export function SiteFeaturesProvider({ children, initial }: { children: ReactNode; initial?: PublicSiteFeatures }) {
  const [state, setState] = useState<PublicSiteFeatures>(initial ?? { revision: 1, features: DEFAULT_SITE_FEATURES });
  useEffect(() => {
    const controller = new AbortController();
    let pending = false,
      lastRead = 0;
    const accept = (value: unknown) => {
      const parsed = PublicSiteFeatures.safeParse(value);
      if (parsed.success)
        startTransition(() =>
          setState((current) => {
            if (parsed.data.revision < current.revision) return current;
            const same = JSON.stringify(parsed.data.features) === JSON.stringify(current.features);
            if (same && parsed.data.revision === current.revision) return current;
            return { ...parsed.data, features: same ? current.features : parsed.data.features };
          }),
        );
    };
    const read = async () => {
      if (pending || Date.now() - lastRead < 30_000) return;
      pending = true;
      lastRead = Date.now();
      try {
        const response = await fetch('/api/features', { cache: 'no-store', signal: controller.signal });
        if (response.ok && !controller.signal.aborted) accept(await response.json());
      } catch {
        /* Optional discovery stays hidden until a valid setting is available. */
      } finally {
        pending = false;
      }
    };
    const changed = (event: Event) => accept((event as CustomEvent).detail);
    const visible = () => {
      if (!document.hidden) void read();
    };
    void read();
    window.addEventListener(siteFeaturesChanged, changed);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', visible);
    return () => {
      controller.abort();
      window.removeEventListener(siteFeaturesChanged, changed);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('focus', visible);
    };
  }, []);
  return <Context.Provider value={state.features}>{children}</Context.Provider>;
}
export function useSiteFeatures() {
  return useContext(Context);
}
