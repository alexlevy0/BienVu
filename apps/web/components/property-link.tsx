'use client';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import type { PropertySummary } from '@bienvu/contracts';
import { prepareProperty, rememberPropertySummary } from '../lib/property-navigation';

/** Carry the visible header into the route commit; fetch the full detail on intent. */
export function PropertyLink({
  owner,
  summary: property,
  children,
  onPointerEnter,
  onFocus,
  ...props
}: Omit<ComponentProps<typeof Link>, 'href' | 'onNavigate'> & { owner: string; summary: PropertySummary }) {
  const propertyId = property.id;
  const href = `/biens/${encodeURIComponent(propertyId)}`;
  const warm = () => {
    rememberPropertySummary(owner, property);
    void prepareProperty(owner, propertyId).catch(() => {});
  };
  return (
    <Link
      {...props}
      href={href}
      transitionTypes={['bv-forward']}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        warm();
      }}
      onFocus={(event) => {
        onFocus?.(event);
        warm();
      }}
      onNavigate={warm}
    >
      {children}
    </Link>
  );
}
