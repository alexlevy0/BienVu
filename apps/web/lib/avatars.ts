import {z} from 'zod';
import {AdminAvatarData,AvatarId,AvatarSettings,AvatarLook,AvatarGalleryQuery,publicErrors,type PublicErrorCode} from '@bienvu/contracts';
import {avatarCatalog,avatarGallery,avatarLooks,avatarSettings,avatarUsage,recentAvatarTasks,findAvatarLook,saveAvatarLook,setAvatarSettings} from '@bienvu/db';
import {heygenClient,downloadHeygenMedia,avatarCatalogKey,avatarMediaVersion,AvatarFailure,verifyHeygenSignature,type HeygenEnvironment} from '@bienvu/avatars';
import type {AuthEnvironment} from './auth';
import {requireAdmin} from './admin-access';
import {respond,RequestFailure,assertSameOrigin,boundedJson,boundedBytes} from './http';
import {streamAvatarCatalogue} from './avatar-media-stream';

type Env=AuthEnvironment&HeygenEnvironment&{MEDIA:R2Bucket;SUPER_ADMIN_EMAIL?:string;GENERATION_SERVICE?:Fetcher;GENERATION_TOKEN?:string};
const update=z.union([z.object({settings:AvatarSettings,revision:z.number().int().positive()}).strict(),
  z.object({enableLooks:z.array(AvatarId).min(1).max(100)}).strict(),
  z.object({lookId:AvatarId,enabled:z.boolean(),transparentVerified:z.boolean()}).strict()]);
export async function publicAvatarRequest(env:Env){return respond(async()=>Response.json(await avatarCatalog(env.DB)));}
export async function publicAvatarGalleryRequest(request:Request,env:Pick<Env,'DB'>){return respond(async()=>{
  const input=AvatarGalleryQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!input.success)throw new RequestFailure('VALIDATION_ERROR');
  return Response.json(await avatarGallery(env.DB,input.data));
});}
export async function adminAvatarRequest(request:Request,env:Env){return respond(async()=>{
  const actor=await requireAdmin(request,env);
  if(request.method!=='GET')assertSameOrigin(request,env);
  try{
    if(request.method==='PATCH'){
      const input=update.safeParse(await boundedJson(request,16000));if(!input.success)throw new RequestFailure('VALIDATION_ERROR');
      if('settings' in input.data)await setAvatarSettings(env.DB,actor.id,input.data.settings,input.data.revision);
      else if('enableLooks' in input.data){
        const {settings}=await avatarSettings(env.DB),stored=await Promise.all([...new Set(input.data.enableLooks)].map(id=>findAvatarLook(env.DB,id)));
        if(stored.some(value=>!value||value.look.ownership!=='public'||!(value.look.engines.includes('avatar_iii')||settings.allowPremium&&value.look.engines.includes('avatar_iv'))))throw new RequestFailure('AVATAR_UNAVAILABLE');
        for(const value of stored)if(value&&!value.look.enabled)await saveAvatarLook(env.DB,actor.id,{...value.look,enabled:true,updatedAt:new Date().toISOString()},value.source);
      }
      else {const stored=await findAvatarLook(env.DB,input.data.lookId);if(!stored)throw new RequestFailure('NOT_FOUND');
        await saveAvatarLook(env.DB,actor.id,{...stored.look,enabled:input.data.enabled,transparentVerified:input.data.transparentVerified,updatedAt:new Date().toISOString()},stored.source);}
    }else if(request.method==='POST'){
      const input=z.union([z.object({action:z.literal('sync'),type:z.enum(['studio_avatar','photo_avatar','digital_twin']),token:z.string().max(512).optional()}).strict(),z.object({action:z.literal('reconcile')}).strict()]).safeParse(await boundedJson(request,2048));
      if(!input.success)throw new RequestFailure('VALIDATION_ERROR');if(!env.HEYGEN_API_KEY)throw new RequestFailure('AVATAR_UNAVAILABLE');
      if(input.data.action==='reconcile'){
        if(!env.GENERATION_SERVICE||!env.GENERATION_TOKEN)throw new RequestFailure('AVATAR_UNAVAILABLE');
        const response=await env.GENERATION_SERVICE.fetch('https://generation.internal/operator/avatars/reconcile',{method:'POST',headers:{Authorization:`Bearer ${env.GENERATION_TOKEN}`,'X-Agency-ID':actor.id}});
        if(!response.ok)throw new RequestFailure('AVATAR_UNAVAILABLE');await response.body?.cancel();return Response.json({checked:true});
      }
      const page=await heygenClient(env.HEYGEN_API_KEY).looks(input.data.type,input.data.token);
      for(const entry of page.looks){const current=await findAvatarLook(env.DB,entry.look.id);
        const look:AvatarLook={...entry.look,enabled:current?.look.enabled??false,transparentVerified:current?.look.transparentVerified??false,
          thumbnail:entry.source.image?`/api/avatars/${entry.look.id}/media?kind=thumbnail&v=${await avatarMediaVersion(entry.source.image)}`:null,
          preview:entry.source.video?`/api/avatars/${entry.look.id}/media?kind=preview&v=${await avatarMediaVersion(entry.source.video)}`:null};
        await saveAvatarLook(env.DB,actor.id,look,entry.source);}
      return Response.json({imported:page.looks.length,nextToken:page.nextToken});
    }else if(request.method!=='GET')throw new RequestFailure('NOT_FOUND');
    let wallet:AdminAvatarData['wallet']=null;if(env.HEYGEN_API_KEY)try{wallet=await heygenClient(env.HEYGEN_API_KEY).wallet();}catch{/* Settings remain available during a provider outage. */}
    const data=await avatarSettings(env.DB);return Response.json(AdminAvatarData.parse({...data,looks:await avatarLooks(env.DB),connected:Boolean(env.HEYGEN_API_KEY&&env.HEYGEN_ENABLED==='true'),wallet,
      usage:await avatarUsage(env.DB),tasks:await recentAvatarTasks(env.DB)}));
  }catch(cause){const code=cause instanceof AvatarFailure?cause.code:/\b(CONFLICT|RATE_LIMITED|AVATAR_[A-Z_]+)\b/.exec(String(cause))?.[1];
    if(code&&code in publicErrors)throw new RequestFailure(code as PublicErrorCode);if(cause instanceof RequestFailure)throw cause;throw new RequestFailure('AVATAR_UNAVAILABLE');}
});}
export async function avatarMediaRequest(request:Request,env:Env,id:string){let publicMedia=false;const response=await respond(async()=>{
  if(!AvatarId.safeParse(id).success)throw new RequestFailure('NOT_FOUND');
  const stored=await findAvatarLook(env.DB,id);if(!stored||stored.look.ownership!=='public')throw new RequestFailure('NOT_FOUND');
  if(!stored.look.enabled)await requireAdmin(request,env);
  publicMedia=stored.look.enabled;
  const kind=new URL(request.url).searchParams.get('kind');if(kind!=='thumbnail'&&kind!=='preview')throw new RequestFailure('NOT_FOUND');
  const source=kind==='thumbnail'?stored.source.image:stored.source.video;if(!source)throw new RequestFailure('NOT_FOUND');
  const version=await avatarMediaVersion(source),requested=new URL(request.url).searchParams.get('v');
  if(requested&&requested!==version)throw new RequestFailure('NOT_FOUND');
  const key=avatarCatalogKey(id,kind,version),mime=kind==='thumbnail'?'image/jpeg':'video/mp4';
  if(!await env.MEDIA.head(key)){const bytes=await downloadHeygenMedia(source,kind==='thumbnail'?2*1024*1024:10*1024*1024);
    const image=bytes[0]===0xff&&bytes[1]===0xd8||bytes[0]===0x89&&bytes[1]===0x50||new TextDecoder().decode(bytes.slice(0,4))==='RIFF';
    if(kind==='thumbnail'?!image:new TextDecoder().decode(bytes.slice(4,8))!=='ftyp')throw new RequestFailure('NOT_FOUND');
    await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:kind==='thumbnail'?(bytes[0]===0x89?'image/png':bytes[0]===0xff?'image/jpeg':'image/webp'):mime}});}
  return streamAvatarCatalogue(request,env.MEDIA,key);
});
  if(publicMedia&&(response.ok||response.status===304))response.headers.set('Cache-Control','public, max-age=300');
  return response;
}
export async function heygenWebhookRequest(request:Request,env:Env){
  let bytes:Uint8Array;try{bytes=await boundedBytes(request,32000);}catch{return new Response(null,{status:400});}
  if(!await verifyHeygenSignature(env.HEYGEN_WEBHOOK_SECRET??'',bytes,request.headers.get('signature')))return new Response(null,{status:401});
  let body:unknown;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return new Response(null,{status:400});}
  const event=z.object({event_type:z.enum(['avatar_video.success','avatar_video.fail']),event_data:z.object({video_id:AvatarId,callback_id:AvatarId.optional()}).passthrough()}).passthrough().safeParse(body);
  if(!event.success)return new Response(null,{status:200});
  // The notification only nudges a scoped task. Status and download URLs are
  // fetched from HeyGen itself; arbitrary webhook media never enters R2.
  const e=event.data.event_data;await env.DB.prepare(`UPDATE avatar_tasks SET provider_id=coalesce(provider_id,?),state='submitted',poll_after=?,updated_at=?
    WHERE (provider_id=? OR id=?) AND state IN ('submitted','submitting','uncertain') AND (provider_id IS NULL OR provider_id=?)`)
    .bind(e.video_id,new Date().toISOString(),new Date().toISOString(),e.video_id,e.callback_id??'',e.video_id).run();return new Response(null,{status:204});
}
