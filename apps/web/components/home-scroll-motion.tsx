'use client';
import { useEffect, useRef, type RefObject } from 'react';

/** Optional decoration: first paint and a failed/delayed chunk stay fully readable. */
export function HomeScrollMotion({
  root,
  active,
  revision,
}: {
  root: RefObject<HTMLDivElement | null>;
  active: boolean;
  revision: boolean;
}) {
  const revealed = useRef(new WeakSet<HTMLElement>());
  useEffect(() => {
    const node = root.current;
    if (!active || !node || !window.IntersectionObserver || matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    let disposed = false,
      cleanup: (() => void) | undefined,
      styleLink: HTMLLinkElement | null = null;
    const load = () => {
      void import('../lib/home-scroll-motion')
        .then(({ mountHomeScrollMotion }) => {
          if (!disposed && node.isConnected) cleanup = mountHomeScrollMotion(node, revealed.current);
        })
        .catch(() => {
          /* Entrances are optional; never hide content before the module arrives. */
        });
    };
    const start = () => {
      styleLink = document.getElementById('bienvu-home-marketing-css') as HTMLLinkElement | null;
      if (styleLink && !styleLink.sheet) styleLink.addEventListener('load', load, { once: true });
      else load();
    };
    const idle =
      typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(start, { timeout: 1500 }) : null;
    const timer = idle === null ? window.setTimeout(start, 180) : null;
    return () => {
      disposed = true;
      if (idle !== null) window.cancelIdleCallback(idle);
      if (timer !== null) clearTimeout(timer);
      styleLink?.removeEventListener('load', load);
      cleanup?.();
    };
  }, [root, active, revision]);
  return null;
}
