// Animations silencieuses de visuels synthétiques. Aucun fournisseur ni rendu produit.
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {dirname,join,resolve} from 'node:path';
import {mkdir,stat,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import sharp from 'sharp';
const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url));
const rendererRequire=createRequire(require.resolve('@remotion/renderer'));
const binary=process.env.BIENVU_FFMPEG_PATH??(process.platform==='darwin'?join(dirname(rendererRequire.resolve(`@remotion/compositor-darwin-${process.arch}/package.json`)),'ffmpeg'):'ffmpeg');
const output=resolve('apps/web/public/videos/studio-home');await mkdir(output,{recursive:true});
const temporary=await mkdtemp(join(tmpdir(),'bienvu-home-demo-'));
try{
for(const [id,seconds]of [['paris',28],['sud',32],['lyon',27],['bordeaux',30]]){
  const file=join(output,`${id}.mp4`),input=join(temporary,`${id}.png`);
  await sharp(resolve(`apps/web/public/images/studio-home/${id}.webp`)).png().toFile(input);
  const p=spawn(binary,['-hide_banner','-loglevel','error','-loop','1','-framerate','24','-i',input,'-vf',`scale=900:1200,crop=864:1152:x='(iw-ow)*(0.5+0.45*sin(t*PI/${seconds}))':y='(ih-oh)*t/${seconds}',scale=600:800`,'-t',String(seconds),'-an','-c:v','libx264','-preset','fast','-crf','25','-pix_fmt','yuv420p','-movflags','+faststart','-threads','2','-y',file],{cwd:binary.includes('/')?dirname(binary):undefined,stdio:['ignore','ignore','pipe']});
  let error='';p.stderr.on('data',chunk=>{error+=chunk.toString();});
  const timer=setTimeout(()=>p.kill('SIGTERM'),180_000);
  const code=await new Promise((r,j)=>{p.on('error',j);p.on('close',r);});clearTimeout(timer);
  if(code!==0)throw new Error(`DEMO_${id}_FAILED: ${error.slice(-1200)}`);
  console.log(JSON.stringify({id,seconds,bytes:(await stat(file)).size,silent:true}));
}
}finally{await rm(temporary,{recursive:true,force:true});}
