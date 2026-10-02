// One-time operator recording, never imported by web or Worker code.
// Replays reuse the WAV and durable journal; uncertain calls are never retried.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fishFrenchVoices,FishVoiceConfig,VoiceFailure} from '../packages/contracts/src/index';
import {fishTts,measureVoiceWav,voiceCacheKey} from '../packages/voice/src/index';
import {VOICE_PREVIEW_TEXT,voicePreviews} from '../apps/web/lib/voice-previews';
const exec=promisify(execFile),sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const directory=resolve('evidence/local/fish-previews'),publicRoot=resolve('apps/web/public');
let phase='configuration';
const voices=fishFrenchVoices;

async function main(){
  const mode=process.argv[2]??'--check';assert.ok(['--check','--real','--replay'].includes(mode));assert.equal(process.argv.length,3);
  if(mode==='--check'){
    console.log(JSON.stringify({voices:voices.map(v=>v.name),charactersPerVoice:[...VOICE_PREVIEW_TEXT].length,
      available:voices.map(v=>existsSync(publicRoot+voicePreviews[v.id].src)),networkRequests:0}));return;
  }
  await mkdir(directory,{recursive:true,mode:0o700});const lock=directory+'/.lock';
  await mkdir(lock,{mode:0o700}).catch(()=>{throw new VoiceFailure('VOICE_PROBE_REVIEW_REQUIRED');});
  try{
    phase='local_encoder';
    const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url)),rendererRequire=createRequire(require.resolve('@remotion/renderer'));
    const binaries=dirname(rendererRequire.resolve(`@remotion/compositor-${process.platform}-${process.arch}/package.json`));
    const ffmpeg=join(binaries,'ffmpeg'),ffprobe=join(binaries,'ffprobe');
    await exec(ffmpeg,['-hide_banner','-version'],{cwd:binaries,timeout:10_000,maxBuffer:32_000});
    let apiKey='';
    if(mode==='--real'){
      if(existsSync('.env.fish'))process.loadEnvFile('.env.fish');apiKey=process.env.FISH_API_KEY??'';
      for(const voice of fishFrenchVoices){
        const response=await fetch('https://api.fish.audio/model/'+voice.referenceId,{headers:{Authorization:'Bearer '+apiKey},redirect:'manual',signal:AbortSignal.timeout(15_000)});
        if(!response.ok)throw new VoiceFailure('VOICE_NOT_FOUND');const model=await response.json() as {_id:string;author?:{_id:string};source:string;state:string;languages:string[];dmca_taken_down?:boolean};
        assert.equal(model._id,voice.referenceId);assert.equal(model.author?._id,'d8b0991f96b44e489422ca2ddf0bd31d');
        assert.equal(model.source,'voice_design');assert.equal(model.state,'trained');assert.ok(model.languages.includes('fr'));assert.ok(!model.dmca_taken_down);
      }
    }
    const samples=[];let synthesisCalls=0;
    for(const voice of voices){
      phase=`recording_${voice.name}`;
      const reportFile=`${directory}/${voice.name.toLowerCase()}.json`,wavFile=`${directory}/${voice.name.toLowerCase()}.wav`;
      let report;
      if(existsSync(reportFile)){
        report=JSON.parse(await readFile(reportFile,'utf8'));
        if(report.state!=='done')throw new VoiceFailure('VOICE_PROBE_REVIEW_REQUIRED');
        assert.equal(report.text,VOICE_PREVIEW_TEXT);assert.equal(report.config.voice,voice.id);
        assert.equal(sha(await readFile(wavFile)),report.sha256);
      }else{
        if(mode!=='--real'||!apiKey)throw new VoiceFailure('VOICE_PROBE_REVIEW_REQUIRED');
        const config=FishVoiceConfig.parse({voice:voice.id}),cacheKey=await voiceCacheKey(config,VOICE_PREVIEW_TEXT);
        report={state:'pending',at:new Date().toISOString(),config,text:VOICE_PREVIEW_TEXT,cacheKey,reservationCents:0};
        await writeFile(reportFile,JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});
        try{
          synthesisCalls++;const {bytes,...metrics}=await fishTts(config,apiKey).synthesize(VOICE_PREVIEW_TEXT);
          const measurement=measureVoiceWav(bytes);assert.ok(measurement.durationMs>=1000&&measurement.durationMs<=20_000);
          await writeFile(wavFile,bytes,{mode:0o600,flag:'wx'});
          report={...report,...metrics,state:'done',measurement};
          await writeFile(reportFile,JSON.stringify(report,null,2),{mode:0o600});
        }catch(error){await writeFile(reportFile,JSON.stringify({...report,state:'failed',errorCode:error instanceof VoiceFailure?error.code:'RECORDING_FAILED'},null,2),{mode:0o600});throw error;}
      }
      phase=`encoding_${voice.name}`;
      const privateMp3=`${directory}/${voice.name.toLowerCase()}.mp3`,target=publicRoot+voicePreviews[voice.id].src;
      await exec(ffmpeg,['-v','error','-i',wavFile,'-map_metadata','-1','-ac','1','-ar','24000','-c:a','libmp3lame','-b:a','96k','-y',privateMp3],{cwd:binaries,timeout:20_000,maxBuffer:32_000});
      const bytes=await readFile(privateMp3);assert.ok(bytes.length>1000&&bytes.length<250_000);
      const decodedFile=`${directory}/${voice.name.toLowerCase()}-decoded.wav`;
      await exec(ffmpeg,['-v','error','-i',privateMp3,'-c:a','pcm_s16le','-y',decodedFile],{cwd:binaries,timeout:20_000,maxBuffer:32_000});
      const measurement=measureVoiceWav(await readFile(decodedFile));assert.ok(Math.abs(measurement.durationMs-report.measurement.durationMs)<150);
      const {stdout}=await exec(ffprobe,['-v','error','-show_format','-show_streams','-of','json',privateMp3],{cwd:binaries,timeout:10_000,maxBuffer:32_000});
      const metadata=JSON.parse(stdout);assert.equal(metadata.streams.length,1);assert.equal(metadata.streams[0].codec_name,'mp3');
      await mkdir(dirname(target),{recursive:true});
      if(existsSync(target))assert.equal(sha(await readFile(target)),sha(bytes),'RECORDED_ASSET_CHANGED');
      else {await writeFile(target+'.tmp',bytes,{flag:'wx'});await rename(target+'.tmp',target);}
      samples.push({voice:voice.id,name:voice.name,src:voicePreviews[voice.id].src,sha256:sha(bytes),sizeBytes:bytes.length,
        durationMs:measurement.durationMs,codec:'mp3',rmsDbfs:measurement.rmsDbfs});
    }
    const manifest={version:1,provider:'fish',model:'s2.1-pro-free',text:VOICE_PREVIEW_TEXT,samples};
    const manifestFile=publicRoot+'/audio/voice-previews/fish-v1/manifest.json';
    if(existsSync(manifestFile))assert.deepEqual(JSON.parse(await readFile(manifestFile,'utf8')),manifest);
    else await writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
    await writeFile(directory+`/run-${mode.slice(2)}.json`,JSON.stringify({at:new Date().toISOString(),mode,synthesisCalls,manifest,humanListening:'not_validated'},null,2),{mode:0o600});
    console.log(JSON.stringify({mode,synthesisCalls,samples}));
  }finally{await rm(lock,{recursive:true});}
}
main().catch(error=>{console.error(JSON.stringify({phase,error:error instanceof VoiceFailure?error.code:'VOICE_PREVIEW_PREPARATION_FAILED',kind:error instanceof Error?error.name:'unknown',help:'Conserver le journal ; ne pas relancer une synthèse incertaine.'}));process.exitCode=1;});
