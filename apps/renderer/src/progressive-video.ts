import {mkdir,readFile,stat,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {ProgressiveVideo,STREAM_SEGMENT_MAX_BYTES,streamSegmentFile,type VideoManifest} from '@bienvu/contracts';
import {trialWatermarkOverlay} from '../../../packages/video/src/watermark-artwork';
export type StreamOptions={directory:string;audio?:string;watermark?:string;width:number;height:number};
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

// Keep Remotion's pinned encoder, quality and final audio mux. Its growing
// pre-encoded MP4 emits a closed fragment every 60 frames (two seconds).
export function progressiveFfmpegArgs(args:string[]){
  const input=args.indexOf('-i');if(input<0||args[input+1]!=='-'||!args.at(-1)?.endsWith('.mp4'))throw Error('VIDEO_STREAM_ENCODER_INVALID');
  const source=args.slice(0,-1);
  // Dimensions and image codec are already known. Avoid FFmpeg buffering a
  // large batch of frames just to probe an image pipe before it starts.
  source.splice(input,0,'-probesize','32','-analyzeduration','0');
  return [...source,'-g','60','-keyint_min','60','-sc_threshold','0','-movflags','+frag_keyframe+empty_moov+default_base_moof',args.at(-1)!];
}

// Only mux existing H.264 packets for normal videos. The anonymous stream has
// a single, veryfast watermarked transcode, matching the former preview quality.
// A file descriptor stays open if Remotion removes its temporary directory.
export function followProgressiveVideo(file:string,options:StreamOptions){
  const ffmpeg=process.env.BIENVU_FFMPEG_PATH??'/usr/bin/ffmpeg';
  const args=['-v','error','-probesize','32768','-analyzeduration','0','-f','mp4','-i','pipe:0',
    ...(options.audio?['-i',options.audio]:[]),...(options.watermark?['-i',options.watermark]:[]),
    ...(options.watermark?['-filter_complex',trialWatermarkOverlay(options,options.audio?2:1),
      '-map','[v]','-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-threads','1','-g','60','-keyint_min','60','-sc_threshold','0']:['-map','0:v:0','-c:v','copy']),
    ...(options.audio?['-map','1:a:0','-c:a','aac','-b:a','192k','-ar','48000']:[]),
    '-f','hls','-hls_time','2','-hls_list_size','0','-hls_playlist_type','event','-hls_flags','independent_segments+temp_file',
    '-hls_segment_filename',path.join(options.directory,'segment-%06d.ts'),path.join(options.directory,'index.m3u8')];
  const child=spawn(ffmpeg,args,{stdio:['pipe','ignore','pipe']});let ended=false,stopped=false;
  const result=new Promise<boolean>(resolve=>{child.once('error',()=>{stopped=true;resolve(false);});child.once('close',code=>{stopped=true;resolve(code===0);});});
  child.stderr.on('data',()=>{/* No paths or source media in production logs. */});
  child.stdin.on('error',()=>{stopped=true;});
  const pump=(async()=>{
    let handle:Awaited<ReturnType<typeof open>>|undefined;
    try{
      while(!handle&&!stopped){try{handle=await open(file,'r');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;if(ended)return;await sleep(25);}}
      if(!handle)return;const buffer=Buffer.alloc(256*1024);let offset=0;
      while(!stopped){const {bytesRead}=await handle.read(buffer,0,buffer.length,offset);
        if(!bytesRead){if(ended)break;await sleep(25);continue;}
        offset+=bytesRead;
        // The read buffer is reused only after the write callback has completed.
        await new Promise<void>((resolve,reject)=>child.stdin.write(buffer.subarray(0,bytesRead),error=>error?reject(error):resolve()));
      }
    }catch{stopped=true;child.kill('SIGKILL');}
    finally{await handle?.close();child.stdin.end();}
  })().catch(()=>{stopped=true;child.kill('SIGKILL');});
  return {async finish(success=true){ended=true;if(!success){stopped=true;child.kill('SIGKILL');}
    const timer=setTimeout(()=>{stopped=true;child.kill('SIGKILL');},15000);
    try{await pump;return await result;}finally{clearTimeout(timer);}
  }};
}
export async function readProgressiveVideo(directory:string,manifest:VideoManifest,hash:string):Promise<ProgressiveVideo|null>{
  const root=path.join(directory,'stream');let text:string;
  try{text=await readFile(path.join(root,'index.m3u8'),'utf8');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
  if(text.length>8192)throw Error('VIDEO_STREAM_INVALID');
  const lines=text.split('\n'),segments=[];
  for(let i=0;i<lines.length;i++)if(lines[i].startsWith('#EXTINF:')){
    const durationSeconds=Number(lines[i].slice(8).split(',')[0]),file=lines[++i]?.trim();
    if(file!==streamSegmentFile(segments.length))throw Error('VIDEO_STREAM_INVALID');
    const filename=path.join(root,file),info=await stat(filename);
    if(!info.isFile()||info.size>STREAM_SEGMENT_MAX_BYTES)throw Error('VIDEO_STREAM_INVALID');
    const bytes=await readFile(filename);segments.push({file,durationSeconds,sizeBytes:info.size,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  return ProgressiveVideo.parse({version:1,manifestHash:hash,watermarked:manifest.rights.kind==='anonymous'||manifest.rights.watermarked,
    complete:text.includes('#EXT-X-ENDLIST'),segments});
}
export async function prepareProgressiveDirectory(directory:string){const root=path.join(directory,'stream');await mkdir(root,{recursive:true,mode:0o700});return root;}
