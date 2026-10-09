import {DurableObject} from 'cloudflare:workers';
import worker,{reconcileBatch,reconcileGeneration,GenerationWorkflow, type GenerationEnv} from '../apps/pipeline/src/generation-worker';
import {VideoManifest,VideoReport,videoManifestHash,videoObjectKey,videoPreviewKey} from '../packages/contracts/src/index';
import {DEFAULT_SCRIPT_MODEL} from '../packages/narration/src/index';
import {googleTts,fishTts,cartesiaTts,frenchVoiceConfig} from '../packages/voice/src/index';
import {toneFixture} from './voice';
import {fixturePlan,fixtureScriptMetrics} from './narration';
import {findGeneration,generationView} from '../packages/db/src/index';
import {productRenderBudget} from '../apps/pipeline/src/product-render-budget';
export class FixtureGenerationWorkflow extends GenerationWorkflow {
  // The workflow fixture must never contact the real map service.
  protected override async defaultMap(){return null;}
  protected override diagnostic(error:unknown){console.error(error);}
  protected override async providers(voiceName?:string,voiceEnabled=true){
    const config=frenchVoiceConfig(voiceName??'fish-manon','bienvu-fixture');
    const voice=config.provider==='cartesia'?cartesiaTts(config,'fixture-key-never-networked',{fetch:async()=>new Response(new Uint8Array(toneFixture(4500)))})
      :config.provider==='fish'?fishTts(config,'fixture-key-never-networked',{fetch:async()=>new Response(new Uint8Array(toneFixture(4500)))})
      :googleTts(config,async()=>'fixture-token-never-networked', {fetch:async()=>{const bytes=toneFixture(4500);let text='';for(const b of bytes)text+=String.fromCharCode(b);return Response.json({audioContent:btoa(text)});}});
    return {mode:'mock' as const,script:{model:DEFAULT_SCRIPT_MODEL,plan:async(context:Parameters<typeof fixturePlan>[0])=>({plan:fixturePlan(context),metrics:fixtureScriptMetrics()})},voice:{config,synthesize:voiceEnabled?voice.synthesize:async():Promise<never>=>{throw Error('TTS_MUST_NOT_RUN');}}};
  }
}
export class FixtureInvalidScriptWorkflow extends FixtureGenerationWorkflow {
  protected override async providers(voiceName?:string,voiceEnabled=true){
    const providers=await super.providers(voiceName,voiceEnabled);
    return {...providers,script:{...providers.script,plan:async(context:Parameters<typeof fixturePlan>[0])=>{
      const plan=fixturePlan(context);plan.scenes[1].copyId='gallery/foreign';
      return {plan,metrics:fixtureScriptMetrics()};
    }}};
  }
}
export class FixtureGenerationRenderer extends DurableObject<GenerationEnv>{
  override async fetch(request:Request){
    const path=new URL(request.url).pathname;
    if(path==='/render'){
      const manifest=VideoManifest.parse(await request.json()),id=await videoManifestHash(manifest);
      const existing=await this.ctx.storage.get(id);if(existing)return Response.json(existing);
      await productRenderBudget(this.env.DB,manifest,Date.now());
      const bytes=new Uint8Array([1,2,3,4]),sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
      const frames=manifest.scenes.reduce((n,s)=>n+s.durationFrames,0),at=new Date().toISOString(),objectKey=videoObjectKey(manifest,id);
      const report:VideoReport={id,manifestHash:id,sha256:sha,sizeBytes:bytes.length,width:manifest.width,height:manifest.height,fps:30,codec:'h264',audioCodec:manifest.voiceEnabled===false?null:'aac',durationFrames:frames,durationSeconds:frames/30,fastStart:true,watermarked:manifest.rights.watermarked,meanVolumeDb:manifest.voiceEnabled===false?null:-20,startedAt:at,endedAt:at,renderAndVerifySeconds:0};
      await this.env.MEDIA.put(objectKey,bytes,{customMetadata:{sha256:sha,manifestHash:id}});
      if(manifest.rights.kind==='anonymous'){
        const preview=new Uint8Array([5,6,7,8]),previewHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',preview))].map(b=>b.toString(16).padStart(2,'0')).join('');
        report.preview={...report,sha256:previewHash,watermarked:true};
        await this.env.MEDIA.put(videoPreviewKey(manifest,id),preview,{customMetadata:{sha256:previewHash,manifestHash:id}});
      }
      const result={status:'ready',report,objectKey};await this.ctx.storage.put(id,result);
      await this.ctx.storage.put('starts',(await this.ctx.storage.get<number>('starts')??0)+1);return Response.json(result);
    }
    if(path==='/count')return Response.json({starts:await this.ctx.storage.get('starts')??0});
    return Response.json(await this.ctx.storage.get(path.split('/')[2])??null);
  }
}
export default {async fetch(request:Request,env:GenerationEnv){
  if(new URL(request.url).pathname==='/tick'){await reconcileBatch(env);return Response.json({reconciled:true});}
  if(new URL(request.url).pathname.startsWith('/reconcile/')){const row=await findGeneration(env.DB,request.headers.get('X-Agency-ID')!,new URL(request.url).pathname.split('/')[2]);if(row)await reconcileGeneration(env,row);return Response.json({reconciled:true});}
  if(new URL(request.url).pathname.startsWith('/job/')){const row=await findGeneration(env.DB,request.headers.get('X-Agency-ID')!,new URL(request.url).pathname.split('/')[2]);return Response.json(row?generationView(row):null);}
  return worker.fetch(request,env);
}};
