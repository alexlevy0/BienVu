import {Container} from '@cloudflare/containers';
import {authorized,json} from './auth';
import {getJobVideo,prepareJobVideo} from './video-manifest';
import {VideoCoordinator} from './video-coordinator';
import {containerGrossUsd} from './budget';
type Env=VideoEnv&{PROBE_TOKEN?:string;RENDER_TOKEN?:string};
export class VideoRenderer extends Container<Env> {
  defaultPort=8080;
  sleepAfter='30s';
  enableInternet=false;
  envVars={RENDER_TOKEN:this.env.RENDER_TOKEN??'',RENDER_ENV:'cloudflare-container',INSTANCE_TYPE:'standard-2'};
  private engine=new VideoCoordinator({storage:this.ctx.storage,bucket:this.env.MEDIA,
    call:async(path,init={})=>{const headers=new Headers(init.headers);headers.set('Authorization',`Bearer ${this.env.RENDER_TOKEN}`);
      if((await this.getState()).status!=='healthy') {
        const previous=await this.ctx.storage.get<{startedAt:number;stoppedAt?:number}>('lifecycle');
        if(!previous||previous.stoppedAt)await this.ctx.storage.put('lifecycle',{startedAt:Date.now()});
        try {await this.startAndWaitForPorts({ports:[8080],cancellationOptions:{instanceGetTimeoutMS:30_000,
          portReadyTimeoutMS:60_000,abort:AbortSignal.timeout(90_000)}});}
        catch(error) {
          let message=error instanceof Error?error.message:String(error);
          for(const token of [this.env.RENDER_TOKEN,this.env.PROBE_TOKEN])if(token)message=message.replaceAll(token,'[redacted]');
          await this.ctx.storage.put('bootFailure',{at:Date.now(),message:message.slice(0,1200),diagnostic:await this.diagnostic()});
          console.error(JSON.stringify({event:'video_boot_failed',message:message.slice(0,1200)}));
          throw new Error('VIDEO_CONTAINER_BOOT_FAILED');
        }
      }
      return this.containerFetch(`http://container${path}`,{...init,headers,signal:AbortSignal.timeout(60_000)});},
    running:async()=>['running','healthy'].includes((await this.getState()).status),stop:()=>this.stop(),
    schedule:async()=>{this.deleteSchedules('advance');await this.schedule(5,'advance');},
    maxAttempts:Number(this.env.VIDEO_MAX_ATTEMPTS),budget:{month:this.env.VIDEO_BUDGET_MONTH,paused:false,
      fixedAndOtherCents:Number(this.env.VIDEO_OTHER_CENTS),ceilingCents:Number(this.env.VIDEO_CEILING_CENTS),
      envelopeCents:Number(this.env.VIDEO_ENVELOPE_CENTS),committedCents:0,attempts:0,days:{}}});
  async advance(){await this.engine.advance();}
  private async diagnostic() {
    if(!this.ctx.container?.running)return {running:false};
    // Diagnostic fixe, sans shell, secret, chemin ni code fourni par le client.
    const command=`const fs=require('node:fs');(async()=>{const processes=fs.readdirSync('/proc').filter(x=>/^\\d+$/.test(x)).slice(0,80).flatMap(pid=>{try{return [{pid,name:fs.readFileSync('/proc/'+pid+'/comm','utf8').trim(),state:fs.readFileSync('/proc/'+pid+'/status','utf8').match(/State:[^\\n]+/)?.[0],cwd:fs.readlinkSync('/proc/'+pid+'/cwd')}]}catch{return []}});let health;try{const r=await fetch('http://127.0.0.1:8080/health',{signal:AbortSignal.timeout(2000)});health={status:r.status}}catch{health={error:'LOOPBACK_UNREACHABLE'}}console.log(JSON.stringify({cwd:process.cwd(),rendererExists:fs.existsSync('/app/apps/renderer/src/server.ts'),processes,health}))})()`;
    try {const child=await this.ctx.container.exec(['node','-e',command],{signal:AbortSignal.timeout(8000)});
      const output=await child.output();return {running:true,exitCode:output.exitCode,details:JSON.parse(new TextDecoder().decode(output.stdout).slice(0,12_000))};
    }catch{return {running:true,error:'VIDEO_DIAGNOSTIC_UNAVAILABLE'};}
  }
  override async fetch(request:Request):Promise<Response> {
    const path=new URL(request.url).pathname;
    if(path==='/render'&&request.method==='POST') {
      const job=await this.engine.accept(await request.json());
      return json(publicJob(job),job.status==='ready'?200:202);
    }
    if(path==='/pause'&&request.method==='POST'){await this.engine.pause();return json({paused:true});}
    if(path==='/state')return json({...await this.engine.state(),container:await this.getState(),lifecycle:await this.ctx.storage.get('lifecycle')??null,
      bootFailure:await this.ctx.storage.get('bootFailure')??null});
    if(path==='/diagnostic'&&request.method==='GET')return json(await this.diagnostic());
    const cancel=/^\/cancel\/([a-f0-9]{64})$/.exec(path);
    if(cancel&&request.method==='POST'){const job=await this.engine.cancel(cancel[1]);return json(job?publicJob(job):null);}
    const retry=/^\/retry\/([a-f0-9]{64})$/.exec(path);
    if(retry&&request.method==='POST')return json(publicJob(await this.engine.retry(retry[1],Number(this.env.VIDEO_RETRY_FAILED_AT))),202);
    const history=/^\/attempts\/([a-f0-9]{64})$/.exec(path);
    if(history&&request.method==='GET')return json((await this.engine.history(history[1])).map(publicJob));
    const match=/^\/status\/([a-f0-9]{64})$/.exec(path);
    if(match) {
      const job=await this.engine.get(match[1]);
      if(job&&!['ready','failed'].includes(job.status)){this.ctx.waitUntil(this.engine.advance());}
      return job?json(publicJob(job)):json({error:'VIDEO_NOT_FOUND'},404);
    }
    return json({error:'NOT_FOUND'},404);
  }
  override async onActivityExpired(){await this.engine.advance();if((await this.engine.state()).active)this.renewActivityTimeout();else await this.stop();}
  override async onStart(){const life=await this.ctx.storage.get<{startedAt:number}>('lifecycle');
    await this.ctx.storage.put('lifecycle',{startedAt:life?.startedAt??Date.now(),serviceReadyAt:Date.now()});}
  override async onStop(){const life=await this.ctx.storage.get<{startedAt:number}>('lifecycle');if(life){const stoppedAt=Date.now();
    await this.ctx.storage.put('lifecycle',{...life,stoppedAt,uptimeSeconds:(stoppedAt-life.startedAt)/1000,
      grossComputeUsdUpperEstimate:containerGrossUsd((stoppedAt-life.startedAt)/1000,(stoppedAt-life.startedAt)/1000),actualBilledEur:null});}}
}
function publicJob(job:Awaited<ReturnType<VideoCoordinator['accept']>>) {
  const {manifest,...rest}=job;return {...rest,rights:manifest.rights};
}
export default {
  async fetch(request:Request,env:Env):Promise<Response> {
    if(!authorized(request,env.PROBE_TOKEN))return json({error:'UNAUTHORIZED'},401);
    const path=new URL(request.url).pathname,controller=env.RENDERER.getByName('sprint-06-single-slot');
    try {
      if(path==='/state'||path==='/pause'||path==='/diagnostic')return controller.fetch(request);
      if(!['GET','HEAD','POST'].includes(request.method))return json({error:'METHOD_NOT_ALLOWED'},405);
      if(request.method==='POST') {
        // Le POST ne peut altérer le droit, la voix ou les médias du job.
        const reader=request.body?.getReader();if(reader){const part=await reader.read();await reader.cancel();if(part.value?.length)return json({error:'VIDEO_BODY_FORBIDDEN'},400);}
        if(env.VIDEO_ENABLED!=='true')return json({error:'VIDEO_DISABLED'},503);
        if(path==='/prepare')return json(await prepareJobVideo(env,env.VIDEO_AGENCY_ID,env.VIDEO_JOB_ID));
      }
      const frozen=await getJobVideo(env.DB,env.VIDEO_AGENCY_ID,env.VIDEO_JOB_ID);
      if(!frozen||frozen.state!=='prepared')return json({error:'VIDEO_NOT_PREPARED'},409);
      if(path==='/manifest'&&request.method==='GET')return json(frozen);
      if(path==='/render'&&request.method==='POST')return controller.fetch('https://video/render',{method:'POST',body:JSON.stringify(frozen.manifest)});
      if(path==='/retry'&&request.method==='POST')return controller.fetch(`https://video/retry/${frozen.hash}`,{method:'POST'});
      if(path==='/attempts'&&request.method==='GET')return controller.fetch(`https://video/attempts/${frozen.hash}`);
      if(path==='/status'&&request.method==='GET')return controller.fetch(`https://video/status/${frozen.hash}`);
      if(path==='/file'&&['GET','HEAD'].includes(request.method)) {
        const status=await controller.fetch(`https://video/status/${frozen.hash}`);
        const job=await status.json() as {status?:string;objectKey?:string};
        if(job.status!=='ready'||!job.objectKey)return json({error:'VIDEO_NOT_READY'},409);
        const head=await env.MEDIA.head(job.objectKey);if(!head)return json({error:'VIDEO_FILE_MISSING'},500);
        const range=request.headers.get('range'),match=range?/^bytes=(\d*)-(\d*)$/.exec(range):null;
        let offset=0,length=head.size;
        if(range) {
          const start=match?.[1]?Number(match[1]):Math.max(0,head.size-Number(match?.[2]));
          const end=match?.[1]&&match[2]?Math.min(head.size-1,Number(match[2])):head.size-1;
          if(!match||!match[1]&&!match[2]||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=head.size)
            return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`}});
          offset=start;length=end-start+1;
        }
        const object=request.method==='HEAD'?null:await env.MEDIA.get(job.objectKey,range?{range:{offset,length}}:undefined);
        if(!object&&request.method!=='HEAD')return json({error:'VIDEO_FILE_MISSING'},500);
        return new Response(object?.body??null,{status:range?206:200,headers:{'Content-Type':'video/mp4',
          'Accept-Ranges':'bytes','Content-Length':String(length),'Cache-Control':'private, no-store',
          ...(range?{'Content-Range':`bytes ${offset}-${offset+length-1}/${head.size}`}:{})}});
      }
      return json({error:'NOT_FOUND'},404);
    }catch(error){return json({error:error instanceof Error&&/^[A-Z_]{3,64}$/.test(error.message)?error.message:'VIDEO_FAILED'},409);}
  },
};
