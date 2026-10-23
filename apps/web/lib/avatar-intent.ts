import { AvatarId } from '@bienvu/contracts';
export const avatarIntentKey = 'bienvu:avatar-intent:v1';
export function parseAvatarIntent(raw: string | null, now = Date.now()): { lookId: string; at: number } | null {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (
      !value ||
      !AvatarId.safeParse(value.lookId).success ||
      !Number.isFinite(value.at) ||
      value.at > now ||
      now - value.at > 86400000
    )
      return null;
    return { lookId: value.lookId, at: value.at };
  } catch {
    return null;
  }
}
