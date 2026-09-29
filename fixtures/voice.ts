// Texte de recette écrit à la main : aucune annonce réelle, aucun appel LLM.
export const frenchVoiceSample = 'Ceci est un échantillon vocal de BienVu, avec des informations fictives. À Lyon, découvrez un appartement de quarante-deux virgule zéro six mètres carrés. Son prix est de trois cent soixante-dix-neuf mille euros. À Saint-Étienne, un loyer de mille deux cents euros par mois, charges comprises. Cette voix est générée par intelligence artificielle.';

// Signal déterministe pour les tests techniques uniquement ; ce n'est pas une voix.
export function toneFixture(durationMs = 1000, silent = false): Uint8Array {
  const rate = 24000, samples = Math.round(durationMs * rate / 1000);
  const bytes = new Uint8Array(44 + samples * 2), view = new DataView(bytes.buffer);
  const tag = (value: string, offset: number) => bytes.set(new TextEncoder().encode(value), offset);
  tag('RIFF', 0); view.setUint32(4, bytes.length - 8, true); tag('WAVE', 8); tag('fmt ', 12);
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  tag('data', 36); view.setUint32(40, samples * 2, true);
  for (let index = 0; index < samples; index++) view.setInt16(44 + index * 2, silent ? 0 : Math.round(Math.sin(index * 2 * Math.PI * 440 / rate) * 5000), true);
  return bytes;
}
