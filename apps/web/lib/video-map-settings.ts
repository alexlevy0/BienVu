import {UpdateVideoMapSettings} from '@bienvu/contracts';
import {videoMapSettings,setVideoMapSettings} from '@bienvu/db';
import type {AuthEnvironment} from './auth';
import {requireAdmin} from './admin-access';
import {respond,RequestFailure,assertSameOrigin,boundedJson} from './http';

export async function adminVideoMapRequest(request:Request,env:AuthEnvironment&{SUPER_ADMIN_EMAIL?:string}){
  return respond(async()=>{
    const actor=await requireAdmin(request,env);
    if(request.method==='GET')return Response.json(await videoMapSettings(env.DB));
    if(request.method!=='PATCH')throw new RequestFailure('NOT_FOUND');
    assertSameOrigin(request,env);
    const input=UpdateVideoMapSettings.safeParse(await boundedJson(request,1024));
    if(!input.success)throw new RequestFailure('VALIDATION_ERROR');
    try{return Response.json(await setVideoMapSettings(env.DB,actor.id,input.data.settings,input.data.revision));}
    catch(cause){const message=String(cause);
      if(message.includes('VIDEO_MAP_SETTING_CONFLICT'))throw new RequestFailure('CONFLICT');
      if(message.includes('VIDEO_MAP_SETTING_RATE_LIMIT'))throw new RequestFailure('RATE_LIMITED');throw cause;}
  });
}
