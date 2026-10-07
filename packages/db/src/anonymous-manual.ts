import {EntityId,publicErrors,type ManualListingInput,type PublicErrorCode} from '@bienvu/contracts';
import type {Database} from './index';
import {opaqueHash,type AnonymousSession} from './anonymous';
import {GenerationFailure} from './generation';
import {findImport} from './imports';

export async function anonymousManualPermit(db:Database,session:AnonymousSession,id:string){
  if(!EntityId.safeParse(id).success)return null;
  return db.prepare(`SELECT m.idempotency_key AS key,m.ip_hmac AS ipHmac,m.turnstile_hash AS turnstileHash,m.verified_until AS verifiedUntil
    FROM anonymous_manual_imports m JOIN listing_imports i ON i.id=m.import_id
    WHERE m.import_id=? AND m.session_id=? AND i.agency_id=? AND i.source_kind='manual' AND i.status IN ('importing','ready') AND i.expires_at>?`)
    .bind(id,session.id,session.scopeId,new Date().toISOString()).first<{key:string;ipHmac:string|null;turnstileHash:string|null;verifiedUntil:string}>();
}
export async function priorAnonymousManual(db:Database,session:AnonymousSession,key:string,input:ManualListingInput){
  if(!/^[a-zA-Z0-9_-]{16,128}$/.test(key))throw new GenerationFailure('VALIDATION_ERROR');
  const body=JSON.stringify(input),hash=await opaqueHash(body);
  const old=await db.prepare('SELECT import_id AS id,input_hash AS hash FROM anonymous_manual_imports WHERE session_id=? AND idempotency_key=?')
    .bind(session.id,key).first<{id:string;hash:string}>();
  if(old&&old.hash!==hash)throw new GenerationFailure('CONFLICT');
  const row=old?await findImport(db,session.scopeId,old.id):null;
  if(old&&!row)throw new GenerationFailure('CONFLICT');
  return {body,hash,row};
}
export async function admitAnonymousManual(db:Database,session:AnonymousSession,key:string,input:ManualListingInput,
  proof:{ipHmac:string;turnstileHash:string},now=Date.now()){
  const old=await priorAnonymousManual(db,session,key,input);if(old.row)return old.row;
  const id=crypto.randomUUID(),at=new Date(now).toISOString(),verifiedUntil=new Date(now+900_000).toISOString();
  try{await db.prepare(`INSERT INTO anonymous_manual_imports(import_id,session_id,idempotency_key,input_json,input_hash,ip_hmac,turnstile_hash,created_at,verified_until)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(session_id,idempotency_key) DO NOTHING`)
    .bind(id,session.id,key,old.body,old.hash,proof.ipHmac,proof.turnstileHash,at,verifiedUntil).run();
  }catch(error){
    const winner=await priorAnonymousManual(db,session,key,input);if(winner.row)return winner.row;
    const message=String(error),code=Object.keys(publicErrors).find(code=>message.includes(code)) as PublicErrorCode|undefined;
    if(code)throw new GenerationFailure(code);
    if(message.includes('turnstile_hash'))throw new GenerationFailure('BOT_VERIFICATION_FAILED');throw error;
  }
  const row=(await priorAnonymousManual(db,session,key,input)).row;
  if(!row)throw new GenerationFailure('CONFLICT');return row;
}
