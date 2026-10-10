import {AsyncLocalStorage} from 'node:async_hooks';
import {PostHog,type PostHogOptions} from 'posthog-node/edge';
import {analyticsConfiguration} from './analytics-policy';
import {ERROR_RELEASE,errorPath,safeExceptionProperties} from './error-tracking-policy';

export type ErrorTrackingEnv={POSTHOG_ENABLED?:string;POSTHOG_PROJECT_TOKEN?:string;POSTHOG_HOST?:string;POSTHOG_ERROR_TRACKING_ENABLED?:string;BIENVU_RELEASE?:string;BIENVU_WORKER_CHUNK_ID?:string;PROBE_MODE?:string};
type Scope={env:ErrorTrackingEnv;ctx:{waitUntil(task:Promise<unknown>):void};request:Request|null;seen:WeakSet<object>;count:number;fetcher:typeof fetch};
// OpenNext and the outer Worker bundle this module separately. Share the ALS
// container, never the request value, so Next hooks see the outer request scope.
const scopeKey=Symbol.for('bienvu.error-tracking.scope');
const shared=globalThis as typeof globalThis&{[scopeKey]?:AsyncLocalStorage<Scope>};
const requests=shared[scopeKey]??(shared[scopeKey]=new AsyncLocalStorage<Scope>());
export function withServerErrorTracking<T>(request:Request|null,env:ErrorTrackingEnv,ctx:Scope['ctx'],action:()=>T,fetcher:typeof fetch=fetch):T {
 return requests.run({request,env,ctx,seen:new WeakSet(),count:0,fetcher},action);
}
export function errorTrackingOptions(fetcher:typeof fetch,workerChunkId?:string):PostHogOptions {
 return {host:'https://eu.i.posthog.com',flushAt:1,flushInterval:0,requestTimeout:2500,fetchRetryCount:0,
  enableExceptionAutocapture:false,disableGeoip:true,fetch:(url,options)=>fetcher.call(globalThis,url,options),
  before_send:event=>{
   if(event?.event!=='$exception')return null;
   const props=safeExceptionProperties(event.properties??{});
   // Next injects IDs into its intermediate modules. After Wrangler combines
   // them, all Worker frames must use the map of the final uploaded bundle.
   if(workerChunkId&&/^[a-f\d-]{36}$/i.test(workerChunkId))for(const exception of (props.$exception_list??[]) as {stacktrace:{frames:Record<string,unknown>[]}}[])
    for(const frame of exception.stacktrace.frames)if(typeof frame.filename==='string'&&/(?:^|\/)(?:worker|index)\.m?js$/.test(frame.filename)){frame.chunk_id=workerChunkId;frame.in_app=true;}
   return {...event,properties:props};
  }};
}
// Per-request clients and waitUntil prevent lost events and cross-request SDK queues.
export function captureServerException(error:unknown,properties:{source:'nextjs'|'api'|'worker'|'scheduled';requestId?:string;path?:string;routeType?:string;routerKind?:string}):boolean {
 const scope=requests.getStore();if(!scope)return false;
 const config=analyticsConfiguration(scope.env);
 if(!config.enabled||scope.env.POSTHOG_ERROR_TRACKING_ENABLED==='false'||scope.count>=5)return false;
 if(error&&typeof error==='object'){if(scope.seen.has(error))return false;scope.seen.add(error);}
 scope.count++;
 const correlation=scope.request?.headers.get('X-Analytics-Consent')==='2',session=scope.request?.headers.get('X-PostHog-Session-ID'),identity=scope.request?.headers.get('X-PostHog-Distinct-ID');
 const sessionValid=correlation&&/^[\da-f-]{36}$/i.test(session??''),identityValid=sessionValid&&/^(?:user:)?[a-zA-Z\d_-]{16,100}$/.test(identity??'');
 const digest=error&&typeof error==='object'&&'digest' in error&&typeof error.digest==='string'?error.digest:undefined;
 const props={bv_error_source:properties.source,bv_release:scope.env.BIENVU_RELEASE??ERROR_RELEASE,bv_request_id:properties.requestId,bv_error_digest:digest,
  bv_route_type:properties.routeType,bv_router_kind:properties.routerKind,bv_http_method:scope.request?.method??'SCHEDULED',
  $pathname:errorPath(properties.path??scope.request?.url??'/scheduled'),...(sessionValid?{$session_id:session}:{}),is_test:scope.env.PROBE_MODE==='true',$process_person_profile:false,$ip:null};
 // Telemetry failure cannot change the response or recursively report itself.
 scope.ctx.waitUntil((async()=>{
  const client=new PostHog(config.token,errorTrackingOptions(scope.fetcher,scope.env.BIENVU_WORKER_CHUNK_ID));let warned=false;
  const warn=()=>{if(!warned){warned=true;console.warn(JSON.stringify({event:'error_tracking_delivery_failed'}));}};client.on('error',warn);
  try{await client.captureExceptionImmediate(error,identityValid?identity!:'bienvu:server',props);}
  catch{warn();}
  finally{await client.shutdown(3000).catch(()=>{});}
 })().catch(()=>{console.warn(JSON.stringify({event:'error_tracking_delivery_failed'}));}));
 return true;
}
