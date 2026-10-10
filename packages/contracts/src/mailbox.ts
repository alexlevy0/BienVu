import {z} from 'zod';
import {EntityId} from './product';

export const MAILBOX_LIMITS={rawBytes:25*1024*1024,uploadBytes:3*1024*1024,attachmentBytes:3*1024*1024,
  attachments:8,incomingAttachments:64,bodyCharacters:100000,replyCharacters:20000,pageSize:20} as const;
export const PERSONAL_MAILBOXES={admin:'greg@bienvu.online',superadmin:'alex@bienvu.online'} as const;
export function configuredMailboxes(env:{MAILBOX_ADDRESS?:string;MAILBOX_ADDRESSES?:string}){
  try{return z.array(z.email().max(254)).min(1).max(10).parse(env.MAILBOX_ADDRESSES?JSON.parse(env.MAILBOX_ADDRESSES):[env.MAILBOX_ADDRESS??'contact@bienvu.online']).map(a=>a.toLowerCase());}
  catch{return [];}
}
export const MailFolder=z.enum(['inbox','archived','spam']);
export const MailDelivery=z.enum(['received','queued','sending','sent','failed','uncertain']);
export const MailAttachment=z.object({id:EntityId,name:z.string().max(200),mime:z.string().max(150),size:z.number().int().nonnegative()});
export type MailAttachment=z.infer<typeof MailAttachment>;
export const MailThread=z.object({id:EntityId,subject:z.string().max(998),peerEmail:z.email(),peerName:z.string().max(200),
  snippet:z.string().max(250),folder:MailFolder,unread:z.number().int().nonnegative(),messageCount:z.number().int().nonnegative(),
  attachmentCount:z.number().int().nonnegative(),lastAt:z.string(),lastDirection:z.enum(['in','out'])});
export type MailThread=z.infer<typeof MailThread>;
export const MailboxPage=z.object({address:z.email(),enabled:z.boolean(),items:z.array(MailThread),nextCursor:EntityId.nullable(),
  mailboxes:z.array(z.email()).default([]),
  counts:z.object({inbox:z.number(),unread:z.number(),archived:z.number(),spam:z.number(),sent:z.number()})});
export type MailboxPage=z.infer<typeof MailboxPage>;
export const MailMessage=z.object({id:EntityId,threadId:EntityId,direction:z.enum(['in','out']),fromEmail:z.email(),fromName:z.string(),
  toEmail:z.email(),replyTo:z.email().nullable(),subject:z.string(),text:z.string(),truncated:z.boolean(),at:z.string(),
  delivery:MailDelivery,error:z.string().nullable(),attempts:z.number().int().nonnegative(),attachments:z.array(MailAttachment),hasOriginal:z.boolean()});
export type MailMessage=z.infer<typeof MailMessage>;
export const MailThreadDetail=z.object({thread:MailThread,messages:z.array(MailMessage),olderCursor:EntityId.nullable(),
  readThrough:EntityId.nullable(),client:z.object({id:EntityId,name:z.string(),email:z.email(),agencyId:EntityId.nullable(),agency:z.string().nullable(),
    videos:z.number(),recentVideos:z.array(z.object({id:EntityId,title:z.string(),status:z.string()}))}).nullable()});
export type MailThreadDetail=z.infer<typeof MailThreadDetail>;
export const MailSendRequest=z.object({id:z.uuid(),threadId:EntityId.optional(),replyMessageId:EntityId.optional(),
  to:z.email().max(254).optional(),subject:z.string().trim().min(1).max(200).regex(/^[^\r\n\x00]*$/).optional(),
  text:z.string().trim().min(1).max(MAILBOX_LIMITS.replyCharacters),attachments:z.array(z.uuid()).max(MAILBOX_LIMITS.attachments).default([])})
  .strict().refine(v=>Boolean(v.threadId&&v.replyMessageId&&!v.to&&!v.subject)||Boolean(!v.threadId&&!v.replyMessageId&&v.to&&v.subject),
    {message:'Choisissez une conversation ou un destinataire et un objet.'});
export type MailSendRequest=z.infer<typeof MailSendRequest>;
export const MailThreadAction=z.discriminatedUnion('action',[
  z.object({action:z.literal('read'),through:EntityId}).strict(),
  z.object({action:z.enum(['unread','archive','restore','spam'])}).strict(),
]);
export type MailThreadAction=z.infer<typeof MailThreadAction>;

// File names and message IDs are untrusted MIME metadata. Never use them as paths or raw headers.
export function mailFileName(name:string){return name.replace(/[\x00-\x1f\x7f/\\]/g,'_').trim().slice(0,200)||'piece-jointe';}
export function mailMessageIds(value:string|null|undefined){return [...new Set((value??'').match(/<[^\s<>\x00-\x1f\x7f]{1,250}@[^\s<>\x00-\x1f\x7f]{1,250}>/g)??[])].slice(-20);}
export function mailSubjectKey(subject:string){return subject.replace(/^(\s*(re|fw|fwd|tr)\s*:\s*)+/i,'').trim().toLowerCase();}
