export const LOCALITY_SPEECH_VERSION = 'locality-case/1' as const;

// Use the listing's locality, rather than lowercasing every uppercase word:
// energy ratings and acronyms such as DPE/GES still need their original spelling.
export function localitySpeechText(text: string, locality: string | null): string {
  if (!locality?.trim()) return text;
  const pattern = locality.normalize('NFC').trim().split(/([\s\p{Pd}'’]+)/u).map(part =>
    /^[\s\p{Pd}]+$/u.test(part) ? '[\\s\\p{Pd}]+'
      : /^['’]+$/.test(part) ? "['’]+" : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
  const city = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${pattern}(?![\\p{L}\\p{M}\\p{N}])`, 'giu');
  return text.normalize('NFC').replace(city, match => {
    // An arrondissement suffix (LYON 6e) does not make the city mixed case.
    const letters = match.replace(/\d+(?:er|e|ème|eme)\b/giu, '').match(/\p{L}/gu)?.join('') ?? '';
    if (!letters || letters !== letters.toLocaleUpperCase('fr-FR') || letters === letters.toLocaleLowerCase('fr-FR')) return match;
    return match.toLocaleLowerCase('fr-FR').replace(/\p{L}/u, first => first.toLocaleUpperCase('fr-FR'));
  });
}
