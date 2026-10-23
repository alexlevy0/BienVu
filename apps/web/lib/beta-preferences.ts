import { CartesiaVoiceId, type VideoCustomization } from '@bienvu/contracts';

export const betaVoiceKey = 'bienvu:beta-voice';
export type BetaVoiceChoice = { voice: NonNullable<ReturnType<typeof parseBetaVoice>>; revision: number };
export function parseBetaVoice(value: unknown) {
  const parsed = CartesiaVoiceId.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Keep the rest of a personalized video when applying an auditioned voice. */
export function withBetaVoice(settings: VideoCustomization, voice: unknown): VideoCustomization {
  const selected = parseBetaVoice(voice);
  return selected ? { ...settings, voice: selected } : settings;
}
