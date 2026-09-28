import {ListingUrl} from '@bienvu/contracts';

type ListingDraft = {kind: 'url'; url: string; savedAt: number} | {kind: 'manual'; savedAt: number};
const key = 'bienvu:listing-draft';
const lifetime = 60 * 60 * 1000;

// A tab-local convenience only. It never imports a URL or starts billable work.
export function readListingDraft(): ListingDraft | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null') as ListingDraft | null;
    if (!value) return null;
    if (!Number.isFinite(value.savedAt) || Date.now() - value.savedAt > lifetime || value.savedAt > Date.now()) {clearListingDraft(); return null;}
    if (value.kind === 'manual') return value;
    if (value.kind === 'url' && ListingUrl.safeParse(value.url).success) return value;
    clearListingDraft(); return null;
  } catch {return null;}
}
export function saveListingDraft(value: {kind: 'url'; url: string} | {kind: 'manual'}) {
  try {sessionStorage.setItem(key, JSON.stringify({...value, savedAt: Date.now()})); return true;}
  catch {return false;}
}
export function clearListingDraft() {
  try {sessionStorage.removeItem(key);} catch { /* Private browsing may refuse storage. */ }
}
