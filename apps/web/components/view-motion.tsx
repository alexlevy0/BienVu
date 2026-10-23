'use client';
import { useId, ViewTransition, type ReactNode } from 'react';
import type { MotionKind } from '../lib/view-motion';

export function MotionSwap({ identity, kind, children }: { identity: string; kind?: MotionKind; children: ReactNode }) {
  const name = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const fade = kind ? { [kind]: 'bv-fade', default: 'none' } : 'bv-fade';
  return (
    <ViewTransition key={identity} name={`bv-panel-${name}`} default="none" share={fade} enter={fade} exit={fade}>
      {children}
    </ViewTransition>
  );
}
export function MotionItem({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      default="none"
      update={{ 'bv-list': 'bv-reorder', default: 'none' }}
      enter={{ 'bv-list': 'bv-fade', default: 'none' }}
      exit={{ 'bv-list': 'bv-fade', default: 'none' }}
    >
      {children}
    </ViewTransition>
  );
}
