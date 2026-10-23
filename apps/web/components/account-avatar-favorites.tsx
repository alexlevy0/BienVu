'use client';
import type { ReactNode } from 'react';
import { useAccount } from './account';
import { AvatarFavoritesProvider } from './avatar-favorites';
export function AccountAvatarFavoritesProvider({ children }: { children: ReactNode }) {
  const { me } = useAccount();
  return <AvatarFavoritesProvider userId={me?.user.id ?? null}>{children}</AvatarFavoritesProvider>;
}
