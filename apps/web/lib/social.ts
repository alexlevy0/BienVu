import {z} from 'zod';
import {EntityId,NormalizedListing,SocialConnection,SocialPublication,SocialPublicationRequest,VideoReport,type SocialPlatform} from '@bienvu/contracts';
import {findOwnedGeneration,generationMasterUnlocked} from '@bienvu/db';
import {demoByteRange} from './editor-demo-media';
import {MetaChoice,MetaSocial,safeSocialPermalink} from './meta-social';
import {openSocial,sealSocial,randomSocialToken,socialConfigured,socialOrigin,socialHash,graphVersion,
  socialMediaSignature,verifySocialMediaSignature,SocialFailure,type SocialSecrets,type SocialOAuthRejection} from './social-crypto';

export type SocialEnv=SocialSecrets&{DB:D1Database;MEDIA:R2Bucket};
export type SocialConnectionRow={id:string;agency_id:string;platform:SocialPlatform;remote_id:string;page_id:string;meta_user_id:string;
  name:string;username:string|null;token_cipher:string|null;status:'active'|'reconnect'|'disconnected';expires_at:string|null};
export type SocialPostRow={id:string;agency_id:string;job_id:string;title:string;caption:string;scheduled_at:string;timezone:string;
  manifest_hash:string;object_key:string;size_bytes:number;sha256:string;width:number;height:number;duration_seconds:number;
  prepared:number;expires_at:string;media_deleted_at:string|null;created_at:string;input_hash:string;prepare_lease:string|null;prepare_until:string|null};
const iso=(now=Date.now())=>new Date(now).toISOString();
export function assertSocialManager(role:string){if(!['owner','admin'].includes(role))throw new SocialFailure('FORBIDDEN',403);}
export function assertSocialPublisher(role:string){if(!['owner','admin','editor'].includes(role))throw new SocialFailure('FORBIDDEN',403);}
export function requireSocial(env:SocialSecrets){if(!socialConfigured(env))throw new SocialFailure('SOCIAL_DISABLED',503);}
export async function socialEvent(env:Pick<SocialEnv,'DB'>,agency:string,post:string,action:string,actor:string|null=null,target:string|null=null,code:string|null=null){
  await env.DB.prepare('INSERT INTO social_events VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),agency,post,target,actor,action,code,iso()).run();
}
export function connectionView(row:SocialConnectionRow,now=Date.now()){
  return SocialConnection.parse({id:row.id,platform:row.platform,name:row.name,username:row.username,
    status:row.status==='active'&&(!row.token_cipher||row.expires_at&&Date.parse(row.expires_at)<=now)?'reconnect':row.status,
    expiresAt:row.expires_at,profileUrl:row.platform==='instagram'&&row.username?`https://www.instagram.com/${encodeURIComponent(row.username)}/`:row.platform==='facebook'?`https://www.facebook.com/${row.remote_id}`:null});
}
export async function socialConnections(env:Pick<SocialEnv,'DB'>,agency:string){
  const rows=await env.DB.prepare("SELECT * FROM social_connections WHERE agency_id=? AND status!='disconnected' ORDER BY platform,name").bind(agency).all<SocialConnectionRow>();
  return rows.results.map(row=>connectionView(row));
}
export async function startSocialOAuth(env:SocialEnv,agency:string,user:string,role:string,pageId?:string,flow?:'facebook'){
  assertSocialManager(role);requireSocial(env);
  if(pageId!==undefined&&!/^\d{1,40}$/.test(pageId))throw new SocialFailure('VALIDATION_ERROR',400);
  if(flow!==undefined&&flow!=='facebook')throw new SocialFailure('VALIDATION_ERROR',400);
  const count=await env.DB.prepare('SELECT count(*) n FROM social_oauth_states WHERE agency_id=? AND created_at>?').bind(agency,iso(Date.now()-3600_000)).first<{n:number}>();
  if((count?.n??0)>=20)throw new SocialFailure('RATE_LIMITED',429);
  const state=randomSocialToken(),browser=randomSocialToken(),at=iso();
  const pageHint=pageId?await sealSocial(pageId,env.SOCIAL_TOKEN_ENCRYPTION_KEY,`oauth-page:${browser}`):null;
  await env.DB.prepare('INSERT INTO social_oauth_states VALUES(?,?,?,?,?,NULL,?)').bind(await socialHash(state),await socialHash(browser),agency,user,iso(Date.now()+900_000),at).run();
  const url=new URL(`https://www.facebook.com/${graphVersion(env)}/dialog/oauth`);
  url.search=new URLSearchParams({client_id:env.META_APP_ID!,redirect_uri:`${socialOrigin(env)}/api/social/oauth/callback`,state,response_type:'code',
    ...(env.META_LOGIN_CONFIG_ID&&flow!=='facebook'?{config_id:env.META_LOGIN_CONFIG_ID}:{scope:'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish',auth_type:'rerequest'})}).toString();
  console.info(JSON.stringify({event:'social_oauth_started',flow:env.META_LOGIN_CONFIG_ID&&flow!=='facebook'?'business':'facebook',requestedPage:Boolean(pageId)}));
  return {url:url.toString(),browser,pageHint};
}
export async function finishSocialOAuth(env:SocialEnv,agency:string,user:string,role:string,state:string,browser:string,code:string|null|SocialOAuthRejection,api=new MetaSocial(env),pageHint:string|null=null){
  assertSocialManager(role);requireSocial(env);
  if(!/^[A-Za-z0-9_-]{43}$/.test(state)||!/^[A-Za-z0-9_-]{43}$/.test(browser))throw new SocialFailure('SOCIAL_STATE',403);
  const claimed=await env.DB.prepare('UPDATE social_oauth_states SET consumed_at=? WHERE state_hash=? AND browser_hash=? AND agency_id=? AND user_id=? AND consumed_at IS NULL AND expires_at>? RETURNING state_hash')
    .bind(iso(),await socialHash(state),await socialHash(browser),agency,user,iso()).first();
  if(!claimed)throw new SocialFailure('SOCIAL_STATE',403);
  if(code!==null&&typeof code!=='string'){
    console.warn(JSON.stringify({event:'social_oauth_provider_failed',code:code.failure,providerError:code.providerError,providerReason:code.providerReason,metaCode:code.metaCode}));
    throw new SocialFailure(code.failure);
  }
  if(!code)throw new SocialFailure('SOCIAL_CANCELLED');
  if(code.length>4096)throw new SocialFailure('SOCIAL_STATE');
  let requestedPageId:string|undefined;
  if(pageHint!==null){try{
    if(pageHint.length>256)throw new Error();
    requestedPageId=z.string().regex(/^\d{1,40}$/).parse(await openSocial(pageHint,env.SOCIAL_TOKEN_ENCRYPTION_KEY,`oauth-page:${browser}`));
  }catch{throw new SocialFailure('SOCIAL_STATE',403);}}
  const choices=await api.exchange(code,`${socialOrigin(env)}/api/social/oauth/callback`,requestedPageId),id=crypto.randomUUID(),cipher=await sealSocial(choices,env.SOCIAL_TOKEN_ENCRYPTION_KEY,`grant:${agency}:${user}:${id}`);
  await env.DB.prepare('INSERT INTO social_oauth_grants VALUES(?,?,?,?,?,NULL,?)').bind(id,agency,user,cipher,iso(Date.now()+600_000),iso()).run();
  return id;
}
async function grantChoices(env:SocialEnv,agency:string,user:string,id:string){
  if(!EntityId.safeParse(id).success)throw new SocialFailure('SOCIAL_STATE');
  const grant=await env.DB.prepare('SELECT choices_cipher FROM social_oauth_grants WHERE id=? AND agency_id=? AND user_id=? AND consumed_at IS NULL AND expires_at>?').bind(id,agency,user,iso()).first<{choices_cipher:string}>();
  if(!grant)throw new SocialFailure('SOCIAL_STATE');
  return z.array(MetaChoice).max(1000).parse(await openSocial(grant.choices_cipher,env.SOCIAL_TOKEN_ENCRYPTION_KEY,`grant:${agency}:${user}:${id}`));
}
export async function socialOAuthChoices(env:SocialEnv,agency:string,user:string,role:string,id:string){
  assertSocialManager(role);const choices=await grantChoices(env,agency,user,id);
  return choices.map(({id,platform,name,username})=>({id,platform,name,username}));
}
export async function selectSocialConnections(env:SocialEnv,agency:string,user:string,role:string,input:unknown){
  assertSocialManager(role);requireSocial(env);
  const data=z.object({grantId:EntityId,ids:z.array(z.string().regex(/^(instagram|facebook):\d{1,40}$/)).min(1).max(20)}).strict().parse(input);
  const choices=await grantChoices(env,agency,user,data.grantId),selected=choices.filter(c=>data.ids.includes(c.id));
  if(selected.length!==new Set(data.ids).size)throw new SocialFailure('SOCIAL_STATE');
  const count=await env.DB.prepare("SELECT count(*) n FROM social_connections WHERE agency_id=? AND status!='disconnected'").bind(agency).first<{n:number}>();
  if((count?.n??0)+selected.length>40)throw new SocialFailure('RATE_LIMITED',429);
  const statements=[];
  for(const choice of selected){
    const existing=await env.DB.prepare('SELECT id FROM social_connections WHERE agency_id=? AND platform=? AND remote_id=?').bind(agency,choice.platform,choice.remoteId).first<{id:string}>();
    const id=existing?.id??crypto.randomUUID(),cipher=await sealSocial(choice.token,env.SOCIAL_TOKEN_ENCRYPTION_KEY,`connection:${agency}:${id}`);
    statements.push(env.DB.prepare(`INSERT INTO social_connections(id,agency_id,platform,remote_id,page_id,meta_user_id,name,username,token_cipher,status,expires_at,connected_by,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,?,?,'active',?,?,?,? WHERE EXISTS(SELECT 1 FROM social_oauth_grants WHERE id=? AND agency_id=? AND user_id=? AND consumed_at IS NULL AND expires_at>?)
      ON CONFLICT(agency_id,platform,remote_id) DO UPDATE SET page_id=excluded.page_id,meta_user_id=excluded.meta_user_id,name=excluded.name,username=excluded.username,token_cipher=excluded.token_cipher,status='active',expires_at=excluded.expires_at,connected_by=excluded.connected_by,updated_at=excluded.updated_at`)
      .bind(id,agency,choice.platform,choice.remoteId,choice.pageId,choice.metaUserId,choice.name,choice.username,cipher,choice.expiresAt,user,iso(),iso(),data.grantId,agency,user,iso()));
  }
  // L'écriture des comptes et la consommation du grant sont atomiques.
  const results=await env.DB.batch([...statements,env.DB.prepare('UPDATE social_oauth_grants SET consumed_at=?,choices_cipher=\'\' WHERE id=? AND agency_id=? AND user_id=? AND consumed_at IS NULL AND expires_at>?').bind(iso(),data.grantId,agency,user,iso())]);
  if(results.at(-1)?.meta.changes!==1)throw new SocialFailure('SOCIAL_STATE');
  return socialConnections(env,agency);
}
export async function disconnectSocial(env:SocialEnv,agency:string,id:string,role:string){
  assertSocialManager(role);
  if(!EntityId.safeParse(id).success)throw new SocialFailure('NOT_FOUND',404);
  const row=await env.DB.prepare('SELECT id FROM social_connections WHERE agency_id=? AND id=?').bind(agency,id).first();if(!row)throw new SocialFailure('NOT_FOUND',404);
  await env.DB.batch([
    env.DB.prepare("UPDATE social_connections SET token_cipher=NULL,status='disconnected',updated_at=? WHERE agency_id=? AND id=?").bind(iso(),agency,id),
    env.DB.prepare("UPDATE social_targets SET status=CASE WHEN stage='publishing' THEN 'uncertain' ELSE 'cancelled' END,error_code=CASE WHEN stage='publishing' THEN 'SOCIAL_UNCERTAIN' ELSE 'SOCIAL_RECONNECT' END,stage='done',lease_token=NULL,lease_until=NULL,updated_at=? WHERE connection_id=? AND post_id IN (SELECT id FROM social_posts WHERE agency_id=?) AND status IN ('scheduled','processing','failed')").bind(iso(),id,agency),
  ]);
}
export async function socialPublication(env:Pick<SocialEnv,'DB'>,agency:string,id:string){
  if(!EntityId.safeParse(id).success)throw new SocialFailure('NOT_FOUND',404);
  const row=await env.DB.prepare('SELECT * FROM social_posts WHERE agency_id=? AND id=? AND prepared=1').bind(agency,id).first<SocialPostRow>();if(!row)throw new SocialFailure('NOT_FOUND',404);
  const targets=await env.DB.prepare('SELECT id,connection_id AS connectionId,platform,account_name AS name,status,error_code AS errorCode,permalink,published_at AS publishedAt FROM social_targets WHERE post_id=? ORDER BY platform,id').bind(id).all();
  return publicationView(row,targets.results);
}
function publicationView(row:SocialPostRow,targets:unknown){
  return SocialPublication.parse({id:row.id,jobId:row.job_id,title:row.title,caption:row.caption,scheduledAt:row.scheduled_at,timezone:row.timezone,
    createdAt:row.created_at,expiresAt:row.expires_at,aspectRatio:row.width>row.height?'16:9':'9:16',durationSeconds:row.duration_seconds,
    videoUrl:`/api/social/publications/${row.id}/video`,targets});
}
export function socialScheduleDate(value:string|null,timezone:string,now=Date.now()){
  try{new Intl.DateTimeFormat('fr-FR',{timeZone:timezone}).format();}catch{throw new SocialFailure('VALIDATION_ERROR');}
  if(value===null)return iso(now);
  const time=Date.parse(value);if(!Number.isFinite(time)||time<now+120000||time>now+30*86400_000)throw new SocialFailure('SOCIAL_INVALID_DATE');
  return iso(time);
}
export async function createSocialPublication(env:SocialEnv,agency:string,user:string,role:string,key:string,input:unknown){
  assertSocialPublisher(role);requireSocial(env);
  const parsed=SocialPublicationRequest.safeParse(input);if(!parsed.success||!/^[a-zA-Z0-9_-]{16,128}$/.test(key))throw new SocialFailure('VALIDATION_ERROR');
  const body=parsed.data,hash=await socialHash(JSON.stringify({...body,connectionIds:[...body.connectionIds].sort()})),at=iso();
  const previous=await env.DB.prepare('SELECT * FROM social_posts WHERE agency_id=? AND idempotency_key=?').bind(agency,key).first<SocialPostRow>();
  if(previous&&previous.input_hash!==hash)throw new SocialFailure('SOCIAL_CONFLICT',409);
  if(previous?.prepared)return socialPublication(env,agency,previous.id);
  const scheduledAt=socialScheduleDate(body.scheduledAt,body.timezone);
  const job=await findOwnedGeneration(env.DB,agency,body.jobId);
  if(!job||job.status!=='ready'||job.retention!=='available'||job.expiresAt<=at||!generationMasterUnlocked(job)||!job.report||!job.objectKey)throw new SocialFailure('SOCIAL_EXPIRED');
  const report=VideoReport.parse(JSON.parse(job.report));
  if(report.watermarked||!job.objectKey.startsWith(`agencies/${job.agencyId}/jobs/${job.jobId}/`))throw new SocialFailure('SOCIAL_EXPIRED');
  const connections:SocialConnectionRow[]=[];
  for(const id of body.connectionIds){const connection=await env.DB.prepare("SELECT * FROM social_connections WHERE agency_id=? AND id=? AND status='active' AND token_cipher IS NOT NULL").bind(agency,id).first<SocialConnectionRow>();
    if(!connection||connection.expires_at&&connection.expires_at<=scheduledAt)throw new SocialFailure('SOCIAL_RECONNECT');
    if(connection.platform==='facebook'&&report.width>report.height)throw new SocialFailure('SOCIAL_HORIZONTAL');
    connections.push(connection);}
  const count=await env.DB.prepare('SELECT count(*) n FROM social_posts WHERE agency_id=? AND created_at>=?').bind(agency,iso(Date.now()-86400_000)).first<{n:number}>();
  if(!previous&&(count?.n??0)>=100)throw new SocialFailure('RATE_LIMITED',429);
  const id=previous?.id??crypto.randomUUID(),objectKey=previous?.object_key??`agencies/${agency}/social/${id}/video.mp4`,lease=crypto.randomUUID(),until=iso(Date.now()+120000),expires=iso(Date.parse(scheduledAt)+30*86400_000);
  if(!previous){await env.DB.batch([
    env.DB.prepare(`INSERT INTO social_posts(id,agency_id,job_id,idempotency_key,input_hash,created_by,title,caption,scheduled_at,timezone,manifest_hash,object_key,size_bytes,sha256,width,height,duration_seconds,prepare_lease,prepare_until,expires_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(agency_id,idempotency_key) DO NOTHING`)
      .bind(id,agency,job.jobId,key,hash,user,job.title,body.caption,scheduledAt,body.timezone,report.manifestHash,objectKey,report.sizeBytes,report.sha256,report.width,report.height,report.durationSeconds,lease,until,expires,at,at),
    ...connections.map(c=>env.DB.prepare('INSERT INTO social_targets(id,post_id,connection_id,platform,account_name,next_attempt_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM social_posts WHERE id=? AND prepare_lease=?)')
      .bind(crypto.randomUUID(),id,c.id,c.platform,c.name,scheduledAt,at,id,lease)),
  ]);}
  else{const claimed=await env.DB.prepare('UPDATE social_posts SET prepare_lease=?,prepare_until=? WHERE id=? AND agency_id=? AND prepared=0 AND (prepare_until IS NULL OR prepare_until<?) RETURNING id').bind(lease,until,id,agency,at).first();
    if(!claimed)throw new SocialFailure('SOCIAL_CONFLICT',409);}
  const snapshot=await env.DB.prepare('SELECT * FROM social_posts WHERE agency_id=? AND idempotency_key=?').bind(agency,key).first<SocialPostRow>();
  if(!snapshot||snapshot.id!==id||snapshot.input_hash!==hash||snapshot.prepare_lease!==lease)throw new SocialFailure('SOCIAL_CONFLICT',409);
  try{const source=await env.MEDIA.get(job.objectKey);
    if(!source||source.size!==snapshot.size_bytes||source.customMetadata?.sha256!==snapshot.sha256)throw new SocialFailure('SOCIAL_EXPIRED');
    const metadata={httpMetadata:{contentType:'video/mp4'},customMetadata:{sha256:snapshot.sha256,manifestHash:snapshot.manifest_hash}};
    if(typeof FixedLengthStream==='undefined')await env.MEDIA.put(objectKey,await source.arrayBuffer(),metadata);
    else{const stream=new FixedLengthStream(snapshot.size_bytes);
      await Promise.all([source.body.pipeTo(stream.writable),env.MEDIA.put(objectKey,stream.readable,metadata)]);}
    const head=await env.MEDIA.head(objectKey);if(head?.size!==snapshot.size_bytes||head.customMetadata?.sha256!==snapshot.sha256)throw new SocialFailure('SOCIAL_MEDIA');
    const result=await env.DB.prepare('UPDATE social_posts SET prepared=1,prepare_lease=NULL,prepare_until=NULL,updated_at=? WHERE id=? AND agency_id=? AND prepare_lease=?').bind(iso(),id,agency,lease).run();
    if(result.meta.changes!==1)throw new SocialFailure('SOCIAL_CONFLICT',409);
    await socialEvent(env,agency,id,body.scheduledAt?'scheduled':'publish_requested',user);
  }catch(error){await env.DB.prepare('UPDATE social_posts SET prepare_lease=NULL,prepare_until=NULL WHERE id=? AND agency_id=? AND prepare_lease=? AND prepared=0').bind(id,agency,lease).run();throw error;}
  return socialPublication(env,agency,id);
}
export async function socialOverview(env:SocialEnv,agency:string,from:string,to:string,cursor:string|null=null){
  if(!z.iso.datetime().safeParse(from).success||!z.iso.datetime().safeParse(to).success||from>=to||Date.parse(to)-Date.parse(from)>93*86400_000)throw new SocialFailure('VALIDATION_ERROR');
  let after:{date:string;id:string}|null=null;
  if(cursor){try{if(cursor.length>256)throw new Error();after=z.object({date:z.iso.datetime(),id:EntityId}).strict().parse(JSON.parse(cursor));
    if(after.date<from||after.date>=to)throw new Error();}catch{throw new SocialFailure('VALIDATION_ERROR');}}
  const rows=await env.DB.prepare(`SELECT p.*,(SELECT json_group_array(json_object('id',t.id,'connectionId',t.connection_id,'platform',t.platform,'name',t.account_name,'status',t.status,'errorCode',t.error_code,'permalink',t.permalink,'publishedAt',t.published_at)) FROM social_targets t WHERE t.post_id=p.id) targets_json
    FROM social_posts p WHERE p.agency_id=? AND p.prepared=1 AND p.scheduled_at>=? AND p.scheduled_at<?
    ${after?'AND (p.scheduled_at>? OR (p.scheduled_at=? AND p.id>?))':''} ORDER BY p.scheduled_at,p.id LIMIT 101`)
    .bind(agency,from,to,...(after?[after.date,after.date,after.id]:[])).all<SocialPostRow&{targets_json:string}>();
  const page=rows.results.slice(0,100),publications=page.map(row=>publicationView(row,JSON.parse(row.targets_json))),last=page.at(-1);
  const alerts=await env.DB.prepare("SELECT count(*) n FROM social_targets t JOIN social_posts p ON p.id=t.post_id WHERE p.agency_id=? AND t.status IN ('failed','uncertain')").bind(agency).first<{n:number}>();
  return {configured:socialConfigured(env),connections:await socialConnections(env,agency),publications,
    nextCursor:rows.results.length>100&&last?JSON.stringify({date:last.scheduled_at,id:last.id}):null,alerts:alerts?.n??0};
}
export async function socialCaption(env:Pick<SocialEnv,'DB'>,agency:string,id:string){
  const job=await findOwnedGeneration(env.DB,agency,id);if(!job)throw new SocialFailure('NOT_FOUND',404);
  const source=job.listingId?await env.DB.prepare('SELECT result_json FROM listing_imports WHERE id=? AND agency_id=?').bind(job.listingId,job.agencyId).first<{result_json:string}>():null;
  const parsed=source?NormalizedListing.safeParse(JSON.parse(source.result_json)):null,facts=parsed?.success?parsed.data.facts:null;
  const details=[facts?.area?.value?`${facts.area.value} m²`:null,facts?.rooms?.value?`${facts.rooms.value} pièces`:null,
    facts?.price?.value?new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(facts.price.value.amountCents/100)+(facts.price.value.period==='month'?' / mois':''):null].filter(Boolean).join(' · ');
  const city=job.locality?.replace(/[^\p{L}\p{N}]/gu,'')??'';
  return {caption:[job.title,details,'Découvrez le bien en vidéo. Contactez-nous pour organiser une visite.',`#Immobilier${city?` #${city}`:''}`].filter(Boolean).join('\n\n'),title:job.title};
}
export async function changeSocialPublication(env:SocialEnv,agency:string,user:string,role:string,id:string,input:unknown){
  assertSocialPublisher(role);
  const action=z.discriminatedUnion('action',[
    z.object({action:z.literal('cancel')}),
    z.object({action:z.literal('edit'),caption:z.string().trim().max(2200),scheduledAt:z.iso.datetime(),timezone:z.string().max(80)}),
    z.object({action:z.literal('retry'),targetId:EntityId,confirmedNotPublished:z.boolean().optional()}),
    z.object({action:z.literal('confirm-published'),targetId:EntityId,permalink:z.url().max(2048)}),
  ]).safeParse(input);if(!action.success)throw new SocialFailure('VALIDATION_ERROR');
  const post=await socialPublication(env,agency,id),body=action.data;
  if(body.action==='cancel'||body.action==='edit'){
    if(!post.targets.every(t=>t.status==='scheduled'))throw new SocialFailure('SOCIAL_CONFLICT',409);
    const actionToken=crypto.randomUUID(),at=iso();
    const fence="id=? AND agency_id=? AND NOT EXISTS(SELECT 1 FROM social_targets WHERE post_id=? AND (status!='scheduled' OR lease_until>?))";
    if(body.action==='edit'){const scheduled=socialScheduleDate(body.scheduledAt,body.timezone);
      const bad=await env.DB.prepare('SELECT 1 FROM social_targets t JOIN social_connections c ON c.id=t.connection_id WHERE t.post_id=? AND (c.status!=\'active\' OR c.expires_at<=?)').bind(id,scheduled).first();
      if(bad)throw new SocialFailure('SOCIAL_RECONNECT');
      const result=await env.DB.batch([env.DB.prepare(`UPDATE social_posts SET caption=?,scheduled_at=?,timezone=?,expires_at=?,updated_at=?,action_token=? WHERE ${fence}`)
        .bind(body.caption,scheduled,body.timezone,iso(Date.parse(scheduled)+30*86400_000),at,actionToken,id,agency,id,at),
        env.DB.prepare("UPDATE social_targets SET next_attempt_at=?,updated_at=? WHERE post_id=? AND EXISTS(SELECT 1 FROM social_posts WHERE id=? AND action_token=?)").bind(scheduled,at,id,id,actionToken)]);
      if(result[0].meta.changes!==1)throw new SocialFailure('SOCIAL_CONFLICT',409);
    }else{const result=await env.DB.batch([
      env.DB.prepare(`UPDATE social_posts SET action_token=?,updated_at=? WHERE ${fence}`).bind(actionToken,at,id,agency,id,at),
      env.DB.prepare("UPDATE social_targets SET status='cancelled',stage='done',updated_at=? WHERE post_id=? AND EXISTS(SELECT 1 FROM social_posts WHERE id=? AND action_token=?)").bind(at,id,id,actionToken),
    ]);if(result[0].meta.changes!==1)throw new SocialFailure('SOCIAL_CONFLICT',409);}
  }else{
    const target=post.targets.find(t=>t.id===body.targetId);if(!target||!['failed','uncertain'].includes(target.status))throw new SocialFailure('SOCIAL_CONFLICT',409);
    if(body.action==='confirm-published'){
      const permalink=safeSocialPermalink(target.platform,body.permalink);if(!permalink||target.status!=='uncertain')throw new SocialFailure('VALIDATION_ERROR');
      const result=await env.DB.prepare("UPDATE social_targets SET status='published',stage='done',permalink=?,published_at=?,error_code=NULL,updated_at=? WHERE id=? AND post_id=? AND status='uncertain'").bind(permalink,iso(),iso(),target.id,id).run();
      if(result.meta.changes!==1)throw new SocialFailure('SOCIAL_CONFLICT',409);
    }else{
      requireSocial(env);if(target.status==='uncertain'&&!body.confirmedNotPublished)throw new SocialFailure('SOCIAL_UNCERTAIN',409);
      const connection=await env.DB.prepare("SELECT id FROM social_connections WHERE agency_id=? AND id=? AND status='active' AND token_cipher IS NOT NULL AND (expires_at IS NULL OR expires_at>?)").bind(agency,target.connectionId,iso()).first();
      if(!connection)throw new SocialFailure('SOCIAL_RECONNECT');
      if(post.expiresAt<=iso())throw new SocialFailure('SOCIAL_EXPIRED');
      const result=await env.DB.prepare("UPDATE social_targets SET status='scheduled',stage='queued',remote_id=NULL,upload_url=NULL,attempts=0,polls=0,error_code=NULL,lease_token=NULL,lease_until=NULL,final_started_at=NULL,next_attempt_at=?,updated_at=? WHERE id=? AND post_id=? AND status=?").bind(iso(),iso(),target.id,id,target.status).run();
      if(result.meta.changes!==1)throw new SocialFailure('SOCIAL_CONFLICT',409);
    }
  }
  await socialEvent(env,agency,id,body.action,user,'targetId' in body?body.targetId:null);
  return socialPublication(env,agency,id);
}
export async function socialVideo(env:SocialEnv,request:Request,id:string,agency?:string){
  if(!EntityId.safeParse(id).success)throw new SocialFailure('NOT_FOUND',404);
  const row=await env.DB.prepare('SELECT * FROM social_posts WHERE id=? AND prepared=1 AND media_deleted_at IS NULL AND expires_at>?').bind(id,iso()).first<SocialPostRow>();
  if(!row||agency&&agency!==row.agency_id)throw new SocialFailure('NOT_FOUND',404);
  if(!agency){const url=new URL(request.url),expires=Number(url.searchParams.get('expires')),signature=url.searchParams.get('signature')??'';
    if(!env.SOCIAL_TOKEN_ENCRYPTION_KEY||!await verifySocialMediaSignature(env.SOCIAL_TOKEN_ENCRYPTION_KEY,id,expires,signature))throw new SocialFailure('NOT_FOUND',404);
    // Un URL remis à Meta ne reste valide que pour les publications actives.
    if(!await env.DB.prepare("SELECT 1 FROM social_targets WHERE post_id=? AND status='processing'").bind(id).first())throw new SocialFailure('NOT_FOUND',404);
  }
  if(row.object_key!==`agencies/${row.agency_id}/social/${id}/video.mp4`)throw new SocialFailure('NOT_FOUND',404);
  const head=await env.MEDIA.head(row.object_key);if(!head||head.size!==row.size_bytes||head.customMetadata?.sha256!==row.sha256)throw new SocialFailure('NOT_FOUND',404);
  const range=request.headers.get('range'),parsed=range?demoByteRange(range,head.size):{offset:0,length:head.size};
  if(!parsed)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${head.size}`}});
  const headers={'Content-Type':'video/mp4','Content-Length':String(parsed.length),'Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer',
    ...(range?{'Content-Range':`bytes ${parsed.offset}-${parsed.offset+parsed.length-1}/${head.size}`}:{})};
  if(request.method==='HEAD')return new Response(null,{status:range?206:200,headers});
  const object=await env.MEDIA.get(row.object_key,{range:parsed});if(!object)throw new SocialFailure('NOT_FOUND',404);
  return new Response(object.body,{status:range?206:200,headers});
}
export async function socialFetchUrl(env:SocialSecrets,id:string){
  const expires=Math.floor(Date.now()/1000)+24*3600,signature=await socialMediaSignature(env.SOCIAL_TOKEN_ENCRYPTION_KEY!,id,expires);
  return `${socialOrigin(env)}/api/social/media/${id}?expires=${expires}&signature=${signature}`;
}
export async function revokeMetaUser(env:SocialEnv,metaUserId:string,erase=false){
  await env.DB.batch([
    env.DB.prepare("UPDATE social_targets SET status=CASE WHEN stage='publishing' THEN 'uncertain' ELSE 'cancelled' END,error_code='SOCIAL_RECONNECT',lease_token=NULL,lease_until=NULL,updated_at=? WHERE connection_id IN (SELECT id FROM social_connections WHERE meta_user_id=?) AND status IN ('scheduled','processing','failed')").bind(iso(),metaUserId),
    env.DB.prepare("UPDATE social_connections SET token_cipher=NULL,status='disconnected',updated_at=? WHERE meta_user_id=?").bind(iso(),metaUserId),
    // Tout grant en attente peut contenir ce compte et doit être repris par OAuth.
    env.DB.prepare('DELETE FROM social_oauth_grants WHERE agency_id IN (SELECT agency_id FROM social_connections WHERE meta_user_id=?)').bind(metaUserId),
  ]);
  if(erase){
    const posts=await env.DB.prepare('SELECT DISTINCT p.id,p.object_key FROM social_posts p JOIN social_targets t ON t.post_id=p.id WHERE t.connection_id IN (SELECT id FROM social_connections WHERE meta_user_id=?)').bind(metaUserId).all<{id:string;object_key:string}>();
    await env.DB.batch([env.DB.prepare('DELETE FROM social_targets WHERE connection_id IN (SELECT id FROM social_connections WHERE meta_user_id=?)').bind(metaUserId),env.DB.prepare('DELETE FROM social_connections WHERE meta_user_id=?').bind(metaUserId)]);
    for(const post of posts.results){if(!await env.DB.prepare('SELECT 1 FROM social_targets WHERE post_id=?').bind(post.id).first()){
      await env.MEDIA.delete(post.object_key);await env.DB.prepare('DELETE FROM social_posts WHERE id=?').bind(post.id).run();}}
  }
}
export async function cleanupSocial(env:SocialEnv,now=Date.now()){
  const at=iso(now);
  await env.DB.batch([env.DB.prepare('DELETE FROM social_oauth_states WHERE expires_at<=?').bind(at),env.DB.prepare('DELETE FROM social_oauth_grants WHERE expires_at<=? OR consumed_at IS NOT NULL').bind(at),
    env.DB.prepare('DELETE FROM social_deletion_receipts WHERE created_at<?').bind(iso(now-30*86400_000)),
    env.DB.prepare("UPDATE social_connections SET status='reconnect',token_cipher=NULL,updated_at=? WHERE status='active' AND expires_at<=?").bind(at,at)]);
  const rows=await env.DB.prepare('SELECT id,object_key FROM social_posts WHERE media_deleted_at IS NULL AND expires_at<=? ORDER BY expires_at LIMIT 20').bind(at).all<{id:string;object_key:string}>();
  for(const row of rows.results){await env.DB.prepare("UPDATE social_targets SET status=CASE WHEN stage='publishing' THEN 'uncertain' ELSE 'failed' END,error_code='SOCIAL_EXPIRED',updated_at=? WHERE post_id=? AND status IN ('scheduled','processing')").bind(at,row.id).run();
    await env.MEDIA.delete(row.object_key);await env.DB.prepare('UPDATE social_posts SET media_deleted_at=? WHERE id=?').bind(at,row.id).run();}
}
