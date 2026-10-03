import {z} from 'zod';
import {SocialPlatform,type SocialPlatform as Platform} from '@bienvu/contracts';
import {graphVersion,socialHmac,SocialFailure,type SocialSecrets} from './social-crypto';

const remoteId=z.string().regex(/^\d{1,40}$/),accessToken=z.string().min(10).max(4096);
const publishingTasks=new Set(['CREATE_CONTENT','MANAGE','PROFILE_PLUS_CREATE_CONTENT','PROFILE_PLUS_MANAGE','PROFILE_PLUS_FULL_CONTROL']);
const pagePermissions=new Set(['pages_show_list','pages_read_engagement','pages_manage_posts']);
const pageAccount=z.object({id:remoteId,name:z.string().max(160),access_token:accessToken,tasks:z.array(z.string()).optional(),
  instagram_business_account:z.object({id:remoteId,username:z.string().max(100).nullish(),name:z.string().max(160).nullish()}).nullish()});
export const MetaChoice=z.object({id:z.string().max(100),platform:SocialPlatform,remoteId,pageId:remoteId,metaUserId:remoteId,
  name:z.string().min(1).max(160),username:z.string().max(100).nullable(),token:accessToken,expiresAt:z.iso.datetime().nullable()});
export type MetaChoice=z.infer<typeof MetaChoice>;
type MetaDiagnostic={status?:number;metaCode?:number;metaSubcode?:number;reason?:'api'|'transport'|'timeout'|'response'|'redirect'};
export class MetaFailure extends SocialFailure {
  constructor(code:string,readonly retryable=false,readonly uncertain=false,readonly diagnostic:MetaDiagnostic={}){super(code,502);}
}
export type MetaFetcher=typeof fetch;
async function readMeta(response:Response){
  // Workers accepte « manual ». Refuser les redirections sans transmettre un jeton à un autre hôte.
  if(response.status>=300&&response.status<400){await response.body?.cancel();throw new MetaFailure('SOCIAL_MEDIA',false,false,{status:response.status,reason:'redirect'});}
  if(Number(response.headers.get('content-length'))>524288){await response.body?.cancel();throw new MetaFailure('SOCIAL_TEMPORARY',true);}
  const reader=response.body?.getReader();if(!reader)throw new MetaFailure('SOCIAL_TEMPORARY',true);
  const chunks:Uint8Array[]=[],limit=524288;let size=0;
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit){await reader.cancel();throw new MetaFailure('SOCIAL_TEMPORARY',true);}chunks.push(part.value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let json:Record<string,unknown>;try{json=JSON.parse(new TextDecoder().decode(bytes)) as Record<string,unknown>;}catch{throw new MetaFailure('SOCIAL_TEMPORARY',true,false,{status:response.status,reason:'response'});}
  const error=json.error as {code?:number;error_subcode?:number;is_transient?:boolean}|undefined;
  if(error||!response.ok){
    const code=error?.code,diagnostic:MetaDiagnostic={status:response.status,reason:'api',
      ...(Number.isSafeInteger(code)?{metaCode:code}:{}),...(Number.isSafeInteger(error?.error_subcode)?{metaSubcode:error!.error_subcode}:{})};
    if(code===190)throw new MetaFailure('SOCIAL_RECONNECT',false,false,diagnostic);
    if([10,200,299].includes(code??0))throw new MetaFailure('SOCIAL_PERMISSIONS',false,false,diagnostic);
    if(response.status>=500||response.status===429||error?.is_transient||[1,2,4,17,32,341,613].includes(code??0))throw new MetaFailure('SOCIAL_TEMPORARY',true,false,diagnostic);
    throw new MetaFailure('SOCIAL_MEDIA',false,false,diagnostic);
  }
  return json;
}
export class MetaSocial {
  readonly fetcher:MetaFetcher;
  constructor(readonly env:SocialSecrets,fetcher:MetaFetcher=fetch){
    // Ne pas invoquer le fetch natif avec MetaSocial comme receveur : workerd le refuse.
    this.fetcher=(input,init)=>fetcher(input,init);
  }
  private async oauthStep<T>(step:'code_exchange'|'token_extension'|'token_validation'|'accounts',action:()=>Promise<T>,retry=false):Promise<T>{
    for(let attempt=0;;attempt++)try{return await action();}catch(error){
      // Seules les lectures et la prolongation du jeton peuvent être reprises. Le code OAuth est à usage unique.
      if(retry&&attempt<2&&error instanceof MetaFailure&&error.retryable){await new Promise(resolve=>setTimeout(resolve,200*(attempt+1)));continue;}
      const code=error instanceof SocialFailure?error.code==='SOCIAL_TEMPORARY'?'SOCIAL_CONNECT_TEMPORARY':error.code==='SOCIAL_MEDIA'?'SOCIAL_CONNECT_FAILED':error.code:'SOCIAL_CONNECT_FAILED';
      // Liste fermée : aucun jeton, code OAuth, message fournisseur, URL ou information de compte.
      console.warn(JSON.stringify({event:'social_oauth_step_failed',step,code,...(error instanceof MetaFailure?error.diagnostic:{reason:'response'}),attempts:attempt+1}));
      throw new SocialFailure(code,error instanceof SocialFailure?error.httpStatus:502);
    }
  }
  async graph(path:string,token:string,params:Record<string,string>={},method='GET'){
    if(!/^(?:me(?:\/(?:accounts|permissions))?|\d{1,40}(?:\/(?:media|media_publish|video_reels))?|debug_token)$/.test(path))throw new Error('META_PATH_INVALID');
    const url=new URL(`https://graph.facebook.com/${graphVersion(this.env)}/${path}`),proof=await socialHmac(this.env.META_APP_SECRET!,token);
    const fields=new URLSearchParams({...params,appsecret_proof:[...proof].map(b=>b.toString(16).padStart(2,'0')).join('')});
    if(method==='GET')url.search=fields.toString();
    try{return await readMeta(await this.fetcher(url,{method,headers:{Authorization:`Bearer ${token}`,...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded'}:{})},
      body:method==='POST'?fields:undefined,signal:AbortSignal.timeout(15000),redirect:'manual'}));
    }catch(error){if(error instanceof MetaFailure)throw error;throw new MetaFailure('SOCIAL_TEMPORARY',true,true,{reason:error instanceof Error&&['TimeoutError','AbortError'].includes(error.name)?'timeout':'transport'});}
  }
  async exchange(code:string,redirectUri:string,requestedPageId?:string){
    if(requestedPageId!==undefined&&!remoteId.safeParse(requestedPageId).success)throw new SocialFailure('SOCIAL_STATE',403);
    const call=async(params:Record<string,string>)=>{
      const url=new URL(`https://graph.facebook.com/${graphVersion(this.env)}/oauth/access_token`);
      url.search=new URLSearchParams({client_id:this.env.META_APP_ID!,client_secret:this.env.META_APP_SECRET!,...params}).toString();
      try{return await readMeta(await this.fetcher(url,{signal:AbortSignal.timeout(15000),redirect:'manual'}));}
      catch(error){if(error instanceof MetaFailure)throw error;throw new MetaFailure('SOCIAL_TEMPORARY',true,false,{reason:error instanceof Error&&['TimeoutError','AbortError'].includes(error.name)?'timeout':'transport'});}
    };
    const short=await this.oauthStep('code_exchange',async()=>accessToken.parse((await call({code,redirect_uri:redirectUri})).access_token));
    const token=await this.oauthStep('token_extension',async()=>accessToken.parse((await call({grant_type:'fb_exchange_token',fb_exchange_token:short})).access_token),true);
    const debug=await this.oauthStep('token_validation',()=>this.graph('debug_token',`${this.env.META_APP_ID}|${this.env.META_APP_SECRET}`,{input_token:token}),true);
    const info=z.object({is_valid:z.literal(true),app_id:z.string(),user_id:remoteId,expires_at:z.number().nonnegative(),
      data_access_expires_at:z.number().nonnegative().optional(),scopes:z.array(z.string()),
      granular_scopes:z.array(z.object({scope:z.string(),target_ids:z.array(remoteId).max(500).optional()})).max(100).catch([])}).parse(debug.data);
    if(info.app_id!==this.env.META_APP_ID)throw new SocialFailure('SOCIAL_STATE',403);
    const expiry=[info.expires_at,info.data_access_expires_at].filter((n):n is number=>Boolean(n&&n>0));
    const expiresAt=new Date(Math.min(...expiry,Date.now()/1000+60*86400)*1000).toISOString();
    if(Date.parse(expiresAt)<=Date.now()+120000)throw new SocialFailure('SOCIAL_RECONNECT');
    const facebook=['pages_show_list','pages_read_engagement','pages_manage_posts'].every(s=>info.scopes.includes(s));
    const instagram=['pages_show_list','pages_read_engagement','instagram_basic','instagram_content_publish'].every(s=>info.scopes.includes(s));
    if(!facebook&&!instagram)throw new SocialFailure('SOCIAL_PERMISSIONS');
    const choices:MetaChoice[]=[],seenPages=new Set<string>();let after:string|undefined,pagesReturned=0,pagesWithPublishingAccess=0,linkedInstagramAccounts=0;
    const collect=(row:z.infer<typeof pageAccount>)=>{
      if(seenPages.has(row.id))return;seenPages.add(row.id);pagesReturned++;
      if(row.tasks&&!row.tasks.some(task=>publishingTasks.has(task)))return;
      pagesWithPublishingAccess++;
      if(row.instagram_business_account)linkedInstagramAccounts++;
      const common={pageId:row.id,metaUserId:info.user_id,token:row.access_token,expiresAt};
      if(facebook)choices.push(MetaChoice.parse({...common,id:`facebook:${row.id}`,platform:'facebook',remoteId:row.id,name:row.name,username:null}));
      if(instagram&&row.instagram_business_account){const ig=row.instagram_business_account;
        choices.push(MetaChoice.parse({...common,id:`instagram:${ig.id}`,platform:'instagram',remoteId:ig.id,name:ig.name||ig.username||row.name,username:ig.username??null}));}
    };
    // Pagination bornée. Aucun paging.next fourni par le réseau n'est suivi.
    for(let page=0;page<5;page++){
      const json=await this.oauthStep('accounts',()=>this.graph('me/accounts',token,{fields:`id,name,access_token,tasks${instagram?',instagram_business_account{id,username,name}':''}`,limit:'100',...(after?{after}:{})}),true);
      const rows=z.array(pageAccount).max(100).parse(json.data);for(const row of rows)collect(row);
      const paging=json.paging as {cursors?:{after?:string};next?:string}|undefined;after=paging?.next?paging.cursors?.after:undefined;
      if(!after||after.length>2000)break;
    }
    // Certaines Pages ne figurent pas dans /me/accounts. Meta vérifie aussi l'accès à une Page indiquée
    // par l'utilisateur : son identifiant n'accorde aucun droit, Meta doit fournir un jeton de Page.
    const authorizedPages=[...new Set(info.granular_scopes.filter(scope=>pagePermissions.has(scope.scope)&&info.scopes.includes(scope.scope)).flatMap(scope=>scope.target_ids??[]))];
    const candidatePages=[...new Set([...(requestedPageId?[requestedPageId]:[]),...authorizedPages])];
    const missingPages=candidatePages.filter(id=>!seenPages.has(id)).slice(0,Math.min(10,500-pagesReturned));
    let unreadablePages=0;
    for(let offset=0;offset<missingPages.length;offset+=5){
      const results=await Promise.allSettled(missingPages.slice(offset,offset+5).map(async id=>{
        const json=await this.oauthStep('accounts',()=>this.graph(id,token,{fields:`id,name,access_token${instagram?',instagram_business_account{id,username,name}':''}`}),true);
        const row=pageAccount.parse(json);
        if(row.id!==id)throw new SocialFailure('SOCIAL_CONNECT_FAILED');
        // Vérifier l'identité du jeton retourné. Ne pas inventer des tâches depuis can_post :
        // le parcours direct documenté par Meta ne requiert pas ce champ.
        const identity=await this.oauthStep('accounts',()=>this.graph('me',row.access_token,{fields:'id'}),true);
        if(remoteId.parse(identity.id)!==id)throw new SocialFailure('SOCIAL_CONNECT_FAILED');
        return row;
      }));
      for(const result of results){if(result.status==='fulfilled')collect(result.value);
        else if(result.reason instanceof SocialFailure&&['SOCIAL_PERMISSIONS','SOCIAL_CONNECT_FAILED'].includes(result.reason.code))unreadablePages++;
        else throw result.reason;}
    }
    if(!choices.length){
      const code=pagesReturned===0?unreadablePages?'SOCIAL_PERMISSIONS':'SOCIAL_NO_ACCOUNTS':pagesWithPublishingAccess===0?'SOCIAL_PAGE_ACCESS':'SOCIAL_INSTAGRAM_LINK';
      // Comptages et permissions uniquement : aucune identité de compte ou donnée d'autorisation.
      console.warn(JSON.stringify({event:'social_oauth_accounts_empty',code,pagesReturned,pagesWithPublishingAccess,linkedInstagramAccounts,
        facebookPermission:facebook,instagramPermission:instagram,authorizedPageTargets:authorizedPages.length,requestedPage:Boolean(requestedPageId),unreadablePages}));
      throw new SocialFailure(code);
    }
    return [...new Map(choices.map(c=>[c.id,c])).values()];
  }
  async create(platform:Platform,remote:string,token:string,videoUrl:string,caption:string){
    remoteId.parse(remote);
    if(platform==='instagram'){const result=await this.graph(`${remote}/media`,token,{media_type:'REELS',video_url:videoUrl,caption,share_to_feed:'true'},'POST');
      return {id:remoteId.parse(result.id),uploadUrl:null};}
    const result=await this.graph(`${remote}/video_reels`,token,{upload_phase:'start'},'POST'),id=remoteId.parse(result.video_id);
    const expected=`https://rupload.facebook.com/video-upload/${graphVersion(this.env)}/${id}`;
    if(result.upload_url!==expected)throw new MetaFailure('SOCIAL_MEDIA');
    return {id,uploadUrl:expected};
  }
  async upload(id:string,token:string,uploadUrl:string,videoUrl:string){
    remoteId.parse(id);if(uploadUrl!==`https://rupload.facebook.com/video-upload/${graphVersion(this.env)}/${id}`)throw new MetaFailure('SOCIAL_MEDIA');
    try{const result=await readMeta(await this.fetcher(uploadUrl,{method:'POST',headers:{Authorization:`OAuth ${token}`,file_url:videoUrl},signal:AbortSignal.timeout(15000),redirect:'manual'}));
      if(result.success!==true)throw new MetaFailure('SOCIAL_MEDIA');
    }catch(error){if(error instanceof MetaFailure)throw error;throw new MetaFailure('SOCIAL_TEMPORARY',true,true);}
  }
  async status(platform:Platform,id:string,token:string){
    remoteId.parse(id);
    if(platform==='instagram'){const result=await this.graph(id,token,{fields:'status_code'}),code=result.status_code;
      return {ready:code==='FINISHED',published:code==='PUBLISHED',failed:code==='ERROR'||code==='EXPIRED',permalink:null};}
    const result=await this.graph(id,token,{fields:'status'}),status=result.status as {video_status?:string;uploading_phase?:{status?:string};processing_phase?:{status?:string};publishing_phase?:{status?:string}}|undefined;
    return {ready:status?.uploading_phase?.status==='complete',published:status?.publishing_phase?.status==='complete',
      failed:status?.video_status==='error'||[status?.uploading_phase?.status,status?.processing_phase?.status,status?.publishing_phase?.status].includes('error'),permalink:null};
  }
  async publish(platform:Platform,remote:string,id:string,token:string,caption:string){
    remoteId.parse(remote);remoteId.parse(id);
    if(platform==='instagram'){const result=await this.graph(`${remote}/media_publish`,token,{creation_id:id},'POST');return remoteId.parse(result.id);}
    const result=await this.graph(`${remote}/video_reels`,token,{upload_phase:'finish',video_id:id,video_state:'PUBLISHED',description:caption},'POST');
    if(result.success!==true)throw new MetaFailure('SOCIAL_TEMPORARY',true,true);return id;
  }
  async permalink(platform:Platform,id:string,token:string){
    const result=await this.graph(id,token,{fields:platform==='instagram'?'permalink':'permalink_url'});
    return safeSocialPermalink(platform,result[platform==='instagram'?'permalink':'permalink_url']);
  }
}
export function safeSocialPermalink(platform:Platform,value:unknown){
  if(typeof value!=='string'||value.length>2048)return null;
  try{const url=new URL(value.startsWith('/')?'https://www.facebook.com'+value:value),hosts=platform==='instagram'?['www.instagram.com','instagram.com']:['www.facebook.com','facebook.com','m.facebook.com'];
    return url.protocol==='https:'&&!url.username&&!url.password&&hosts.includes(url.hostname)&&!url.port?url.toString():null;
  }catch{return null;}
}
