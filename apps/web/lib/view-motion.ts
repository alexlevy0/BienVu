import { addTransitionType, startTransition } from 'react';

export type MotionKind = 'bv-list' | 'bv-tabs' | 'bv-avatar';
/** Only deliberate interactions opt in; progress polling stays silent. */
export function runMotion(kind: MotionKind, action: () => void) {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    action();
    return;
  }
  startTransition(() => {
    addTransitionType(kind);
    action();
  });
}
