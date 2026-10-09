import {CreationDraftData} from '@bienvu/contracts';
import {opaqueHash} from '@bienvu/db';
import {assertSameOrigin,boundedJson,RequestFailure} from './http';
import {ipFingerprint,requireTrial,verifyTrialBot,type TrialEnv} from './trials';

type Env=TrialEnv&{GENERATION_SERVICE?:Fetcher;GENERATION_TOKEN?:string};
export async function describeGuest(request:Request,env:Env,trustedCloudflare:boolean,verify=verifyTrialBot){
  assertSameOrigin(request,env);
  const session=await requireTrial(request,env),body=await boundedJson(request,7500) as {text?:unknown;turnstileToken?:unknown};
  if(!body||typeof body.text!=='string'||body.text.trim().length<15||body.text.length>4000||
    Object.keys(body).some(key=>!['text','turnstileToken'].includes(key)))throw new RequestFailure('VALIDATION_ERROR');
  const text=body.text.trim(),key=request.headers.get('Idempotency-Key')??'';
  if(!/^[a-zA-Z0-9_-]{16,128}$/.test(key))throw new RequestFailure('VALIDATION_ERROR');
  const hash=await opaqueHash(text);
  const previous=await env.DB.prepare('SELECT text_hash AS hash,status,result_json AS result FROM guest_extract_calls WHERE session_id=? AND idempotency_key=?')
    .bind(session.id,key).first<{hash:string;status:string;result:string|null}>();
  if(previous){if(previous.hash!==hash)throw new RequestFailure('CONFLICT');
    return Response.json({extraction:previous.status==='ready'?'ready':'unavailable',
      data:previous.status==='ready'&&previous.result?CreationDraftData.parse(JSON.parse(previous.result)):null});}
  if(env.ANONYMOUS_TRIALS_ENABLED!=='true'||!env.GENERATION_SERVICE||!env.GENERATION_TOKEN)
    throw new RequestFailure('ANONYMOUS_UNAVAILABLE');
  const ipHmac=await ipFingerprint(request,env,trustedCloudflare);
  await verify(env,body.turnstileToken,session.id+':extract:'+key);
  const id=crypto.randomUUID(),at=new Date().toISOString();
  try{await env.DB.prepare(`INSERT INTO guest_extract_calls(id,session_id,ip_hmac,idempotency_key,text_hash,status,created_at)
    VALUES(?,?,?,?,?,'pending',?) ON CONFLICT(session_id,idempotency_key) DO NOTHING`)
    .bind(id,session.id,ipHmac,key,hash,at).run();}
  catch(error){if(String(error).includes('EXTRACTION_LIMIT'))throw new RequestFailure('RATE_LIMITED');throw error;}
  const claim=await env.DB.prepare('SELECT id FROM guest_extract_calls WHERE session_id=? AND idempotency_key=?')
    .bind(session.id,key).first<{id:string}>();
  if(claim?.id!==id)return Response.json({extraction:'unavailable',data:null});
  try{const response=await env.GENERATION_SERVICE.fetch('https://generation.internal/extract',{method:'POST',
    headers:{Authorization:`Bearer ${env.GENERATION_TOKEN}`,'X-Agency-ID':session.id,'X-AI-Extraction-ID':id,'Content-Type':'application/json'},
    body:JSON.stringify({text}),signal:AbortSignal.timeout(22_000)});
    if(!response.ok){await response.body?.cancel();throw new Error('EXTRACTION_UNAVAILABLE');}
    const result=await response.json() as {data:unknown},data=CreationDraftData.parse(result.data);
    if(data.originalText!==text)throw new Error('EXTRACTION_INVALID');
    await env.DB.prepare("UPDATE guest_extract_calls SET status='ready',result_json=? WHERE id=? AND status='pending'")
      .bind(JSON.stringify(data),id).run();
    return Response.json({extraction:'ready',data});
  }catch{
    await env.DB.prepare("UPDATE guest_extract_calls SET status='failed' WHERE id=? AND status='pending'").bind(id).run();
    return Response.json({extraction:'unavailable',data:null});
  }
}
