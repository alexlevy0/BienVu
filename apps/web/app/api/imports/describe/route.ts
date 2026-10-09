import {CreationDraftData} from '@bienvu/contracts';
import {findCreationDraft,updateCreationDraft} from '@bienvu/db';
import {requireOwner} from '../../../../lib/owner';
import {assertSameOrigin,boundedJson,RequestFailure,respond} from '../../../../lib/http';
import {assertImportMode,reserveCloudflareImport} from '../../../../lib/import-transport';
import {startManualCreationDraft} from '../../../../lib/creation-drafts';
export const dynamic='force-dynamic';

export async function POST(request:Request){return respond(async()=>{
  const {env,agency}=await requireOwner(request);assertSameOrigin(request,env);
  const serviceEnv=env as CloudflareEnv&{GENERATION_TOKEN?:string};
  const mode=assertImportMode(request,env),body=await boundedJson(request,5000) as {text?:unknown};
  if(!body||typeof body.text!=='string'||body.text.trim().length<15||body.text.length>4000)throw new RequestFailure('VALIDATION_ERROR');
  const text=body.text.trim(),key=request.headers.get('Idempotency-Key')??'';
  if(!/^[a-zA-Z0-9_-]{16,128}$/.test(key))throw new RequestFailure('VALIDATION_ERROR');
  const draft=await startManualCreationDraft(env.DB,agency.id,key,text);
  if(mode==='cloudflare')await reserveCloudflareImport(env,agency.id,draft.id);
  const bytes=new TextEncoder().encode(text),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
    .map(value=>value.toString(16).padStart(2,'0')).join('');
  const previous=await env.DB.prepare('SELECT status,result_json AS result FROM draft_extract_calls WHERE agency_id=? AND import_id=? AND text_hash=?')
    .bind(agency.id,draft.id,hash).first<{status:string;result:string|null}>();
  if(previous)return Response.json({draft:await findCreationDraft(env.DB,agency.id,draft.id),
    extraction:previous.status==='ready'?'ready':'unavailable'});
  const id=crypto.randomUUID(),at=new Date().toISOString();
  try{await env.DB.prepare(`INSERT INTO draft_extract_calls(id,agency_id,import_id,text_hash,status,created_at)
    VALUES(?,?,?,?,'pending',?) ON CONFLICT(agency_id,import_id,text_hash) DO NOTHING`).bind(id,agency.id,draft.id,hash,at).run();}
  catch(error){if(String(error).includes('EXTRACTION_LIMIT'))throw new RequestFailure('RATE_LIMITED');throw error;}
  const claimed=await env.DB.prepare('SELECT id,status FROM draft_extract_calls WHERE agency_id=? AND import_id=? AND text_hash=?')
    .bind(agency.id,draft.id,hash).first<{id:string;status:string}>();
  if(claimed?.id!==id)return Response.json({draft:await findCreationDraft(env.DB,agency.id,draft.id),extraction:'unavailable'});
  if(!serviceEnv.GENERATION_SERVICE||!serviceEnv.GENERATION_TOKEN){
    await env.DB.prepare("UPDATE draft_extract_calls SET status='failed' WHERE id=?").bind(id).run();
    return Response.json({draft,extraction:'unavailable'});
  }
  try{
    const response=await serviceEnv.GENERATION_SERVICE.fetch('https://generation.internal/extract',{method:'POST',
      headers:{Authorization:`Bearer ${serviceEnv.GENERATION_TOKEN}`,'X-Agency-ID':agency.id,'X-AI-Extraction-ID':id,'X-AI-Listing-ID':draft.id,'Content-Type':'application/json'},
      body:JSON.stringify({text}),signal:AbortSignal.timeout(22_000)});
    if(!response.ok){await response.body?.cancel();throw new Error('EXTRACTION_UNAVAILABLE');}
    const value=await response.json() as {data:unknown;usage:unknown},data=CreationDraftData.parse(value.data);
    if(data.originalText!==text)throw new Error('EXTRACTION_INVALID');
    await env.DB.prepare("UPDATE draft_extract_calls SET status='ready',result_json=? WHERE id=? AND status='pending'")
      .bind(JSON.stringify({data,usage:value.usage}),id).run();
    // A user's edit while the provider was answering wins over the old revision.
    await updateCreationDraft(env.DB,agency.id,draft.id,draft.version,data);
    return Response.json({draft:await findCreationDraft(env.DB,agency.id,draft.id),extraction:'ready'});
  }catch{
    await env.DB.prepare("UPDATE draft_extract_calls SET status='failed' WHERE id=? AND status='pending'").bind(id).run();
    return Response.json({draft:await findCreationDraft(env.DB,agency.id,draft.id),extraction:'unavailable'});
  }
});}
