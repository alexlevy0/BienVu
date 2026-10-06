// Operator recording only; never imported by a browser or Worker. Every real
// request reserves the shared Free envelope first. Failed/uncertain records
// deliberately require review rather than automatically retrying.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {CartesiaVoiceConfig,cartesiaParisianVoices} from '../packages/contracts/src/index';
import {cartesiaTts,measureVoiceWav,voiceCacheKey} from '../packages/voice/src/index';
import {reserveCartesiaVoice,finishCartesiaVoice,cartesiaFreeUsage,type Database} from '../packages/db/src/index';
import {cloudflare,accountId} from './cloudflare-operator.mjs';
const exec=promisify(execFile),directory='evidence/remote/cartesia-20261006/previews',publicRoot='apps/web/public/audio/voice-previews/cartesia-v1';
const text='À Lyon, découvrez cet appartement lumineux de trois pièces. Avec BienVu, vos annonces prennent vie.';
const mode=process.argv[2]??'--check';assert.ok(['--check','--one','--real'].includes(mode));
if(mode==='--check'){console.log({voices:cartesiaParisianVoices.length,maximumCharacters:text.length*cartesiaParisianVoices.length,available:cartesiaParisianVoices.filter(v=>existsSync(`${publicRoot}/${v.providerVoiceId}.mp3`)).length});}
else{
  const raw=await readFile('.env.cartesia','utf8'),key=raw.match(/^\s*CARTESIA_API_KEY\s*=\s*['"]?([^'"\r\n]+)['"]?\s*$/m)?.[1]?.trim();assert.ok(key);
  const db:Database={prepare(sql){let params:(string|number|null)[]=[];const query=async()=>{
    const result=await cloudflare(`/accounts/${accountId}/d1/database/0219384e-d439-4421-840e-32c551afdb0d/query`,{method:'POST',body:JSON.stringify({sql,params})});
    return (result as {success:boolean;results:unknown[]}[]).at(-1)?.results??[];};
    return {bind(...values){params=values;return this;},async first<T>(){return (await query())[0] as T??null;},run:query};}};
  await mkdir(directory,{recursive:true});await mkdir(publicRoot,{recursive:true});
  const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url)),rendererRequire=createRequire(require.resolve('@remotion/renderer')),
    binaries=dirname(rendererRequire.resolve(`@remotion/compositor-${process.platform}-${process.arch}/package.json`)),ffmpeg=join(binaries,'ffmpeg');
  for(const voice of mode==='--one'?cartesiaParisianVoices.slice(0,1):cartesiaParisianVoices){
    const config=CartesiaVoiceConfig.parse({voice:voice.id}),cacheKey=await voiceCacheKey(config,text),id='public:'+cacheKey,
      wav=`${directory}/${voice.providerVoiceId}.wav`,receipt=`${directory}/${voice.providerVoiceId}.json`,target=`${publicRoot}/${voice.providerVoiceId}.mp3`;
    let state:{state:string;sha256?:string;durationMs?:number};
    if(existsSync(receipt)){state=JSON.parse(await readFile(receipt,'utf8'));assert.equal(state.state,'done','Uncertain call: review before retrying');assert.ok(existsSync(wav));}
    else{
      await reserveCartesiaVoice(db,id,text);await writeFile(receipt,JSON.stringify({state:'pending',config,cacheKey}),{flag:'wx',mode:0o600});let success=false;
      try{const result=await cartesiaTts(config,key).synthesize(text),measurement=measureVoiceWav(result.bytes);
        await writeFile(wav,result.bytes,{flag:'wx',mode:0o600});state={state:'done',sha256:result.sha256,durationMs:measurement.durationMs};
        await writeFile(receipt,JSON.stringify({...state,config,cacheKey,characters:text.length}),{mode:0o600});success=true;
      }catch(error){await writeFile(receipt,JSON.stringify({state:'failed',code:error instanceof Error?error.message:'VOICE_UNAVAILABLE'}),{mode:0o600});throw error;}
      finally{await finishCartesiaVoice(db,id,success);}
    }
    if(!existsSync(target))await exec(ffmpeg,['-v','error','-i',resolve(wav),'-map_metadata','-1','-ac','1','-ar','24000','-c:a','libmp3lame','-b:a','96k','-y',resolve(target)],{cwd:binaries,timeout:20000,maxBuffer:32000});
    console.log(JSON.stringify({voice:voice.name,durationMs:state.durationMs,ready:true}));
  }
  console.log(await cartesiaFreeUsage(db));
}
