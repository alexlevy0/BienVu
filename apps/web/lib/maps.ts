import {MapFailure,limitMapRequest,type MapEnvironment} from '@bienvu/maps';
import {RequestFailure,assertSameOrigin} from './http';
import type {AuthEnvironment} from './auth';
export async function authorizeMapRequest(request:Request,env:MapEnvironment&AuthEnvironment){
  assertSameOrigin(request,env);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.BETTER_AUTH_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`map:${request.headers.get('cf-connecting-ip')??'local'}`));
  const identity=Array.from(new Uint8Array(signature),v=>v.toString(16).padStart(2,'0')).join('');
  await limitMapRequest(env.DB,identity);
}
export async function mapAction<T>(action:()=>Promise<T>):Promise<T>{
  try{return await action();}catch(error){if(error instanceof MapFailure)throw new RequestFailure(error.code);throw error;}
}
