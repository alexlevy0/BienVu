import {z} from 'zod';

// Diagnostic privé : aucun paramètre de requête, fragment ou credential.
export const ImportResourceDiagnostic = z.object({
  stage: z.enum(['page', 'browser', 'photo']),
  reason: z.enum(['invalid_url', 'host_not_allowed', 'transport_refused']),
  host: z.string().max(253).regex(/^[a-z0-9.:[\]-]+$/i).nullable(),
  path: z.string().max(300).regex(/^\/[^?#\s]*$/).nullable(),
  resourceType: z.string().max(32).regex(/^[a-z]+$/).optional(),
}).strict();
export type ImportResourceDiagnostic = z.infer<typeof ImportResourceDiagnostic>;
export function importResourceDiagnostic(value: string, stage: ImportResourceDiagnostic['stage'],
  reason: ImportResourceDiagnostic['reason'], resourceType?: string): ImportResourceDiagnostic {
  let host: string | null = null, path: string | null = null;
  try {const url = new URL(value); host = url.hostname.slice(0, 253) || null; path = url.pathname.slice(0, 300) || '/';} catch {}
  const parsed = ImportResourceDiagnostic.safeParse({stage, reason, host, path, resourceType});
  return parsed.success ? parsed.data : {stage, reason, host: null, path: null};
}
export function importResourceHeader(value: ImportResourceDiagnostic): string {
  return encodeURIComponent(JSON.stringify(ImportResourceDiagnostic.parse(value)));
}
export function parseImportResourceHeader(value: string | null): ImportResourceDiagnostic | undefined {
  if (!value || value.length > 2_000) return undefined;
  try {const parsed = ImportResourceDiagnostic.safeParse(JSON.parse(decodeURIComponent(value))); return parsed.success ? parsed.data : undefined;} catch {return undefined;}
}
