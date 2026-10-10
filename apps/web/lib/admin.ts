import {AdminQuery,AdminTrafficQuery,AdminAction,EntityId} from '@bienvu/contracts';
import {adminPage,adminOverview,adminTraffic,adminAction,adminVideoDetail,findGeneration} from '@bienvu/db';
import type {AuthEnvironment} from './auth';
import {commercialSummary} from './commercial';
import {seoSummary} from './seo-analytics';
import {requireStaff,isSuperAdmin} from './admin-access';
import {assertSameOrigin,boundedJson,RequestFailure,respond} from './http';
import {streamGenerationMedia} from './generations';
export type AdminEnvironment=AuthEnvironment&{ADMIN_EMAIL?:string}&Pick<CloudflareEnv,'MEDIA'|'SUPER_ADMIN_EMAIL'|'GENERATIONS_ENABLED'|'ANONYMOUS_TRIALS_ENABLED'|'IMPORT_MODE'|'AUTH_EMAIL_MODE'>&{TRAFFIC_ENABLED?:string};
export async function adminRequest(request:Request,env:AdminEnvironment){
  return respond(async()=>{
    const user=await requireStaff(request,env),restricted=!isSuperAdmin(env,user);
    if(request.method==='POST'){
      if(restricted)throw new RequestFailure('FORBIDDEN');
      assertSameOrigin(request,env);
      const action=AdminAction.safeParse(await boundedJson(request,2048));if(!action.success)throw new RequestFailure('VALIDATION_ERROR');
      try{return Response.json(await adminAction(env.DB,user.id,action.data));}
      catch(error){const message=error instanceof Error?error.message:'';
        if(message.includes('ADMIN_CONFLICT'))throw new RequestFailure('CONFLICT');
        if(message.includes('ADMIN_RATE_LIMIT'))throw new RequestFailure('RATE_LIMITED');throw error;}
    }
    if(request.method!=='GET')throw new RequestFailure('FORBIDDEN');
    const params=new URL(request.url).searchParams;
    if(restricted&&!STAFF_SECTIONS.includes(params.get('section')??''))throw new RequestFailure('FORBIDDEN');
    if(params.get('section')==='seo'){if([...params.keys()].some(k=>k!=='section'))throw new RequestFailure('VALIDATION_ERROR');return Response.json(await seoSummary(env.DB,env.TRAFFIC_ENABLED==='true'));}
    if(params.get('section')==='commercial'){if([...params.keys()].some(k=>k!=='section'))throw new RequestFailure('VALIDATION_ERROR');return Response.json(await commercialSummary(env.DB));}
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
    try{return Response.json(restricted?staffPage(await adminPage(env.DB,parsed.data),parsed.data.section):await adminPage(env.DB,parsed.data));}
    catch(error){if(error instanceof Error&&error.message==='ADMIN_INVALID_QUERY')throw new RequestFailure('VALIDATION_ERROR');throw error;}
  });
}
export async function adminJobRequest(request:Request,env:AdminEnvironment,id:string,media=false){
  return respond(async()=>{
    const user=await requireStaff(request,env),restricted=!isSuperAdmin(env,user);
    if(request.method!=='GET'&&!(media&&request.method==='HEAD'))throw new RequestFailure('FORBIDDEN');
    if(!EntityId.safeParse(id).success)throw new RequestFailure('NOT_FOUND');
    if(!media){const result=await adminVideoDetail(env.DB,id);if(!result)throw new RequestFailure('NOT_FOUND');return Response.json(restricted?{...result,video:staffRow(result.video,'videos'),calls:[],animations:[]}:result);}
    const variant=new URL(request.url).searchParams.get('variant')??'master';
    if(!['master','preview'].includes(variant))throw new RequestFailure('VALIDATION_ERROR');
    const ref=await env.DB.prepare('SELECT agency_id AS agencyId FROM generation_runs WHERE job_id=?').bind(id).first<{agencyId:string}>();
    const row=ref?await findGeneration(env.DB,ref.agencyId,id):null;if(!row)throw new RequestFailure('NOT_FOUND');
    return streamGenerationMedia(request,env,row,variant==='preview'?'preview':'master');
  });
}

const STAFF_SECTIONS=['users','agencies','videos'];
const staffFields:Record<string,string[]>={
  users:['id','sortKey','name','email','status','agencyId','agency'],
  agencies:['id','sortKey','createdAt','updatedAt','agencyId','agency','email','owner','city','contactEmail','phone','website','videos','ready','lastVideo'],
  videos:['id','sortKey','createdAt','updatedAt','agencyId','agency','email','audience','status','stage','progress','attempt','error','title','locality','sourceUrl','sourceKind','retention','public','duration','master','preview'],
};
function staffRow(row:import('@bienvu/contracts').AdminRow,section:string){return Object.fromEntries(staffFields[section].filter(key=>key in row).map(key=>[key,row[key]]));}
function staffPage(page:import('@bienvu/contracts').AdminPage,section:string){return {...page,rows:page.rows.map(row=>staffRow(row,section))};}
