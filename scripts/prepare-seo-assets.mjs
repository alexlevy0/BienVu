// Native asset preparation; never imported by a Worker.
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url));
const sharp=require('sharp');
const dir=new URL('../apps/web/public/images/',import.meta.url);
await mkdir(new URL('seo/',dir),{recursive:true});
for(const id of ['paris','sud','lyon','bordeaux'])for(const width of [320,640,960]){
  await sharp(await readFile(new URL(`studio-home/${id}.webp`,dir))).resize({width,withoutEnlargement:true}).webp({quality:72}).toFile(new URL(`studio-home/${id}-${width}.webp`,dir).pathname);
}
const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#e6eddf"/><rect x="45" y="45" width="1110" height="540" rx="24" fill="#fafbf7"/><text x="86" y="151" fill="#11150f" font-family="Arial" font-size="67" font-weight="800">bienvu</text><text x="86" y="270" fill="#182116" font-family="Georgia" font-size="55">Le marketing immobilier,</text><text x="86" y="340" fill="#182116" font-family="Georgia" font-size="55" font-style="italic">en mouvement.</text><text x="90" y="420" fill="#59694f" font-family="Arial" font-size="26">Création · Personnalisation · Publication</text><rect x="86" y="470" width="290" height="58" rx="10" fill="#14200f"/><text x="115" y="507" fill="white" font-family="Arial" font-size="24">Vos annonces en vidéo</text></svg>`);
const photo=await sharp(await readFile(new URL('studio-home/paris.webp',dir))).resize(270,420,{fit:'cover'}).toBuffer();
await writeFile(new URL('seo/bienvu-og.jpg',dir),await sharp(svg).composite([{input:photo,left:845,top:107}]).jpeg({quality:82}).toBuffer());
console.log('Images adaptatives et image de partage préparées.');
