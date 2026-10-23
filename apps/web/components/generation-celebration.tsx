'use client';

import { useEffect, useRef } from 'react';
import type { GenerationView } from '@bienvu/contracts';

type Result = Pick<GenerationView, 'id' | 'status' | 'videoUrl'>;

// Keep the drawing library out of the initial page bundle. Assembly gives us
// time to load it before the final result, without touching the media pipeline.
const loadConfetti = () => import('../lib/generation-confetti');

export function GenerationCelebration({ job }: { job: Result | null }) {
  const observed = useRef<{ id: string; active: boolean; pending: boolean } | null>(null);
  const id = job?.id,
    status = job?.status,
    hasVideo = Boolean(job?.videoUrl);
  useEffect(() => {
    if (!id || !status) {
      observed.current = null;
      return;
    }
    const active = status !== 'ready' && status !== 'failed';
    if (observed.current?.id !== id) observed.current = { id, active, pending: false };
    else if (active) {
      observed.current.active = true;
      observed.current.pending = false;
    } else if (status === 'failed') {
      observed.current.active = false;
      observed.current.pending = false;
    } else if (hasVideo && observed.current.active) {
      observed.current.active = false;
      observed.current.pending = true;
    }

    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) {
      observed.current.pending = false;
      return;
    }
    if (status === 'rendering')
      void loadConfetti().catch(() => {
        /* Decoration is optional. */
      });
    if (!observed.current.pending || !hasVideo) return;

    let disposed = false,
      starting = false,
      stop: (() => void) | undefined;
    const start = async () => {
      if (disposed || starting || document.hidden || !observed.current?.pending) return;
      starting = true;
      try {
        const { celebrateGeneration } = await loadConfetti();
        if (!disposed && !document.hidden) {
          stop = celebrateGeneration(id) ?? undefined;
          observed.current!.pending = false;
        }
      } catch {
        /* An animation failure must never hide a completed video. */
      } finally {
        starting = false;
      }
    };
    const visible = () => {
      if (!document.hidden) void start();
    };
    document.addEventListener('visibilitychange', visible);
    void start();
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', visible);
      stop?.();
    };
  }, [id, status, hasVideo]);
  return null;
}
