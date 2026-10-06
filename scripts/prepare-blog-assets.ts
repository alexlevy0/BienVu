// Native asset preparation only; never imported by the Worker.
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {blogArticles} from '../apps/web/lib/blog-content';

const dir = new URL('../apps/web/public/images/', import.meta.url);
const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
await mkdir(new URL('blog/', dir), {recursive: true});
for (const article of blogArticles) {
  const lines: string[] = [];
  for (const word of article.heading.split(' ')) {
    if (!lines.length || `${lines.at(-1)} ${word}`.length > 26) lines.push(word);
    else lines[lines.length - 1] += ` ${word}`;
  }
  const size = lines.length > 5 ? 37 : 42;
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#e5eddf"/><rect x="34" y="34" width="1132" height="562" rx="22" fill="#fcfcf8"/><text x="70" y="116" fill="#11150f" font-family="Arial" font-size="44" font-weight="800">bienvu</text><text x="72" y="164" fill="#5b7451" font-family="Arial" font-size="16" letter-spacing="3">LE BLOG IMMOBILIER</text>${lines.map((line, index) => `<text x="70" y="${238 + index * (size + 8)}" fill="#20251f" font-family="Georgia" font-size="${size}">${escapeXml(line)}</text>`).join('')}<text x="72" y="553" fill="#63725a" font-family="Arial" font-size="19">Méthodes et exemples pour votre agence</text></svg>`);
  const photo = await sharp(await readFile(new URL(`studio-home/${article.image}.webp`, dir))).resize(390, 475, {fit: 'cover'}).toBuffer();
  await writeFile(new URL(`blog/${article.slug}.jpg`, dir), await sharp(svg).composite([{input: photo, left: 739, top: 77}]).jpeg({quality: 82}).toBuffer());
}
console.log(`Images de partage du blog préparées : ${blogArticles.length} fichiers JPEG 1200 × 630.`);
