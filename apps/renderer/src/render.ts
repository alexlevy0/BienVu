import {renderMedia, selectComposition} from '@remotion/renderer';
import {ProbeRender, VideoFixture} from '@bienvu/contracts';
import {createHash} from 'node:crypto';
import {mkdir, readFile, stat, writeFile, rename} from 'node:fs/promises';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import path from 'node:path';
import {bundleDir, fixturesDir, outputDir} from './paths';
const exec = promisify(execFile);

export async function render(input: unknown) {
  const request=ProbeRender.parse(input);const start=Date.now();
  try {return await renderVideo(request);} catch(error) {
    await mkdir(outputDir,{recursive:true});
    await writeFile(path.join(outputDir,`${request.id}.failed.json`),JSON.stringify({
      ...request,status:'failed',at:new Date().toISOString(),durationSeconds:(Date.now()-start)/1000,
      environment:process.env.RENDER_ENV??'local-node',error:error instanceof Error?error.message.slice(0,300):'RENDER_FAILED',
      synthetic:true,ttsCalls:0,textTokens:0,actualBilledEur:process.env.RENDER_ENV==='cloudflare-container'?null:0,
    },null,2));
    throw error;
  }
}
async function renderVideo(input: unknown) {
  const request = ProbeRender.parse(input);
  const props = VideoFixture.parse(JSON.parse(await readFile(path.join(fixturesDir,`${request.fixture}.json`),'utf8')));
  await mkdir(outputDir,{recursive:true});
  const startedAt = new Date().toISOString(); const start = performance.now();
  const cpu = process.cpuUsage();
  const file = path.join(outputDir,`${request.id}.mp4`);
  const partial = path.join(outputDir,`${request.id}.partial.mp4`);
  const browserExecutable=process.env.REMOTION_BROWSER_EXECUTABLE;
  const chromeMode=browserExecutable?'chrome-for-testing' as const:'headless-shell' as const;
  const composition = await selectComposition({serveUrl:bundleDir,id:'BienVuProbe',inputProps:props,browserExecutable,chromeMode});
  await renderMedia({serveUrl:bundleDir,composition,inputProps:props,browserExecutable,chromeMode,codec:'h264',audioCodec:'aac',pixelFormat:'yuv420p',outputLocation:partial,concurrency:1,timeoutInMilliseconds:120_000});
  const ffprobe=process.env.BIENVU_FFPROBE_PATH??'ffprobe';
  const ffmpeg=process.env.BIENVU_FFMPEG_PATH??'ffmpeg';
  // Les binaires Remotion macOS chargent leurs bibliothèques depuis leur dossier.
  const binaryCwd=(binary:string)=>path.isAbsolute(binary)?path.dirname(binary):undefined;
  const {stdout} = await exec(ffprobe,['-v','error','-show_format','-show_streams','-of','json',partial],{cwd:binaryCwd(ffprobe)});
  const metadata = JSON.parse(stdout) as {format:{duration:string; size:string}; streams:Array<{codec_type:string;codec_name:string;width?:number;height?:number;avg_frame_rate?:string}>};
  const video = metadata.streams.find(s=>s.codec_type==='video'); const audio = metadata.streams.find(s=>s.codec_type==='audio');
  const duration = Number(metadata.format.duration);
  if (video?.codec_name!=='h264'||video.width!==1080||video.height!==1920||video.avg_frame_rate!=='30/1'||audio?.codec_name!=='aac'||Math.abs(duration-props.durationSeconds)>0.12) throw new Error('INVALID_MP4');
  // Décoder réellement l'AAC en PCM : fonctionne aussi avec le FFmpeg minimal de Remotion.
  const {stdout:wav}=await exec(ffmpeg,['-v','error','-i',partial,'-map','0:a:0','-ar','16000','-ac','1','-c:a','pcm_s16le','-f','wav','pipe:1'],{cwd:binaryCwd(ffmpeg),encoding:'buffer',maxBuffer:5_000_000});
  if(wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE')throw new Error('INVALID_DECODED_AUDIO');
  let pcm:Buffer|undefined;
  for(let offset=12;offset+8<=wav.length;){
    const length=wav.readUInt32LE(offset+4);
    // Sur stdout, FFmpeg utilise 0xffffffff pour la longueur encore inconnue.
    if(wav.toString('ascii',offset,offset+4)==='data'){pcm=wav.subarray(offset+8,Math.min(wav.length,offset+8+length));break;}
    offset+=8+length+(length%2);
  }
  if(!pcm?.length)throw new Error('EMPTY_DECODED_AUDIO');
  let squareSum=0;const sampleCount=Math.floor(pcm.length/2);
  for(let offset=0;offset<sampleCount*2;offset+=2)squareSum+=(pcm.readInt16LE(offset)/32768)**2;
  const meanDb=10*Math.log10(squareSum/sampleCount);
  if (!Number.isFinite(meanDb)||meanDb < -50) throw new Error('SILENT_AUDIO');
  await rename(partial,file);
  const sizeBytes = (await stat(file)).size;
  const sha256 = createHash('sha256').update(await readFile(file)).digest('hex');
  const usedCpu = process.cpuUsage(cpu);
  const report = {id:request.id,fixture:request.fixture,environment:process.env.RENDER_ENV??'local-node',startedAt,endedAt:new Date().toISOString(),
    renderAndVerifySeconds:(performance.now()-start)/1000, nodeProcessCpuSeconds:(usedCpu.user+usedCpu.system)/1e6,
    cpuMeasurementNote:'Node seulement ; exclut Chromium et FFmpeg. Ne vaut pas une mesure facturable Containers.',
    instanceType:process.env.INSTANCE_TYPE??null, sizeBytes,sha256,metadata,meanVolumeDb:meanDb,audioMeasurement:'RMS dBFS du flux AAC décodé en PCM mono 16 kHz',watermarked:true,synthetic:true,
    ttsCalls:0,textTokens:0,audioSeconds:duration,estimatedProviderCostEur:process.env.RENDER_ENV==='cloudflare-container'?null:0};
  await writeFile(path.join(outputDir,`${request.id}.json`),JSON.stringify(report,null,2));
  return report;
}
