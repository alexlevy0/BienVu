import {VideoManifest, VideoReport, videoAssets, videoManifestHash, videoObjectKey,videoPreviewKey} from '@bienvu/contracts';
import {reserve, budgetLimits, type Budget} from './budget';
import {storeRenderArtifact} from './render-artifact';

export type VideoJob = {id:string;manifest:VideoManifest;status:'accepted'|'staging'|'starting'|'rendering'|'publishing'|'ready'|'failed';
  startedAt:number;updatedAt:number;report?:VideoReport;objectKey?:string;error?:string;failures:number;progressPercent?:number;
  diagnostic?:{operation:'submit'|'boot';httpStatus?:number;code?:string};attempt?:number;retryOf?:number};
type Dependencies = {storage:DurableObjectStorage;bucket:R2Bucket;call:(path:string,init?:RequestInit)=>Promise<Response>;
  running:()=>Promise<boolean>;stop:()=>Promise<void>;schedule:()=>Promise<unknown>;now?:()=>number;
  budget:Budget;maxAttempts:number;productBudget?:(manifest:VideoManifest,now:number)=>Promise<Budget>};
const terminal=(job:VideoJob)=>['ready','failed'].includes(job.status);
const safeError=(error:unknown)=>error instanceof Error&&/^[A-Z_]{3,64}$/.test(error.message)?error.message:'VIDEO_INTERNAL_ERROR';

// Un seul slot de calcul borné pour cette recette ; état persistant indépendant
// du disque éphémère. Le Workflow produit sera branché au sprint 07.
export class VideoCoordinator {
  private pending:Promise<void>|null=null;
  private cancellation:Promise<VideoJob|undefined>|null=null;
  constructor(private deps:Dependencies){
    if(!Number.isInteger(deps.maxAttempts)||deps.maxAttempts<1||deps.maxAttempts>5
      ||!Number.isInteger(deps.budget.fixedAndOtherCents)||deps.budget.fixedAndOtherCents<0||deps.budget.fixedAndOtherCents>budgetLimits(deps.budget).ceilingCents
      ||!/^\d{4}-\d{2}$/.test(deps.budget.month))throw new Error('VIDEO_BUDGET_CONFIG_INVALID');
  }
  private now(){return this.deps.now?.()??Date.now();}
  async accept(input:unknown) {
    const manifest=VideoManifest.parse(input),id=await videoManifestHash(manifest);
    // D1 est relu hors transaction DO : un rejeu ne relance pas les lectures,
    // et les éventuelles reprises de transaction n'exécutent aucun I/O externe.
    const known=await this.deps.storage.get<VideoJob>(`video:${id}`);
    if(known){if(!terminal(known))await this.deps.schedule();return known;}
    const now=this.now(),snapshot=await this.deps.productBudget?.(manifest,now);
    const result=await this.deps.storage.transaction(async tx=>{
      const old=await tx.get<VideoJob>(`video:${id}`);if(old)return old;
      if(await tx.get(`cancel:${id}`))throw new Error('VIDEO_CANCELLED');
      if(await tx.get('cancelling'))throw new Error('VIDEO_BUSY');
      if(await tx.get('paused'))throw new Error('VIDEO_PAUSED');
      if(await tx.get('active'))throw new Error('VIDEO_BUSY');
      const previous=await tx.get<Budget>('budget'),budget=previous??this.deps.budget;
      const provision=manifest.rights.kind==='anonymous'?50+manifest.rights.previewProvisionCents:50;
      if(snapshot){
        budgetLimits(snapshot);
        if(snapshot.paused||snapshot.month!==new Date(now).toISOString().slice(0,7)||snapshot.fixedAndOtherCents>budgetLimits(snapshot).ceilingCents)throw new Error('VIDEO_BUDGET_LIMIT');
        const sameMonth=previous?.month===snapshot.month;
        if(previous&&!sameMonth)await tx.put(`budget-history:${budget.month}`,budget);
        const committed=(sameMonth?budget.committedCents:0)+provision,day=new Date(now).toISOString().slice(0,10);
        if(snapshot.fixedAndOtherCents<committed)throw new Error('VIDEO_BUDGET_RECONCILIATION_REQUIRED');
        // Journal technique inclus dans la provision D1. Limites produit : D1
        // (5/jour, 30/mois), distinctes des cinq tentatives de la recette initiale.
        await tx.put('budget',{...snapshot,committedCents:committed,fixedAndOtherCents:snapshot.fixedAndOtherCents-committed,
          attempts:(sameMonth?budget.attempts:0)+1,days:{...(sameMonth?budget.days:{}),[day]:(sameMonth?budget.days[day]??0:0)+1}} satisfies Budget);
      }else{
        if(budget.attempts>=this.deps.maxAttempts)throw new Error('VIDEO_ATTEMPT_LIMIT');
        await tx.put('budget',reserve(budget,new Date(now),provision));
      }
      const job:VideoJob={id,manifest,status:'accepted',startedAt:this.now(),updatedAt:this.now(),failures:0,attempt:1};
      await tx.put(`video:${id}`,job);await tx.put('active',id);return job;
    });
    if(!terminal(result))await this.deps.schedule();
    return result;
  }
  async cancel(id:string):Promise<VideoJob|undefined> {
    if(this.cancellation)await this.cancellation;
    const work=this.cancelOnce(id);this.cancellation=work;
    try{return await work;}finally{if(this.cancellation===work)this.cancellation=null;}
  }
  private async cancelOnce(id:string) {
    const decision=await this.deps.storage.transaction(async tx=>{
      await tx.put(`cancel:${id}`,true);
      const job=await tx.get<VideoJob>(`video:${id}`),active=await tx.get<string>('active');
      if(!job||job.status==='ready'||active&&active!==id)return {job,stop:false};
      // Aucun nouveau job ne peut occuper le slot pendant l'arrêt d'un ancien.
      const hold=await tx.get<string>('cancelling');if(hold&&hold!==id)throw new Error('VIDEO_BUSY');
      await tx.put('cancelling',id);return {job,stop:true};
    });
    if(!decision.stop)return decision.job;
    if(this.pending)await this.pending;
    const job=(await this.get(id))!;
    if(job.status!=='ready'){
      await this.deps.stop();
      if(await this.deps.running())throw new Error('VIDEO_CONTAINER_STILL_RUNNING');
      await this.finish({...job,status:'failed',error:job.error??'VIDEO_CANCELLED'});
    }
    await this.deps.storage.transaction(async tx=>{if(await tx.get('cancelling')===id)await tx.delete('cancelling');});
    return this.get(id);
  }
  async pause(){await this.deps.storage.put('paused',true);}
  async retry(id:string,failedAt:number) {
    if(!Number.isSafeInteger(failedAt)||failedAt<=0)throw new Error('VIDEO_RETRY_INTENT_REQUIRED');
    const existing=await this.get(id);
    if(existing?.retryOf===failedAt)return existing;
    // Reprise opérateur seulement, jamais un effet d'un GET/POST ordinaire.
    // Arrêt prouvé avant de réarmer : aucun calcul en double sur un ancien VM.
    if(await this.deps.running())throw new Error('VIDEO_CONTAINER_STILL_RUNNING');
    const result=await this.deps.storage.transaction(async tx=>{
      const old=await tx.get<VideoJob>(`video:${id}`);
      if(old?.retryOf===failedAt)return old;
      if(!old||old.status!=='failed'||old.updatedAt!==failedAt)throw new Error('VIDEO_RETRY_INTENT_STALE');
      if(await tx.get('active'))throw new Error('VIDEO_BUSY');
      const previous=await tx.get<Budget>('budget');
      if(!previous||previous.month!==this.deps.budget.month||this.deps.budget.fixedAndOtherCents<previous.fixedAndOtherCents)
        throw new Error('VIDEO_BUDGET_RECONCILIATION_REQUIRED');
      if(previous.attempts>=this.deps.maxAttempts)throw new Error('VIDEO_ATTEMPT_LIMIT');
      const budget={...previous,...budgetLimits(this.deps.budget),fixedAndOtherCents:this.deps.budget.fixedAndOtherCents,paused:false};
      await tx.put('budget',reserve(budget,new Date(this.now()),old.manifest.rights.kind==='anonymous'?50+old.manifest.rights.previewProvisionCents:50));
      await tx.put(`video-attempt:${id}:${old.attempt??1}`,old);
      const job:VideoJob={id,manifest:old.manifest,status:'accepted',startedAt:this.now(),updatedAt:this.now(),failures:0,
        attempt:(old.attempt??1)+1,retryOf:failedAt};
      await tx.put(`video:${id}`,job);await tx.put('active',id);await tx.put('paused',false);return job;
    });
    if(!terminal(result))await this.deps.schedule();return result;
  }
  async history(id:string) {
    const old=await this.deps.storage.list<VideoJob>({prefix:`video-attempt:${id}:`,limit:5});
    const current=await this.get(id);return [...old.values(),...(current?[current]:[])];
  }
  async get(id:string){return this.deps.storage.get<VideoJob>(`video:${id}`);}
  async state(){return {active:await this.deps.storage.get('active')??null,paused:await this.deps.storage.get('paused')??false,
    budget:await this.deps.storage.get('budget')??null};}
  private async save(job:VideoJob){job.updatedAt=this.now();await this.deps.storage.put(`video:${job.id}`,job);}
  private async finish(job:VideoJob) {
    await this.deps.storage.transaction(async tx=>{await tx.put(`video:${job.id}`,{...job,updatedAt:this.now()});
      if(await tx.get('active')===job.id)await tx.delete('active');});
  }
  async advance():Promise<void> {
    if(this.pending)return this.pending;
    this.pending=this.advanceOnce().finally(()=>{this.pending=null;});return this.pending;
  }
  private async advanceOnce() {
    const id=await this.deps.storage.get<string>('active');if(!id)return;
    let job=await this.get(id);if(!job||terminal(job))return;
    try {
      if(await this.deps.storage.get(`cancel:${id}`))throw new Error('VIDEO_CANCELLED');
      if(this.now()-job.startedAt>600_000)throw new Error('VIDEO_TIMEOUT');
      // Un stockage terminé peut être réconcilié sans démarrer le conteneur.
      if(job.status==='publishing'&&job.report&&await this.stored(job)) {await this.complete(job);return;}
      if(['starting','rendering','publishing'].includes(job.status)&&!await this.deps.running())throw new Error('VIDEO_RENDER_INTERRUPTED');
      if(job.status==='accepted'||job.status==='staging') {
        job={...job,status:'staging'};await this.save(job);
        const accepted=await this.deps.call('/videos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,manifest:job.manifest})});
        if(!accepted.ok) {
          await accepted.body?.cancel();
          // Le SDK peut répondre 500/503 pendant le démarrage, avant que Node
          // ait accepté le manifeste. Une reprise de staging ne lance pas de calcul.
          job={...job,diagnostic:{operation:'submit',httpStatus:accepted.status}};
          throw new Error(accepted.status===429||accepted.status>=500?'VIDEO_CONTAINER_UNAVAILABLE':'VIDEO_CONTAINER_REJECTED');
        }
        const receipt=await accepted.json() as {id?:string;status?:string};
        if(receipt.id!==id)throw new Error('VIDEO_CONTAINER_REJECTED');
        if(receipt.status==='staging') {
          for(const asset of videoAssets(job.manifest)) {
            const object=await this.deps.bucket.get(asset.objectKey);
            if(!object||object.size!==asset.sizeBytes)throw new Error('VIDEO_ASSET_MISSING');
            const upload=await this.deps.call(`/videos/${id}/assets/${asset.id}`,{method:'PUT',body:object.body,headers:{'Content-Type':asset.mime}});
            await upload.body?.cancel();if(!upload.ok)throw new Error('VIDEO_ASSET_REJECTED');
          }
          // Persisté avant le POST : toute ambiguïté est résolue par le statut,
          // jamais par un second calcul après perte du disque du conteneur.
          job={...job,status:'starting'};await this.save(job);
          const start=await this.deps.call(`/videos/${id}/start`,{method:'POST'});
          await start.body?.cancel();if(!start.ok)throw new Error('VIDEO_START_FAILED');
        }
        job={...job,status:'rendering'};await this.save(job);
      }
      if(job.status==='starting') {
        // Le même POST est idempotent sur disque ; si le conteneur a disparu,
        // le contrôle running ci-dessus interdit de le relancer.
        const start=await this.deps.call(`/videos/${id}/start`,{method:'POST'});
        await start.body?.cancel();if(!start.ok)throw new Error('VIDEO_START_FAILED');
        job={...job,status:'rendering'};await this.save(job);
      }
      if(job.status==='rendering') {
        const response=await this.deps.call(`/videos/${id}`);
        if(!response.ok)throw new Error('VIDEO_STATE_LOST');
        const result=await response.json() as {id?:string;status?:string;report?:unknown;error?:string;progressPercent?:number};
        if(result.id!==id)throw new Error('VIDEO_STATE_LOST');
        if(result.status==='failed')throw new Error(result.error??'VIDEO_RENDER_FAILED');
        if(result.status!=='ready'){
          const percent=result.progressPercent;
          if(typeof percent==='number'&&Number.isInteger(percent)&&percent>=0&&percent<=95&&percent>(job.progressPercent??0)){
            job={...job,progressPercent:percent};await this.save(job);
          }
          await this.deps.schedule();return;
        }
        const report=VideoReport.parse(result.report),frames=job.manifest.scenes.reduce((n,s)=>n+s.durationFrames,0);
        if(report.id!==id||report.manifestHash!==id||report.width!==job.manifest.width||report.height!==job.manifest.height||report.watermarked!==job.manifest.rights.watermarked||report.durationFrames!==frames
          ||Math.abs(report.durationSeconds-frames/30)>.12||report.audioCodec!==(job.manifest.voiceEnabled===false?null:'aac'))throw new Error('VIDEO_REPORT_INVALID');
        if(job.manifest.rights.kind==='anonymous'&&(!report.preview||!report.preview.watermarked||report.preview.manifestHash!==id||report.preview.id!==id||report.preview.durationFrames!==frames||Math.abs(report.preview.durationSeconds-report.durationSeconds)>.12||report.preview.sha256===report.sha256))throw new Error('VIDEO_PREVIEW_INVALID');
        job={...job,status:'publishing',progressPercent:96,report,objectKey:videoObjectKey(job.manifest,id)};await this.save(job);
      }
      if(job.status==='publishing'&&job.report&&job.objectKey) {
        if(!await this.stored(job)) {
          const file=await this.deps.call(`/videos/${id}/file`);
          if(!file.ok||!file.body)throw new Error('VIDEO_FILE_MISSING');
          await storeRenderArtifact(this.deps.bucket,job.objectKey,file.body,job.report,
            {manifestHash:id,watermarked:String(job.manifest.rights.watermarked),sha256:job.report.sha256});
        }
        if(job.manifest.rights.kind==='anonymous'&&job.report.preview){
          const preview=await this.deps.call(`/videos/${id}/preview`);
          if(!preview.ok||!preview.body)throw new Error('VIDEO_FILE_MISSING');
          await storeRenderArtifact(this.deps.bucket,videoPreviewKey(job.manifest,id),preview.body,job.report.preview,
            {manifestHash:id,watermarked:'true',sha256:job.report.preview.sha256});
        }
        if(!await this.stored(job))throw new Error('VIDEO_FILE_MISSING');
        await this.complete(job);
      }
    }catch(error){
      const code=safeError(error),uncertain=['VIDEO_INTERNAL_ERROR','VIDEO_CONTAINER_UNAVAILABLE','VIDEO_CONTAINER_BOOT_FAILED'].includes(code);
      if(code==='VIDEO_CONTAINER_BOOT_FAILED')job={...job,diagnostic:{operation:'boot',code}};
      // Une reprise de transport au plus ; aucune réservation n'est annulée.
      if(uncertain&&job.failures<1&&this.now()-job.startedAt<=600_000) {
        await this.save({...job,failures:job.failures+1});await this.deps.schedule();return;
      }
      await this.deps.stop().catch(()=>{});
      await this.finish({...job,status:'failed',error:code,failures:job.failures+1});
    }
  }
  private async stored(job:VideoJob) {
    if(!job.report||!job.objectKey)return false;
    const head=await this.deps.bucket.head(job.objectKey);if(!head)return false;
    if(head.size!==job.report.sizeBytes||head.customMetadata?.sha256!==job.report.sha256||head.customMetadata?.manifestHash!==job.id)
      throw new Error('VIDEO_ARTIFACT_CONFLICT');
    if(job.manifest.rights.kind==='anonymous'){
      if(!job.report.preview)return false;
      const preview=await this.deps.bucket.head(videoPreviewKey(job.manifest,job.id));
      if(!preview)return false;
      if(preview.size!==job.report.preview.sizeBytes||preview.customMetadata?.sha256!==job.report.preview.sha256||preview.customMetadata?.manifestHash!==job.id)throw new Error('VIDEO_ARTIFACT_CONFLICT');
    }
    return true;
  }
  private async complete(job:VideoJob) {
    await this.finish({...job,status:'ready',progressPercent:100});
    // Le résultat R2 est autoritaire avant le nettoyage de l'espace éphémère.
    try {if(await this.deps.running()) {
      const response=await this.deps.call(`/videos/${job.id}`,{method:'DELETE'});await response.body?.cancel();
    }}catch {/* L'arrêt supprime aussi le disque éphémère ; le MP4 R2 reste prêt. */}
    await this.deps.stop().catch(()=>{});
  }
}
