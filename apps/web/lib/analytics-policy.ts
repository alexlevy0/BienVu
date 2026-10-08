import {publicSeoPaths} from './seo-paths';

export const ANALYTICS_CONSENT_KEY='bienvu:privacy:v2';
export const CONSENT_DURATION_MS=180*24*60*60*1000;
export type AnalyticsConsent={version:2;analytics:boolean;replay:boolean;at:number};
export type AnalyticsConfig={enabled:boolean;token:string;host:string};
export type AnalyticsProperties=Record<string,string|number|boolean|undefined>;
const privateParameters=new Set(['token','code','state','grant','socialError','socialConnected','session_id','checkout','homePreview','facebookPage']);
const studioPaths=new Set(['/connexion','/agence','/biens','/historique','/editeur','/projets','/publications','/equipe']);

// Public article slugs are retained; private property/project IDs never leave the browser.
export function analyticsPath(value:string):string|null {
  try {const url=new URL(value,'https://bienvu.online');
    if([...url.searchParams.keys()].some(key=>privateParameters.has(key))||/token=|code=/i.test(url.hash))return null;
    const path=url.pathname.replace(/\/$/,'')||'/';
    if(publicSeoPaths.includes(path)||studioPaths.has(path))return path;
    if(/^\/(biens|historique|explorer)\/[^/]+$/.test(path))return '/'+path.split('/')[1]+'/[id]';
    return null;
  }catch{return null;}
}
export function replayAllowed(value:string):boolean {
  return analyticsPath(value)!==null;
}
export function readAnalyticsConsent(raw:string|null,now=Date.now()):AnalyticsConsent|null {
  try {const c=JSON.parse(raw??'null') as AnalyticsConsent|null;
    if(!c||c.version!==2||typeof c.analytics!=='boolean'||typeof c.replay!=='boolean'||!Number.isFinite(c.at)||c.at>now||now-c.at>=CONSENT_DURATION_MS||c.replay&&!c.analytics)return null;
    return {version:2,analytics:c.analytics,replay:c.replay,at:c.at};
  }catch{return null;}
}
export function analyticsConfiguration(env:{POSTHOG_ENABLED?:string;POSTHOG_PROJECT_TOKEN?:string;POSTHOG_HOST?:string}):AnalyticsConfig {
  const token=env.POSTHOG_PROJECT_TOKEN??'',host=env.POSTHOG_HOST??'https://eu.i.posthog.com';
  return {enabled:env.POSTHOG_ENABLED==='true'&&/^phc_[A-Za-z0-9_-]{20,150}$/.test(token)&&host==='https://eu.i.posthog.com',token,host};
}

const enums:Record<string,readonly string[]>={
  source_kind:['url','manual','description','editor','demo','empty'],
  mode:['now','later'],method:['email','google'],account_type:['anonymous','authenticated'],
  aspect_ratio:['9:16','16:9'],platform:['instagram','facebook','both'],
  tab:['photos','style','voice','map','text','audio'],status:['ready','needs_input','failed','queued','scheduled','processing','published','partial','cancelled'],
  action:['photo_added','photo_removed','photo_reordered','animation_toggled','text_changed','music_added','music_removed','music_trimmed','clip_duration_changed','undo','redo','preview','new_project','format_changed','voice_changed','subtitles_changed','map_changed'],
  metric:['CLS','INP','LCP'],quality:['good','needs-improvement','poor'],
  control_area:['navigation','composer','customizer','editor_media','editor_timeline','editor_preview','agency','properties','publications','partners','offers','page'],
  control_type:['link','button','input','select','textarea'],
};
const counts=new Set(['photo_count','animation_count','duration_seconds','credit_cost','destination_count','elapsed_ms','metric_value']);
const flags=new Set(['voice_enabled','subtitles_enabled','map_enabled','verification_required','is_test','is_internal']);
export const analyticsEvents=new Set(['import_requested','import_completed','import_failed','description_requested','description_completed','description_failed',
  'manual_form_opened','manual_listing_saved','manual_listing_failed','generation_requested','generation_accepted','generation_request_failed','generation_ready','generation_failed',
  'editor_project_selected','editor_opened','editor_action','editor_export_requested','editor_export_accepted','editor_export_failed',
  'signup_requested','signup_completed','signup_failed','login_requested','login_redirected','login_completed','login_failed','logout_completed',
  'agency_saved','agency_save_failed','social_connection_requested','social_connection_completed','social_connection_removed',
  'publication_requested','publication_created','publication_failed','publication_completed',
  'checkout_requested','checkout_opened','checkout_failed','partner_application_started','partner_application_requested','partner_application_received','partner_application_failed',
  'video_played','video_download_clicked','share_clicked','navigation_clicked','control_interacted','preferences_updated','web_vital']);
export function safeAnalyticsProperties(input:Record<string,unknown>):AnalyticsProperties {
  const result:AnalyticsProperties={};
  for(const [key,value] of Object.entries(input)){
    if(enums[key]?.includes(value as string))result[key]=value as string;
    else if(counts.has(key)&&typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=3_600_000)result[key]=Math.round(value*1000)/1000;
    else if(flags.has(key)&&typeof value==='boolean')result[key]=value;
    else if(key==='page'||key==='destination'){const path=typeof value==='string'?analyticsPath(value):null;if(path)result[key]=path;}
    else if(key==='error_code'&&typeof value==='string'&&/^[A-Z][A-Z0-9_]{1,60}$/.test(value))result[key]=value;
    else if(key==='source_domain'&&typeof value==='string'&&/^[a-z0-9-]+(?:\.[a-z0-9-]+){1,6}$/.test(value)&&value.length<=200)result[key]=value;
  }return result;
}
export function analyticsUrl(value:string):string {
  const path=analyticsPath(value);return path?'https://bienvu.online'+path:'';
}
// Replay keeps the real interface. Only credentials are removed from resource/link URLs.
export function replayUrl(value:string):string {
  if(/^data:image\/(?:png|jpeg|webp|gif|svg\+xml)[;,]/i.test(value)||value.startsWith('blob:'))return value;
  try{const origin=typeof window==='undefined'?'https://bienvu.online':window.location.origin,url=new URL(value,origin);
    if(['mailto:','tel:'].includes(url.protocol))return value;
    if(!['http:','https:'].includes(url.protocol))return value.startsWith('#')?value:'';
    url.username='';url.password='';
    for(const key of [...url.searchParams.keys()])if(/^(?:access_token|refresh_token|id_token|token|code|state|grant|password|secret|authorization|turnstileToken|signature)$/i.test(key))url.searchParams.delete(key);
    if(/token=|code=|secret=/i.test(url.hash))url.hash='';
    return url.href;
  }catch{return '';}
}
export function replayAttribute(name:string,value:string,element?:Element):string {
  if(/password|secret|csrf|authorization|access.token|refresh.token/i.test(name))return '';
  if(name==='value'&&element?.matches('input[type="password"],input[autocomplete="one-time-code"],.ph-mask'))return '[masqué]';
  if(['href','src','poster','xlink:href'].includes(name))return replayUrl(value);
  return value;
}
