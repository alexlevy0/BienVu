// Shared by browser and Worker: retain debuggable frames, never request credentials.
export const ERROR_RELEASE=process.env.NEXT_PUBLIC_BIENVU_RELEASE??'development';
export function redactErrorText(value:string):string {
 return value.slice(0,4000)
  .replace(/https?:\/\/[^\s<>"')]+/gi,url=>{try{const u=new URL(url);u.username='';u.password='';u.search='';u.hash='';return u.href;}catch{return '[URL]';}})
  .replace(/(?:phx_|phc_|sk_live_|sk_test_|sk-proj-|sk-)[A-Za-z0-9_-]{8,}/g,'[clé]')
  .replace(/Bearer\s+[^\s"']+/gi,'Bearer [masqué]')
  .replace(/\b(password|secret|authorization|cookie|access_token|refresh_token|token|code|signature)\b(["']?\s*[:=]\s*["']?)[^\s,;"'<>}]+/gi,'$1$2[masqué]')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[e-mail]')
  .replace(/(?<!\d)(?:\+33\s?|0)[1-9](?:[ .-]?\d{2}){4}(?!\d)/g,'[téléphone]');
}
const record=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
export function errorPath(value:string):string {
 try {const path=new URL(value,'https://bienvu.online').pathname;
  return path.replace(/^\/validation\/[^/]+/,'/validation/[token]').split('/').map(part=>/^[a-f\d-]{20,}$/i.test(part)||/[a-f\d]{8}-[a-f\d-]{27}/i.test(part)||/^\d{4,}$/.test(part)||/@|%40/i.test(part)||part.length>80?'[id]':part).join('/');
 }catch{return '/[unknown]';}
}
export function safeExceptionProperties(input:Record<string,unknown>):Record<string,unknown> {
 const result:Record<string,unknown>={};
 if(Array.isArray(input.$exception_list))result.$exception_list=input.$exception_list.slice(0,5).map(value=>{
  const exception=record(value),mechanism=record(exception.mechanism),stacktrace=record(exception.stacktrace);
  const frames=Array.isArray(stacktrace.frames)?stacktrace.frames.slice(-50).map(value=>{
   const frame=record(value),clean:Record<string,unknown>={};
   for(const key of ['filename','function','module','platform','chunk_id','debug_id'])if(typeof frame[key]==='string')clean[key]=redactErrorText(frame[key] as string);
   for(const key of ['lineno','colno','line','column'])if(typeof frame[key]==='number'&&Number.isFinite(frame[key]))clean[key]=frame[key];
   for(const key of ['in_app','resolved'])if(typeof frame[key]==='boolean')clean[key]=frame[key];
   return clean;
  }):[];
  return {type:redactErrorText(typeof exception.type==='string'?exception.type:'Error'),value:redactErrorText(typeof exception.value==='string'?exception.value:'Unexpected error'),
   mechanism:{...(typeof mechanism.type==='string'?{type:mechanism.type.slice(0,100)}:{}),...(typeof mechanism.handled==='boolean'?{handled:mechanism.handled}:{})},
   stacktrace:{type:typeof stacktrace.type==='string'?stacktrace.type:'raw',frames}};
 });
 for(const key of ['$exception_level','$exception_source','$exception_type','$exception_message','$exception_capture_source','$exception_handled','$exception_personURL','$exception_stack_trace_raw','$exception_stack_trace_type','$exception_fingerprint','$release_id']){
  if(typeof input[key]==='string')result[key]=redactErrorText(input[key]);else if(typeof input[key]==='boolean')result[key]=input[key];
 }
 for(const key of ['distinct_id','$device_id','$session_id','$window_id','$lib','$lib_version','$browser','$browser_version','$os','$os_version','$device_type','$screen_height','$screen_width','$viewport_height','$viewport_width']){
  if(typeof input[key]==='string'||typeof input[key]==='number')result[key]=input[key];
 }
 for(const key of ['bv_error_source','bv_error_digest','bv_release','bv_request_id','bv_route_type','bv_router_kind','bv_http_method'])if(typeof input[key]==='string')result[key]=redactErrorText(input[key]).slice(0,200);
 for(const key of ['is_internal','is_test'])if(typeof input[key]==='boolean')result[key]=input[key];
 if(typeof input.$pathname==='string')result.$pathname=errorPath(input.$pathname);
 result.$process_person_profile=false;result.$ip=null;
 return result;
}
