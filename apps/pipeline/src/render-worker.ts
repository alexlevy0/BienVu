import {Container} from '@cloudflare/containers';
import {ProbeRender} from '@bienvu/contracts';
import {authorized,json,smallJson} from './auth';
import {type Budget,reserve,summary,containerGrossUsd} from './budget';
import {storeRenderArtifact} from './render-artifact';
type Env=RendererEnv&{PROBE_TOKEN?:string;RENDER_TOKEN?:string};
type Job={id:string;fixture:'short'|'target';status:'accepted'|'rendering'|'ready'|'failed';startedAt:number;error?:string;objectKey?:string;report?:Record<string,unknown>};

// L'atome de coordination du sprint est l'unique slot de rendu de test.
// Ce contrôleur ne remplace pas le Workflow produit des sprints suivants.
export class Renderer extends Container<Env> {
  defaultPort=8080;
  sleepAfter='30s';
  enableInternet=false;
  envVars={RENDER_TOKEN:this.env.RENDER_TOKEN??'',RENDER_ENV:this.env.PROBE_MODE==='remote'?'cloudflare-container':'local-container',INSTANCE_TYPE:'standard-2'};
  // Coordonner l'alarme et les polls HTTP dans cette instance ; l'état métier reste en stockage durable.
  private pendingPolls=new Map<string,Promise<Job|undefined>>();
  private async call(path:string,init:RequestInit={}) {
    const headers=new Headers(init.headers);headers.set('Authorization',`Bearer ${this.env.RENDER_TOKEN}`);
    console.log(JSON.stringify({event:'container_request',path,method:init.method??'GET'}));
    const response=await this.containerFetch(`http://container${path}`,{...init,headers,signal:AbortSignal.timeout(30_000)});
    console.log(JSON.stringify({event:'container_response',path,status:response.status}));
    return response;
  }
  override async fetch(request:Request):Promise<Response> {
    const url=new URL(request.url);
    if(url.pathname==='/state')return json({container:await this.getState(),active:await this.ctx.storage.get('active')??null,budget:await this.budget(),lifecycle:await this.ctx.storage.get('lifecycle')??null});
    if(url.pathname==='/pause'&&request.method==='POST'){
      const b=await this.ctx.storage.get<Budget>('budget');if(b)await this.ctx.storage.put('budget',{...b,paused:true});
      return json({paused:true});
    }
    if(url.pathname==='/diagnostic'&&request.method==='GET'){
      const state=await this.getState();
      if(!['running','healthy'].includes(state.status))return json({container:state});
      // Diagnostic fixe et borné : jamais de commande, chemin ou argument client.
      const command=`const fs=require('node:fs');(async()=>{const files=fs.readdirSync('/app/evidence/local/renderer');const processes=fs.readdirSync('/proc').filter(x=>/^\\d+$/.test(x)).flatMap(pid=>{try{return [{pid,name:fs.readFileSync('/proc/'+pid+'/comm','utf8').trim(),state:fs.readFileSync('/proc/'+pid+'/status','utf8').match(/State:[^\\n]+/)?.[0],wait:fs.readFileSync('/proc/'+pid+'/wchan','utf8').trim(),command:fs.readFileSync('/proc/'+pid+'/cmdline','utf8').split('\\0').slice(0,7).join(' ').slice(0,500)}]}catch{return []}});let health;try{const r=await fetch('http://127.0.0.1:8080/health',{headers:{Authorization:'Bearer '+process.env.RENDER_TOKEN},signal:AbortSignal.timeout(3000)});health={status:r.status,body:await r.json()}}catch(e){health={error:e.message}}console.log(JSON.stringify({files,processes,health}))})()`;
      const child=await this.ctx.container!.exec(['node','-e',command],{signal:AbortSignal.timeout(10_000)});
      const output=await child.output();
      return json({container:state,exitCode:output.exitCode,stdout:new TextDecoder().decode(output.stdout).slice(0,8000),stderr:new TextDecoder().decode(output.stderr).slice(0,2000)});
    }
    if(url.pathname==='/budget'&&request.method==='PUT'){
      const input=await smallJson(request) as {fixedAndOtherCents?:number};
      if(!Number.isInteger(input.fixedAndOtherCents)||input.fixedAndOtherCents!<0||input.fixedAndOtherCents!>2500)return json({error:'INVALID_BUDGET'},400);
      const made=await this.ctx.storage.transaction(async txn=>{
        if(await txn.get('budget'))return false;
        await txn.put('budget',{month:new Date().toISOString().slice(0,7),paused:false,fixedAndOtherCents:input.fixedAndOtherCents,committedCents:0,attempts:0,days:{}});return true;
      });
      return json({ok:made,budget:await this.budget()},made?201:409);
    }
    if(url.pathname==='/jobs'&&request.method==='POST'){
      if(this.env.PROBE_MODE!=='local'&&this.env.ALLOW_PAID_PROBES!=='true')return json({error:'PAID_PROBES_DISABLED'},503);
      const parsed=ProbeRender.safeParse(await smallJson(request));if(!parsed.success)return json({error:'INVALID_INPUT'},400);
      const input=parsed.data;
      const existing=await this.ctx.storage.get<Job>(`job:${input.id}`);
      if(existing)return json(existing,existing.fixture===input.fixture?existing.status==='ready'?200:202:409);
      let job:Job;
      try {
        job=await this.ctx.storage.transaction(async txn=>{
          if(await txn.get('active'))throw new Error('RENDER_BUSY');
          if(await txn.get(`job:${input.id}`))throw new Error('REPLAY_PENDING');
          const budget=await txn.get<Budget>('budget');if(!budget)throw new Error('BUDGET_NOT_INITIALIZED');
          await txn.put('budget',reserve(budget));
          const j:Job={...input,status:'accepted',startedAt:Date.now()};
          await txn.put(`job:${input.id}`,j);await txn.put('active',input.id);return j;
        });
      }catch(error){return json({error:error instanceof Error?error.message:'RESERVATION_FAILED'},409);}
      try {
        // Le POST attend seulement le démarrage et l'acceptation, jamais le MP4 complet.
        const response=await this.call('/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
        const receipt=await response.json() as {id?:string;status?:string};
        if(!response.ok||receipt.id!==input.id||!['accepted','rendering','ready'].includes(receipt.status??''))throw new Error('RENDER_REJECTED');
        job=await this.ctx.storage.transaction(async txn=>{
          const current=await txn.get<Job>(`job:${job.id}`);
          if(current&&current.status!=='accepted')return current;
          const rendering={...job,status:'rendering' as const};await txn.put(`job:${job.id}`,rendering);return rendering;
        });
        return json(job,job.status==='failed'?502:202);
      }catch {return json(await this.fail(job,'START_FAILED'),502);}
    }
    const match=url.pathname.match(/^\/jobs\/([a-z0-9][a-z0-9-]{0,63})(\/file)?$/);
    if(match&&request.method==='GET'){
      const job=await this.poll(match[1]);if(!job)return json({error:'NOT_FOUND'},404);
      if(!match[2])return json(job);
      if(job.status!=='ready'||!job.objectKey)return json({error:'NOT_READY'},409);
      const object=await this.env.MEDIA.get(job.objectKey);if(!object)return json({error:'ARTIFACT_MISSING'},500);
      return new Response(object.body,{headers:{'Content-Type':'video/mp4','Content-Length':String(object.size),'Cache-Control':'private, no-store','Content-Disposition':`attachment; filename="${job.id}.mp4"`}});
    }
    return json({error:'NOT_FOUND'},404);
  }
  private async budget(){const b=await this.ctx.storage.get<Budget>('budget');return b?summary(b):null;}
  override async onStart() {
    await this.ctx.storage.put('lifecycle',{startedAt:Date.now(),stoppedAt:null,instanceType:'standard-2'});
  }
  override async onStop() {
    const life=await this.ctx.storage.get<{startedAt:number}>('lifecycle');
    if(life){const stoppedAt=Date.now(),uptimeSeconds=(stoppedAt-life.startedAt)/1000;
      await this.ctx.storage.put('lifecycle',{...life,stoppedAt,uptimeSeconds,instanceType:'standard-2',
        grossComputeUsdUpperEstimate:containerGrossUsd(uptimeSeconds,uptimeSeconds),actualBilledEur:null,
        note:'Intervalle des hooks du contrôleur, à comparer aux métriques facturées. CPU supposé actif à 100 %, hors démarrage antérieur au hook.'});}
  }
  private async fail(job:Job,error:string) {
    const failed={...job,status:'failed' as const,error};
    await this.ctx.storage.transaction(async txn=>{await txn.put(`job:${job.id}`,failed);if(await txn.get('active')===job.id)await txn.delete('active');});
    return failed; // Une dépense possiblement engagée n'est jamais effacée après un échec.
  }
  async poll(id:string):Promise<Job|undefined> {
    const pending=this.pendingPolls.get(id);if(pending)return pending;
    const operation=this.pollOnce(id).finally(()=>this.pendingPolls.delete(id));
    this.pendingPolls.set(id,operation);return operation;
  }
  private async pollOnce(id:string):Promise<Job|undefined> {
    const job=await this.ctx.storage.get<Job>(`job:${id}`);if(!job||['ready','failed'].includes(job.status))return job;
    if(Date.now()-job.startedAt>600_000){await this.stop();return this.fail(job,'RENDER_TIMEOUT');}
    // Une lecture pendant le démarrage ne doit pas transformer l'acceptation en échec.
    if(job.status==='accepted')return job;
    const state=await this.getState();
    if(!['running','healthy'].includes(state.status))return this.fail(job,'RENDER_INTERRUPTED');
    const response=await this.call(`/jobs/${id}`);if(!response.ok)return this.fail(job,'RENDER_STATE_LOST');
    const rendered=await response.json() as {status:string;report?:Record<string,unknown>};
    console.log(JSON.stringify({event:'renderer_job',id,status:rendered.status}));
    if(rendered.status==='failed')return this.fail({...job,report:rendered.report},'RENDER_FAILED');
    if(rendered.status!=='ready')return job;
    const report=rendered.report;
    if(!report||typeof report.sha256!=='string'||!/^[a-f0-9]{64}$/.test(report.sha256)||typeof report.sizeBytes!=='number'||!Number.isSafeInteger(report.sizeBytes)||report.sizeBytes<=0||report.sizeBytes>50*1024*1024)return this.fail(job,'INVALID_RENDER_REPORT');
    const file=await this.call(`/jobs/${id}/file`);if(!file.ok||!file.body)return this.fail(job,'ARTIFACT_MISSING');
    const objectKey=`probes/renders/${id}.mp4`;
    // R2 vérifie le checksum pendant l'upload, puis la taille est relue.
    await storeRenderArtifact(this.env.MEDIA,objectKey,file.body,{sizeBytes:report.sizeBytes,sha256:report.sha256});
    const ready:Job={...job,status:'ready',objectKey,report};
    await this.ctx.storage.transaction(async txn=>{await txn.put(`job:${id}`,ready);if(await txn.get('active')===id)await txn.delete('active');});
    await this.env.MEDIA.put(`probes/renders/${id}.json`,JSON.stringify(ready));
    const cleanup=await this.call(`/jobs/${id}`,{method:'DELETE'});await cleanup.body?.cancel();
    return ready;
  }
  override async onActivityExpired() {
    const id=await this.ctx.storage.get<string>('active');
    if(id){try{const job=await this.poll(id);if(job&&['accepted','rendering'].includes(job.status)){this.renewActivityTimeout();return;}}catch{const job=await this.ctx.storage.get<Job>(`job:${id}`);if(job)await this.fail(job,'RECONCILIATION_FAILED');}}
    await this.stop();
  }
}
export default {
  async fetch(request:Request,env:Env) {
    if(!authorized(request,env.PROBE_TOKEN))return json({error:'UNAUTHORIZED'},401);
    // Les requêtes/réponses HTTP du SDK Containers gardent leur durée de vie fetch.
    try{return await env.RENDERER.getByName('sprint-00-single-slot').fetch(request);}catch{return json({error:'PROBE_FAILED'},500);}
  },
};
