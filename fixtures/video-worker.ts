import {DurableObject} from 'cloudflare:workers';
import {VideoCoordinator, type VideoJob} from '../apps/pipeline/src/video-coordinator';
import type {VideoReport,VideoManifest} from '../packages/contracts/src/index';
type Env={MEDIA:R2Bucket;COORDINATOR:DurableObjectNamespace;PRODUCT_BUDGET?:string};
// Backend de rendu simulé, jamais déployé : D.O. SQLite et R2 sont réels dans workerd.
export class FixtureVideo extends DurableObject<Env> {
  private engine=new VideoCoordinator({storage:this.ctx.storage,bucket:this.env.MEDIA,
    call:async(path,init)=>{
      if(path==='/videos') {
        await this.ctx.storage.put('stopped',false);
        const unavailable=await this.ctx.storage.get<number>('unavailable')??0;
        if(unavailable){await this.ctx.storage.put('unavailable',unavailable-1);return new Response('Fixture startup unavailable',{status:503});}
        return Response.json({id:await this.ctx.storage.get('id'),status:'staging'}, {status:202});
      }
      if(path.includes('/assets/')){await new Response(init?.body).arrayBuffer();return Response.json({ok:true});}
      if(path.endsWith('/start')){await this.ctx.storage.put('starts',(await this.ctx.storage.get<number>('starts')??0)+1);return Response.json({status:'rendering'});}
      if(path.endsWith('/preview'))return new Response(new Uint8Array([3,2,1]));
      if(path.endsWith('/file'))return new Response(new Uint8Array([1,2,3]));
      if(init?.method==='DELETE'){await this.ctx.storage.put('cleaned',true);return Response.json({ok:true});}
      return Response.json({id:await this.ctx.storage.get('id'),status:await this.ctx.storage.get('hold')?'rendering':'ready',
        progressPercent:await this.ctx.storage.get('progressPercent')??0,report:await this.ctx.storage.get('report')});
    },running:async()=>!await this.ctx.storage.get('stopped'),stop:async()=>{await this.ctx.storage.put('stopped',true);},schedule:async()=>{},
    productBudget:this.env.PRODUCT_BUDGET==='true'?async()=>{const snapshot=await this.ctx.storage.get<import('../apps/pipeline/src/budget').Budget>('productBudget');if(!snapshot)throw new Error('VIDEO_BUDGET_LIMIT');return snapshot;}:undefined,
    now:()=>this.clock,maxAttempts:4,budget:{month:new Date().toISOString().slice(0,7),paused:false,fixedAndOtherCents:2425,
      ceilingCents:3500,envelopeCents:4000,committedCents:0,attempts:0,days:{}}});
  private clock=Date.now();
  override async fetch(request:Request) {
    this.clock=await this.ctx.storage.get<number>('clock')??this.clock;
    const path=new URL(request.url).pathname;
    if(path==='/accept') {
      const {manifest,report}=await request.json() as {manifest:VideoManifest;report:VideoReport};
      await this.ctx.storage.put({id:report.id,report});try{return Response.json(await this.engine.accept(manifest));}catch(error){return Response.json({error:(error as Error).message},{status:409});}
    }
    if(path==='/cancel'){const {id}=await request.json() as {id:string};return Response.json(await this.engine.cancel(id)??null);}
    if(path==='/advance'){await this.engine.advance();return Response.json(await this.engine.state());}
    if(path==='/control'){const value=await request.json() as Record<string,unknown>;if(value.clock)this.clock=Number(value.clock);await this.ctx.storage.put(value);return Response.json({ok:true});}
    if(path==='/publishing'){const id=(await this.ctx.storage.get<string>('id'))!,job=(await this.engine.get(id))!;
      // Simule la coupure entre R2.put et l'enregistrement ready.
      await this.ctx.storage.put(`video:${id}`,{...job,status:'publishing'} satisfies VideoJob);await this.ctx.storage.put('active',id);return Response.json({ok:true});}
    if(path==='/pause'){await this.engine.pause();return Response.json({ok:true});}
    if(path==='/retry'){
      const {failedAt}=await request.json() as {failedAt:number};
      try{return Response.json(await this.engine.retry((await this.ctx.storage.get<string>('id'))!,failedAt));}
      catch(error){return Response.json({error:(error as Error).message},{status:409});}
    }
    if(path==='/history')return Response.json(await this.engine.history((await this.ctx.storage.get<string>('id'))!));
    if(path==='/budget-history')return Response.json([...await this.ctx.storage.list({prefix:'budget-history:'})]);
    const id=await this.ctx.storage.get<string>('id');return Response.json({state:await this.engine.state(),job:id?await this.engine.get(id):null,
      starts:await this.ctx.storage.get('starts')??0,cleaned:await this.ctx.storage.get('cleaned')??false,stopped:await this.ctx.storage.get('stopped')??false});
  }
}
export default {fetch(request:Request,env:Env) {const url=new URL(request.url),name=url.searchParams.get('name')??'default';return env.COORDINATOR.getByName(name).fetch(request);}};
