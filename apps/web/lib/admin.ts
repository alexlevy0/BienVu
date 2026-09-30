import {AdminQuery,AdminTrafficQuery,AdminAction,EntityId} from '@bienvu/contracts';
import {adminPage,adminOverview,adminTraffic,adminAction,adminVideoDetail,findGeneration} from '@bienvu/db';
import type {AuthEnvironment} from './auth';
import {requireAdmin} from './admin-access';
import {assertSameOrigin,boundedJson,RequestFailure,respond} from './http';
import {streamGenerationMedia} from './generations';
export type AdminEnvironment=AuthEnvironment&Pick<CloudflareEnv,'MEDIA'|'SUPER_ADMIN_EMAIL'|'GENERATIONS_ENABLED'|'ANONYMOUS_TRIALS_ENABLED'|'IMPORT_MODE'|'AUTH_EMAIL_MODE'>&{TRAFFIC_ENABLED?:string};
export async function adminRequest(request:Request,env:AdminEnvironment){
  return respond(async()=>{
    const user=await requireAdmin(request,env);
    if(request.method==='POST'){
      assertSameOrigin(request,env);
      const action=AdminAction.safeParse(await boundedJson(request,2048));if(!action.success)throw new RequestFailure('VALIDATION_ERROR');
      try{return Response.json(await adminAction(env.DB,user.id,action.data));}
      catch(error){const message=error instanceof Error?error.message:'';
        if(message.includes('ADMIN_CONFLICT'))throw new RequestFailure('CONFLICT');
        if(message.includes('ADMIN_RATE_LIMIT'))throw new RequestFailure('RATE_LIMITED');throw error;}
    }
    if(request.method!=='GET')throw new RequestFailure('FORBIDDEN');
    const params=new URL(request.url).searchParams;
    if(params.get('section')==='traffic'){
      const query=AdminTrafficQuery.safeParse(Object.fromEntries(params));if(!query.success)throw new RequestFailure('VALIDATION_ERROR');
      return Response.json(await adminTraffic(env.DB,Number(query.data.days) as 7|30,env.TRAFFIC_ENABLED==='true'));
    }
    if(params.get('section')==='overview'){
      if([...params.keys()].some(key=>key!=='section'))throw new RequestFailure('VALIDATION_ERROR');
      return Response.json(await adminOverview(env.DB,{generations:env.GENERATIONS_ENABLED==='true',anonymousTrials:env.ANONYMOUS_TRIALS_ENABLED==='true',
        imports:env.IMPORT_MODE,email:env.AUTH_EMAIL_MODE,google:Boolean(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET),origin:env.BETTER_AUTH_URL}));
    }
    const parsed=AdminQuery.safeParse(Object.fromEntries(params));if(!parsed.success)throw new RequestFailure('VALIDATION_ERROR');
    try{return Response.json(await adminPage(env.DB,parsed.data));}
    catch(error){if(error instanceof Error&&error.message==='ADMIN_INVALID_QUERY')throw new RequestFailure('VALIDATION_ERROR');throw error;}
  });
}
export async function adminJobRequest(request:Request,env:AdminEnvironment,id:string,media=false){
  return respond(async()=>{
    await requireAdmin(request,env);
    if(!EntityId.safeParse(id).success)throw new RequestFailure('NOT_FOUND');
    if(!media){const result=await adminVideoDetail(env.DB,id);if(!result)throw new RequestFailure('NOT_FOUND');return Response.json(result);}
    const variant=new URL(request.url).searchParams.get('variant')??'master';
    if(!['master','preview'].includes(variant))throw new RequestFailure('VALIDATION_ERROR');
    const ref=await env.DB.prepare('SELECT agency_id AS agencyId FROM generation_runs WHERE job_id=?').bind(id).first<{agencyId:string}>();
    const row=ref?await findGeneration(env.DB,ref.agencyId,id):null;if(!row)throw new RequestFailure('NOT_FOUND');
    return streamGenerationMedia(request,env,row,variant==='preview'?'preview':'master');
  });
}
