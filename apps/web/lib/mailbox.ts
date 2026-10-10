import {z} from 'zod';
import {configuredMailboxes,PERSONAL_MAILBOXES,EntityId,MailSendRequest,MailThreadAction,MailboxPage,MailFolderView,MAILBOX_LIMITS,mailFileName,mailMessageIds,type MailAttachment} from '@bienvu/contracts';
import {listMailThreads,mailThreadDetail,findMailThread,findMailMessage,insertMailThread,insertMailMessage,changeMailThread,
  mailAttachments,mailMessageView,type MailMessageRow,type StoredMailAttachment} from '@bienvu/db';
import type {AuthEnvironment} from './auth';
import {assertSameOrigin,boundedBytes,boundedJson,RequestFailure,respond} from './http';
import {requireStaff,isSuperAdmin,type AdminIdentity} from './admin-access';
import {mailHtmlDocument} from './mail-html';

export type MailboxEnv=AuthEnvironment&{MEDIA:Pick<R2Bucket,'get'|'put'|'delete'>;SUPER_ADMIN_EMAIL?:string;ADMIN_EMAIL?:string;MAILBOX_ADDRESSES?:string;MAILBOX_ENABLED?:string;MAILBOX_ADDRESS?:string;SUPPORT_EMAIL?:SendEmail};
type Upload=StoredMailAttachment&{actor_id:string;message_id:string|null;content_hash:string;mailbox_address:string};
const uuid=z.uuid();
const address=(env:MailboxEnv)=>(env.MAILBOX_ADDRESS??'contact@bienvu.online').toLowerCase();
export function allowedMailboxes(env:MailboxEnv,user:AdminIdentity){return (isSuperAdmin(env,user)?[address(env),PERSONAL_MAILBOXES.superadmin]:[PERSONAL_MAILBOXES.admin]).filter(a=>configuredMailboxes(env).includes(a));}
export function mailboxEnabled(env:MailboxEnv){return env.MAILBOX_ENABLED==='true'&&Boolean(env.SUPPORT_EMAIL)&&z.email().safeParse(env.MAILBOX_ADDRESS).success;}
const id=(value:string)=>{if(!EntityId.safeParse(value).success)throw new RequestFailure('NOT_FOUND');return value;};
async function hash(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes))),n=>n.toString(16).padStart(2,'0')).join('');}
async function uploadRow(env:MailboxEnv,key:string){return env.DB.prepare(`SELECT id,actor_id,message_id,name,mime,size,object_key objectKey,content_hash,mailbox_address FROM mailbox_uploads WHERE id=?`)
  .bind(key).first<Upload>();}

export async function uploadMailAttachment(env:MailboxEnv,actor:string,key:string,name:string,mime:string,bytes:Uint8Array,mailbox=address(env)){
  if(!uuid.safeParse(key).success||!bytes.length)throw new RequestFailure('VALIDATION_ERROR');
  if(bytes.length>MAILBOX_LIMITS.uploadBytes)throw new RequestFailure('MAIL_ATTACHMENTS_TOO_LARGE');
  name=mailFileName(name);mime=/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(mime)?mime:'application/octet-stream';
  const digest=await hash(bytes),previous=await uploadRow(env,key);
  if(previous){if(previous.mailbox_address!==mailbox||previous.actor_id!==actor||previous.message_id||previous.content_hash!==digest||previous.name!==name||previous.mime!==mime)throw new RequestFailure('CONFLICT');
    return {id:key,name,mime,size:bytes.length};}
  const recent=await env.DB.prepare("SELECT count(*) n FROM mailbox_uploads WHERE actor_id=? AND created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')")
    .bind(actor).first<{n:number}>();if((recent?.n??0)>=100)throw new RequestFailure('RATE_LIMITED');
  const objectKey=`mailbox/uploads/${key}-${digest}`;
  await env.MEDIA.put(objectKey,bytes,{httpMetadata:{contentType:'application/octet-stream',cacheControl:'private, no-store'}});
  try{await env.DB.prepare(`INSERT INTO mailbox_uploads(id,actor_id,name,mime,size,object_key,content_hash,created_at,mailbox_address) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`)
    .bind(key,actor,name,mime,bytes.length,objectKey,digest,new Date().toISOString(),mailbox).run();
    const current=await uploadRow(env,key);if(!current||current.mailbox_address!==mailbox||current.actor_id!==actor||current.objectKey!==objectKey||current.message_id)throw new RequestFailure('CONFLICT');
  }catch(cause){const current=await uploadRow(env,key);if(current?.objectKey!==objectKey)await env.MEDIA.delete(objectKey);throw cause;}
  return {id:key,name,mime,size:bytes.length};
}
export async function enqueueMail(env:MailboxEnv,actor:string,value:unknown,mailbox=address(env)){
  if(!mailboxEnabled(env))throw new RequestFailure('MAILBOX_UNAVAILABLE');
  const input=MailSendRequest.safeParse(value);if(!input.success)throw new RequestFailure('VALIDATION_ERROR');
  const data=input.data;
  function existing(prior:MailMessageRow){
    if(prior.from_email!==mailbox||prior.direction!=='out'||prior.actor_id!==actor||prior.body_text!==data.text||prior.in_reply_to!==(data.replyMessageId??null)
      ||data.threadId&&prior.thread_id!==data.threadId||data.to&&prior.to_email!==data.to.toLowerCase()||data.subject&&prior.subject!==data.subject
      ||JSON.stringify(mailAttachments(prior).map(a=>a.id))!==JSON.stringify(data.attachments))throw new RequestFailure('CONFLICT');
    return mailMessageView(prior);
  }
  const prior=await findMailMessage(env.DB,data.id);if(prior)return existing(prior);
  const reply=data.replyMessageId?await findMailMessage(env.DB,data.replyMessageId,mailbox):null,
    thread=data.threadId?await findMailThread(env.DB,data.threadId,mailbox):null;
  if(data.threadId&&(!thread||!reply||reply.thread_id!==thread.id||reply.direction==='out'&&reply.delivery!=='sent'))throw new RequestFailure('NOT_FOUND');
  if(thread?.folder==='spam')throw new RequestFailure('CONFLICT');
  const to=reply?(reply.direction==='out'?reply.to_email:reply.reply_to??reply.from_email):data.to!.toLowerCase(),from=mailbox,
    subject=reply?(/^\s*re\s*:/i.test(reply.subject)?reply.subject:('Re: '+reply.subject).slice(0,998)):data.subject!,
    threadId=thread?.id??data.id,at=new Date().toISOString();
  const attachments:StoredMailAttachment[]=[];
  if(new Set(data.attachments).size!==data.attachments.length)throw new RequestFailure('VALIDATION_ERROR');
  for(const key of data.attachments){const file=await uploadRow(env,key);
    if(!file||file.mailbox_address!==mailbox||file.actor_id!==actor||file.message_id)throw new RequestFailure('NOT_FOUND');
    attachments.push({id:file.id,name:file.name,mime:file.mime,size:file.size,objectKey:file.objectKey});}
  if(attachments.reduce((sum,a)=>sum+a.size,0)>MAILBOX_LIMITS.attachmentBytes)throw new RequestFailure('MAIL_ATTACHMENTS_TOO_LARGE');
  const references=mailMessageIds(reply?[...JSON.parse(reply.references_json),reply.rfc_message_id].filter(Boolean).join(' '):'');
  if(!thread)await insertMailThread(env.DB,{id:threadId,email:to,name:'',subject,at,address:mailbox});
  const row:MailMessageRow={id:data.id,thread_id:threadId,dedupe_key:'out:'+data.id,direction:'out',from_email:from,from_name:'BienVu',to_email:to,
    reply_to:from,subject,body_text:data.text,truncated:0,raw_key:null,rfc_message_id:null,in_reply_to:data.replyMessageId??null,
    references_json:JSON.stringify(references),attachments_json:JSON.stringify(attachments),is_read:1,delivery:'queued',provider_id:null,error_code:null,
    attempts:0,actor_id:actor,created_at:at,updated_at:at};
  try{await insertMailMessage(env.DB,row);}catch(cause){
    const code=cause instanceof Error?cause.message:'';
    if(code.includes('MAIL_RATE_LIMIT'))throw new RequestFailure('RATE_LIMITED');
    if(code.includes('MAIL_ATTACHMENTS_CONFLICT'))throw new RequestFailure('CONFLICT');throw cause;
  }
  return existing((await findMailMessage(env.DB,data.id))!);
}
function base64(bytes:Uint8Array){let result='';for(let i=0;i<bytes.length;i+=16384)result+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(result);}
const refused=new Set(['E_VALIDATION_ERROR','E_FIELD_MISSING','E_TOO_MANY_ATTACHMENTS','E_TOO_MANY_RECIPIENTS','E_SENDER_NOT_VERIFIED',
  'E_RECIPIENT_NOT_ALLOWED','E_RECIPIENT_SUPPRESSED','E_SENDER_DOMAIN_NOT_AVAILABLE','E_CONTENT_TOO_LARGE','E_RATE_LIMIT_EXCEEDED','E_DAILY_LIMIT_EXCEEDED',
  'E_HEADER_NOT_ALLOWED','E_HEADER_USE_API_FIELD','E_HEADER_VALUE_INVALID','E_HEADER_VALUE_TOO_LONG','E_HEADER_NAME_INVALID','E_HEADERS_TOO_LARGE','E_HEADERS_TOO_MANY','E_DELIVERY_FAILED']);
export async function sendMailboxOutbox(env:MailboxEnv,messageId?:string){
  if(!mailboxEnabled(env))return;
  const now=new Date().toISOString();
  // A crashed or ambiguous send must never be resent silently: the provider may have already accepted it.
  await env.DB.prepare(`UPDATE mailbox_messages SET delivery='uncertain',error_code='MAIL_SEND_UNCERTAIN',updated_at=?
    WHERE delivery='sending' AND updated_at<strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 minutes')`).bind(now).run();
  const list=await env.DB.prepare(`SELECT json_group_array(id) ids FROM (SELECT id FROM mailbox_messages WHERE direction='out' AND delivery='queued'
    AND (? IS NULL OR id=?) ORDER BY created_at LIMIT 3)`).bind(messageId??null,messageId??null).first<{ids:string}>();
  for(const key of JSON.parse(list?.ids??'[]') as string[]){
    const row=await env.DB.prepare(`UPDATE mailbox_messages SET delivery='sending',attempts=attempts+1,updated_at=?
      WHERE id=? AND direction='out' AND delivery='queued' RETURNING *`).bind(new Date().toISOString(),key).first<MailMessageRow>();
    if(!row)continue;
    try{
      if(!configuredMailboxes(env).includes(row.from_email))throw Object.assign(Error('Sender not allowed'),{code:'E_SENDER_NOT_VERIFIED'});
      const attachments:EmailAttachment[]=[];
      for(const file of mailAttachments(row)){
        if(!/^mailbox\/uploads\/[a-f0-9-]{36}-[a-f0-9]{64}$/.test(file.objectKey)||file.size>MAILBOX_LIMITS.attachmentBytes)throw Error('MAIL_ATTACHMENT_UNAVAILABLE');
        const object=await env.MEDIA.get(file.objectKey);
        if(!object||object.size!==file.size)throw Error('MAIL_ATTACHMENT_UNAVAILABLE');
        attachments.push({filename:file.name,type:file.mime,content:base64(new Uint8Array(await object.arrayBuffer())),disposition:'attachment'});
      }
      const parent=row.in_reply_to?await findMailMessage(env.DB,row.in_reply_to):null,headers:Record<string,string>={'X-Mailer':'BienVu support'};
      if(parent?.rfc_message_id)headers['In-Reply-To']=parent.rfc_message_id;
      const references=JSON.parse(row.references_json) as string[];
      let header='';for(const ref of references.slice().reverse()){if(ref.length+header.length+1>1800)break;header=ref+(header?' '+header:'');}
      if(header)headers.References=header;
      const result=await env.SUPPORT_EMAIL!.send({from:{email:row.from_email,name:row.from_name||'BienVu'},to:row.to_email,replyTo:row.from_email,subject:row.subject,
        text:row.body_text,headers,attachments});
      if(!result.messageId)throw Error('MAIL_SEND_UNCERTAIN');
      await env.DB.prepare(`UPDATE mailbox_messages SET delivery='sent',provider_id=?,rfc_message_id=?,error_code=NULL,updated_at=? WHERE id=? AND delivery='sending'`)
        .bind(result.messageId,mailMessageIds(result.messageId)[0]??null,new Date().toISOString(),key).run();
    }catch(cause){
      const providerCode=cause&&typeof cause==='object'&&'code' in cause?String(cause.code):'',
        known=refused.has(providerCode)||cause instanceof Error&&cause.message==='MAIL_ATTACHMENT_UNAVAILABLE',
        error=refused.has(providerCode)?providerCode:known?'MAIL_ATTACHMENT_UNAVAILABLE':'MAIL_SEND_UNCERTAIN';
      await env.DB.prepare(`UPDATE mailbox_messages SET delivery=?,error_code=?,updated_at=? WHERE id=? AND delivery='sending'`)
        .bind(known?'failed':'uncertain',error,new Date().toISOString(),key).run();
      console.error(JSON.stringify({event:'mail_send_failed',messageId:key,code:error}));
    }
  }
}
export async function cleanupMailUploads(env:MailboxEnv){
  const result=await env.DB.prepare(`SELECT json_group_array(json_object('id',id,'key',object_key)) items FROM
    (SELECT id,object_key FROM mailbox_uploads WHERE message_id IS NULL AND created_at<strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day') LIMIT 50)`).first<{items:string}>();
  for(const file of JSON.parse(result?.items??'[]') as {id:string;key:string}[]){
    const removed=await env.DB.prepare('DELETE FROM mailbox_uploads WHERE id=? AND message_id IS NULL RETURNING id').bind(file.id).first();
    if(removed&&/^mailbox\/uploads\/[a-f0-9-]{36}-[a-f0-9]{64}$/.test(file.key))await env.MEDIA.delete(file.key);
  }
}
export async function mailFile(env:MailboxEnv,messageId:string,fileId:string,mailbox=address(env)){
  const row=await findMailMessage(env.DB,id(messageId),mailbox);if(!row)throw new RequestFailure('NOT_FOUND');
  const file=fileId==='original'&&row.raw_key?{objectKey:row.raw_key,name:'message-'+row.id+'.eml',size:undefined}:
    mailAttachments(row).find(a=>a.id===fileId);
  if(!file||!/^mailbox\/(messages\/[a-zA-Z0-9_-]+\/(original\.eml|attachments\/[a-zA-Z0-9_-]+)|uploads\/[a-f0-9-]{36}-[a-f0-9]{64})$/.test(file.objectKey))throw new RequestFailure('NOT_FOUND');
  const object=await env.MEDIA.get(file.objectKey);if(!object||file.size!==undefined&&object.size!==file.size)throw new RequestFailure('NOT_FOUND');
  return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(object.size),
    'Content-Disposition':`attachment; filename="piece-jointe"; filename*=UTF-8''${encodeURIComponent(mailFileName(file.name))}`,
    'Content-Security-Policy':"default-src 'none'; sandbox"}});
}
export async function adminMailboxRequest(request:Request,env:MailboxEnv,target?:{threadId?:string;messageId?:string;fileId?:string;uploadId?:string;retry?:boolean;html?:boolean},waitUntil?:(work:Promise<unknown>)=>void){
  return respond(async()=>{
    const user=await requireStaff(request,env),mailboxes=allowedMailboxes(env,user),params=new URL(request.url).searchParams,mailbox=params.get('mailbox')??mailboxes[0];
    if(!mailbox||!mailboxes.includes(mailbox))throw new RequestFailure('FORBIDDEN');
    params.delete('mailbox');
    if(request.method==='GET'){
      if(target?.messageId&&target.fileId)return mailFile(env,target.messageId,target.fileId,mailbox);
      if(target?.messageId&&target.html){
        const row=await findMailMessage(env.DB,id(target.messageId),mailbox);
        if(!row?.raw_key||!/^mailbox\/messages\/[a-zA-Z0-9_-]+\/original\.eml$/.test(row.raw_key))throw new RequestFailure('NOT_FOUND');
        const raw=await env.MEDIA.get(row.raw_key);if(!raw||raw.size>MAILBOX_LIMITS.rawBytes)throw new RequestFailure('NOT_FOUND');
        return new Response(await mailHtmlDocument(await raw.arrayBuffer()),{headers:{'Content-Type':'text/html; charset=utf-8',
          'X-Frame-Options':'SAMEORIGIN','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'; sandbox allow-popups allow-popups-to-escape-sandbox"}});
      }
      if(target?.threadId){
        const query=z.object({cursor:EntityId.optional()}).strict().safeParse(Object.fromEntries(params));
        if(!query.success)throw new RequestFailure('VALIDATION_ERROR');
        const detail=await mailThreadDetail(env.DB,id(target.threadId),query.data.cursor,mailbox);if(!detail)throw new RequestFailure('NOT_FOUND');return Response.json(detail);
      }
      const query=z.object({q:z.string().max(100).default(''),folder:MailFolderView.default('inbox'),cursor:EntityId.optional()})
        .strict().safeParse(Object.fromEntries(params));if(!query.success)throw new RequestFailure('VALIDATION_ERROR');
      return Response.json(MailboxPage.parse({address:mailbox,mailboxes,enabled:mailboxEnabled(env),...await listMailThreads(env.DB,{...query.data,address:mailbox})}));
    }
    assertSameOrigin(request,env);
    if(request.method==='PATCH'&&target?.threadId){const action=MailThreadAction.safeParse(await boundedJson(request));if(!action.success)throw new RequestFailure('VALIDATION_ERROR');
      const thread=await changeMailThread(env.DB,id(target.threadId),user.id,action.data,mailbox);if(!thread)throw new RequestFailure('NOT_FOUND');return Response.json(thread);}
    if(!mailboxEnabled(env))throw new RequestFailure('MAILBOX_UNAVAILABLE');
    if(request.method==='PUT'&&target?.uploadId){const filename=request.headers.get('x-file-name');let name:string;
      try{if(!filename||filename.length>2000)throw Error();name=decodeURIComponent(filename);}catch{throw new RequestFailure('VALIDATION_ERROR');}
      return Response.json(await uploadMailAttachment(env,user.id,target.uploadId,name,request.headers.get('content-type')??'application/octet-stream',
        await boundedBytes(request,MAILBOX_LIMITS.uploadBytes,'MAIL_ATTACHMENTS_TOO_LARGE'),mailbox),{status:201});}
    if(request.method==='POST'&&target?.retry&&target.messageId){
      const retried=await env.DB.prepare(`UPDATE mailbox_messages SET delivery='queued',error_code=NULL,actor_id=?,updated_at=?
        WHERE id=? AND direction='out' AND delivery='failed' AND attempts<3 AND thread_id IN (SELECT id FROM mailbox_threads WHERE mailbox_address=? COLLATE NOCASE) RETURNING *`).bind(user.id,new Date().toISOString(),id(target.messageId),mailbox).first<MailMessageRow>();
      if(!retried)throw new RequestFailure('CONFLICT');
      waitUntil?.(sendMailboxOutbox(env,retried.id));return Response.json(mailMessageView(retried),{status:202});
    }
    if(request.method==='POST'&&!target){const queued=await enqueueMail(env,user.id,await boundedJson(request,100000),mailbox);
      waitUntil?.(sendMailboxOutbox(env,queued.id));return Response.json(queued,{status:202});}
    throw new RequestFailure('NOT_FOUND');
  });
}
