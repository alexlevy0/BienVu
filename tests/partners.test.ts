import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {migrateNarrationProbe} from '../scripts/narration-fixtures';
import {PartnerApplication,partnerCommissionCents} from '../packages/contracts/src/partners';
import {submitPartnerApplication,partnerApplicationConfig,type PartnersEnv} from '../apps/web/lib/partners';
import {respond} from '../apps/web/lib/http';
import {adminMailboxRequest} from '../apps/web/lib/mailbox';
import {listMailThreads,mailThreadDetail,cleanupPartnerApplications} from '../packages/db/src/index';
import {verifyBot} from '../apps/web/lib/bot-verification';

test('Programme partenaires : calcul en centimes et candidature bornée',()=>{
  assert.equal(partnerCommissionCents(10,10000),15000);
  assert.equal(partnerCommissionCents(1,1900),285);
  assert.equal(partnerCommissionCents(1,4900),735);
  assert.equal(partnerCommissionCents(10,0),0);
  assert.equal(partnerCommissionCents(3,5011),2255);
  assert.equal(partnerCommissionCents(50,100000),750000);
  for(const [clients,spend] of [[0,10000],[1.5,10000],[51,10000],[2,-1],[2,100001],[2,NaN]])assert.throws(()=>partnerCommissionCents(clients,spend),/INVALID/);
  assert.equal(PartnerApplication.parse({name:' Alex ',email:' ALEX@example.com ',activity:'photographer'}).email,'alex@example.com');
  for(const data of [{name:'A'}, {name:'Alex\r\nBcc: victim@example.com'}, {email:'bad'}, {activity:'invented'}, {extra:true}])
    assert.equal(PartnerApplication.safeParse({name:'Alex',email:'alex@example.com',activity:'photographer',...data}).success,false);
});

test('Candidatures publiques : validation, boîte privée, atomicité, limites et répétitions',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-10-03',d1Databases:['DB'],r2Buckets:['MEDIA']}));
  t.after(()=>mf.dispose());const bindings=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(bindings.DB);
  let sent=0,verified=0;
  const env:PartnersEnv={...bindings,PROBE_MODE:'remote',BETTER_AUTH_URL:'https://bienvu.test',BETTER_AUTH_SECRET:'a'.repeat(32),GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',
    MAILBOX_ENABLED:'true',MAILBOX_ADDRESS:'contact@bienvu.online',SUPPORT_EMAIL:{async send(){sent++;return {messageId:'forbidden-test-email'};}},
    TURNSTILE_SITE_KEY:'fixture-public',TURNSTILE_SECRET_KEY:'fixture-private',TRIAL_IP_HMAC_SECRET:'b'.repeat(32)};
  const base={name:'Alex Martin',email:'alex@example.com',activity:'photographer',turnstileToken:'proof-1'};
  const request=(id=crypto.randomUUID(),body:unknown=base,ip='203.0.113.5',origin=env.BETTER_AUTH_URL)=>new Request(env.BETTER_AUTH_URL+'/api/partners/applications',{
    method:'POST',headers:{origin,'Content-Type':'application/json','Idempotency-Key':id,'cf-connecting-ip':ip},body:JSON.stringify(body)});
  const siteverify=(changes:Record<string,unknown>={})=>(async(url,init)=>{verified++;assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.ok(!String(init?.body).includes('alex@example'));assert.equal(JSON.parse(String(init?.body)).secret,'fixture-private');
    return Response.json({success:true,hostname:'bienvu.test',action:'partner_application',challenge_ts:new Date().toISOString(),...changes});}) as typeof fetch;
  const submit=(r:Request,customEnv=env,fetcher=siteverify(),trusted=true)=>respond(()=>submitPartnerApplication(r,customEnv,trusted,fetcher));
  const counts=async()=>{const result=await env.DB.prepare(`SELECT (SELECT count(*) FROM mailbox_threads) threads,(SELECT count(*) FROM mailbox_messages) messages,
    (SELECT count(*) FROM mailbox_events) events,(SELECT count(*) FROM partner_applications) applications`).first();return result;};
  await t.test('configuration publique sans secrets, validation et anti-robot fermés',async()=>{
    assert.deepEqual(await partnerApplicationConfig(env).json(),{enabled:true,siteKey:'fixture-public'});
    assert.deepEqual(await partnerApplicationConfig({...env,MAILBOX_ENABLED:'false'}).json(),{enabled:false,siteKey:null});
    assert.equal((await submit(request(),{...env,MAILBOX_ENABLED:'false'})).status,503);
    assert.equal((await submit(request(undefined,{...base,email:'invalid'}))).status,422);
    assert.equal((await submit(request(undefined,{...base,name:'x'.repeat(5000)}))).status,413);
    assert.equal((await submit(request(undefined,base,undefined,'https://attacker.test'))).status,403);
    assert.equal((await submit(request(),env,siteverify(),false)).status,503);
    for(const wrong of [{success:false},{hostname:'attacker.test'},{action:'anonymous_trial'},{challenge_ts:'bad'},
      {challenge_ts:new Date(Date.now()-301000).toISOString()}])assert.equal((await submit(request(),env,siteverify(wrong))).status,422);
    assert.deepEqual(await counts(),{threads:0,messages:0,events:0,applications:0});
  });
  const firstId=crypto.randomUUID();
  await t.test('réception sans compte, message privé complet et aucune notification sortante',async()=>{
    const response=await submit(request(firstId));assert.equal(response.status,201);assert.deepEqual(await response.json(),{received:true});
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.deepEqual(await counts(),{threads:1,messages:1,events:1,applications:1});
    const threads=await listMailThreads(env.DB,{q:'Candidature partenaire',folder:'inbox'});assert.equal(threads.items.length,1);
    const thread=threads.items[0];assert.equal(thread.unread,1);assert.equal(thread.peerEmail,base.email);
    const detail=(await mailThreadDetail(env.DB,thread.id))!;assert.equal(detail.messages[0].replyTo,base.email);
    assert.match(detail.messages[0].text,/Photographe immobilier/);assert.match(detail.messages[0].text,/non vérifiée/);assert.match(detail.messages[0].text,/manuellement/);
    assert.equal(detail.messages[0].delivery,'received');assert.equal(detail.messages[0].hasOriginal,false);
    assert.equal((await adminMailboxRequest(new Request(env.BETTER_AUTH_URL+'/api/admin/mailbox'),env)).status,401);
    assert.equal(sent,0);assert.equal((await env.DB.prepare('SELECT count(*) n FROM auth_user').first<{n:number}>())!.n,0);
  });
  await t.test('reprise après réponse perdue et conflit de contenu',async()=>{
    const before=verified,reply=await submit(request(firstId,{...base,turnstileToken:''}));assert.equal(reply.status,200);assert.equal(verified,before);
    assert.equal((await submit(request(firstId,{...base,name:'Autre nom',turnstileToken:''}))).status,409);
    assert.equal((await submit(request(undefined,{...base,email:'other@example.com'},'203.0.113.6'))).status,422,'Une preuve ne peut produire deux candidatures');
    assert.deepEqual(await counts(),{threads:1,messages:1,events:1,applications:1});
  });
  await t.test('envois simultanés, même intention = un seul message',async()=>{
    const id=crypto.randomUUID(),body={...base,email:'parallel@example.com',turnstileToken:'proof-parallel'};
    const replies=await Promise.all([submit(request(id,body,'203.0.113.10')),submit(request(id,body,'203.0.113.10'))]);
    assert.ok(replies.every(reply=>[200,201].includes(reply.status)));assert.deepEqual(await counts(),{threads:2,messages:2,events:2,applications:2});
    const conflictId=crypto.randomUUID();
    const conflicting=await Promise.all([submit(request(conflictId,{...base,email:'race@example.com',turnstileToken:'race-a'},'203.0.113.11')),
      submit(request(conflictId,{...base,email:'race2@example.com',turnstileToken:'race-b'},'203.0.113.11'))]);
    assert.deepEqual(conflicting.map(reply=>reply.status).sort(),[201,409]);assert.deepEqual(await counts(),{threads:3,messages:3,events:3,applications:3});
  });
  await t.test('limites IP et e-mail : aucun fil ou compteur orphelin après refus',async()=>{
    for(let i=0;i<3;i++)assert.equal((await submit(request(undefined,{...base,email:`limit-${i}@example.com`,turnstileToken:'limit-ip-'+i},'203.0.113.20'))).status,201);
    const before=await counts();assert.equal((await submit(request(undefined,{...base,email:'fourth@example.com',turnstileToken:'limit-ip-4'},'203.0.113.20'))).status,429);
    assert.deepEqual(await counts(),before);
    for(let i=0;i<3;i++)assert.equal((await submit(request(undefined,{...base,email:'limit-email@example.com',turnstileToken:'limit-email-'+i},`203.0.113.${30+i}`))).status,201);
    const beforeEmail=await counts();assert.equal((await submit(request(undefined,{...base,email:'limit-email@example.com',turnstileToken:'limit-email-4'},'203.0.113.35'))).status,429);
    assert.deepEqual(await counts(),beforeEmail);
    assert.equal((await env.DB.prepare('SELECT count(*) n FROM mailbox_threads WHERE message_count!=1 OR unread!=1').first<{n:number}>())!.n,0);
  });
  await t.test('limite des tentatives avant appel au prestataire et nettoyage des empreintes',async()=>{
    for(let i=0;i<30;i++)assert.equal((await submit(request(undefined,{...base,turnstileToken:'invalid-attempt'},'203.0.113.50'),env,siteverify({success:false}))).status,422);
    const before=verified;assert.equal((await submit(request(undefined,{...base,turnstileToken:'invalid-attempt'},'203.0.113.50'))).status,429);assert.equal(verified,before);
    await env.DB.prepare("UPDATE partner_applications SET created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 days') WHERE id=?").bind(firstId).run();
    await env.DB.prepare("UPDATE partner_application_attempts SET hour='2020-01-01T00' WHERE ip_hash IN (SELECT ip_hash FROM partner_applications WHERE id=?)").bind(firstId).run();
    await cleanupPartnerApplications(env.DB);
    const old=await env.DB.prepare('SELECT ip_hash,email_hash,turnstile_hash FROM partner_applications WHERE id=?').bind(firstId).first();
    assert.deepEqual(old,{ip_hash:null,email_hash:null,turnstile_hash:null});
    assert.equal((await submit(request(firstId,{...base,turnstileToken:''}))).status,200,'Le nettoyage conserve la reprise idempotente');
    assert.equal(sent,0);assert.equal((await env.DB.prepare('PRAGMA foreign_key_check').all()).results.length,0);
  });
});

test('Siteverify : une nouvelle preuve renouvelle la clé de vérification, une reprise la conserve',async()=>{
  const env={BETTER_AUTH_URL:'https://bienvu.test',BETTER_AUTH_SECRET:'a'.repeat(32),PROBE_MODE:'remote',TURNSTILE_SECRET_KEY:'fixture'} as PartnersEnv;
  const keys:string[]=[],fetcher=(async(_url,init)=>{keys.push(JSON.parse(String(init?.body)).idempotency_key);return Response.json({success:true,hostname:'bienvu.test',action:'partner_application',challenge_ts:new Date().toISOString()});}) as typeof fetch;
  await verifyBot(env,'first','intent','partner_application',fetcher);await verifyBot(env,'first','intent','partner_application',fetcher);await verifyBot(env,'second','intent','partner_application',fetcher);
  assert.equal(keys[0],keys[1]);assert.notEqual(keys[1],keys[2]);
});
