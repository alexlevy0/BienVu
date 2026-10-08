import type {Database} from './index';

export function partnerApplicationReceipt(db:Database,id:string) {
  return db.prepare('SELECT request_hash FROM partner_applications WHERE id=?').bind(id).first<{request_hash:string}>();
}
export async function partnerApplicationAttempt(db:Database,ipHash:string,at:string) {
  const row=await db.prepare(`INSERT INTO partner_application_attempts(ip_hash,hour,attempts) VALUES(?,?,1)
    ON CONFLICT(ip_hash,hour) DO UPDATE SET attempts=attempts+1 WHERE attempts<30 RETURNING attempts`)
    .bind(ipHash,at.slice(0,13)).first<{attempts:number}>();
  if(!row)throw new Error('PARTNER_RATE_LIMIT');
}
export async function storePartnerApplication<Statement>(db:{prepare(sql:string):{bind(...values:(string|number|null)[]):Statement};batch(statements:Statement[]):Promise<unknown>},input:{
  id:string;requestHash:string;messageId:string;ipHash:string;emailHash:string;turnstileHash:string;
  name:string;email:string;to:string;subject:string;text:string;at:string;
}) {
  await db.batch([
    db.prepare(`INSERT INTO mailbox_threads(id,peer_email,peer_name,subject,subject_key,last_at,created_at)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`)
      .bind(input.messageId,input.email,input.name,input.subject,input.subject.toLowerCase(),input.at,input.at),
    db.prepare(`INSERT INTO mailbox_messages(id,thread_id,dedupe_key,direction,from_email,from_name,to_email,reply_to,subject,body_text,
      truncated,raw_key,rfc_message_id,in_reply_to,references_json,attachments_json,is_read,delivery,provider_id,error_code,
      attempts,actor_id,created_at,updated_at) VALUES(?,?,?,'in',?,?,?,?,?,?,0,NULL,NULL,NULL,'[]','[]',0,'received',NULL,NULL,0,NULL,?,?)
      ON CONFLICT(dedupe_key) DO NOTHING`)
      .bind(input.messageId,input.messageId,'partner:'+input.id,input.email,input.name,input.to,input.email,input.subject,input.text,input.at,input.at),
    db.prepare(`INSERT INTO partner_applications(id,request_hash,message_id,ip_hash,email_hash,turnstile_hash,created_at)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`)
      .bind(input.id,input.requestHash,input.messageId,input.ipHash,input.emailHash,input.turnstileHash,input.at),
  ]);
}
export async function cleanupPartnerApplications(db:Database) {
  await db.prepare(`UPDATE partner_applications SET ip_hash=NULL,email_hash=NULL,turnstile_hash=NULL
    WHERE created_at<strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days') AND ip_hash IS NOT NULL`).run();
  await db.prepare("DELETE FROM partner_application_attempts WHERE hour<substr(strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days'),1,13)").run();
}
