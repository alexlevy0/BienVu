import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {ProbeRender} from '@bienvu/contracts';
import {outputDir} from './paths';

// Le serveur reste disponible même si Chromium, un chargement natif ou un rendu se bloque.
export function runBoundedNode(args:string[],options:{timeoutMs:number;signal?:AbortSignal}):Promise<void> {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,args,{stdio:['ignore','ignore','pipe'],detached:process.platform!=='win32'});
    let stderr='';child.stderr?.on('data',(data:Buffer)=>{stderr=(stderr+data.toString('utf8')).slice(-4000);});
    let failure:string|undefined;
    const stop=(reason:string)=>{
      failure??=reason;
      if(child.pid){try{process.kill(process.platform==='win32'?child.pid:-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}}
    };
    const timer=setTimeout(()=>stop('RENDER_PROCESS_TIMEOUT'),options.timeoutMs);
    const abort=()=>stop('RENDER_CANCELLED');
    options.signal?.addEventListener('abort',abort,{once:true});
    if(options.signal?.aborted)abort();
    const cleanup=()=>{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);};
    child.once('error',()=>{cleanup();reject(new Error('RENDER_PROCESS_START_FAILED'));});
    child.once('close',(code)=>{cleanup();if(failure||code!==0)reject(new Error(failure??'RENDER_PROCESS_FAILED',{cause:{stderr}}));else resolve();});
  });
}

export async function renderInProcess(input:unknown,signal?:AbortSignal) {
  const request=ProbeRender.parse(input);
  await runBoundedNode([...process.execArgv,fileURLToPath(new URL('./cli.ts',import.meta.url)),request.id,request.fixture],{timeoutMs:540_000,signal});
  return JSON.parse(await readFile(path.join(outputDir,`${request.id}.json`),'utf8')) as Record<string,unknown>;
}
