// Offline compositions of an existing transparent HeyGen sample and the home's
// synthetic apartment photo. This never calls an avatar, voice or image provider.
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {dirname,join,resolve} from 'node:path';
import {mkdir,mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import sharp from 'sharp';
const index=process.argv.indexOf('--avatar');
if(index<0||!process.argv[index+1])throw Error('Usage: node scripts/prepare-home-avatar-demos.mjs --avatar /path/to/existing-transparent.webm');
const avatar=resolve(process.argv[index+1]),root=resolve('apps/web/public');await stat(avatar);
const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url)),r=createRequire(require.resolve('@remotion/renderer'));
const binary=process.env.BIENVU_FFMPEG_PATH??(process.platform==='darwin'?join(dirname(r.resolve(`@remotion/compositor-darwin-${process.arch}/package.json`)),'ffmpeg'):'ffmpeg');
const videos=join(root,'videos/studio-home'),images=join(root,'images/studio-home'),evidence=resolve('evidence/local/home-avatars');
await Promise.all([mkdir(videos,{recursive:true}),mkdir(images,{recursive:true}),mkdir(evidence,{recursive:true,mode:0o700})]);
async function ffmpeg(args){
 const p=spawn(binary,['-hide_banner','-loglevel','error',...args],{cwd:binary.includes('/')?dirname(binary):undefined,stdio:['ignore','ignore','pipe']});
 let message='';p.stderr.on('data',data=>message+=data);const timer=setTimeout(()=>p.kill('SIGTERM'),120000);
 const result=await new Promise((done,fail)=>{p.once('error',fail);p.once('close',done);});clearTimeout(timer);
 if(result!==0)throw Error('Avatar demo composition failed: '+message.slice(-1200));
}
const temporary=await mkdtemp(join(tmpdir(),'bienvu-avatar-home-'));
try{
 const sourceFrames=join(temporary,'source');await mkdir(sourceFrames);
 // The bundled compositor decoder needs libvpx explicitly to retain VP9 alpha.
 await ffmpeg(['-c:v','libvpx-vp9','-i',avatar,'-map','0:v:0','-frames:v','147','-y',join(sourceFrames,'%03d.png')]);
 const background=await sharp(join(images,'paris.webp')).resize(570,1012,{fit:'cover'}).png().toBuffer();
 const mask=Buffer.from('<svg width="196" height="196"><circle cx="98" cy="98" r="98" fill="white"/></svg>');
 const disc=Buffer.from('<svg width="206" height="206"><circle cx="103" cy="103" r="103" fill="#fffefa"/><circle cx="103" cy="103" r="98" fill="#e6ddce"/></svg>');
 for(const mode of ['circle','integrated']){
  const frames=join(temporary,mode);await mkdir(frames);
  for(let n=1;n<=147;n++){
   const frame=await readFile(join(sourceFrames,String(n).padStart(3,'0')+'.png'));
   let person,left,top;
   if(mode==='circle'){
    const portrait=await sharp(frame).extract({left:40,top:285,width:640,height:640}).resize(196,196).composite([{input:mask,blend:'dest-in'}]).png().toBuffer();
    person=await sharp(disc).composite([{input:portrait,left:5,top:5}]).png().toBuffer();left=310;top=718;
   }else{person=await sharp(frame).extract({left:40,top:280,width:640,height:720}).resize(350,394).png().toBuffer();left=0;top=566;}
   await sharp(background).extract({left:15+Math.floor(n/147*8),top:26+Math.floor(n/147*10),width:540,height:960}).composite([{input:person,left,top}]).png().toFile(join(frames,String(n).padStart(3,'0')+'.png'));
  }
  const file=join(videos,`avatar-${mode}.mp4`);
  await ffmpeg(['-framerate','25','-i',join(frames,'%03d.png'),'-i',avatar,'-map','0:v:0','-map','1:a:0','-t','5.88','-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-af','asetpts=PTS-STARTPTS','-movflags','+faststart','-threads','2','-y',file]);
  await sharp(join(frames,'016.png')).webp({quality:82}).toFile(join(images,`avatar-${mode}.webp`));
  console.log(JSON.stringify({mode,videoBytes:(await stat(file)).size,posterBytes:(await stat(join(images,`avatar-${mode}.webp`))).size,existingSample:true}));
 }
}finally{await rm(temporary,{recursive:true,force:true});}
await writeFile(join(videos,'avatar-demo.fr.vtt'),'WEBVTT\n\n00:00:00.000 --> 00:00:03.700\nÀ Lyon, découvrez cet appartement lumineux de trois pièces.\n\n00:00:03.700 --> 00:00:05.880\nAvec BienVu, vos annonces prennent vie.\n');
