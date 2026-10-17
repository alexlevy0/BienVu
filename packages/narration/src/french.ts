import {frenchInteger} from '@bienvu/voice';
export {frenchInteger};
// Frozen script catalogues keep digit-by-digit decimals; speech normalization
// is versioned separately so existing jobs and audio caches remain replayable.
const small = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
function decimalParts(value: number): [string, string] {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) throw new Error('FRENCH_NUMBER_INVALID');
  const [base, exponent = '0'] = String(value).split('e'), [integer, decimal = ''] = base.split('.');
  const point = integer.length + Number(exponent), digits = integer + decimal;
  const expanded = point <= 0 ? `0.${'0'.repeat(-point)}${digits}` : point >= digits.length ? digits + '0'.repeat(point - digits.length) : `${digits.slice(0, point)}.${digits.slice(point)}`;
  const [whole, fraction = ''] = expanded.split('.');
  return [whole, fraction];
}
export function frenchDecimal(value: number): string {
  const [whole, fraction] = decimalParts(value);
  return frenchInteger(BigInt(whole)) + (fraction ? ` virgule ${[...fraction].map(d => small[Number(d)]).join(' ')}` : '');
}
export function frenchEuros(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 1) throw new Error('FRENCH_NUMBER_INVALID');
  const amount = BigInt(cents), euros = amount / 100n, rest = amount % 100n;
  return `${frenchInteger(euros)} euro${euros === 1n ? '' : 's'}${rest ? ` et ${frenchInteger(rest)} centime${rest === 1n ? '' : 's'}` : ''}`;
}
export function displayNumber(value: number): string {
  const [whole, fraction] = decimalParts(value);
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (fraction ? `,${fraction}` : '');
}
export function displayEuros(cents: number): string {
  const n = BigInt(cents), whole = String(n / 100n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '), rest = n % 100n;
  return `${whole}${rest ? `,${String(rest).padStart(2, '0')}` : ''} €`;
}
