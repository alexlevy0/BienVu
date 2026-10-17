import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHmac} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {admitGeneration,savePushDevice,watchPushGeneration,claimPushDelivery,finishPushDelivery,expirePushEndpoint} from '../packages/db/src/index';
import {adminOperationsRequest,operationsRead,operationWrite,OperationsQuery,OperationAction,percentiles} from '../apps/web/lib/admin-operations';
import {createAuth} from '../apps/web/lib/auth';

test('Quantiles : médiane exacte, P95 rang supérieur et valeurs absentes exclues',()=>{
 assert.deepEqual(percentiles([]),{measured:0,average:null,median:null,p95:null});
 assert.deepEqual(percentiles([0,60,180,600,-1,NaN]),{measured:4,average:210,median:120,p95:600});
 assert.equal(percentiles(Array.from({length:100},(_,i)=>i+1)).p95,95);
 for(const query of [{days:'365'},{duration:'60'},{from:'2026-02-31'},{from:'2026-10-17',to:'2026-10-01'},{secret:'x'}])assert.equal(OperationsQuery.safeParse(query).success,false);
 assert.equal(OperationAction.safeParse({action:'incident',target:'voice:ERROR',state:'resolved',expected:null,body:'Cause connue',actor:'forged'}).success,false);
});

test('Cohortes : retour à 7 et 30 jours, fenêtre complète, événement futur exclu',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default{fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB']}));t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');
 await db.exec('CREATE TABLE jobs(id TEXT,status TEXT,created_at TEXT); CREATE TABLE generation_runs(job_id TEXT,owner_agency_id TEXT,agency_id TEXT); CREATE TABLE generation_events(job_id TEXT,event TEXT,created_at TEXT); CREATE TABLE agencies(id TEXT,name TEXT,owner_user_id TEXT); CREATE TABLE auth_user(id TEXT);');
 const now=Date.parse('2026-10-17T12:00:00.000Z');
 for(const [agency,offsets] of [['a',[40,35]],['b',[20,10]],['c',[2,1]],['d',[40]],['future',[-1/24]]] as [string,number[]][]){
  await db.prepare('INSERT INTO auth_user VALUES(?)').bind(agency).run();await db.prepare('INSERT INTO agencies VALUES(?,?,?)').bind(agency,agency,agency).run();
  for(const [index,days] of offsets.entries()){const id=agency+'-'+index,at=new Date(now-days*86400_000).toISOString();await db.prepare('INSERT INTO jobs VALUES(?,?,?)').bind(id,'ready',at).run();await db.prepare('INSERT INTO generation_runs VALUES(?,?,?)').bind(id,agency,agency).run();await db.prepare('INSERT INTO generation_events VALUES(?,?,?)').bind(id,'ready',at).run();}
 }
 const report=await operationsRead(db,OperationsQuery.parse({section:'retention',days:'90'}),now);assert.ok('summary' in report&&report.summary);
 assert.deepEqual(report.summary,{activated:4,secondVideo:3,eligible7:3,returned7:1,eligible30:2,returned30:1});assert.ok('activity' in report&&!report.activity?.some(a=>a.id==='future'));
});

test('Opérations : requêtes D1 réelles, notes privées, incidents concurrents, cohortes et journal push',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB']}));t.after(()=>mf.dispose());
 const db=await mf.getD1Database('DB');await migrateNarrationProbe(db);
 const now=Date.now(),at=new Date(now).toISOString(),env={DB:db,BETTER_AUTH_URL:'http://localhost:8787',BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),PROBE_MODE:'local',SUPER_ADMIN_EMAIL:'owner@example.test',ADMIN_EMAIL:'staff@example.test',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:''};
 const auth=createAuth(env),context=await auth.$context,cookies:string[]=[];
 for(const [id,email] of [['admin-ops','owner@example.test'],['staff-ops','staff@example.test'],['regular-ops','regular@example.test']]){
  await db.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind(id,id,email,now,now).run();
  const session=await context.internalAdapter.createSession(id);assert.ok(session);cookies.push(context.authCookies.sessionToken.name+'='+encodeURIComponent(session.token+'.'+createHmac('sha256',env.BETTER_AUTH_SECRET).update(session.token).digest('base64')));
 }
 const req=(path:string,cookie=cookies[0],body?:unknown,origin=env.BETTER_AUTH_URL)=>new Request(env.BETTER_AUTH_URL+path,{method:body?'POST':'GET',headers:{cookie,origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 await t.test('toutes les nouvelles lectures fonctionnent sur le schéma vide',async()=>{
  for(const section of ['dashboard','performance','incidents','retention','profit','providers','changes']){
   await operationsRead(db,OperationsQuery.parse({section}));const response=await adminOperationsRequest(req('/api/admin/operations?section='+section),env);assert.equal(response.status,200,section+': '+await response.clone().text());assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  }
 });
 await t.test('autorisation avant lecture, sans extension des droits support aux finances',async()=>{
  for(const [cookie,status] of [['',401],[cookies[1],403],[cookies[2],403]] as const)for(const section of ['performance','incidents','retention','profit','providers','changes','agency','video'])assert.equal((await adminOperationsRequest(req('/api/admin/operations?section='+section,cookie),env)).status,status);
  assert.equal((await adminOperationsRequest(req('/api/admin/operations',cookies[0],{action:'change',title:'Test release',body:'Version locale uniquement'},'https://evil.example'),env)).status,403);
 });
 await db.exec('UPDATE generation_control SET enabled=1; UPDATE trial_policy SET enabled=1,free_enabled=1');
 await db.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9000,0)').bind(at.slice(0,7)).run();
 const seed=await seedNarrationFixture(db,'ops-fixture',true);
 await db.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE' WHERE id=?").bind(seed.jobId).run();
 await db.prepare("UPDATE agencies SET owner_user_id='old-regular-ops' WHERE owner_user_id='regular-ops'").run();
 await db.prepare('UPDATE agencies SET owner_user_id=? WHERE id=?').bind('regular-ops',seed.agencyId).run();
 await db.prepare("UPDATE allocations SET kind='paid',quota_limit=50 WHERE agency_id=?").bind(seed.agencyId).run();await db.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(seed.agencyId,'allocation-ops-fixture').run();
 const job=await admitGeneration(db,seed.agencyId,'operations-fixture-video',{listingId:'listing-ops-fixture',durationSeconds:20},'true');
 const probeNow=Date.parse(job.createdAt);
 await db.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)').bind(job.jobId,'fixture-'+job.jobId,'{}',at).run();
 await db.prepare("UPDATE jobs SET status='ready',lease_until=NULL,updated_at=? WHERE id=?").bind(new Date(probeNow+120000).toISOString(),job.jobId).run();
 await t.test('vue agence, notes immuables et accès support limité aux seules notes',async()=>{
  const action={action:'note',id:seed.agencyId,body:'Contexte interne de suivi client'};
  assert.equal((await adminOperationsRequest(req('/api/admin/operations',cookies[1],action),env)).status,200);
  const response=await adminOperationsRequest(req('/api/admin/operations?section=notes&id='+seed.agencyId,cookies[1]),env);assert.equal(response.status,200);const body=await response.json() as {notes:{actor:string;body:string}[]};assert.equal(body.notes[0].actor,'staff-ops');assert.ok(!('agency' in body));
  const grantsBefore=await db.prepare('SELECT count(*) AS n FROM allocations').first<{n:number}>();
  const agency=await operationsRead(db,OperationsQuery.parse({section:'agency',id:seed.agencyId}));assert.ok('agency' in agency&&agency.agency);assert.ok('notes' in agency&&agency.notes?.length===1);assert.ok('balance' in agency&&agency.balance);assert.equal(agency.balance.available,49);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM allocations').first<{n:number}>())?.n,grantsBefore?.n,'Une lecture admin ne crée aucun crédit gratuit ou payant');
  await assert.rejects(db.prepare("UPDATE admin_operation_entries SET body='edited'").run(),/AUDIT_IMMUTABLE/);
  assert.equal((await adminOperationsRequest(req('/api/admin/operations',cookies[1],{action:'change',title:'Test',body:'Forbidden change'}),env)).status,403);
 });
 await t.test('groupes incidents, déduplication par vidéo et résolution optimiste',async()=>{
  const a=await operationWrite(db,'admin-ops',{action:'incident',target:'voicing:EXAMPLE',state:'reviewing',expected:null,body:'Analyse en cours'});
  await assert.rejects(operationWrite(db,'admin-ops',{action:'incident',target:'voicing:EXAMPLE',state:'resolved',expected:null,body:'Résolution obsolète'}),/CONFLICT/);
  await operationWrite(db,'admin-ops',{action:'incident',target:'voicing:EXAMPLE',state:'resolved',expected:a.id,body:'Résolution vérifiée'});
  const incidents=await operationsRead(db,OperationsQuery.parse({section:'incidents'}));assert.ok('incidents' in incidents&&incidents.incidents?.some(i=>i.code==='FIXTURE'));
  await db.prepare("INSERT INTO generation_preparation_steps(job_id,agency_id,step,state,started_at,updated_at,error_code) VALUES(?,?,'animations','skipped',?,?,'RUNWAY_TIMEOUT')").bind(job.jobId,seed.agencyId,at,at).run();
  const incidentNow=Date.now();const resolution=await operationWrite(db,'admin-ops',{action:'incident',target:'animations:RUNWAY_TIMEOUT',state:'resolved',expected:null,body:'Correction vérifiée'},incidentNow+1000);
  await db.prepare("UPDATE generation_preparation_steps SET updated_at=? WHERE job_id=? AND step='animations'").bind(new Date(incidentNow+2000).toISOString(),job.jobId).run();
  const recurring=await operationsRead(db,OperationsQuery.parse({section:'incidents'}),incidentNow+3000);assert.ok('incidents' in recurring&&recurring.incidents);const reappeared=recurring.incidents.find(i=>i.code==='RUNWAY_TIMEOUT');assert.equal(reappeared?.review?.id,resolution.id);assert.equal(reappeared?.review?.state,'open');assert.equal(reappeared?.reopened,true);assert.equal(reappeared?.count,1,'Une vidéo prête avec animation omise reste diagnostiquable');
 });
 await t.test('performance filtrée et durées fondées sur ready, pas sur updated_at',async()=>{
  await db.prepare("INSERT OR REPLACE INTO generation_events VALUES(?,'ready',?)").bind(job.jobId,new Date(Date.parse(job.createdAt)+120000).toISOString()).run();
  const result=await operationsRead(db,OperationsQuery.parse({section:'performance',duration:'20'}),probeNow+180000);assert.ok('stats' in result&&result.stats);assert.equal(result.stats.measured,1);assert.equal(result.stats.median,120);
  const other=await operationsRead(db,OperationsQuery.parse({section:'performance',duration:'40'}),probeNow+180000);assert.ok('stats' in other&&other.stats);assert.equal(other.stats.measured,0);
  await db.prepare('UPDATE jobs SET updated_at=? WHERE id=?').bind(new Date(now+999999).toISOString(),job.jobId).run();
  const again=await operationsRead(db,OperationsQuery.parse({section:'performance',duration:'20'}),probeNow+180000);assert.ok('stats' in again&&again.stats);assert.equal(again.stats.median,120);
  const profit=await operationsRead(db,OperationsQuery.parse({section:'profit',mode:'test'}),probeNow+180000);assert.ok('groups' in profit&&profit.groups);assert.equal(profit.groups[0]?.render,'standard');assert.equal(profit.groups[0]?.videos,1);
 });
 await t.test('rétention : aucune agence récente dans le dénominateur à 7/30 jours',async()=>{
  const report=await operationsRead(db,OperationsQuery.parse({section:'retention'}),probeNow+180000);assert.ok('summary' in report&&report.summary);assert.equal(report.summary.activated,1);assert.equal(report.summary.eligible7,0);assert.equal(report.summary.eligible30,0);
 });
 await t.test('push : le diagnostic survit à la suppression de l’abonnement, sans clés privées',async()=>{
  const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/private-test',expirationTime:null,keys:{p256dh:'private-key-not-for-admin',auth:'private-auth-not-for-admin'}};
  const hash=await savePushDevice(db,{kind:'user',id:'regular-ops'},'token'.repeat(12),subscription);assert.ok(hash);
  await watchPushGeneration(db,{kind:'user',id:'regular-ops'},'token'.repeat(12),job.jobId,probeNow+180000);
  const delivery={endpointHash:hash,jobId:job.jobId,subscription:JSON.stringify(subscription)},lease='fixture-lease';
  const claimed=await claimPushDelivery(db,delivery,lease,probeNow+180000);assert.ok(claimed);
  await finishPushDelivery(db,delivery,lease,'sent',claimed.attempts,probeNow+180000);
  await expirePushEndpoint(db,hash);assert.equal((await db.prepare('SELECT count(*) AS n FROM browser_push_deliveries WHERE job_id=?').bind(job.jobId).first<{n:number}>())?.n,0);
  const report=await operationsRead(db,OperationsQuery.parse({section:'video',id:job.jobId}),probeNow+180000);assert.ok('push' in report&&report.push);assert.deepEqual(report.push.map(p=>p.event),['watch','attempt','accepted','device_disabled']);
  const json=JSON.stringify(report);for(const secret of [hash,subscription.endpoint,subscription.keys.p256dh,subscription.keys.auth])assert.ok(!json.includes(secret));
 });
});
