import {analyticsFetch as fetch} from './product-analytics';
import {GenerationView, publicErrors, type GenerationRequest, type PublicErrorCode} from '@bienvu/contracts';
import {clearListingDraft} from './listing-draft';

// Shared by the home page and studio. A lost response keeps the same admission key.
export async function requestGeneration(agencyId: string, input: GenerationRequest): Promise<GenerationView> {
  const body = JSON.stringify(input), storageKey = `bienvu:generation:${agencyId}`;
  let previous: {body: string; key: string} | null = null;
  try {previous = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');} catch {}
  const attempt = previous?.body === body && typeof previous.key === 'string'
    ? previous : {body, key: crypto.randomUUID()};
  try {sessionStorage.setItem(storageKey, JSON.stringify(attempt));} catch {}
  const response = await fetch('/api/generations', {
    method: 'POST', headers: {'Content-Type': 'application/json', 'Idempotency-Key': attempt.key}, body,
  });
  const value = await response.json() as {error?: {code?: PublicErrorCode}};
  if (!response.ok) {
    const code = value.error?.code;
    throw new Error(code && code in publicErrors ? publicErrors[code][1] : 'La création n’a pas abouti. Réessayez.');
  }
  const job = GenerationView.parse(value);
  clearListingDraft();
  try {sessionStorage.removeItem(storageKey);} catch {}
  return job;
}
