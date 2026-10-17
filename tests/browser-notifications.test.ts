import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {createECDH,hkdfSync,createDecipheriv} from 'node:crypto';
import {createRequire} from 'node:module';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {admitGeneration,createAnonymousSession,admitAnonymous,disablePushDevice,savePushDevice,watchPushGeneration,pendingPushDeliveries,cleanupPushDevices,type PushPrincipal} from '../packages/db/src/index';
import {browserPushConfigured,sendGenerationNotifications,validPushEndpoint,validatePushSubscription} from '../packages/notifications/src/index';
import {browserNotificationAction} from '../apps/web/lib/browser-notifications';
import {respond} from '../apps/web/lib/http';
import {watchAcceptedBrowserGeneration,browserPushCookie} from '../apps/web/lib/browser-push-cookie';

const b64=(bytes:Uint8Array|ArrayBuffer)=>Buffer.from(bytes instanceof ArrayBuffer?new Uint8Array(bytes):bytes).toString('base64url');
async function keys(){const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),jwk=await crypto.subtle.exportKey('jwk',pair.privateKey);
  return {publicKey:b64(await crypto.subtle.exportKey('raw',pair.publicKey)),privateKey:jwk.d!,pair};}
function subscriber(suffix='fixture'){
  const ecdh=createECDH('prime256v1');ecdh.generateKeys();const auth=crypto.getRandomValues(new Uint8Array(16));
  return {ecdh,auth,subscription:{endpoint:`https://fcm.googleapis.com/fcm/send/${suffix}`,expirationTime:null,keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:b64(auth)}}};
}
async function setup(t:TestContext,script='export default {fetch(){return new Response("fixture")}}'){
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script,compatibilityDate:'2026-09-27',d1Databases:['DB']}));t.after(()=>mf.dispose());
  const db=await mf.getD1Database('DB');await migrateNarrationProbe(db);await db.exec('UPDATE generation_control SET enabled=1; UPDATE trial_policy SET enabled=1,free_enabled=1');
  await db.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9000,0)').bind(new Date().toISOString().slice(0,7)).run();
  for(const label of ['push-a','push-b']){const seed=await seedNarrationFixture(db,label,true);await db.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE' WHERE id=?").bind(seed.jobId).run();
    await db.prepare("UPDATE allocations SET kind='paid',quota_limit=50 WHERE agency_id=?").bind(seed.agencyId).run();await db.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(seed.agencyId,`allocation-${label}`).run();}
  const a=await admitGeneration(db,'s05-push-a','notifications-job-first',{listingId:'listing-push-a'},'true'),b=await admitGeneration(db,'s05-push-b','notifications-job-second',{listingId:'listing-push-b'},'true');
  const vapid=await keys(),env={DB:db,WEB_PUSH_ENABLED:'true',WEB_PUSH_PUBLIC_KEY:vapid.publicKey,WEB_PUSH_PRIVATE_KEY:vapid.privateKey,WEB_PUSH_SUBJECT:'mailto:contact@bienvu.online',
    BETTER_AUTH_URL:'https://bienvu.online',BETTER_AUTH_SECRET:'s'.repeat(32),PROBE_MODE:'local',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:''};
  const finish=async(id:string)=>{const at=new Date().toISOString();await db.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)').bind(id,'fixture-'+id,'{}',at).run();
    await db.prepare("UPDATE jobs SET status='ready',lease_until=NULL,updated_at=? WHERE id=?").bind(at,id).run();};
  return {mf,db,a,b,env,vapid,finish,principal:{kind:'user',id:'owner-push-a'} as PushPrincipal};
}
test('Web Push : configuration, clés EC réelles et refus des endpoints SSRF ou redirections',async()=>{
  const s=subscriber();assert.ok(await validatePushSubscription(s.subscription));
  for(const endpoint of ['http://fcm.googleapis.com/fcm/send/a','https://127.0.0.1/','https://localhost/','https://fcm.googleapis.com.attacker.example/fcm/send/a','https://user@fcm.googleapis.com/fcm/send/a','https://fcm.googleapis.com:8443/fcm/send/a','https://fcm.googleapis.com/fcm/send/a#secret','https://example.com/push'])assert.equal(validPushEndpoint(endpoint),false,endpoint);
  for(const endpoint of ['https://web.push.apple.com/QABC','https://updates.push.services.mozilla.com/wpush/v2/ABC','https://wns2.notify.windows.com/?token=abc'])assert.equal(validPushEndpoint(endpoint),true);
  assert.equal(await validatePushSubscription({...s.subscription,keys:{...s.subscription.keys,p256dh:'B'+'a'.repeat(86)}}),null);
  assert.equal(await validatePushSubscription({...s.subscription,expirationTime:1}),null);
  assert.equal(browserPushConfigured({DB:{} as D1Database,WEB_PUSH_ENABLED:'true'}),false);
});
test('Web Push D1 : isolation utilisateurs, essais, capacité de révocation et ancien historique silencieux',async t=>{
  const s=await setup(t),device=subscriber(),token='a'.repeat(43),otherToken='b'.repeat(43);
  await savePushDevice(s.db,s.principal,token,device.subscription);
  assert.equal(await savePushDevice(s.db,{kind:'user',id:'owner-push-b'},otherToken,device.subscription),null,'Un endpoint ne peut pas être détourné sans son secret de navigateur');
  assert.equal(await watchPushGeneration(s.db,s.principal,token,s.b.jobId),false);assert.equal(await watchPushGeneration(s.db,{kind:'user',id:'owner-push-b'},token,s.a.jobId),false);
  assert.ok(await watchPushGeneration(s.db,s.principal,token,s.a.jobId));await s.finish(s.a.jobId);assert.equal((await pendingPushDeliveries(s.db)).length,1);
  await savePushDevice(s.db,{kind:'user',id:'owner-push-b'},token,device.subscription);assert.equal((await pendingPushDeliveries(s.db)).length,0,'Un changement de compte retire les anciens suivis');
  const trial=await createAnonymousSession(s.db),guest={kind:'trial',id:trial.session.id} as const;
  const input={url:'https://agence.example/annonce/123'};
  const job=await admitAnonymous(s.db,trial.session,'notifications-trial-first',input,{ipHmac:'a'.repeat(64),turnstileHash:'c'.repeat(64)},'true');
  const trialDevice=subscriber('guest');await savePushDevice(s.db,guest,otherToken,trialDevice.subscription);
  assert.ok(await watchPushGeneration(s.db,guest,otherToken,job.jobId));assert.equal(await watchPushGeneration(s.db,guest,otherToken,s.b.jobId),false);
  await s.db.prepare('UPDATE generation_runs SET owner_agency_id=? WHERE job_id=?').bind(s.b.agencyId,job.jobId).run();
  await s.db.prepare('DELETE FROM browser_push_deliveries WHERE job_id=?').bind(job.jobId).run();assert.equal(await watchPushGeneration(s.db,guest,otherToken,job.jobId),false,'Un essai réclamé n’appartient plus à la session anonyme');
  await savePushDevice(s.db,s.principal,token,device.subscription);assert.equal(await watchPushGeneration(s.db,s.principal,token,s.a.jobId,Date.now()+601_000),false,'Pas de notification tardive sur une vidéo terminée depuis longtemps');
  await disablePushDevice(s.db,otherToken);assert.equal(await watchPushGeneration(s.db,guest,otherToken,job.jobId),false);
});
test('Web Push : livraison chiffrée RFC 8291, JWT VAPID vérifiable, reprise serveur et dédoublonnage concurrent',async t=>{
  const s=await setup(t),device=subscriber(),token='a'.repeat(43);let now=Date.now();await savePushDevice(s.db,s.principal,token,device.subscription,now);
  const request=new Request('https://bienvu.online/api/generations',{headers:{Cookie:browserPushCookie(new Request('https://bienvu.online'),token).split(';')[0]}});
  await watchAcceptedBrowserGeneration(s.env,request,s.a.jobId,s.principal);now=Date.now();let calls=0;
  const send:typeof fetch=async(_url,init)=>{
    calls++;assert.equal(init?.redirect,'manual');const headers=new Headers(init?.headers);assert.equal(headers.get('content-encoding'),'aes128gcm');
    const auth=headers.get('authorization')!,match=/^vapid t=([^,]+),\s*k=([\w-]+)$/.exec(auth);assert.ok(match);assert.equal(match[2],s.vapid.publicKey);
    const [head,body,signature]=match[1].split('.');assert.equal(JSON.parse(Buffer.from(body,'base64url').toString()).aud,'https://fcm.googleapis.com');
    assert.ok(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},s.vapid.pair.publicKey,Buffer.from(signature,'base64url'),new TextEncoder().encode(head+'.'+body)));
    const bytes=Buffer.from(init!.body as Uint8Array);assert.equal(bytes.length,4096);const salt=bytes.subarray(0,16),serverKey=bytes.subarray(21,86),shared=device.ecdh.computeSecret(serverKey);
    const ikm=hkdfSync('sha256',shared,device.auth,Buffer.concat([Buffer.from('WebPush: info\0'),device.ecdh.getPublicKey(),serverKey]),32);
    const key=hkdfSync('sha256',Buffer.from(ikm),salt,Buffer.from('Content-Encoding: aes128gcm\0'),16),nonce=hkdfSync('sha256',Buffer.from(ikm),salt,Buffer.from('Content-Encoding: nonce\0'),12),ciphertext=bytes.subarray(86),decipher=createDecipheriv('aes-128-gcm',Buffer.from(key),Buffer.from(nonce));
    decipher.setAuthTag(ciphertext.subarray(-16));const plain=Buffer.concat([decipher.update(ciphertext.subarray(0,-16)),decipher.final()]);let end=plain.length-1;while(plain[end]===0)end--;assert.equal(plain[end],2);
    const payload=JSON.parse(plain.subarray(0,end).toString());assert.equal(payload.jobId,s.a.jobId);assert.equal(payload.url,'/historique/'+s.a.jobId);assert.equal(payload.type,'generation-ready');assert.ok(!JSON.stringify(payload).includes('owner-push'));
    return new Response(null,{status:calls===1?503:201});
  };
  await sendGenerationNotifications(s.env,undefined,now,send);assert.equal(calls,0,'Aucun push avant validation de la vidéo');await s.finish(s.a.jobId);
  await Promise.all([1,2,3].map(()=>sendGenerationNotifications(s.env,undefined,now,send)));assert.equal(calls,1);
  await sendGenerationNotifications(s.env,undefined,now+14_000,send);assert.equal(calls,1);
  await sendGenerationNotifications(s.env,undefined,now+16_000,send);assert.equal(calls,2);
  await watchPushGeneration(s.db,s.principal,token,s.a.jobId,now+17_000);await sendGenerationNotifications(s.env,undefined,now+18_000,send);assert.equal(calls,2,'Ni replay de workflow ni nouvel onglet ne renvoie la même notification');
  await cleanupPushDevices(s.db,now+91*86400_000);assert.equal((await s.db.prepare('SELECT count(*) n FROM browser_push_devices').first<{n:number}>())!.n,0);
});
test('Web Push API : origine obligatoire, JSON borné, identité serveur et désactivation par capacité seule',async t=>{
  const s=await setup(t),device=subscriber(),token='a'.repeat(43),body={action:'subscribe',token,subscription:device.subscription,jobs:[s.a.jobId]};
  const req=(data:unknown,origin='https://bienvu.online',method='POST')=>new Request('https://bienvu.online/api/notifications',{method,headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)});
  let identities=0;const principal=async()=>{identities++;return s.principal;};
  assert.equal((await respond(()=>browserNotificationAction(req(body,'https://attacker.example'),s.env,principal))).status,403);assert.equal(identities,0);
  assert.equal((await respond(()=>browserNotificationAction(req({...body,token:'short'}),s.env,principal))).status,422);
  const subscribed=await respond(()=>browserNotificationAction(req(body),s.env,principal));assert.equal(subscribed.status,202);assert.equal(identities,1);assert.match(subscribed.headers.get('Set-Cookie')!,/__Host-bienvu-push=.*HttpOnly.*SameSite=Lax.*Secure/);
  assert.equal((await respond(()=>browserNotificationAction(req({token},'https://bienvu.online','DELETE'),s.env,async()=>{throw Error('MUST_NOT_AUTHENTICATE_DISABLE');}))).status,200);
  await s.finish(s.a.jobId);assert.equal((await pendingPushDeliveries(s.db)).length,0);
});
test('Web Push : membre révoqué et abonnement expiré ne reçoivent plus de notification',async t=>{
  const s=await setup(t),at=new Date().toISOString(),member={kind:'user',id:'push-collaborator'} as const,token='c'.repeat(43),device=subscriber('expired');
  await s.db.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind(member.id,'Fixture','collaborator@example.com',at,at).run();
  await s.db.prepare("INSERT INTO agency_members VALUES(?,?,'editor',?)").bind(s.a.agencyId,member.id,at).run();
  await savePushDevice(s.db,member,token,device.subscription);assert.ok(await watchPushGeneration(s.db,member,token,s.a.jobId));
  await s.db.prepare('DELETE FROM agency_members WHERE agency_id=? AND user_id=?').bind(s.a.agencyId,member.id).run();await s.finish(s.a.jobId);
  let calls=0;const gone:typeof fetch=async()=>{calls++;return new Response(null,{status:410});};await sendGenerationNotifications(s.env,undefined,Date.now(),gone);assert.equal(calls,0);
  await savePushDevice(s.db,s.principal,token,device.subscription);assert.ok(await watchPushGeneration(s.db,s.principal,token,s.a.jobId));
  await sendGenerationNotifications(s.env,undefined,Date.now(),gone);assert.equal(calls,1);assert.equal((await s.db.prepare('SELECT enabled FROM browser_push_devices').first<{enabled:number}>())!.enabled,0);
  await sendGenerationNotifications(s.env,undefined,Date.now()+120000,gone);assert.equal(calls,1);
});
test('Web Push : envoi complet dans workerd, requête native valide et refus des redirections',async t=>{
  const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('tsx/package.json'))('esbuild'),source=new URL('../packages/notifications/src/index.ts',import.meta.url).pathname;
  const result=await build({stdin:{contents:`import{sendGenerationNotifications}from${JSON.stringify(source)};
    export default{async fetch(request,bindings){
      const{vapid,jobId,status}=await request.json(),outgoing=[];
      await sendGenerationNotifications({DB:bindings.DB,WEB_PUSH_ENABLED:'true',WEB_PUSH_PUBLIC_KEY:vapid.publicKey,WEB_PUSH_PRIVATE_KEY:vapid.privateKey,WEB_PUSH_SUBJECT:'mailto:contact@bienvu.online'},jobId,Date.now(),async(url,init)=>{
        // Native Request validates the production sender's options in workerd before any external dispatch.
        const push=new Request(url,init);
        outgoing.push({method:push.method,redirect:push.redirect,length:(await push.arrayBuffer()).byteLength,encoding:push.headers.get('content-encoding'),signed:push.headers.get('authorization')?.startsWith('vapid t=')});
        return new Response(null,{status,headers:status===307?{Location:'https://attacker.example/collect'}:{}});
      });
      const delivery=await bindings.DB.prepare('SELECT status,attempts,sent_at FROM browser_push_deliveries WHERE job_id=?').bind(jobId).first();
      return Response.json({outgoing,delivery});
    }}`,resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'esm',target:'es2022'});
  const s=await setup(t,new TextDecoder().decode(result.outputFiles[0].contents)),token='a'.repeat(43);
  await savePushDevice(s.db,s.principal,token,subscriber().subscription);
  await watchPushGeneration(s.db,s.principal,token,s.a.jobId);await s.finish(s.a.jobId);
  const dispatch=async(status:number)=>{
    const response=await s.mf.dispatchFetch('http://fixture.test/',{method:'POST',body:JSON.stringify({jobId:s.a.jobId,status,vapid:{publicKey:s.vapid.publicKey,privateKey:s.vapid.privateKey}})});
    assert.equal(response.status,200);
    return await response.json() as {outgoing:Array<{method:string;redirect:string;length:number;encoding:string;signed:boolean}>;delivery:{status:string;attempts:number;sent_at:string|null}};
  };
  const sent=await dispatch(201);
  assert.deepEqual(sent.outgoing,[{method:'POST',redirect:'manual',length:4096,encoding:'aes128gcm',signed:true}]);
  assert.equal(sent.delivery.status,'sent');assert.equal(sent.delivery.attempts,1);assert.ok(sent.delivery.sent_at);
  assert.equal((await dispatch(201)).outgoing.length,0,'Une livraison réussie reste dédoublonnée dans workerd');
  await s.db.prepare("UPDATE browser_push_deliveries SET status='pending',attempts=0,sent_at=NULL,retry_at=created_at WHERE job_id=?").bind(s.a.jobId).run();
  const redirected=await dispatch(307);
  assert.equal(redirected.outgoing.length,1,'Aucune seconde requête vers la destination de redirection');
  assert.equal(redirected.delivery.status,'failed');assert.equal(redirected.delivery.attempts,1);assert.equal(redirected.delivery.sent_at,null);
});
