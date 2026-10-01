import {DurableObject} from 'cloudflare:workers';
import worker,{reconcileBatch,reconcileGeneration,GenerationWorkflow, type GenerationEnv} from '../apps/pipeline/src/generation-worker';
import {GoogleVoiceConfig,VideoManifest,VideoReport,videoManifestHash,videoObjectKey,videoPreviewKey} from '../packages/contracts/src/index';
import {DEFAULT_SCRIPT_MODEL} from '../packages/narration/src/index';
import {googleTts} from '../packages/voice/src/index';
import {toneFixture} from './voice';
import {fixturePlan,fixtureScriptMetrics} from './narration';
import {findGeneration,generationView} from '../packages/db/src/index';
import {productRenderBudget} from '../apps/pipeline/src/product-render-budget';
export class FixtureGenerationWorkflow extends GenerationWorkflow {
  protected override diagnostic(error:unknown){console.error(error);}
  protected override async providers(){
    const config=GoogleVoiceConfig.parse({projectId:'bienvu-fixture'});
    const voice=googleTts(config,async()=>'fixture-token-never-networked', {fetch:async()=>{const bytes=toneFixture(4500);let text='';for(const b of bytes)text+=String.fromCharCode(b);return Response.json({audioContent:btoa(text)});}});
    return {mode:'mock' as const,script:{model:DEFAULT_SCRIPT_MODEL,plan:async(context:Parameters<typeof fixturePlan>[0])=>({plan:fixturePlan(context),metrics:fixtureScriptMetrics()})},voice:{config,synthesize:voice.synthesize}};
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
      const report:VideoReport={id,manifestHash:id,sha256:sha,sizeBytes:bytes.length,width:1080,height:1920,fps:30,codec:'h264',audioCodec:'aac',durationFrames:frames,durationSeconds:frames/30,fastStart:true,watermarked:manifest.rights.watermarked,meanVolumeDb:-20,startedAt:at,endedAt:at,renderAndVerifySeconds:0};
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
