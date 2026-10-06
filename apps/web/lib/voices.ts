import {z} from 'zod';
import {VoiceCatalog,AdminVoices,VoiceSample,VoiceText,VideoVoice,frenchVoices,NormalizedListing,VoiceFailure} from '@bienvu/contracts';
import {voiceSettings,setDefaultVoice,cartesiaFreeUsage,reserveCartesiaVoice,finishCartesiaVoice,type Database} from '@bienvu/db';
import {frenchVoiceProvider,frenchVoiceConfig,voiceCacheKey,measureVoiceWav,type VoiceProviderEnvironment} from '@bienvu/voice';
import {requireAdmin} from './admin-access';
import {respond,RequestFailure,assertSameOrigin,boundedJson} from './http';
import type {AuthEnvironment} from './auth';
import {contentHash} from './manual-listings';

type Env=AuthEnvironment&VoiceProviderEnvironment&{DB:Database;MEDIA:Pick<R2Bucket,'get'|'put'|'head'>;SUPER_ADMIN_EMAIL?:string};
const provider=(id:string)=>id.startsWith('cartesia-')?'cartesia':id.startsWith('fish-')?'fish':'google';
const available=(env:VoiceProviderEnvironment,id:string)=>provider(id)==='cartesia'?env.CARTESIA_TTS_ENABLED==='true'&&Boolean(env.CARTESIA_API_KEY):
  provider(id)==='fish'?env.FISH_TTS_ENABLED==='true'&&Boolean(env.FISH_API_KEY):Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON&&env.GOOGLE_CLOUD_PROJECT);
export async function publicVoiceCatalog(env:{DB:Database}&VoiceProviderEnvironment){
  const settings=await voiceSettings(env.DB);
  return VoiceCatalog.parse({defaultVoice:settings.voice,revision:settings.revision,voices:frenchVoices.map(v=>({id:v.id,name:v.name,provider:provider(v.id),
    model:provider(v.id)==='cartesia'?'Sonic 3.6':provider(v.id)==='fish'?'S2.1 Pro':'Chirp 3 HD',
    accent:provider(v.id)==='cartesia'?'Français · Parisien':provider(v.id)==='google'?'Français · France':'Français',available:available(env,v.id)}))});
}
export function announcementVoiceText(listing:NormalizedListing){
  const f=listing.facts,amount=f.price.value,details=[f.title.value,f.locality.value,
    f.area.value?`${f.area.value} mètres carrés`:null,f.rooms?.value?`${f.rooms.value} pièces`:null,
    amount?`${new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(amount.amountCents/100)} euros${amount.period==='month'?' par mois':''}`:null,
    listing.description?.text].filter(Boolean).join('. ').replace(/\s+/g,' ').replace(/[<>\u0000-\u001f\u007f]/g,' ').trim();
  if(details.length<=900)return details;
  const part=details.slice(0,895),stop=Math.max(part.lastIndexOf('. '),part.lastIndexOf('! '),part.lastIndexOf('? '));
  return (stop>250?part.slice(0,stop+1):part.slice(0,part.lastIndexOf(' '))+'.').trim();
}
export async function adminVoiceCatalog(env:Env,q=''){
  const row=await env.DB.prepare(`SELECT json_group_array(json_object('id',id,'result',result_json)) AS items FROM
    (SELECT id,result_json FROM listing_imports WHERE status='ready' AND source_kind IN ('manual','url')
    AND (?='' OR instr(lower(result_json),lower(?))>0) ORDER BY created_at DESC LIMIT 30)`).bind(q,q).first<{items:string}>();
  const items: {id:string;result:string}[]=JSON.parse(row?.items??'[]');
  const listings=items.flatMap(item=>{const listing=NormalizedListing.safeParse(JSON.parse(item.result));
    return listing.success?[{id:item.id,title:[listing.data.facts.title.value,listing.data.facts.locality.value].filter(Boolean).join(' · '),text:announcementVoiceText(listing.data)}]:[];});
  return AdminVoices.parse({catalog:await publicVoiceCatalog(env),usage:await cartesiaFreeUsage(env.DB),listings});
}
type SampleRow={id:string;voice_id:string;state:string;object_key:string;metrics_json:string|null};
const sampleView=(row:SampleRow,cached:boolean)=>VoiceSample.parse({id:row.id,voice:row.voice_id,url:`/api/admin/voices/samples/${row.id}`,
  durationMs:JSON.parse(row.metrics_json!).durationMs,cached});
export async function createVoiceSample(env:Env,actorId:string,input:unknown,options:{provider?:typeof frenchVoiceProvider}={}){
  const parsed=z.object({voice:VideoVoice,text:VoiceText.refine(t=>!/[<>]/.test(t))}).strict().safeParse(input);
  if(!parsed.success)throw new RequestFailure('VALIDATION_ERROR');const {voice,text}=parsed.data;
  if(!available(env,voice))throw new RequestFailure('VOICE_SAMPLE_FAILED');
  const config=frenchVoiceConfig(voice,env.GOOGLE_CLOUD_PROJECT),textHash=await voiceCacheKey(config,text),
    id=await contentHash(new TextEncoder().encode(`voice-sample/1:${textHash}`)),key=`admin/voices/${id}.wav`;
  const previous=()=>env.DB.prepare('SELECT * FROM voice_samples WHERE id=?').bind(id).first<SampleRow>();
  const old=await previous();if(old){if(old.state==='done')return sampleView(old,true);throw new RequestFailure('VOICE_SAMPLE_REVIEW');}
  const recent=await env.DB.prepare('SELECT count(*) AS n FROM voice_samples WHERE actor_id=? AND created_at>?')
    .bind(actorId,new Date(Date.now()-86400_000).toISOString()).first<{n:number}>();if((recent?.n??0)>=60)throw new RequestFailure('RATE_LIMITED');
  // Claim before touching any provider. Concurrent clicks cannot spend twice.
  try{await env.DB.prepare("INSERT INTO voice_samples(id,voice_id,text_hash,actor_id,created_at,state,object_key) VALUES(?,?,?,?,?,'pending',?)")
    .bind(id,voice,textHash,actorId,new Date().toISOString(),key).run();}
  catch(cause){if(String(cause).includes('VOICE_SAMPLE_RATE_LIMIT'))throw new RequestFailure('RATE_LIMITED');
    const winner=await previous();if(winner?.state==='done')return sampleView(winner,true);throw new RequestFailure('VOICE_SAMPLE_REVIEW');}
  let reserved=false,success=false;
  try{
    const client=await (options.provider??frenchVoiceProvider)(env,voice,{maximumDurationMs:300000});
    if(config.provider==='cartesia'){await reserveCartesiaVoice(env.DB,`sample:${id}`,text);reserved=true;}
    const result=await client.synthesize(text),measured=measureVoiceWav(result.bytes,300000);
    await env.MEDIA.put(key,result.bytes,{httpMetadata:{contentType:'audio/wav',cacheControl:'private, no-store'},customMetadata:{sha256:result.sha256}});
    await env.DB.prepare("UPDATE voice_samples SET state='done',metrics_json=? WHERE id=? AND state='pending'")
      .bind(JSON.stringify({durationMs:measured.durationMs,sha256:result.sha256,sizeBytes:result.bytes.length,metrics:{...result,bytes:undefined}}),id).run();
    success=true;return sampleView((await previous())!,false);
  }catch(cause){const code=cause instanceof VoiceFailure?cause.code:'VOICE_SAMPLE_FAILED';
    // A limit rejected before dispatch may safely be tried later.
    if(!reserved&&config.provider==='cartesia'&&['VOICE_FREE_LIMIT','VOICE_BUSY'].includes(code)){
      await env.DB.prepare("DELETE FROM voice_samples WHERE id=? AND state='pending'").bind(id).run();
      throw new RequestFailure(code as 'VOICE_FREE_LIMIT'|'VOICE_BUSY');}
    await env.DB.prepare("UPDATE voice_samples SET state='failed',error_code=? WHERE id=? AND state='pending'").bind(code,id).run();
    throw new RequestFailure(code==='VOICE_FREE_LIMIT'?'VOICE_FREE_LIMIT':code==='VOICE_BUSY'?'VOICE_BUSY':'VOICE_SAMPLE_FAILED');
  }finally{if(reserved)await finishCartesiaVoice(env.DB,`sample:${id}`,success);}
}
export async function adminVoicesRequest(request:Request,env:Env,sampleId?:string){
  return respond(async()=>{
    const actor=await requireAdmin(request,env);
    if(sampleId){if(request.method!=='GET'||!/^[a-f0-9]{64}$/.test(sampleId))throw new RequestFailure('NOT_FOUND');
      const row=await env.DB.prepare("SELECT * FROM voice_samples WHERE id=? AND state='done'").bind(sampleId).first<SampleRow>();
      if(!row||row.object_key!==`admin/voices/${sampleId}.wav`)throw new RequestFailure('NOT_FOUND');
      const metrics=JSON.parse(row.metrics_json!),object=await env.MEDIA.get(row.object_key);
      if(!object||!('arrayBuffer' in object)||object.size!==metrics.sizeBytes||object.size>7*1024*1024)throw new RequestFailure('NOT_FOUND');
      const bytes=new Uint8Array(await object.arrayBuffer());
      if(await contentHash(bytes)!==metrics.sha256)throw new RequestFailure('NOT_FOUND');
      return new Response(bytes,{headers:{'Content-Type':'audio/wav','Content-Length':String(bytes.length)}});}
    if(request.method==='GET'){const q=new URL(request.url).searchParams.get('q')??'';if(q.length>100)throw new RequestFailure('VALIDATION_ERROR');
      return Response.json(await adminVoiceCatalog(env,q));}
    assertSameOrigin(request,env);
    if(request.method==='POST')return Response.json(await createVoiceSample(env,actor.id,await boundedJson(request,7000)));
    if(request.method==='PATCH'){
      const input=z.object({voice:VideoVoice,revision:z.number().int().positive()}).strict().safeParse(await boundedJson(request,512));
      if(!input.success)throw new RequestFailure('VALIDATION_ERROR');if(!available(env,input.data.voice))throw new RequestFailure('VOICE_SAMPLE_FAILED');
      try{await setDefaultVoice(env.DB,actor.id,input.data.voice,input.data.revision);}catch{throw new RequestFailure('CONFLICT');}
      return Response.json(await adminVoiceCatalog(env));}
    throw new RequestFailure('NOT_FOUND');
  });
}
