import type {Database,GenerationRow} from '@bienvu/db';
import {RequestFailure} from './http';

export async function saveProblemReport(db:Database,row:GenerationRow,authorKey:string,key:string,input:unknown){
  if(!/^[a-zA-Z0-9_-]{16,128}$/.test(key)||!['ready','failed'].includes(row.status))throw new RequestFailure('VALIDATION_ERROR');
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['category','comment'].includes(key)))
    throw new RequestFailure('VALIDATION_ERROR');
  const value=input as {category?:unknown;comment?:unknown};
  if(!['photos','voice','facts','technical','other'].includes(String(value.category))||typeof value.comment!=='string'||
    !value.comment.trim()||value.comment.trim().length>1000)throw new RequestFailure('VALIDATION_ERROR');
  const report={category:String(value.category),comment:value.comment.trim()};
  const bytes=new TextEncoder().encode(JSON.stringify(report));const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
    .map(value=>value.toString(16).padStart(2,'0')).join('');
  const previous=await db.prepare('SELECT id,input_hash AS hash,created_at AS createdAt FROM generation_reports WHERE job_id=? AND author_key=? AND idempotency_key=?')
    .bind(row.jobId,authorKey,key).first<{id:string;hash:string;createdAt:string}>();
  if(previous){if(previous.hash!==hash)throw new RequestFailure('CONFLICT');return {id:previous.id,createdAt:previous.createdAt};}
  const id=crypto.randomUUID(),at=new Date().toISOString();
  try{await db.prepare(`INSERT INTO generation_reports(id,job_id,author_key,category,comment,created_at,idempotency_key,input_hash)
    VALUES(?,?,?,?,?,?,?,?)`).bind(id,row.jobId,authorKey,report.category,report.comment,at,key,hash).run();}
  catch(error){const winner=await db.prepare('SELECT id,input_hash AS hash,created_at AS createdAt FROM generation_reports WHERE job_id=? AND author_key=? AND idempotency_key=?')
      .bind(row.jobId,authorKey,key).first<{id:string;hash:string;createdAt:string}>();
    if(winner){if(winner.hash!==hash)throw new RequestFailure('CONFLICT');return {id:winner.id,createdAt:winner.createdAt};}
    if(String(error).includes('REPORT_LIMIT'))throw new RequestFailure('RATE_LIMITED');throw error;}
  return {id,createdAt:at};
}
