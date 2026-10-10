import {AvatarId,AvatarEngine,AVATAR_AUDIO_BYTES,type AvatarLook} from '@bienvu/contracts';

export class AvatarFailure extends Error{constructor(readonly code:string,readonly uncertain=false){super(code);}}
export type HeygenEnvironment={HEYGEN_API_KEY?:string;HEYGEN_ENABLED?:string;HEYGEN_WEBHOOK_SECRET?:string};
export const avatarHash=async(bytes:Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes)))].map(x=>x.toString(16).padStart(2,'0')).join('');
// Stable across catalogue refreshes; changing provider assets invalidates only
// their own derivatives. Signed provider URLs never leave the server.
export const avatarMediaVersion=(source:string)=>avatarHash(new TextEncoder().encode(source)).then(hash=>hash.slice(0,16));
export const avatarCatalogKey=(id:string,kind:'thumbnail'|'preview',version:string)=>`catalogue/heygen/${AvatarId.parse(id)}/${kind==='thumbnail'?'thumbnail-320-v1':'preview-v1'}-${version}`;
export async function boundedBytes(response:Response,max:number){
  if(Number(response.headers.get('content-length'))>max){await response.body?.cancel();throw new AvatarFailure('AVATAR_MEDIA_INVALID');}
  const reader=response.body?.getReader();if(!reader)throw new AvatarFailure('AVATAR_MEDIA_INVALID');let size=0;const chunks:Uint8Array[]=[];
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max)throw new AvatarFailure('AVATAR_MEDIA_INVALID');chunks.push(value);}}
  catch(cause){await reader.cancel().catch(()=>{});throw cause;}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}return bytes;
}
export function heygenMediaUrl(value:string){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'
  ||!['heygen.ai','heygen.com'].some(domain=>url.hostname===domain||url.hostname.endsWith('.'+domain)))throw new AvatarFailure('AVATAR_MEDIA_INVALID');return url.toString();}
export async function downloadHeygenMedia(url:string,max=10*1024*1024,fetcher:typeof fetch=fetch){
  let target=heygenMediaUrl(url);for(let i=0;i<3;i++){
    const response=await fetcher(target,{redirect:'manual',signal:AbortSignal.timeout(25000)});
    if(response.status>=300&&response.status<400){const location=response.headers.get('location');await response.body?.cancel();if(!location)break;target=heygenMediaUrl(new URL(location,target).toString());continue;}
    if(!response.ok){await response.body?.cancel();throw new AvatarFailure('AVATAR_MEDIA_UNAVAILABLE');}return boundedBytes(response,max);
  }throw new AvatarFailure('AVATAR_MEDIA_UNAVAILABLE');
}
type JsonRecord=Record<string,unknown>;
export function heygenClient(key:string,fetcher:typeof fetch=fetch){
  if(!key||key.length>1024||/[\r\n]/.test(key))throw new AvatarFailure('AVATAR_CONFIG_INVALID');
  async function request(path:string,init:RequestInit={},billable=false):Promise<JsonRecord>{
    let response:Response;try{response=await fetcher('https://api.heygen.com'+path,{...init,redirect:'manual',signal:AbortSignal.timeout(25000),headers:{'X-Api-Key':key,...init.headers}});}
    catch{throw new AvatarFailure(billable?'AVATAR_UNCERTAIN':'AVATAR_UNAVAILABLE',billable);}
    let body:JsonRecord;try{body=JSON.parse(new TextDecoder().decode(await boundedBytes(response,1024*1024))) as JsonRecord;}
    catch{throw new AvatarFailure(billable?'AVATAR_UNCERTAIN':'AVATAR_RESPONSE_INVALID',billable);}
    if(!response.ok){const raw=(body.error as JsonRecord|undefined)?.code;
      const code=response.status===401||response.status===403?'AVATAR_AUTH_FAILED':response.status===402?'AVATAR_BALANCE_LOW':response.status===429?'AVATAR_RATE_LIMIT':
        response.status>=500?(billable?'AVATAR_UNCERTAIN':'AVATAR_UNAVAILABLE'):raw==='request_in_progress'?'AVATAR_UNCERTAIN':'AVATAR_REQUEST_REJECTED';
      throw new AvatarFailure(code,billable&&(response.status>=500||raw==='request_in_progress'));}
    if(!body.data||typeof body.data!=='object')throw new AvatarFailure(billable?'AVATAR_UNCERTAIN':'AVATAR_RESPONSE_INVALID',billable);
    return body;
  }
  return {
    async wallet(){const body=await request('/v3/users/me'),data=body.data as JsonRecord,wallet=data.wallet as JsonRecord|undefined;
      const balance=wallet?.remaining_balance;return {currency:wallet?.currency==='usd'?'USD':null,balance:typeof balance==='number'&&Number.isFinite(balance)?balance:null,
        autoReload:(wallet?.auto_reload as JsonRecord|undefined)?.enabled===true,billingType:typeof data.billing_type==='string'?data.billing_type:null};},
    async looks(type:'studio_avatar'|'photo_avatar'|'digital_twin'='studio_avatar',token?:string){
      const query=new URLSearchParams({ownership:'public',avatar_type:type,limit:'50'});if(token)query.set('token',token);
      const body=await request('/v3/avatars/looks?'+query),data=body.data;if(!Array.isArray(data)||data.length>50)throw new AvatarFailure('AVATAR_RESPONSE_INVALID');
      const looks=data.flatMap((raw:JsonRecord)=>{const engines=Array.isArray(raw.supported_api_engines)?raw.supported_api_engines.filter(x=>AvatarEngine.safeParse(x).success):[];
        if(!AvatarId.safeParse(raw.id).success||!engines.length||raw.status!==undefined&&raw.status!=='completed'||!['studio_avatar','photo_avatar','digital_twin'].includes(String(raw.avatar_type)))return [];
        const source={image:typeof raw.preview_image_url==='string'?heygenMediaUrl(raw.preview_image_url):null,video:typeof raw.preview_video_url==='string'?heygenMediaUrl(raw.preview_video_url):null};
        return [{look:{id:String(raw.id),name:String(raw.name??'Présentateur').slice(0,160),gender:raw.gender==='female'||raw.gender==='male'?raw.gender:'unknown',type:raw.avatar_type,
          engines,enabled:false,thumbnail:null,preview:null,transparentVerified:false,ownership:'public',updatedAt:new Date().toISOString()} as AvatarLook,source}];});
      return {looks,nextToken:typeof body.next_token==='string'?body.next_token:null};
    },
    async upload(bytes:Uint8Array,id:string){if(bytes.length>AVATAR_AUDIO_BYTES)throw new AvatarFailure('AVATAR_MEDIA_INVALID');
      const body=new FormData();body.set('file',new Blob([new Uint8Array(bytes)],{type:'audio/wav'}),'narration.wav');
      const result=await request('/v3/assets',{method:'POST',body,headers:{'Idempotency-Key':'bienvu-audio:'+id}}),data=result.data as JsonRecord;
      return AvatarId.parse(data.asset_id??data.id);},
    async create(input:{id:string;lookId:string;engine:'avatar_iii'|'avatar_iv';audioId:string;transparent:boolean}){
      const result=await request('/v3/videos',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'bienvu-avatar:'+input.id},
        body:JSON.stringify({type:'avatar',avatar_id:AvatarId.parse(input.lookId),audio_asset_id:AvatarId.parse(input.audioId),engine:{type:input.engine},
          title:'BienVu avatar '+input.id,callback_id:input.id,aspect_ratio:'9:16',resolution:'720p',fit:'cover',output_format:input.transparent?'webm':'mp4'})},true);
      const data=result.data as JsonRecord,parsed=AvatarId.safeParse(data.video_id??data.id);if(!parsed.success)throw new AvatarFailure('AVATAR_UNCERTAIN',true);return parsed.data;
    },
    async video(id:string){const body=await request('/v3/videos/'+AvatarId.parse(id)),data=body.data as JsonRecord;
      const status=String(data.status);if(!['waiting','pending','processing','completed','failed'].includes(status))throw new AvatarFailure('AVATAR_RESPONSE_INVALID');
      return {id:String(data.id??id),status,duration:typeof data.duration==='number'?data.duration:null,
        url:typeof data.video_url==='string'?heygenMediaUrl(data.video_url):null,error:typeof data.failure_code==='string'?data.failure_code:null};
    },
  };
}
export async function verifyHeygenSignature(secret:string,bytes:Uint8Array,signature:string|null){
  if(!signature||!/^[a-f0-9]{64}$/i.test(signature)||!secret)return false;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.match(/.{2}/g)!,x=>parseInt(x,16)),new Uint8Array(bytes));
}
