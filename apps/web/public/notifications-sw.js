/* Notifications only: no fetch handler, application cache or offline interception. */
const notificationDatabase='bienvu-browser-notifications-v1';
const validJob=id=>typeof id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id);
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));

function claimNotification(id){
  // The transaction serializes simultaneous deliveries, including multiple tabs.
  return new Promise(resolve=>{
    const request=indexedDB.open(notificationDatabase,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('shown',{keyPath:'id'});
    request.onerror=()=>resolve(true);
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('shown','readwrite'),store=tx.objectStore('shown');let fresh=false;
      const read=store.get(id);read.onsuccess=()=>{if(!read.result){fresh=true;store.put({id,at:Date.now()});}
        const cursor=store.openCursor();cursor.onsuccess=()=>{const row=cursor.result;if(!row)return;if(row.value.at<Date.now()-7*86400000)row.delete();row.continue();};};
      tx.oncomplete=()=>{db.close();resolve(fresh);};tx.onerror=()=>{db.close();resolve(true);};tx.onabort=()=>{db.close();resolve(true);};
    };
  });
}
self.addEventListener('push',event=>event.waitUntil((async()=>{
  let data;try{data=event.data?.json();}catch{return;}
  if(data?.type==='admin-alert'){
    if(!validJob(data.id)||typeof data.title!=='string'||typeof data.body!=='string'||typeof data.href!=='string'||!/^\/admin(?:\?|\/|$)/.test(data.href)||data.href.includes('\\'))return;
    const tag=`bienvu-admin-${data.id}`;if(!await claimNotification(tag))return;
    await self.registration.showNotification('BienVu · '+data.title.slice(0,100),{body:data.body.slice(0,300),icon:'/notifications/icon-192.png',badge:'/notifications/badge-72.png',tag,renotify:false,data:{adminHref:data.href}});return;
  }
  if(data?.type!=='generation-ready'||!validJob(data.jobId))return;
  const tag=`bienvu-video-${data.jobId}`;
  if(!await claimNotification(tag))return;
  await self.registration.showNotification('Votre vidéo est prête 🎬',{
    body:'Votre création BienVu vous attend. Cliquez pour découvrir le résultat.',
    icon:'/notifications/icon-192.png',badge:'/notifications/badge-72.png',tag,renotify:false,
    data:{jobId:data.jobId},
  });
})()));
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const id=event.notification.data?.jobId,href=event.notification.data?.adminHref;
    const path=typeof href==='string'&&/^\/admin(?:\?|\/|$)/.test(href)&&!href.includes('\\')?href:validJob(id)?`/historique/${id}`:'/';
    const url=new URL(path,self.location.origin).href;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(client=>client.url===url);
    if(existing){await existing.focus();return;}
    await self.clients.openWindow(url);
  })());
});
