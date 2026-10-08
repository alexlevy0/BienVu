import {SocialConnection,SocialPublication} from '@bienvu/contracts';
import {trackProductEvent} from './product-analytics';
export async function socialRequest(path:string,options:RequestInit={}){
  const response=await fetch(path,{cache:'no-store',...options});
  const value=await response.json() as Record<string,unknown>&{error?:{message?:string}};
  if(!response.ok)throw new Error(value.error?.message??'Impossible de charger les publications. Réessayez.');
  if(options.method==='POST'&&path==='/api/social/oauth/start')trackProductEvent('social_connection_requested');
  if(options.method==='POST'&&path==='/api/social/connections')trackProductEvent('social_connection_completed');
  if(options.method==='DELETE'&&path.startsWith('/api/social/connections/'))trackProductEvent('social_connection_removed');
  return value;
}
export const socialJson=(body:unknown)=>({headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export function socialFacebookPageId(value:string){
  const text=value.trim();if(/^\d{1,40}$/.test(text))return text;
  if(text.length>2048)return null;
  try{const url=new URL(text);
    if(url.protocol!=='https:'||url.port||url.username||url.password||!['www.facebook.com','facebook.com','m.facebook.com'].includes(url.hostname))return null;
    const id=url.pathname==='/profile.php'?url.searchParams.get('id'):url.pathname.replace(/^\/|\/$/g,'');
    return id&&/^\d{1,40}$/.test(id)?id:null;
  }catch{return null;}
}
export function socialConnectionsData(value:Record<string,unknown>){return (value.connections as unknown[]).map(c=>SocialConnection.parse(c));}
export function socialPublicationsData(value:Record<string,unknown>){return (value.publications as unknown[]).map(p=>SocialPublication.parse(p));}
export function socialLocalDate(date:Date){const two=(n:number)=>String(n).padStart(2,'0');
  return `${date.getFullYear()}-${two(date.getMonth()+1)}-${two(date.getDate())}T${two(date.getHours())}:${two(date.getMinutes())}`;
}
export const socialTimezone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Paris';
