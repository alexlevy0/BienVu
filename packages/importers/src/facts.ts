import {ImportFailure} from '@bienvu/contracts';

export const verified = <T, U extends string>(value: T, unit: U, sourcePath: string, raw: unknown = value) =>
  ({status: 'verified' as const, value, unit, sourcePath, rawEvidence: (typeof raw === 'object' ? JSON.stringify(raw) : String(raw)).trim().slice(0, 500)});
export const missing = <U extends string>(unit: U) => ({status: 'missing' as const, value: null, unit, sourcePath: null, rawEvidence: null});
export function numeric(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).replace(/[\s\u00a0\u202f]/g, '');
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw)) return null;
  const n = Number(raw.replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null;
}
export function unique<T>(values: T[], message: string): T | undefined {
  const distinct = [...new Map(values.map(v => [JSON.stringify(v), v])).values()];
  if (distinct.length > 1) throw new ImportFailure('CONFLICTING_FACTS', message);
  return distinct[0];
}
export const clean = (v: unknown) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
