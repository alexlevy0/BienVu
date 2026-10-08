import {publicErrors,type PublicErrorCode} from '@bienvu/contracts';
import {trackProductEvent} from './product-analytics';
export async function propertyRequest<T=Record<string,unknown>>(url:string,options:RequestInit={}):Promise<T>{
  if(options.method==='POST'&&/^\/api\/generations\/[^/]+\/share$/.test(url))trackProductEvent('share_clicked');
  const response=await fetch(url,{cache:'no-store',...options}),value=await response.json();
  if(!response.ok){const failure=value as {error?:{code?:PublicErrorCode;message?:string}},code=failure.error?.code;
    throw new Error(code&&publicErrors[code]?publicErrors[code][1]:failure.error?.message??'Cette action n’a pas abouti. Réessayez.');}
  return value as T;
}
export function downloadBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);}
