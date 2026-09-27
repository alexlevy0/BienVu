import sharp from 'sharp';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const dir=path.resolve('fixtures/generated'); await mkdir(dir,{recursive:true});
// Génération déterministe de volumes géométriques : aucun média de bien tiers.
const palettes=[[221,210,189],[186,202,190],[192,201,215]];
for(let n=0;n<3;n++) {
  const w=1080,h=1920,buf=Buffer.alloc(w*h*3); const c=palettes[n];
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const i=(y*w+x)*3;
    const floor=y>1230; const window=x>160+n*55&&x<610+n*55&&y>420&&y<1070;
    const sofa=x>110&&x<900&&y>1220&&y<1480;
    const plant=(x-850)**2/10000+(y-1060)**2/32000<1;
    const color=plant?[63,100,72]:sofa?[119+n*12,94+n*8,71]:window?[169,201,211]:floor?[153,127,100]:c;
    for(let k=0;k<3;k++) buf[i+k]=Math.min(255,color[k]+Math.round(x/w*14));
  }
  await sharp(buf,{raw:{width:w,height:h,channels:3}}).png().toFile(path.join(dir,`room-${n+1}.png`));
}
const sampleRate=24000,seconds=30,samples=sampleRate*seconds;
const wav=Buffer.alloc(44+samples*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(sampleRate,24);wav.writeUInt32LE(sampleRate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
for(let i=0;i<samples;i++) {const t=i/sampleRate,phase=t%2;const envelope=phase<0.8?Math.sin(Math.PI*phase/0.8)**2:0;const frequency=[440,554.365,659.255][Math.floor(t/2)%3];wav.writeInt16LE(Math.round(Math.sin(2*Math.PI*frequency*t)*envelope*6000),44+i*2);}
await writeFile(path.join(dir,'tone.wav'),wav);
for(const [name,seconds] of [['short',6],['target',30]] as const) await writeFile(path.join(dir,`${name}.json`),JSON.stringify({schemaVersion:1,kind:'synthetic-fixture',fps:30,width:1080,height:1920,durationSeconds:seconds,watermarked:true,audio:'tone.wav',scenes:[{image:'room-1.png',caption:'Des images de recette, entièrement synthétiques.'},{image:'room-2.png',caption:'Trois séquences pour vérifier le mouvement et la lisibilité.'},{image:'room-3.png',caption:'BienVu · Démonstration technique du sprint 00.'}]},null,2));
console.log('Fixtures créées : 3 PNG, 1 WAV de synthèse, manifestes 6 s et 30 s. Aucun appel API.');
