import type {PostHog,PostHogConfig,CaptureResult} from 'posthog-js';
import {ANALYTICS_CONSENT_KEY,CONSENT_DURATION_MS,analyticsPath,analyticsUrl,analyticsEvents,readAnalyticsConsent,replayAllowed,replayAttribute,replayUrl,safeAnalyticsProperties,
  type AnalyticsConsent,type AnalyticsConfig,type AnalyticsProperties} from './analytics-policy';

let sdk:PostHog|null=null,initializing:Promise<void>|null=null,config:AnalyticsConfig|null=null;
let consent:AnalyticsConsent|null=null,accountReady=false,excluded=false,internal=false,userId:string|null=null,identified:string|null=null,active=false,lastPage='';
let revision=0;
const pending:{name:string;properties:AnalyticsProperties}[]=[],once=new Set<string>();
const lastAction=new Map<string,number>();
const replayImages=new Map<string,string>();
const locationAllowed=()=>typeof window!=='undefined'&&analyticsPath(window.location.href)!==null;
const mayCapture=()=>accountReady&&!excluded&&Boolean(consent?.analytics)&&Date.now()-(consent?.at??0)<CONSENT_DURATION_MS&&locationAllowed();
const mayRecord=()=>mayCapture()&&Boolean(consent?.replay)&&replayAllowed(window.location.href);
export function storedAnalyticsConsent(){try{return readAnalyticsConsent(localStorage.getItem(ANALYTICS_CONSENT_KEY));}catch{return null;}}
export function openPrivacyPreferences(){if(typeof window!=='undefined')window.dispatchEvent(new Event('bienvu:privacy-preferences'));}

// Photo pixels already displayed in this browser keep authenticated/local images
// readable in replay without exposing a cookie or adding a public media endpoint.
function imageLoaded(event:Event){if(event.target instanceof HTMLImageElement)rememberReplayImage(event.target);}
function rememberReplayImage(image:HTMLImageElement){
  if(!mayRecord()||!image.complete||!image.naturalWidth||replayImages.has(image.src))return;
  try{const canvas=document.createElement('canvas'),scale=Math.min(1,720/image.naturalWidth,720/image.naturalHeight);
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext('2d');if(!context)return;context.drawImage(image,0,0,canvas.width,canvas.height);
    const data=canvas.toDataURL('image/jpeg',.65);if(data.length<=250_000){replayImages.set(image.src,data);if(replayImages.size>48)replayImages.delete(replayImages.keys().next().value!);}
  }catch{/* Cross-origin media remains referenced by its original URL. */}
}
export function redactAnalyticsEvent(event:CaptureResult|null):CaptureResult|null {
  if(!event||!mayCapture())return null;
  if(event.event==='$snapshot'){
    if(!mayRecord())return null;
    for(const image of document.images)rememberReplayImage(image);
    // Preserve text, styles and media. Strip only credentials before transport.
    const snapshots=event.properties.$snapshot_data;
    if(!Array.isArray(snapshots))return null;
    const scrub=(value:unknown):void=>{if(!value||typeof value!=='object')return;
      for(const [key,item] of Object.entries(value)){
        if(['href','url','src','poster'].includes(key)&&typeof item==='string')(value as Record<string,unknown>)[key]=key==='src'?(replayImages.get(item)??replayUrl(item)):replayUrl(item);
        else scrub(item);
      }};
    scrub(snapshots);
    for(const key of Object.keys(event.properties))if(/url|pathname|referrer/i.test(key))delete event.properties[key];
    return event;
  }
  if(!analyticsEvents.has(event.event)&&!['$pageview','$pageleave','$autocapture','$rageclick','$identify'].includes(event.event))return null;
  const props:Record<string,unknown>={...safeAnalyticsProperties(event.properties)};
  for(const key of ['distinct_id','$device_id','$session_id','$window_id','$lib','$lib_version','$browser','$browser_version','$os','$os_version','$device_type',
    '$screen_height','$screen_width','$viewport_height','$viewport_width','$event_type','$is_identified','$pageview_id','$prev_pageview_id','$prev_pageview_duration','$anon_distinct_id','$elements','$elements_chain','$el_text','$referring_domain',
    'utm_source','utm_medium','utm_campaign','utm_content','utm_term']){
    if(event.properties[key]!==undefined)props[key]=event.properties[key];
  }
  if(Array.isArray(props.$elements))props.$elements=props.$elements.map(element=>{
    const clean={...(element as Record<string,unknown>)};
    for(const [key,value] of Object.entries(clean)){
      if(/password|secret|csrf|authorization|access.token|refresh.token/i.test(key))delete clean[key];
      else if(/href|src|url/i.test(key)&&typeof value==='string')clean[key]=replayUrl(value);
    }return clean;
  });
  if(typeof props.$elements_chain==='string'&&/token=|code=|secret=/i.test(props.$elements_chain))delete props.$elements_chain;
  props.$current_url=analyticsUrl(window.location.href);props.$pathname=analyticsPath(window.location.href);props.$host='bienvu.online';props.is_internal=internal;
  props.token=config?.token; // Required by the SDK's ingestion queue; this is the public project token.
  // Person properties are intentionally empty: names, emails and addresses aren't analytics inputs.
  delete event.$set;delete event.$set_once;event.properties=props;return event;
}
export function posthogOptions():Partial<PostHogConfig> {
  return {api_host:config!.host,ui_host:'https://eu.posthog.com',defaults:'2026-05-30',
    persistence:'localStorage',cross_subdomain_cookie:false,cookie_expiration:180,save_referrer:true,store_google:true,
    opt_out_capturing_by_default:true,opt_out_persistence_by_default:true,
    capture_pageview:false,capture_pageleave:false,
    autocapture:{dom_event_allowlist:['click'],capture_copied_text:false},mask_all_text:false,mask_all_element_attributes:false,
    person_profiles:'identified_only',ip:false,disable_surveys:true,enable_heatmaps:false,
    capture_exceptions:false,enable_recording_console_log:false,capture_performance:false,
    advanced_disable_feature_flags:true,disable_session_recording:true,
    mask_personal_data_properties:false,before_send:redactAnalyticsEvent,
    session_recording:{maskAllInputs:false,maskInputOptions:{password:true},maskTextSelector:'[data-analytics-sensitive]',maskAllElementAttributes:false,
      maskInputFn:()=> '[masqué]',maskAttributeFn:replayAttribute,
      blockSelector:'input[type="hidden"],input[type="file"],[data-analytics-secret]',
      captureCanvas:{recordCanvas:true,canvasFps:4,canvasQuality:'0.6'},canvasCapture:{resolutionScale:.7},collectFonts:true,inlineStylesheet:true,recordCrossOriginIframes:false,captureJsonLd:false,slimDOMOptions:true,recordHeaders:false,recordBody:false,
      maskCapturedNetworkRequestFn:data=>data.isInitial?{...data,name:analyticsUrl(data.name),requestHeaders:undefined,responseHeaders:undefined,requestBody:undefined,responseBody:undefined}:null,
      compress_events:false},
  };
}
function halt(){active=false;lastPage='';pending.length=0;replayImages.clear();if(typeof document!=='undefined')document.removeEventListener('load',imageLoaded,true);if(sdk){sdk.stopSessionRecording();sdk.opt_out_capturing();}}
// Next's hook executes before the destination DOM renders, including navigation into the admin.
export function suspendProductAnalytics(){revision++;halt();}
async function synchronize(){
  if(!config?.enabled||!mayCapture()){halt();return;}
  if(!sdk){
    if(!initializing)initializing=(async()=>{try{
      const {default:posthog}=await import('posthog-js');
      if(!config?.enabled||!mayCapture())return;
      sdk=posthog.init(config.token,posthogOptions())??posthog;
    }catch{/* Analytics must never block a visitor's task. */}finally{initializing=null;}})();
    await initializing;
  }
  if(!sdk||!mayCapture()){halt();return;}
  if(identified!==userId||sdk.get_distinct_id().startsWith('user:')&&sdk.get_distinct_id()!=='user:'+userId){
    if(identified!==null&&identified!==userId||sdk.get_distinct_id().startsWith('user:')&&sdk.get_distinct_id()!=='user:'+userId)sdk.reset(true);
    identified=userId;once.clear();
  }
  sdk.opt_in_capturing({captureEventName:false});active=true;
  if(userId&&sdk.get_distinct_id()!=='user:'+userId)sdk.identify('user:'+userId);
  if(userId)try{const login=JSON.parse(sessionStorage.getItem('bienvu:analytics-login')??'null') as {at:number;method:string}|null;
    if(login){sessionStorage.removeItem('bienvu:analytics-login');if(login.method==='google'&&Date.now()-login.at<900000)trackProductEvent('login_completed',{method:'google'});}
  }catch{}
  if(mayRecord()){document.addEventListener('load',imageLoaded,true);sdk.startSessionRecording();}else{document.removeEventListener('load',imageLoaded,true);replayImages.clear();sdk.stopSessionRecording();}
  const page=analyticsPath(window.location.href)!;
  if(page!==lastPage){lastPage=page;sdk.capture('$pageview',{page,account_type:userId?'authenticated':'anonymous'});if(page==='/editeur')trackProductEvent('editor_opened');}
  for(const event of pending.splice(0))sdk.capture(event.name,event.properties);
}
export function configureProductAnalytics(next:AnalyticsConfig,choice:AnalyticsConsent|null,identity:{ready:boolean;excluded:boolean;userId:string|null;internal?:boolean}) {
  if(!choice)clearAnalyticsStorage(next.token);
  config=next;consent=choice;accountReady=identity.ready;excluded=identity.excluded;internal=identity.internal??false;userId=identity.userId;
  void synchronize();
}
function clearAnalyticsStorage(token:string){
  if(typeof window==='undefined'||!token)return;
  try{sessionStorage.removeItem('bienvu:analytics-login');}catch{}
  for(const area of ['localStorage','sessionStorage'] as const)try{const store=window[area];
    for(const key of Object.keys(store))if(key.includes(token)&&(/^ph_|^__ph_/.test(key)))store.removeItem(key);
  }catch{/* Storage may be disabled by the browser. */}
}
export function setAnalyticsConsent(choice:AnalyticsConsent){
  consent=choice;revision++;
  try{localStorage.setItem(ANALYTICS_CONSENT_KEY,JSON.stringify(choice));}catch{/* This choice still applies to this tab. */}
  if(!choice.analytics){halt();sdk?.reset(true);identified=null;once.clear();clearAnalyticsStorage(config?.token??'');}
  void synchronize();
}
export function trackProductEvent(name:string,input:AnalyticsProperties={},key?:string){
  if(!analyticsEvents.has(name)||!mayCapture())return;
  // Continuous typing and dragging remain visible in replay without an event per pixel/key.
  if(name==='editor_action'){const action=input.action??input.tab??'',last=lastAction.get(String(action))??0;
    if(Date.now()-last<1000)return;lastAction.set(String(action),Date.now());}
  if(key){const onceKey=name+':'+key;if(once.has(onceKey))return;once.add(onceKey);if(once.size>2000)once.delete(once.values().next().value!);}
  const properties={...safeAnalyticsProperties(input),page:analyticsPath(window.location.href)!,account_type:userId?'authenticated':'anonymous',is_internal:internal};
  if(active&&sdk)sdk.capture(name,properties);else if(pending.length<50)pending.push({name,properties});
}
export function trackGenerationOutcome(job:{id:string;status:string;sourceKind:string|null;errorCode?:string|null}){
  if(job.status==='ready'||job.status==='failed')trackProductEvent(job.status==='ready'?'generation_ready':'generation_failed',
    {source_kind:job.sourceKind??undefined,...(job.errorCode?{error_code:job.errorCode}:{})},job.id);
}

// A narrow first-party wrapper, never a global fetch interceptor and never a request-body logger.
function operation(path:string,method:string):string|null {
  if(method==='POST'){
    if(path==='/api/imports')return 'import';
    if(['/api/imports/describe','/api/trial/describe'].includes(path))return 'description';
    if(['/api/generations','/api/trial'].includes(path))return 'generation';
    if(/^\/api\/(imports|trial\/manual)\/[^/]+\/complete$/.test(path))return 'manual_listing';
    if(/\/editor-export$/.test(path))return 'editor_export';
    if(path==='/api/auth/sign-up/email')return 'signup';
    if(['/api/auth/sign-in/email','/api/auth/sign-in/social'].includes(path))return 'login';
    if(['/api/billing/checkout','/api/billing/topups'].includes(path))return 'checkout';
    if(path==='/api/partners/applications')return 'partner_application';
  }return null;
}
function requestAnalyticsProperties(body:BodyInit|null|undefined):AnalyticsProperties {
  if(typeof body!=='string')return {};
  try{const value=JSON.parse(body) as Record<string,unknown>,customization=value.customization as Record<string,unknown>|undefined;
    const properties:Record<string,unknown>={duration_seconds:value.durationSeconds,aspect_ratio:value.aspectRatio,
      voice_enabled:value.voiceEnabled,subtitles_enabled:value.subtitlesEnabled,map_enabled:customization?Boolean(customization.map):undefined,
      photo_count:Array.isArray(customization?.photoOrder)?customization.photoOrder.length:undefined,
      animation_count:Array.isArray(customization?.runwayPhotos)?customization.runwayPhotos.length:customization?.runwayClips};
    if(typeof value.url==='string'){const url=new URL(value.url);properties.source_domain=url.hostname.replace(/^www\./,'');properties.source_kind='url';}
    else if(typeof value.listingId==='string')properties.source_kind='manual';
    return safeAnalyticsProperties(properties);
  }catch{return {};}
}
export async function analyticsFetch(input:RequestInfo|URL,init?:RequestInit,properties:AnalyticsProperties={}):Promise<Response>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url,
    path=new URL(url,typeof window!=='undefined'?window.location.origin:'https://bienvu.online').pathname,
    op=operation(path,(init?.method??'GET').toUpperCase());
  if(!op)return fetch(input,init);
  properties={...requestAnalyticsProperties(init?.body),...properties};
  const started=performance.now(),atRevision=revision;
  const headers=new Headers(init?.headers),key=headers.get('Idempotency-Key')??undefined;
  // Correlate operational traces with a consented replay only. This metadata
  // never grants access and is ignored by authentication/agency selection.
  if(mayRecord()&&sdk){headers.set('X-Analytics-Consent','2');headers.set('X-PostHog-Session-ID',sdk.get_session_id());headers.set('X-PostHog-Distinct-ID',sdk.get_distinct_id());}
  trackProductEvent(op+'_requested',properties,key);
  try {const response=await fetch(input,{...init,headers});
    if(atRevision!==revision||!mayCapture())return response;
    try {const body=await response.clone().json() as {id?:string;status?:string;authenticated?:boolean;sourceKind?:string;durationSeconds?:number;aspectRatio?:string;errorCode?:string;error?:{code?:string};received?:boolean};
      const failed=!response.ok||body.status==='failed'||op==='partner_application'&&body.received!==true,name=failed?(op==='generation'?'generation_request_failed':op+'_failed'):
        ({generation:'generation_accepted',manual_listing:'manual_listing_saved',editor_export:'editor_export_accepted',checkout:'checkout_opened',partner_application:'partner_application_received'}[op]??op+'_completed');
      const socialLogin=path==='/api/auth/sign-in/social';
      if(socialLogin&&!failed)try{sessionStorage.setItem('bienvu:analytics-login',JSON.stringify({method:'google',at:Date.now()}));}catch{}
      trackProductEvent(socialLogin&&!failed?'login_redirected':name,{...properties,source_kind:body.sourceKind,duration_seconds:body.durationSeconds,aspect_ratio:body.aspectRatio,
        ...(op==='login'?{method:socialLogin?'google':'email'}:{}),elapsed_ms:performance.now()-started,status:body.status,error_code:failed?body.error?.code??body.errorCode??'REQUEST_FAILED':undefined,
        ...(op==='signup'?{verification_required:body.authenticated!==true}:{})},body.id??key);
    }catch{/* A response format change must not change the action's result. */}return response;
  }catch(error){if(atRevision===revision)trackProductEvent(op==='generation'?'generation_request_failed':op+'_failed',{error_code:'NETWORK_ERROR'},key);throw error;}
}
