import {z} from 'zod';

export const GoogleProjectId = z.string().regex(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/);
export const GoogleVoiceConfig = z.object({
  projectId: GoogleProjectId,
  provider: z.literal('google').default('google'),
  model: z.literal('chirp3-hd').default('chirp3-hd'),
  voice: z.string().regex(/^fr-FR-Chirp3-HD-[A-Za-z]+$/).max(80).default('fr-FR-Chirp3-HD-Aoede'),
  language: z.literal('fr-FR').default('fr-FR'),
  encoding: z.literal('LINEAR16').default('LINEAR16'),
  version: z.literal('google-chirp3/1').default('google-chirp3/1'),
}).strict();
export type GoogleVoiceConfig = z.infer<typeof GoogleVoiceConfig>;

// Limite BienVu, inférieure aux 5 000 octets Google. Jamais de SSML fourni par un client.
export const VoiceText = z.string().trim().min(1).max(1000)
  .refine(value => !/[\u0000-\u0008\u000B-\u001F\u007F]/.test(value), 'Texte vocal invalide.')
  .refine(value => new TextEncoder().encode(value).byteLength <= 5000, 'Texte vocal trop long.');

export const voiceFailureCodes = ['VOICE_CONFIG_INVALID', 'VOICE_AUTH_FAILED', 'VOICE_UNAVAILABLE',
  'VOICE_BILLING_DISABLED', 'VOICE_API_DISABLED',
  'VOICE_RATE_LIMITED', 'VOICE_REQUEST_REJECTED', 'VOICE_TIMEOUT', 'VOICE_RESPONSE_INVALID',
  'VOICE_NOT_FOUND', 'VOICE_TEXT_INVALID', 'VOICE_AUDIO_INVALID', 'VOICE_AUDIO_SILENT',
  'VOICE_DURATION_EXCEEDED', 'VOICE_PROBE_LIMIT', 'VOICE_PROBE_REVIEW_REQUIRED'] as const;
export type VoiceFailureCode = typeof voiceFailureCodes[number];
export class VoiceFailure extends Error {
  constructor(public readonly code: VoiceFailureCode) { super(code); this.name = 'VoiceFailure'; }
}

export const SYNTHETIC_VOICE_DISCLOSURE = 'Voix de synthèse générée par intelligence artificielle.';
