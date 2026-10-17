import {GenerationView,type PropertyDetail,type PropertySummary} from '@bienvu/contracts';
import {propertyRequest} from './property-client';

export type PropertyPage={properties:PropertySummary[];total:number;nextCursor:string|null};
type Entry<T>={at:number;value:T};
const lifetime=30_000,details=new Map<string,Entry<PropertyDetail>>(),summaries=new Map<string,Entry<PropertySummary>>(),pages=new Map<string,Entry<PropertyPage>>(),requests=new Map<string,Promise<PropertyDetail>>();
let epoch=0;
const key=(owner:string,id:string)=>JSON.stringify([owner,id]);
function read<T>(cache:Map<string,Entry<T>>,id:string){const entry=cache.get(id);if(entry&&Date.now()-entry.at<lifetime)return entry.value;cache.delete(id);return null;}
function put<T>(cache:Map<string,Entry<T>>,id:string,value:T,limit:number){cache.delete(id);cache.set(id,{at:Date.now(),value});while(cache.size>limit)cache.delete(cache.keys().next().value!);}
/** Short-lived, account-scoped RAM only. Every destination still revalidates. */
export function cachedProperty(owner:string,id:string){return read(details,key(owner,id));}
export function cachedPropertySummary(owner:string,id:string){return cachedProperty(owner,id)?.property??read(summaries,key(owner,id));}
/** The clicked card can render its destination header before the detail request resolves. */
export function rememberPropertySummary(owner:string,property:PropertySummary){put(summaries,key(owner,property.id),property,12);}
export function cachedPropertyPage(owner:string,query:string){return read(pages,key(owner,query));}
export function rememberPropertyPage(owner:string,query:string,page:PropertyPage){put(pages,key(owner,query),page,3);}
export function forgetProperty(owner:string,id:string){details.delete(key(owner,id));summaries.delete(key(owner,id));}
export function clearPropertyNavigation(){epoch++;details.clear();summaries.clear();pages.clear();requests.clear();}
export function prepareProperty(owner:string,id:string):Promise<PropertyDetail>{
 const idKey=key(owner,id),ready=cachedProperty(owner,id);if(ready)return Promise.resolve(ready);
 const pending=requests.get(idKey);if(pending)return pending;
 const version=epoch,request=propertyRequest<PropertyDetail>(`/api/properties/${encodeURIComponent(id)}`,{signal:AbortSignal.timeout(5000)}).then(detail=>{
  const value={...detail,jobs:detail.jobs.map(job=>GenerationView.parse(job))};
  if(version===epoch)put(details,idKey,value,12);return value;
 }).finally(()=>{if(requests.get(idKey)===request)requests.delete(idKey);});
 requests.set(idKey,request);return request;
}
