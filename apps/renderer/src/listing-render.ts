import {createServer} from 'node:http';
import {createReadStream,renameSync,writeFileSync} from 'node:fs';
import {chmod, mkdir, readFile, rename, rm, stat, writeFile} from 'node:fs/promises';
import {createHash, randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import sharp from 'sharp';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {VideoManifest, VideoReport, videoAssets, videoAssetFile, videoManifestHash,editorHasAudio,MapBuildings,mapCredits} from '@bienvu/contracts';
import {measureVoiceWav} from '@bienvu/voice';
import {bundleDir} from './paths';
import type {ListingVideoProps} from '../../../packages/video/src/listing';
const exec = promisify(execFile), sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const binary = (name: 'ffmpeg' | 'ffprobe') => process.env[name === 'ffmpeg' ? 'BIENVU_FFMPEG_PATH' : 'BIENVU_FFPROBE_PATH'] ?? name;
const cwd = (name: string) => path.isAbsolute(name) ? path.dirname(name) : undefined;
const browser = (manifest?:VideoManifest) => {
  const browserExecutable=process.env.REMOTION_BROWSER_EXECUTABLE;
  return {browserExecutable,chromeMode:browserExecutable&&!browserExecutable.includes('chrome-headless-shell')
    ? 'chrome-for-testing' as const : 'headless-shell' as const,...(manifest?.map?.settings.view==='buildings-3d'?{chromiumOptions:{gl:process.platform==='linux'?'swangle' as const:'angle' as const}}:{})};
};

export function parseRange(value: string | undefined, size: number): {start: number; end: number} | null | false {
  if (!value) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!m || !m[1] && !m[2]) return false;
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start <= end && start < size ? {start,end} : false;
}
export function isFastStart(bytes: Uint8Array) {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset + 8 <= b.length;) {
    let size = b.readUInt32BE(offset); const type = b.toString('ascii', offset + 4, offset + 8);
    if (size === 1) {if (offset + 16 > b.length) return false; size = Number(b.readBigUInt64BE(offset + 8));}
    if (type === 'moov') return true;
    if (type === 'mdat' || !Number.isSafeInteger(size) || size < 8 || offset + size > b.length) return false;
    offset += size;
  }
  return false;
}
export async function withVideoAssets<T>(input: unknown, directory: string, use: (props: ListingVideoProps) => Promise<T>): Promise<T> {
  const manifest = VideoManifest.parse(input), files = new Map<string, {file: string; mime: string; size: number}>();
  const token = randomBytes(32).toString('hex'), media: Record<string,string> = {};
  let logoBackground = '#ffffff';
  for (const asset of videoAssets(manifest)) {
    const file = path.join(directory, videoAssetFile(asset));
    const info = await stat(file);
    if (!info.isFile() || info.size !== asset.sizeBytes) throw new Error('VIDEO_ASSET_INVALID');
    const bytes = await readFile(file);
    if (sha(bytes) !== asset.sha256) throw new Error('VIDEO_ASSET_HASH_MISMATCH');
    if (asset.mime === 'audio/wav') {
      if (measureVoiceWav(bytes,asset.id===manifest.music?.asset.id?300000:35000).durationMs !== asset.durationMs) throw new Error('VIDEO_AUDIO_DURATION_MISMATCH');
    } else if(asset.mime==='video/mp4'){
      const {stdout}=await exec(binary('ffprobe'),['-v','error','-show_format','-show_streams','-of','json',file],{cwd:cwd(binary('ffprobe')),timeout:20_000,maxBuffer:128_000});
      const metadata=JSON.parse(stdout) as {format:{duration:string};streams:{codec_type:string;codec_name:string;width:number;height:number}[]};
      const video=metadata.streams.filter(s=>s.codec_type==='video');
      const duration=Number(metadata.format.duration);
      if(video.length!==1||video[0].codec_name!=='h264'||video[0].width!==asset.width||video[0].height!==asset.height
        ||!Number.isFinite(duration)||Math.abs(duration*1000-asset.durationMs!)>200)throw Error('VIDEO_ANIMATION_INVALID');
    } else if(asset.mime==='application/json'){
      if(bytes.length>4*1024*1024||asset.id!==manifest.map?.buildings?.id)throw new Error('VIDEO_BUILDINGS_INVALID');
      MapBuildings.parse(JSON.parse(bytes.toString('utf8')));
    } else {
      const meta = await sharp(bytes, {limitInputPixels: 40_000_000}).metadata();
      if (meta.format !== ({'image/jpeg':'jpeg','image/png':'png','image/webp':'webp'} as const)[asset.mime]
        || meta.width !== asset.width || meta.height !== asset.height || (meta.pages ?? 1) > 1) throw new Error('VIDEO_IMAGE_INVALID');
      if (asset.id === manifest.logo?.id) {
        const pixels = await sharp(bytes).resize(32,32,{fit:'inside'}).ensureAlpha().raw().toBuffer();
        let light = 0, weight = 0;
        for (let i=0;i<pixels.length;i+=4) {const alpha=pixels[i+3]/255;weight+=alpha;light+=(pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722)*alpha;}
        logoBackground = weight && light/weight > 140 ? '#17352b' : '#ffffff';
      }
    }
    files.set(videoAssetFile(asset), {file, mime: asset.mime, size: info.size});
  }
  const font = path.join(bundleDir,'public/video-font.woff2');
  files.set('font.woff2',{file:font,mime:'font/woff2',size:(await stat(font)).size});
  const displayFont = path.join(bundleDir,'public/video-display.ttf');
  files.set('display.ttf',{file:displayFont,mime:'font/ttf',size:(await stat(displayFont)).size});
  const serifFont=path.join(bundleDir,'public/video-serif.woff2');
  files.set('serif.woff2',{file:serifFont,mime:'font/woff2',size:(await stat(serifFont)).size});
  if(manifest.map?.buildings)for(const name of ['maplibre-gl.mjs','maplibre-gl-worker.mjs','maplibre-gl-shared.mjs']){
    const file=path.join(bundleDir,'public',name);files.set(name,{file,mime:'text/javascript',size:(await stat(file)).size});
  }
  const server = createServer((req,res) => {
    const prefix=`/${token}/`, key=req.url?.startsWith(prefix) ? req.url.slice(prefix.length) : '';
    const asset=files.get(key);
    if (!asset || !['GET','HEAD'].includes(req.method ?? '')) {res.writeHead(404);res.end();return;}
    const range=parseRange(req.headers.range,asset.size);
    if(range===false){res.writeHead(416,{'Content-Range':`bytes */${asset.size}`});res.end();return;}
    res.writeHead(range?206:200,{'Content-Type':asset.mime,'Accept-Ranges':'bytes','Cache-Control':'no-store',
      'Access-Control-Allow-Origin':'*','Content-Length':range?range.end-range.start+1:asset.size,
      ...(range?{'Content-Range':`bytes ${range.start}-${range.end}/${asset.size}`}:{})});
    if(req.method==='HEAD')res.end();else createReadStream(asset.file,range||{}).on('error',()=>res.destroy()).pipe(res);
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  try {
    const address=server.address();if(!address || typeof address==='string')throw new Error('VIDEO_ASSET_SERVER_FAILED');
    const base=`http://127.0.0.1:${address.port}/${token}/`;
    for(const asset of videoAssets(manifest))media[asset.id]=base+videoAssetFile(asset);
    return await use({manifest,media,logoBackground,fontUrl:base+'font.woff2',displayFontUrl:base+'display.ttf',serifFontUrl:base+'serif.woff2',
      ...(manifest.map?.buildings?{maplibreModuleUrl:base+'maplibre-gl.mjs',maplibreWorkerUrl:base+'maplibre-gl-worker.mjs'}:{})});
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
export async function verifyVideoArtifact(file:string,id:string,frames:number,watermarked:boolean,startedAt:string,start:number,voiceEnabled=true,dimensions:Pick<VideoManifest,'width'|'height'>={width:1080,height:1920},minimumVolumeDb=-50) {
    const {stdout}=await exec(binary('ffprobe'),['-v','error','-show_format','-show_streams','-of','json',file],{cwd:cwd(binary('ffprobe')),timeout:20_000,maxBuffer:128_000});
    const metadata=JSON.parse(stdout) as {format:{duration:string};streams:{codec_type:string;codec_name:string;width?:number;height?:number;avg_frame_rate?:string;nb_frames?:string}[]};
    const video=metadata.streams.find(s=>s.codec_type==='video'), audio=metadata.streams.find(s=>s.codec_type==='audio');
    if(metadata.streams.length!==(voiceEnabled?2:1) || video?.codec_name!=='h264' || video.width!==dimensions.width || video.height!==dimensions.height
      || video.avg_frame_rate!=='30/1' || Number(video.nb_frames)!==frames || (voiceEnabled?audio?.codec_name!=='aac':Boolean(audio))
      || Math.abs(Number(metadata.format.duration)-frames/30)>.12)throw new Error('VIDEO_MP4_INVALID');
    let meanVolumeDb:number|null=null;
    if(voiceEnabled){
    const {stdout:wav}=await exec(binary('ffmpeg'),['-v','error','-i',file,'-map','0:a:0','-ar','16000','-ac','1','-f','wav','-c:a','pcm_s16le','pipe:1'],
      {cwd:cwd(binary('ffmpeg')),encoding:'buffer',timeout:30_000,maxBuffer:2_000_000});
    if(wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE')throw new Error('VIDEO_AUDIO_INVALID');
    let pcm:Buffer|undefined;
    for(let offset=12;offset+8<=wav.length;) {
      const length=wav.readUInt32LE(offset+4);
      // Une sortie WAV sur pipe utilise 0xffffffff comme longueur inconnue.
      if(wav.toString('ascii',offset,offset+4)==='data'){pcm=wav.subarray(offset+8,Math.min(wav.length,offset+8+length));break;}
      offset+=8+length+length%2;
    }
    if(!pcm?.length||pcm.length%2)throw new Error('VIDEO_AUDIO_INVALID');
    let sum=0;for(let i=0;i+2<=pcm.length;i+=2)sum+=(pcm.readInt16LE(i)/32768)**2;
    meanVolumeDb=10*Math.log10(sum/(pcm.length/2));
    if(!Number.isFinite(meanVolumeDb)||meanVolumeDb < minimumVolumeDb)throw new Error('VIDEO_AUDIO_SILENT');
    }
    const bytes=await readFile(file);
    if(!isFastStart(bytes))throw new Error('VIDEO_NOT_STREAMABLE');
    const report=VideoReport.parse({id,manifestHash:id,sha256:sha(bytes),sizeBytes:bytes.length,...dimensions,fps:30,
      codec:'h264',audioCodec:voiceEnabled?'aac':null,durationFrames:frames,durationSeconds:Number(metadata.format.duration),fastStart:true,
      watermarked,meanVolumeDb,startedAt,endedAt:new Date().toISOString(),renderAndVerifySeconds:(performance.now()-start)/1000});
    return report;
}
// One bounded derivative from the finished master. The AAC stream is copied;
// neither Remotion, narration nor the importer runs a second time.
export async function createWatermarkedPreview(master:string,directory:string,id:string,frames:number,voiceEnabled=true,dimensions:Pick<VideoManifest,'width'|'height'>={width:1080,height:1920}) {
  const start=performance.now(),startedAt=new Date().toISOString(),watermark=path.join(directory,'trial-watermark.png');
  const output=path.join(directory,'preview.mp4');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="660" height="112" viewBox="0 0 660 112">
    <rect x="1" y="1" width="658" height="110" rx="18" fill="#171714" fill-opacity=".72" stroke="#fff" stroke-opacity=".7"/>
    <g fill="none" stroke="#fff" stroke-width="4"><path d="M25 48V27H46 M77 27H98V48 M25 66V87H46 M77 87H98V66"/></g>
    <text x="122" y="58" font-family="sans-serif" font-weight="700" font-size="40" fill="#fff">bienvu · aperçu</text>
    <text x="124" y="88" font-family="sans-serif" font-size="22" fill="#fff">bienvu.online</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(watermark);
  try {
    await exec(binary('ffmpeg'),['-v','error','-i',master,'-i',watermark,'-filter_complex',`[0:v][1:v]overlay=(W-w)/2:${dimensions.width>dimensions.height?'(H-h)/2':'690'}:format=auto[v]`,
      '-map','[v]',...(voiceEnabled?['-map','0:a:0']:[]),'-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-threads','1','-c:a','copy','-movflags','+faststart','-y',output],
      // Scale the bounded transcode allowance with the validated 20–40 s
      // master, so anonymous 40 s previews do not inherit a 20 s timeout.
      {cwd:cwd(binary('ffmpeg')),timeout:Math.ceil(frames/30)*6000,maxBuffer:128_000});
    if((await stat(output)).size>50*1024*1024)throw new Error('VIDEO_TOO_LARGE');
    const report=await verifyVideoArtifact(output,id,frames,true,startedAt,start,voiceEnabled,dimensions);
    await chmod(output,0o600);return report;
  }finally{await rm(watermark,{force:true});}
}

export async function renderListingVideo(input: unknown, directory: string): Promise<VideoReport> {
  directory=path.resolve(directory);
  const manifest=VideoManifest.parse(input), id=await videoManifestHash(manifest);
  const startedAt=new Date().toISOString(), start=performance.now(), frames=manifest.scenes.reduce((n,s)=>n+s.durationFrames,0);
  const raw=path.join(directory,'raw.mp4'), partial=path.join(directory,'partial.mp4'), output=path.join(directory,'video.mp4');
  const progressFile=path.join(directory,'progress.txt'),progressTemp=path.join(directory,'.progress.tmp');
  let lastProgress=-1;
  const progress=(percent:number)=>{
    const next=Math.max(0,Math.min(95,Math.floor(percent)));
    if(next<=lastProgress)return;
    try{writeFileSync(progressTemp,String(next),{mode:0o600});renameSync(progressTemp,progressFile);lastProgress=next;}
    catch{/* La télémétrie ne doit jamais interrompre la création du MP4. */}
  };
  try {
    progress(0);
    await withVideoAssets(manifest,directory,async props=>{
      const composition=await selectComposition({serveUrl:bundleDir,id:'BienVuListing',inputProps:props,...browser(manifest)});
      await renderMedia({serveUrl:bundleDir,composition,inputProps:props,...browser(manifest),codec:'h264',audioCodec:'aac',muted:!editorHasAudio(manifest),
        pixelFormat:'yuv420p',outputLocation:raw,concurrency:1,timeoutInMilliseconds:120_000,
        audioBitrate:'192k',crf:21,logLevel:'error',onProgress:state=>progress(state.progress*85)});
    });
    progress(85);
    if((await stat(raw)).size>50*1024*1024)throw new Error('VIDEO_TOO_LARGE');
    if(!manifest.map&&isFastStart(await readFile(raw)))await rename(raw,partial);
    else await exec(binary('ffmpeg'),['-v','error','-i',raw,'-map','0','-c','copy',
      ...(manifest.map?['-metadata',`copyright=${mapCredits(manifest.map.capturedAt,manifest.map.settings.view)}`,'-metadata',`comment=${mapCredits(manifest.map.capturedAt,manifest.map.settings.view)}`]:[]),
      '-movflags','+faststart','-y',partial],{cwd:cwd(binary('ffmpeg')),timeout:60_000});
    const dimensions={width:manifest.width,height:manifest.height};
    // Sources are measured before rendering. An editor can intentionally keep a
    // short, quiet music passage or reduce voice gain; retain the silence guard.
    const report=await verifyVideoArtifact(partial,id,frames,manifest.rights.watermarked,startedAt,start,editorHasAudio(manifest),dimensions,manifest.editor?-90:-50);
    await rename(partial,output);await chmod(output,0o600);
    progress(90);
    if(manifest.rights.kind==='anonymous')report.preview=await createWatermarkedPreview(output,directory,id,frames,editorHasAudio(manifest),dimensions);
    progress(94);
    await writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
    progress(95);
    return report;
  }finally{await Promise.all([raw,partial].map(file=>rm(file,{force:true})));}
}
export async function renderListingStills(input: unknown, directory: string, output: string, frames: number[]) {
  await mkdir(output,{recursive:true,mode:0o700});
  await withVideoAssets(input,directory,async props=>{
    const composition=await selectComposition({serveUrl:bundleDir,id:'BienVuListing',inputProps:props,...browser(props.manifest!)});
    for(const frame of frames)await renderStill({serveUrl:bundleDir,composition,inputProps:props,...browser(props.manifest!),frame,
      imageFormat:'png',output:path.join(output,`frame-${frame}.png`),logLevel:'error'});
  });
}
