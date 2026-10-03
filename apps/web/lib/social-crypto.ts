import {publicErrors,socialErrorMessages} from '@bienvu/contracts';
import {z,ZodError} from 'zod';
import {boundedBytes,respond,RequestFailure} from './http';

export class SocialFailure extends Error {
  constructor(readonly code:string,readonly httpStatus=422){super(code);}
}
export function socialFailureResponse(error:unknown){
  if(!(error instanceof SocialFailure))throw error;
  return Response.json({error:{code:error.code,message:socialErrorMessages[error.code]??publicErrors[error.code as keyof typeof publicErrors]?.[1]??'Cette action n’a pas abouti. Réessayez.'}},{status:error.httpStatus});
}
export function respondSocial(action:()=>Promise<Response>){return respond(async()=>{
  try{return await action();}catch(error){if(error instanceof ZodError)throw new RequestFailure('VALIDATION_ERROR');return socialFailureResponse(error);}
});}
export async function socialOAuthStartInput(request:Request){
  // workerd peut fournir un flux vide même pour un POST sans corps.
  const bytes=request.body?await boundedBytes(request,1024):new Uint8Array();
  if(!bytes.length)return {};
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')throw new RequestFailure('VALIDATION_ERROR');
  let value:unknown;try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new RequestFailure('VALIDATION_ERROR');}
  return z.object({pageId:z.string().regex(/^\d{1,40}$/).optional(),flow:z.literal('facebook').optional()}).strict().parse(value);
}
const oauthErrors=['access_denied','invalid_request','unauthorized_client','unsupported_response_type','invalid_scope','server_error','temporarily_unavailable'] as const;
type OAuthError=typeof oauthErrors[number];
export type SocialOAuthRejection={failure:'SOCIAL_CANCELLED'|'SOCIAL_CONNECT_FAILED'|'SOCIAL_CONNECT_TEMPORARY'|'SOCIAL_CONNECT_CONFIGURATION';
  providerError:OAuthError|'absent'|'other'|'malformed_response';providerReason:OAuthError|'user_denied'|'absent'|'other';metaCode:number|null};
export function socialOAuthReturn(params:URLSearchParams):string|SocialOAuthRejection{
  // Les messages libres de Meta peuvent contenir des informations sensibles.
  const rawError=params.get('error'),rawReason=params.get('error_reason'),rawCode=params.get('error_code');
  const providerReason=rawReason===null?'absent':rawReason==='user_denied'?'user_denied':oauthErrors.includes(rawReason as OAuthError)?rawReason as OAuthError:'other';
  const metaCode=rawCode!==null&&/^\d{1,10}$/.test(rawCode)&&Number(rawCode)<=2147483647?Number(rawCode):null;
  if(['code','error','error_reason','error_code'].some(name=>params.getAll(name).length>1))return {failure:'SOCIAL_CONNECT_FAILED',providerError:'malformed_response',providerReason,metaCode};
  if(rawError===null&&rawReason===null&&rawCode===null&&params.get('code'))return params.get('code')!;
  const providerError=rawError===null?'absent':oauthErrors.includes(rawError as OAuthError)?rawError as OAuthError:'other';
  const failure=providerReason==='user_denied'||providerError==='access_denied'&&providerReason==='absent'&&(metaCode===null||metaCode===200)?'SOCIAL_CANCELLED':
    ['server_error','temporarily_unavailable'].includes(providerError)?'SOCIAL_CONNECT_TEMPORARY':
    ['invalid_request','unauthorized_client','unsupported_response_type','invalid_scope'].includes(providerError)?'SOCIAL_CONNECT_CONFIGURATION':'SOCIAL_CONNECT_FAILED';
  return {failure,providerError,providerReason,metaCode};
}
export type SocialSecrets={SOCIAL_ENABLED?:string;META_APP_ID?:string;META_APP_SECRET?:string;META_GRAPH_VERSION?:string;
  META_LOGIN_CONFIG_ID?:string;SOCIAL_TOKEN_ENCRYPTION_KEY?:string;BETTER_AUTH_URL:string};
const encoder=new TextEncoder();
function base64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function unbase64(value:string){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
export const randomSocialToken=()=>base64(crypto.getRandomValues(new Uint8Array(32)));
export async function socialHash(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function encryptionKey(secret:string|undefined){
  if(!secret||!/^[A-Za-z0-9_-]{43}$/.test(secret))throw new SocialFailure('SOCIAL_DISABLED',503);
  const bytes=unbase64(secret);if(bytes.length!==32)throw new SocialFailure('SOCIAL_DISABLED',503);
  return crypto.subtle.importKey('raw',bytes,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
// Le contexte authentifié empêche de déplacer un jeton chiffré vers une autre agence.
export async function sealSocial(value:unknown,secret:string|undefined,context:string){
  const iv=crypto.getRandomValues(new Uint8Array(12)),key=await encryptionKey(secret);
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(context)},key,encoder.encode(JSON.stringify(value)));
  return `v1.${base64(iv)}.${base64(new Uint8Array(ciphertext))}`;
}
export async function openSocial<T>(cipher:string,secret:string|undefined,context:string):Promise<T>{
  const [version,iv,data,...rest]=cipher.split('.');if(version!=='v1'||!iv||!data||rest.length)throw new SocialFailure('SOCIAL_RECONNECT');
  try{const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:unbase64(iv),additionalData:encoder.encode(context)},await encryptionKey(secret),unbase64(data));
    return JSON.parse(new TextDecoder().decode(raw)) as T;
  }catch{throw new SocialFailure('SOCIAL_RECONNECT');}
}
export function socialConfigured(env:SocialSecrets){return env.SOCIAL_ENABLED==='true'&&Boolean(env.META_APP_ID&&/^\d{5,32}$/.test(env.META_APP_ID)&&env.META_APP_SECRET&&/^[A-Za-z0-9_-]{43}$/.test(env.SOCIAL_TOKEN_ENCRYPTION_KEY??''));}
export function socialOrigin(env:SocialSecrets){
  const url=new URL(env.BETTER_AUTH_URL);
  if(url.origin!==env.BETTER_AUTH_URL||url.username||url.password||url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('INVALID_SOCIAL_ORIGIN');
  return url.origin;
}
export function graphVersion(env:SocialSecrets){return /^v\d{2}\.0$/.test(env.META_GRAPH_VERSION??'')?env.META_GRAPH_VERSION!:'v25.0';}
export async function socialHmac(secret:string,value:string){
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));
}
export async function socialMediaSignature(secret:string,postId:string,expires:number){return base64(await socialHmac(secret,`media:v1:${postId}:${expires}`));}
export async function verifySocialMediaSignature(secret:string,postId:string,expires:number,signature:string,now=Date.now()){
  if(!Number.isSafeInteger(expires)||expires*1000<=now||expires*1000>now+25*3600_000||!/^[A-Za-z0-9_-]{43}$/.test(signature))return false;
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('HMAC',key,unbase64(signature),encoder.encode(`media:v1:${postId}:${expires}`));
}
export async function verifyMetaSignedRequest(value:string,secret:string,now=Date.now()){
  if(value.length>8192)throw new SocialFailure('SOCIAL_STATE',403);
  const [signature,payload,...rest]=value.split('.');if(!signature||!payload||rest.length)throw new SocialFailure('SOCIAL_STATE',403);
  try{const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    if(!await crypto.subtle.verify('HMAC',key,unbase64(signature),encoder.encode(payload)))throw new Error();
    const data=JSON.parse(new TextDecoder().decode(unbase64(payload))) as {algorithm?:string;user_id?:string;issued_at?:number};
    if(data.algorithm?.toUpperCase()!=='HMAC-SHA256'||!/^\d{1,40}$/.test(data.user_id??'')||!Number.isSafeInteger(data.issued_at)||Math.abs(now/1000-data.issued_at!)>600)throw new Error();
    return data.user_id!;
  }catch{throw new SocialFailure('SOCIAL_STATE',403);}
}
