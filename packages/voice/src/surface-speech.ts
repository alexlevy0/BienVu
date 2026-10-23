import { frenchInteger } from './french-numbers';

export const SURFACE_SPEECH_VERSION = 'surface-decimals/1' as const;
const digits = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
function fractionSpeech(fraction: string): string {
  const leading = fraction.match(/^0*/u)![0].length,
    rest = fraction.slice(leading);
  const words = Array<string>(leading).fill('zéro');
  if (rest)
    words.push(
      Number.isSafeInteger(Number(rest))
        ? frenchInteger(Number(rest))
        : [...rest].map((digit) => digits[Number(digit)]).join(' '),
    );
  return words.join(' ');
}

// Scope normalization to areas: phone numbers, prices, addresses and unrelated
// decimal quantities retain their spelling. Never round a source measurement.
export function surfaceSpeechText(text: string): string {
  const numeric = text.replace(
    /(?<![\p{L}\p{M}\p{N}.,+-])(\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)[.,](\d+)\s*(?:m[²2]|mètres?\s+carrés?)(?![\p{L}\p{M}\p{N}])/giu,
    (match, whole: string, fraction: string) => {
      const value = Number(whole.replace(/\s/gu, ''));
      return Number.isSafeInteger(value)
        ? `${frenchInteger(value)} virgule ${fractionSpeech(fraction)} mètres carrés`
        : match;
    },
  );
  // Structured scripts already spell numbers, but older catalogues enumerate
  // the fractional digits ("virgule deux sept"). Read them as one number.
  return numeric.replace(
    /\bvirgule((?:[\s-]+(?:zéro|un|deux|trois|quatre|cinq|six|sept|huit|neuf))+)(?=\s+mètres?\s+carrés?(?![\p{L}\p{M}\p{N}]))/giu,
    (_match, fraction: string) =>
      `virgule ${fractionSpeech(
        fraction
          .trim()
          .toLocaleLowerCase('fr-FR')
          .split(/[\s-]+/u)
          .map((word) => digits.indexOf(word))
          .join(''),
      )}`,
  );
}
