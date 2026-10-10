export const TAWK_EMBED_URL='https://embed.tawk.to/6aca2b0398b9c934c10c477e/1k4irg1cl';

type TawkApi={
  autoStart?:boolean;
  customStyle?:{zIndex:number};
  onLoad?:()=>void;
  onStatusChange?:(status:string)=>void;
  start?:(options:{showWidget:boolean})=>void;
  shutdown?:()=>void;
  showWidget?:()=>void;
  hideWidget?:()=>void;
};
declare global {interface Window {Tawk_API?:TawkApi;Tawk_LoadStart?:Date;}}

let initialized=false,ready=false,running=false;

export function tawkChatAllowed(value:string):boolean {
  try {
    const url=new URL(value,'https://bienvu.online');
    if(/^\/(admin|api|validation)(\/|$)/.test(url.pathname))return false;
    if([...url.searchParams.keys()].some(key=>/token|code|state|grant|session_id|checkout|homePreview/i.test(key)))return false;
    return !/token=|code=|grant=/i.test(url.hash);
  }catch{return false;}
}

export function prepareTawkChat(){
  if(typeof window==='undefined'||initialized)return;
  initialized=true;
  const api=window.Tawk_API??={};
  // A deferred script can finish after navigation to a private page.
  // Only start the connection when the current destination permits chat.
  api.autoStart=false;
  api.customStyle={zIndex:40};
  // With autoStart disabled, Tawk reports availability before onLoad.
  // That first status supplies the API needed to start the widget explicitly.
  api.onStatusChange=()=>{if(!ready){ready=true;resumeTawkChat();}};
  api.onLoad=()=>{ready=true;resumeTawkChat();};
  window.Tawk_LoadStart=new Date();
}

export function resumeTawkChat(){
  if(typeof window==='undefined'||!ready)return;
  if(!tawkChatAllowed(window.location.href)){suspendTawkChat();return;}
  try {
    if(!running){window.Tawk_API?.start?.({showWidget:true});running=true;}
    else window.Tawk_API?.showWidget?.();
  }catch{/* Support must not interrupt the studio. */}
}

export function suspendTawkChat(){
  if(typeof window==='undefined'||!ready)return;
  try{window.Tawk_API?.hideWidget?.();window.Tawk_API?.shutdown?.();}catch{/* Third-party availability is independent of navigation. */}
  running=false;
}

export function tawkNavigationStart(destination:string){
  if(!tawkChatAllowed(destination))suspendTawkChat();
}
