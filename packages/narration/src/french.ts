// Nombres du contrat, jamais une conversion de la sortie libre d'un modèle.
const small = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
function belowHundred(n: number): string {
  if (n < 17) return small[n];
  if (n < 20) return `dix-${small[n - 10]}`;
  if (n < 70) {
    const tens = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'][Math.floor(n / 10)], rest = n % 10;
    return tens + (rest === 0 ? '' : rest === 1 ? ' et un' : `-${small[rest]}`);
  }
  if (n < 80) return n === 71 ? 'soixante et onze' : `soixante-${belowHundred(n - 60)}`;
  return n === 80 ? 'quatre-vingts' : `quatre-vingt-${belowHundred(n - 80)}`;
}
function belowThousand(n: number): string {
  if (n < 100) return belowHundred(n);
  const hundreds = Math.floor(n / 100), rest = n % 100;
  return `${hundreds === 1 ? '' : `${small[hundreds]} `}cent${rest === 0 && hundreds > 1 ? 's' : ''}${rest ? ` ${belowHundred(rest)}` : ''}`;
}
export function frenchInteger(value: bigint | number): string {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) throw new Error('FRENCH_NUMBER_INVALID');
  const n = BigInt(value);
  if (n < 0n || n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('FRENCH_NUMBER_INVALID');
  if (n < 1000n) return belowThousand(Number(n));
  for (const [scale, name] of [[1_000_000_000_000_000n, 'billiard'], [1_000_000_000_000n, 'billion'], [1_000_000_000n, 'milliard'], [1_000_000n, 'million'], [1000n, 'mille']] as const) {
    if (n < scale) continue;
    const group = n / scale, rest = n % scale;
    const prefix = name === 'mille' ? group === 1n ? 'mille' : `${frenchInteger(group).replace(/vingts$/, 'vingt').replace(/cents$/, 'cent')} mille`
      : `${frenchInteger(group)} ${name}${group > 1n ? 's' : ''}`;
    return prefix + (rest ? ` ${frenchInteger(rest)}` : '');
  }
  throw new Error('FRENCH_NUMBER_INVALID');
}
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
