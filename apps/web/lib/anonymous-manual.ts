import {MANUAL_PHOTO_LIMITS} from '@bienvu/contracts';
import {admitAnonymousManual,anonymousManualPermit,priorAnonymousManual} from '@bienvu/db';
import {assertSameOrigin,boundedBytes,boundedJson,RequestFailure} from './http';
import {assertImportMode,photoNormalizer,reserveCloudflareImport} from './import-transport';
import {finishManualListing,manualDraft,parseManualInput,uploadManualPhoto,type PhotoNormalizer} from './manual-listings';
import {importResult} from './imports';
import {assertTrialEnabled,ipFingerprint,requireTrial,verifyTrialBot,type TrialEnv} from './trials';

export async function prepareAnonymousManual(request:Request,env:TrialEnv,trustedCloudflare:boolean,verify=verifyTrialBot){
  assertSameOrigin(request,env);assertTrialEnabled(env);
  const session=await requireTrial(request,env),mode=assertImportMode(request,env),body=await boundedJson(request,120_000);
  if(!body||typeof body!=='object'||Array.isArray(body)||!('listing' in body)||Object.keys(body).some(k=>!['listing','turnstileToken'].includes(k)))
    throw new RequestFailure('VALIDATION_ERROR');
  const input=parseManualInput(body.listing),key=request.headers.get('Idempotency-Key')??'';
  const old=await priorAnonymousManual(env.DB,session,key,input);
  let row=old.row;
  if(!row){
    const ipHmac=await ipFingerprint(request,env,trustedCloudflare),turnstileHash=await verify(env,'turnstileToken' in body?body.turnstileToken:undefined,session.id+':manual:'+key);
    row=await admitAnonymousManual(env.DB,session,key,input,{ipHmac,turnstileHash});
  }
  await manualDraft(env.DB,session.scopeId,row.id);
  if(mode==='cloudflare'&&row.status==='importing')await reserveCloudflareImport(env,session.scopeId,row.id);
  return Response.json(importResult(row),{status:row.status==='ready'?200:201});
}
async function ownedManual(request:Request,env:TrialEnv,id:string){
  assertSameOrigin(request,env);assertTrialEnabled(env);
  const session=await requireTrial(request,env);
  if(!await anonymousManualPermit(env.DB,session,id))throw new RequestFailure('NOT_FOUND');
  await manualDraft(env.DB,session.scopeId,id);return session;
}
export async function uploadAnonymousManual(request:Request,env:TrialEnv,id:string,index:string,normalize?:PhotoNormalizer){
  const session=await ownedManual(request,env,id);
  if(!/^(?:[0-9]|1[01])$/.test(index))throw new RequestFailure('VALIDATION_ERROR');
  const bytes=await boundedBytes(request,MANUAL_PHOTO_LIMITS.fileBytes,'PHOTO_TOO_LARGE');
  const photo=await uploadManualPhoto(env,session.scopeId,id,Number(index),bytes,request.headers.get('content-type')?.split(';')[0]??'',
    normalize??photoNormalizer(request,env,session.scopeId,id),request.signal);
  return Response.json({photo});
}
export async function completeAnonymousManual(request:Request,env:TrialEnv,id:string){
  const session=await ownedManual(request,env,id);
  return Response.json(importResult(await finishManualListing(env,session.scopeId,id)));
}
