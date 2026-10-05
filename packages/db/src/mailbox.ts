import {MailThread,MailMessage,MailThreadDetail,MAILBOX_LIMITS,mailSubjectKey,type MailAttachment,type MailThreadAction} from '@bienvu/contracts';
import type {Database,SqlStatement} from './index';

export type StoredMailAttachment=MailAttachment&{objectKey:string};
export type MailMessageRow={id:string;thread_id:string;dedupe_key:string;direction:'in'|'out';from_email:string;from_name:string;to_email:string;
  reply_to:string|null;subject:string;body_text:string;truncated:number;raw_key:string|null;rfc_message_id:string|null;in_reply_to:string|null;
  references_json:string;attachments_json:string;is_read:number;delivery:MailMessage['delivery'];provider_id:string|null;error_code:string|null;
  attempts:number;actor_id:string|null;created_at:string;updated_at:string};
type ThreadRow={id:string;peer_email:string;peer_name:string;subject:string;snippet:string;folder:MailThread['folder'];unread:number;
  message_count:number;attachment_count:number;last_direction:'in'|'out';last_at:string};
const threadView=(r:ThreadRow)=>MailThread.parse({id:r.id,subject:r.subject,peerEmail:r.peer_email,peerName:r.peer_name,snippet:r.snippet,
  folder:r.folder,unread:r.unread,messageCount:r.message_count,attachmentCount:r.attachment_count,lastAt:r.last_at,lastDirection:r.last_direction});
export function mailAttachments(row:MailMessageRow){return JSON.parse(row.attachments_json) as StoredMailAttachment[];}
export function mailMessageView(r:MailMessageRow){return MailMessage.parse({id:r.id,threadId:r.thread_id,direction:r.direction,
  fromEmail:r.from_email,fromName:r.from_name,toEmail:r.to_email,replyTo:r.reply_to,subject:r.subject,text:r.body_text,
  truncated:r.truncated===1,at:r.created_at,delivery:r.delivery,error:r.error_code,attempts:r.attempts,
  attachments:mailAttachments(r),hasOriginal:Boolean(r.raw_key)});}
export async function findMailMessage(db:Database,id:string){return db.prepare('SELECT * FROM mailbox_messages WHERE id=?').bind(id).first<MailMessageRow>();}
export async function findMailThread(db:Database,id:string){const row=await db.prepare('SELECT * FROM mailbox_threads WHERE id=?').bind(id).first<ThreadRow>();return row?threadView(row):null;}
export async function listMailThreads(db:Database,input:{q:string;folder:'inbox'|'unread'|'archived'|'spam'|'sent'|'all';cursor?:string}){
  const filter=input.folder==='unread'?"folder='inbox' AND unread>0":input.folder==='sent'?"EXISTS(SELECT 1 FROM mailbox_messages m WHERE m.thread_id=t.id AND m.direction='out')":
    input.folder==='all'?'1=1':'folder=?';
  const bindings:(string|null)[]=!['unread','sent','all'].includes(input.folder)?[input.folder]:[];
  const found=await db.prepare(`SELECT json_group_array(json_object('id',id,'peer_email',peer_email,'peer_name',peer_name,'subject',subject,
    'snippet',snippet,'folder',folder,'unread',unread,'message_count',message_count,'attachment_count',attachment_count,
    'last_direction',last_direction,'last_at',last_at)) AS items FROM (SELECT * FROM mailbox_threads t WHERE message_count>0 AND ${filter}
    AND (instr(lower(subject),lower(?))>0 OR instr(lower(peer_email),lower(?))>0 OR instr(lower(peer_name),lower(?))>0
      OR EXISTS(SELECT 1 FROM mailbox_messages m WHERE m.thread_id=t.id AND instr(lower(m.body_text),lower(?))>0))
    AND (? IS NULL OR (last_at,id)<(SELECT last_at,id FROM mailbox_threads WHERE id=?)) ORDER BY last_at DESC,id DESC LIMIT ?)`)
    .bind(...bindings,input.q,input.q,input.q,input.q,input.cursor??null,input.cursor??null,MAILBOX_LIMITS.pageSize+1).first<{items:string}>();
  const rows=JSON.parse(found?.items??'[]') as ThreadRow[],items=rows.slice(0,MAILBOX_LIMITS.pageSize).map(threadView);
  const counts=await db.prepare(`SELECT count(CASE WHEN folder='inbox' THEN 1 END) inbox,
    count(CASE WHEN folder='inbox' AND unread>0 THEN 1 END) unread,count(CASE WHEN folder='archived' THEN 1 END) archived,
    count(CASE WHEN folder='spam' THEN 1 END) spam,(SELECT count(DISTINCT thread_id) FROM mailbox_messages WHERE direction='out') sent FROM mailbox_threads WHERE message_count>0`)
    .first<{inbox:number;unread:number;archived:number;spam:number;sent:number}>();
  return {items,nextCursor:rows.length>MAILBOX_LIMITS.pageSize?items.at(-1)!.id:null,counts:counts!};
}
export async function mailThreadDetail(db:Database,id:string,cursor?:string){
  const thread=await findMailThread(db,id);if(!thread)return null;
  // Keep each message in its own SQL row: aggregating long bodies can exceed D1's 2 MB string limit.
  const select=`FROM mailbox_messages WHERE thread_id=? AND (? IS NULL OR (created_at,id)<
    (SELECT created_at,id FROM mailbox_messages WHERE id=? AND thread_id=?)) ORDER BY created_at DESC,id DESC LIMIT ?`,
    bindings=[id,cursor??null,cursor??null,id,MAILBOX_LIMITS.pageSize+1] as const,
    statement=db.prepare(`SELECT * ${select}`).bind(...bindings) as SqlStatement&{all?<T>():Promise<{results:T[]}>};
  let rows:MailMessageRow[];
  if(statement.all)rows=(await statement.all<MailMessageRow>()).results;
  else{
    const result=await db.prepare(`SELECT json_group_array(id) ids FROM (SELECT id ${select})`).bind(...bindings).first<{ids:string}>();
    rows=(await Promise.all((JSON.parse(result?.ids??'[]') as string[]).map(key=>findMailMessage(db,key)))).filter((r):r is MailMessageRow=>Boolean(r));
  }
  const messages=rows.slice(0,MAILBOX_LIMITS.pageSize).map(mailMessageView).reverse();
  const through=rows.slice(0,MAILBOX_LIMITS.pageSize).find(m=>m.direction==='in');
  const client=await db.prepare(`SELECT u.id,u.name,u.email,a.id agencyId,a.name agency,
    (SELECT count(*) FROM jobs j WHERE j.agency_id=a.id) videos FROM auth_user u LEFT JOIN agencies a ON a.owner_user_id=u.id
    WHERE u.email=? COLLATE NOCASE AND u.emailVerified=1`).bind(thread.peerEmail).first<{id:string;name:string;email:string;agencyId:string|null;agency:string|null;videos:number}>();
  const videos=client?.agencyId?await db.prepare(`SELECT json_group_array(json_object('id',id,'title',title,'status',status)) items FROM
    (SELECT j.id,coalesce(json_extract(l.facts_json,'$.title'),'Vidéo') title,j.status FROM jobs j LEFT JOIN listings l ON l.id=j.listing_id
      WHERE j.agency_id=? ORDER BY j.created_at DESC,j.id DESC LIMIT 5)`).bind(client.agencyId).first<{items:string}>():null;
  return MailThreadDetail.parse({thread,messages,olderCursor:rows.length>MAILBOX_LIMITS.pageSize?messages[0].id:null,
    readThrough:through?.id??null,client:client?{...client,recentVideos:JSON.parse(videos?.items??'[]')}:null});
}
export async function insertMailThread(db:Database,input:{id:string;email:string;name:string;subject:string;at:string}){
  await db.prepare(`INSERT INTO mailbox_threads(id,peer_email,peer_name,subject,subject_key,last_at,created_at) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(id) DO NOTHING`).bind(input.id,input.email,input.name,input.subject,mailSubjectKey(input.subject),input.at,input.at).run();
}
export async function insertMailMessage(db:Database,row:MailMessageRow){
  await db.prepare(`INSERT INTO mailbox_messages(id,thread_id,dedupe_key,direction,from_email,from_name,to_email,reply_to,subject,body_text,
    truncated,raw_key,rfc_message_id,in_reply_to,references_json,attachments_json,is_read,delivery,provider_id,error_code,attempts,actor_id,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(dedupe_key) DO NOTHING`).bind(row.id,row.thread_id,row.dedupe_key,row.direction,row.from_email,
      row.from_name,row.to_email,row.reply_to,row.subject,row.body_text,row.truncated,row.raw_key,row.rfc_message_id,row.in_reply_to,row.references_json,
      row.attachments_json,row.is_read,row.delivery,row.provider_id,row.error_code,row.attempts,row.actor_id,row.created_at,row.updated_at).run();
}
export async function changeMailThread(db:Database,id:string,actor:string,action:MailThreadAction){
  if(!await findMailThread(db,id))return null;
  if(action.action==='read'){
    await db.prepare(`UPDATE mailbox_messages SET is_read=1 WHERE thread_id=? AND direction='in' AND (created_at,id)<=
      (SELECT created_at,id FROM mailbox_messages WHERE id=? AND thread_id=? AND direction='in')`).bind(id,action.through,id).run();
  }else if(action.action==='unread'){
    await db.prepare(`UPDATE mailbox_messages SET is_read=0 WHERE id=(SELECT id FROM mailbox_messages WHERE thread_id=?
      AND direction='in' ORDER BY created_at DESC,id DESC LIMIT 1)`).bind(id).run();
  }else{
    await db.prepare('UPDATE mailbox_threads SET folder=? WHERE id=?').bind(action.action==='archive'?'archived':action.action==='spam'?'spam':'inbox',id).run();
  }
  await db.prepare('INSERT INTO mailbox_events(thread_id,actor_id,action,created_at) VALUES(?,?,?,?)')
    .bind(id,actor,action.action,new Date().toISOString()).run();
  return findMailThread(db,id);
}
export async function mailReplyThread(db:Database,peer:string,references:string[],subject:string){
  if(references.length){
    const row=await db.prepare(`SELECT m.thread_id id FROM mailbox_messages m JOIN mailbox_threads t ON t.id=m.thread_id
      WHERE m.rfc_message_id IN (SELECT value FROM json_each(?)) AND (t.peer_email=? COLLATE NOCASE
        OR EXISTS(SELECT 1 FROM mailbox_messages o WHERE o.thread_id=t.id AND o.direction='out' AND o.to_email=? COLLATE NOCASE))
      ORDER BY m.created_at DESC LIMIT 1`).bind(JSON.stringify(references),peer,peer).first<{id:string}>();
    if(row)return row.id;
  }
  // Some clients omit RFC threading headers. Only replies from the same peer may use the recent subject fallback.
  if(/^\s*(re|fw|fwd|tr)\s*:/i.test(subject)){
    const row=await db.prepare(`SELECT id FROM mailbox_threads WHERE peer_email=? COLLATE NOCASE AND subject_key=?
      AND last_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days') ORDER BY last_at DESC LIMIT 1`).bind(peer,mailSubjectKey(subject)).first<{id:string}>();
    if(row)return row.id;
  }
  return null;
}
