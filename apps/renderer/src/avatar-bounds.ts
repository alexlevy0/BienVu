import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { avatarContentBounds, type AvatarContentBounds } from '@bienvu/contracts';

// Sample across the whole clip. A fixed union avoids changes of scale when
// the presenter moves; originals and HeyGen's reusable clips remain intact.
export async function measureAvatarContent(
  file: string,
  width: number,
  height: number,
  durationMs: number,
  ffmpeg: string,
  codec: 'vp8' | 'vp9' = 'vp9',
): Promise<AvatarContentBounds> {
  const directory = await mkdtemp(join(tmpdir(), 'bienvu-avatar-bounds-'));
  try {
    let union: AvatarContentBounds | null = null;
    for (let index = 0; index < 8; index++) {
      const output = join(directory, `frame-${index}.png`);
      await promisify(execFile)(
        ffmpeg,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-ss',
          String((index * durationMs) / 8000),
          '-c:v',
          codec === 'vp8' ? 'libvpx' : 'libvpx-vp9',
          '-threads',
          '2',
          '-i',
          file,
          '-frames:v',
          '1',
          '-pix_fmt',
          'rgba',
          '-threads',
          '1',
          output,
        ],
        { timeout: 30_000, maxBuffer: 128_000 },
      );
      const { data, info } = await sharp(output, { limitInputPixels: 40_000_000 })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      if (info.width !== width || info.height !== height) throw Error('VIDEO_AVATAR_PIXELS_INVALID');
      const bounds = avatarContentBounds(data, width, height);
      if (!bounds) continue;
      if (!union) {
        union = bounds;
        continue;
      }
      const left = Math.min(union.left, bounds.left),
        top = Math.min(union.top, bounds.top);
      union = {
        left,
        top,
        width: Math.max(union.left + union.width, bounds.left + bounds.width) - left,
        height: Math.max(union.top + union.height, bounds.top + bounds.height) - top,
      };
    }
    if (!union) throw Error('VIDEO_AVATAR_EMPTY');
    return union;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
