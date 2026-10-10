import PostalMime from 'postal-mime';
import {convert} from 'html-to-text';
import {z} from 'zod';
import {configuredMailboxes,MAILBOX_LIMITS,mailFileName,mailMessageIds} from '@bienvu/contracts';
import {insertMailThread,insertMailMessage,mailReplyThread,type Database,type StoredMailAttachment,type MailMessageRow} from '@bienvu/db';

type ReceiveEnv={DB:Database;MEDIA:Pick<R2Bucket,'put'>;MAILBOX_ENABLED?:string;MAILBOX_ADDRESS?:string;MAILBOX_ADDRESSES?:string};
type Incoming=Pick<ForwardableEmailMessage,'from'|'to'|'headers'|'raw'|'rawSize'|'setReject'>;
const address=(value:string|undefined)=>{const parsed=z.email().max(254).safeParse(value?.trim().toLowerCase());return parsed.success?parsed.data:null;};
const clean=(value:string,max:number)=>value.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,max);
async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');}
async function readRaw(message:Incoming){
  if(!Number.isSafeInteger(message.rawSize)||message.rawSize>MAILBOX_LIMITS.rawBytes||message.rawSize<=0)throw Error('MAIL_TOO_LARGE');
  const reader=message.raw.getReader(),parts:Uint8Array[]=[];let length=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;
    if(length>MAILBOX_LIMITS.rawBytes){await reader.cancel();throw Error('MAIL_TOO_LARGE');}parts.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;
}
export async function receiveMail(message:Incoming,env:ReceiveEnv){
  if(env.MAILBOX_ENABLED!=='true'||!configuredMailboxes(env).includes(message.to.toLowerCase())){
    message.setReject('Mailbox unavailable');return;
  }
  let raw:Uint8Array<ArrayBuffer>,parsed:Awaited<ReturnType<typeof PostalMime.parse>>;
  try{raw=await readRaw(message);parsed=await PostalMime.parse(raw,{maxNestingDepth:30,maxRfc822NestingDepth:3,maxHeadersSize:256*1024,forceRfc822Attachments:true});}
  catch(cause){message.setReject(cause instanceof Error&&cause.message==='MAIL_TOO_LARGE'?'Message exceeds 25 MiB':'Invalid email message');return;}
  if(parsed.attachments.length>MAILBOX_LIMITS.incomingAttachments){message.setReject('Too many attachments');return;}
  const from=address(parsed.from?.address)??address(message.from),to=address(message.to);
  if(!from||!to){message.setReject('Invalid sender');return;}
  const rfcId=mailMessageIds(parsed.messageId)[0]??null,
    dedupe=await hash(JSON.stringify([to,message.from.toLowerCase(),rfcId??Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)))])),
    id=dedupe.slice(0,32),rawKey=`mailbox/messages/${id}/original.eml`,at=new Date().toISOString();
  const prior=await env.DB.prepare('SELECT id,thread_id FROM mailbox_messages WHERE dedupe_key=?').bind(dedupe).first<{id:string;thread_id:string}>();
  if(prior)return {id:prior.id,threadId:prior.thread_id,duplicate:true};
  const references=mailMessageIds(parsed.references),replyId=mailMessageIds(parsed.inReplyTo).at(-1)??null,
    subject=clean(parsed.subject??'(Sans objet)',998)||'(Sans objet)',name=clean(parsed.from?.name??'',200),
    replyTo=parsed.replyTo?.flatMap(a=>a.address?[a.address]:a.group?.map(g=>g.address)??[]).map(address).find(Boolean)??null;
  const threadId=await mailReplyThread(env.DB,from,[...references,...(replyId?[replyId]:[])],subject,to)??id;
  const attachments:StoredMailAttachment[]=[];
  // Save every attachment, including large incoming files. Only outgoing files have the lower sending limit.
  for(let i=0;i<parsed.attachments.length;i++){
    const file=parsed.attachments[i],content=file.content;if(typeof content==='string')throw Error('MAIL_ATTACHMENT_ENCODING');
    const attachmentId=(await hash(`${id}:${i}`)).slice(0,32),key=`mailbox/messages/${id}/attachments/${attachmentId}`;
    const mime=/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(file.mimeType)?file.mimeType:'application/octet-stream';
    await env.MEDIA.put(key,content,{httpMetadata:{contentType:'application/octet-stream',cacheControl:'private, no-store'}});
    attachments.push({id:attachmentId,name:mailFileName(file.filename??`piece-jointe-${i+1}`),mime,size:content.byteLength,objectKey:key});
  }
  await env.MEDIA.put(rawKey,raw,{httpMetadata:{contentType:'application/octet-stream',cacheControl:'private, no-store'}});
  await insertMailThread(env.DB,{id:threadId,email:from,name,subject,at,address:to});
  // Keep a text fallback; the original is rendered on demand through the isolated HTML preview.
  const htmlLimit=1000000,text=(parsed.text??(parsed.html?convert(parsed.html,{wordwrap:false,
    limits:{maxInputLength:htmlLimit,maxDepth:30,maxChildNodes:10000},selectors:[{selector:'img',format:'skip'},{selector:'a',options:{ignoreHref:false}}]}):''))
    .replace(/\x00/g,'');
  const row:MailMessageRow={id,thread_id:threadId,dedupe_key:dedupe,direction:'in',from_email:from,from_name:name,to_email:to,reply_to:replyTo,
    subject,body_text:text.slice(0,MAILBOX_LIMITS.bodyCharacters),truncated:text.length>MAILBOX_LIMITS.bodyCharacters||!parsed.text&&(parsed.html?.length??0)>htmlLimit?1:0,raw_key:rawKey,rfc_message_id:rfcId,
    in_reply_to:replyId,references_json:JSON.stringify(references),attachments_json:JSON.stringify(attachments),is_read:0,delivery:'received',
    provider_id:null,error_code:null,attempts:0,actor_id:null,created_at:at,updated_at:at};
  await insertMailMessage(env.DB,row);
  return {id,threadId,duplicate:false};
}
