import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {announceGenerationStarted,browserNotificationEvent,consumeNotificationLaunch,pendingNotificationJobs,saveBrowserSubscription,notificationPreference} from '../apps/web/lib/browser-notification-client';

function browser(t:TestContext){
 const session=new Map<string,string>(),local=new Map<string,string>();
 const storage=(values:Map<string,string>)=>({getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}});
 const window=Object.assign(new EventTarget(),{location:{pathname:'/'}});
 for(const [key,value] of Object.entries({window,sessionStorage:storage(session),localStorage:storage(local)})){
  const old=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{value,configurable:true});
  t.after(()=>{if(old)Object.defineProperty(globalThis,key,old);else Reflect.deleteProperty(globalThis,key);});
 }
 consumeNotificationLaunch();
 return {session,local,window};
}
const job=(id:string)=>({id,status:'queued' as const});

test('Notifications : une file restaurée au rafraîchissement ne signifie pas une nouvelle génération',t=>{
 const b=browser(t);
 b.session.set('bienvu:push-pending:v1',JSON.stringify([{id:'previous-job',at:Date.now()-300_000}]));
 assert.deepEqual(pendingNotificationJobs(),['previous-job']);
 assert.equal(consumeNotificationLaunch(),null);
 assert.equal(consumeNotificationLaunch(),null,'Les reprises de chargement du compte restent silencieuses');
});

test('Notifications : un vrai lancement attend le listener, puis son invitation est consommée une fois',t=>{
 const b=browser(t);let events=0;b.window.addEventListener(browserNotificationEvent,()=>{events++;});
 announceGenerationStarted(job('fresh-job'));
 assert.equal(events,1);assert.equal(consumeNotificationLaunch(),'fresh-job');assert.equal(consumeNotificationLaunch(),null);
 assert.deepEqual(pendingNotificationJobs(),['fresh-job'],'Consommer l’invitation ne supprime pas le suivi à enregistrer');
 announceGenerationStarted({id:'completed-job',status:'ready'});announceGenerationStarted({id:'failed-job',status:'failed'});
 assert.equal(consumeNotificationLaunch(),null);assert.equal(events,1);
});

test('Notifications : transfert éditeur à usage unique, limité à sa page de résultat et à une minute',t=>{
 const b=browser(t);let events=0;b.window.addEventListener(browserNotificationEvent,()=>{events++;});
 announceGenerationStarted(job('editor-job'),{navigateToResult:true});
 assert.equal(events,0,'Aucune invitation juste avant de quitter l’éditeur');
 b.window.location.pathname='/historique/editor-job';assert.equal(consumeNotificationLaunch(),'editor-job');
 assert.equal(consumeNotificationLaunch(),null,'Un refresh du résultat ne rejoue pas l’invitation');
 announceGenerationStarted(job('other-job'),{navigateToResult:true});b.window.location.pathname='/';
 assert.equal(consumeNotificationLaunch(),null,'La homepage ne reprend jamais le transfert d’un export');
 b.window.location.pathname='/historique/other-job';assert.equal(consumeNotificationLaunch(),null);
 const now=Date.now();t.mock.method(Date,'now',()=>now);announceGenerationStarted(job('expired-job'),{navigateToResult:true});
 t.mock.method(Date,'now',()=>now+60_001);b.window.location.pathname='/historique/expired-job';assert.equal(consumeNotificationLaunch(),null);
});

test('Notifications : acquittement après succès, nouvelle génération concurrente conservée et échec réessayable',async t=>{
 browser(t);announceGenerationStarted(job('accepted-first'));consumeNotificationLaunch();
 let resolve!:(response:Response)=>void;const bodies:unknown[]=[];
 t.mock.method(globalThis,'fetch',async(_url:unknown,init?:RequestInit)=>{bodies.push(JSON.parse(init!.body as string));return new Promise<Response>(done=>{resolve=done;});});
 const subscription={toJSON:()=>({endpoint:'https://fcm.googleapis.com/fcm/send/fixture'})} as PushSubscription;
 const pending=saveBrowserSubscription(subscription);
 announceGenerationStarted(job('accepted-next'));consumeNotificationLaunch();resolve(new Response(null,{status:202}));await pending;
 assert.deepEqual((bodies[0] as {jobs:string[]}).jobs,['accepted-first']);assert.deepEqual(pendingNotificationJobs(),['accepted-next']);
 assert.equal(notificationPreference(),'enabled');
 const failed=saveBrowserSubscription(subscription);resolve(new Response(null,{status:503}));await assert.rejects(failed);
 assert.deepEqual(pendingNotificationJobs(),['accepted-next']);
 const retried=saveBrowserSubscription(subscription);resolve(new Response(null,{status:202}));await retried;
 assert.deepEqual(pendingNotificationJobs(),[]);
});
