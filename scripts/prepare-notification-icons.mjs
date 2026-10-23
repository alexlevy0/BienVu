import { readFile, mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
const source = await readFile(new URL('../apps/web/app/icon.svg', import.meta.url)),
  dir = new URL('../apps/web/public/notifications/', import.meta.url);
await mkdir(dir, { recursive: true });
for (const size of [72, 192, 512])
  await writeFile(
    new URL(size === 72 ? 'badge-72.png' : `icon-${size}.png`, dir),
    await sharp(size === 72 ? Buffer.from(source.toString().replace(/<rect[^>]*\/>/, '')) : source)
      .resize(size, size)
      .png()
      .toBuffer(),
  );
