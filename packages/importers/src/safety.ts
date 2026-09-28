import ipaddr from 'ipaddr.js';
import {ImportFailure} from '@bienvu/contracts';
export function isPublicIp(value:string) {
  try {const address=ipaddr.process(value);return address.range()==='unicast';}catch{return false;}
}
export function safeUrl(value:string,hosts:readonly string[]):URL {
  let url:URL;try{url=new URL(value);}catch{throw new ImportFailure('INVALID_URL','URL invalide.');}
  const host=url.hostname.replace(/^\[|\]$/g,'');
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hostname.endsWith('.')||ipaddr.isValid(host)||!hosts.includes(url.hostname)) throw new ImportFailure('UNSAFE_URL','Hôte ou protocole non autorisé pour cette sonde.');
  return url;
}
export async function checkPublicDns(host:string,fetcher:typeof fetch=fetch) {
  const results=await Promise.all(['A','AAAA'].map(async type=>{
    const res=await fetcher(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,{headers:{accept:'application/dns-json'},signal:AbortSignal.timeout(5000)});
    if(!res.ok) throw new ImportFailure('UNSAFE_URL','Résolution DNS non vérifiable.');
    const payload=await res.json() as {Status?:number;Answer?:Array<{type:number;data:string}>};
    if(payload.Status!==0) throw new ImportFailure('UNSAFE_URL','Résolution DNS en échec.');
    return (payload.Answer??[]).filter(x=>x.type===1||x.type===28).map(x=>x.data);
  }));
  const addresses=results.flat();
  if(!addresses.length||!addresses.every(isPublicIp)) throw new ImportFailure('UNSAFE_URL','Destination DNS privée ou réservée.');
}
export async function readLimited(response:Pick<Response, 'headers' | 'body'>,maximum:number):Promise<Uint8Array<ArrayBuffer>> {
  if(Number(response.headers.get('content-length'))>maximum) {await response.body?.cancel();throw new Error('MEDIA_TOO_LARGE');}
  const reader=response.body?.getReader();if(!reader) return new Uint8Array();
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>maximum)throw new Error('MEDIA_TOO_LARGE');chunks.push(item.value);}}
  finally{await reader.cancel();reader.releaseLock();}
  const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}
