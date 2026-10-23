import { ViewTransition, type ReactNode } from 'react';

export function RouteMotion({ children }: { children: ReactNode }) {
  const direction = { 'bv-forward': 'bv-forward', 'bv-back': 'bv-back', default: 'none' };
  return (
    <ViewTransition default="none" enter={direction} exit={direction}>
      {children}
    </ViewTransition>
  );
}
