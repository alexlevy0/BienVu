import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHmac} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {adminPage,adminOverview,adminAction,adminVideoDetail,ensureAgency,admitGeneration,findGeneration} from '../packages/db/src/index';
import {AdminQuery,Me,VideoReport} from '../packages/contracts/src/index';
import {isSuperAdmin,requireAdmin} from '../apps/web/lib/admin-access';
import {adminRequest,adminJobRequest} from '../apps/web/lib/admin';
import {createAuth} from '../apps/web/lib/auth';
import {videoFixture,videoReport} from '../fixtures/video';
import {RequestFailure} from '../apps/web/lib/http';

test('Super admin : accès fermé par défaut, adresse exacte et vérification obligatoires',()=>{
  const user={id:'admin',email:'Owner@Example.com',emailVerified:true};
  assert.equal(isSuperAdmin({},user),false);assert.equal(isSuperAdmin({SUPER_ADMIN_EMAIL:'owner@example.com'},user),true);
  assert.equal(isSuperAdmin({SUPER_ADMIN_EMAIL:'owner@example.com'},{...user,emailVerified:false}),false);
  for(const email of ['owner@example.com.evil','other@example.com','Owner+test@example.com'])assert.equal(isSuperAdmin({SUPER_ADMIN_EMAIL:'owner@example.com'},{...user,email}),false);
  assert.equal(isSuperAdmin({SUPER_ADMIN_EMAIL:'owner@example.com,other@example.com'},user),false);
  assert.equal(isSuperAdmin({SUPER_ADMIN_EMAIL:'owner@example.com'},null),false);
  assert.equal(Me.shape.isSuperAdmin.parse(undefined),false);
});

test('Admin avec Better Auth/D1/R2 locaux : isolation, pagination globale, actions atomiques et audit',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
  const bindings=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>(),db=bindings.DB,bucket=bindings.MEDIA;await migrateNarrationProbe(db);
  const at=new Date().toISOString(),month=at.slice(0,7);
  await db.prepare('INSERT INTO hosted_import_budget VALUES(?,0,4500,0)').bind(month).run();await db.exec('UPDATE generation_control SET enabled=1; UPDATE trial_policy SET free_enabled=1,enabled=1,budget_ceiling_cents=4500');
  const env={DB:db,MEDIA:bucket,PROBE_MODE:'local',SUPER_ADMIN_EMAIL:'owner@example.com',BETTER_AUTH_URL:'http://localhost:8787',BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),
    GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',GENERATIONS_ENABLED:'true',AUTH_EMAIL_MODE:'local',ANONYMOUS_TRIALS_ENABLED:'true',IMPORT_MODE:'disabled'};
  const auth=createAuth(env),context=await auth.$context;
  const users=[{id:crypto.randomUUID(),email:'owner@example.com',name:'Owner',emailVerified:1},{id:crypto.randomUUID(),email:'regular@example.com',name:'Regular',emailVerified:1},{id:crypto.randomUUID(),email:'unverified@example.com',name:'Unverified',emailVerified:0}];
  const cookies:string[]=[];
  for(const u of users){await db.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').bind(u.id,u.name,u.email,u.emailVerified,Date.now(),Date.now()).run();
    let session:{token:string}|null;
    if(u.emailVerified)session=await context.internalAdapter.createSession(u.id);
    else{const token=randomBytes(32).toString('hex');await db.prepare('INSERT INTO auth_session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),Date.now()+86400_000,token,Date.now(),Date.now(),u.id).run();session={token};}
    assert.ok(session);cookies.push(context.authCookies.sessionToken.name+'='+encodeURIComponent(session.token+'.'+createHmac('sha256',env.BETTER_AUTH_SECRET).update(session.token).digest('base64')));}
  const agency=await ensureAgency(db,users[0]),otherAgency=await ensureAgency(db,users[1]);
  const req=(path:string,cookie=cookies[0],options:RequestInit={})=>new Request(env.BETTER_AUTH_URL+path,{...options,headers:{cookie,...options.headers}});
  await t.test('toutes les routes privées refusent anonyme, autre compte et adresse non vérifiée',async()=>{
    for(const [cookie,expected] of [['',401],[cookies[1],403],[cookies[2],401]] as const){
      for(const response of [await adminRequest(req('/api/admin?section=overview',cookie),env),await adminRequest(req('/api/admin?section=traffic',cookie),env),await adminRequest(req('/api/admin',cookie,{method:'POST',headers:{origin:env.BETTER_AUTH_URL,'Content-Type':'application/json'},body:JSON.stringify({action:'generation_gate',expected:true,enabled:false,reason:'Fixture'})}),env),await adminJobRequest(req('/api/admin/jobs/missing',cookie),env,'missing'),await adminJobRequest(req('/api/admin/jobs/missing/video',cookie),env,'missing',true)]){
        assert.equal(response.status,expected);assert.equal(response.headers.get('cache-control'),'private, no-store');}
    }
    await assert.rejects(requireAdmin(req('/api/admin'),{...env,SUPER_ADMIN_EMAIL:''}),e=>e instanceof RequestFailure&&e.code==='FORBIDDEN');
    await db.prepare('UPDATE auth_user SET emailVerified=0 WHERE id=?').bind(users[0].id).run();assert.equal((await adminRequest(req('/api/admin'),env)).status,401);
    await db.prepare('UPDATE auth_user SET emailVerified=1 WHERE id=?').bind(users[0].id).run();
  });
  await t.test('toutes les sections se lisent sans secrets et les mauvais paramètres sont refusés',async()=>{
    for(const section of ['traffic','overview','videos','agencies','users','subscriptions','quotas','imports','reports','audit']){
      const response=await adminRequest(req('/api/admin?section='+section),env);assert.equal(response.status,200,section+': '+await response.clone().text());
      assert.doesNotMatch(await response.text(),/proof_hash|password|accessToken|refreshToken|object_key|BETTER_AUTH_SECRET|ip_hmac|author_key/);
    }
    assert.equal((await adminRequest(req('/api/admin?section=users&from=2026-10-01&to=2026-01-01'),env)).status,422);
    for(const query of ['section=traffic&days=365','section=traffic&country=FR','section=users&status=ready','section=videos&cursor=evil','section=users&secret=x','section=videos&q='+encodeURIComponent('x'.repeat(101))])assert.equal((await adminRequest(req('/api/admin?'+query),env)).status,422);
    const overview=await adminOverview(db,{generations:true,anonymousTrials:true,imports:'disabled',email:'local',google:false,origin:env.BETTER_AUTH_URL});
    assert.equal(overview.counts.agencies,2);assert.equal(overview.counts.users,3);assert.equal(overview.counts.activeSubscriptions,0);
  });
  const fixture=await seedNarrationFixture(db,'admin-test');
  // One real retained ledger entry (fixture media, no paid provider/render).
  await db.prepare('UPDATE agencies SET owner_user_id=? WHERE id=?').bind(users[2].id,fixture.agencyId).run();
  await db.prepare('UPDATE jobs SET status=\'failed\',error_code=\'FIXTURE_ERROR\',lease_until=NULL WHERE id=?').bind(fixture.jobId).run();
  await t.test('coûts par requête : métriques conservées, absence inconnue et payload privé exclu',async()=>{
    await db.prepare('INSERT INTO narration_budget VALUES(?,2500,0)').bind(month).run();
    await db.prepare("INSERT INTO narration_runs(job_id,agency_id,input_hash,config_hash,snapshot_json,provider_mode,job_attempt,created_at,expires_at) VALUES(?,?,?,?,'{}','real',1,?,?)")
      .bind(fixture.jobId,fixture.agencyId,'a'.repeat(64),'b'.repeat(64),at,new Date(Date.now()+86400_000).toISOString()).run();
    const metrics={model:'gpt-5.4-mini-2026-03-17',providerRequestId:'req_fixture',responseId:'resp_fixture',requestDurationMs:1234,usage:{inputTokens:1530,outputTokens:128,cachedInputTokens:1024},cost:{currency:'USD',priceDate:'2026-09-28',estimatedMicrosBeforeCacheDiscount:1724,actualBilledMicros:null}};
    const stored=[['openai','script/1','done',{metrics,plan:{privatePrompt:'PRIVATE_PROMPT'},apiKey:'PRIVATE_SECRET'}],['openai','script/2','failed',null],
      ['google','voice/1','done',{metrics:{usage:{inputCharacters:260},cost:{currency:'USD',estimatedMicrosBeforeFreeTier:7800}}}],
      ['google','voice/2','done',{metrics:{cost:{currency:'USD',estimatedMicrosBeforeFreeTier:-1}}}]] as const;
    for(const [provider,step,state,payload] of stored)await db.prepare("INSERT INTO narration_calls(id,agency_id,job_id,step_key,request_hash,provider,provider_mode,month,reservation_cents,state,result_json,created_at) VALUES(?,?,?,?,?,?,'real',?,5,?,?,?)")
      .bind(crypto.randomUUID(),fixture.agencyId,fixture.jobId,step,'c'.repeat(64),provider,month,state,payload===null?null:JSON.stringify(payload),at).run();
    const response=await adminJobRequest(req('/api/admin/jobs/'+fixture.jobId),env,fixture.jobId);assert.equal(response.status,200);
    const detail=await response.json() as Awaited<ReturnType<typeof adminVideoDetail>>;assert.ok(detail);assert.equal(detail.calls.length,4);
    const call=detail.calls.find(c=>c.step==='script/1')!;assert.equal(call.estimatedMicros,1724);assert.equal(call.currency,'USD');assert.equal(call.model,metrics.model);
    assert.equal(call.inputTokens,1530);assert.equal(call.outputTokens,128);assert.equal(call.cachedInputTokens,1024);assert.equal(call.providerRequestId,'req_fixture');assert.equal(call.reservedCents,5);
    assert.equal(detail.calls.find(c=>c.step==='script/2')!.estimatedMicros,null);assert.equal(detail.calls.find(c=>c.step==='script/2')!.inputTokens,null);
    assert.equal(detail.calls.find(c=>c.step==='voice/1')!.estimatedMicros,7800);assert.equal(detail.calls.find(c=>c.step==='voice/2')!.estimatedMicros,null);
    assert.doesNotMatch(JSON.stringify(detail),/PRIVATE_SECRET|PRIVATE_PROMPT|apiKey|privatePrompt|snapshot_json|result_json/);
    const monthly=(await adminOverview(db,{generations:true,anonymousTrials:true,imports:'disabled',email:'local',google:false,origin:env.BETTER_AUTH_URL})).monthlyCosts;
    for(const [provider,amount] of [['openai',1724],['google',7800]] as const){const c=monthly.find(c=>c.provider===provider)!;assert.equal(c.realCalls,2);assert.equal(c.measuredCalls,1);assert.equal(c.amountMicros,amount);}
    const before=await db.prepare('SELECT sum(reservation_cents) AS n FROM narration_calls').first();await adminVideoDetail(db,fixture.jobId);
    assert.deepEqual(await db.prepare('SELECT sum(reservation_cents) AS n FROM narration_calls').first(),before);
    await db.prepare("UPDATE narration_calls SET result_json=? WHERE job_id=? AND step_key='script/1'").bind(JSON.stringify({metrics:{...metrics,usage:{inputTokens:0,outputTokens:0,cachedInputTokens:0},cost:{...metrics.cost,estimatedMicrosBeforeCacheDiscount:0}}}),fixture.jobId).run();
    const zero=(await adminVideoDetail(db,fixture.jobId))!.calls.find(c=>c.step==='script/1')!;assert.equal(zero.estimatedMicros,0);assert.equal(zero.inputTokens,0);
    await db.prepare("UPDATE narration_calls SET provider_mode='mock',reservation_cents=0 WHERE job_id=?").bind(fixture.jobId).run();
    await db.prepare("UPDATE narration_runs SET provider_mode='mock' WHERE job_id=?").bind(fixture.jobId).run();
    assert.ok((await adminVideoDetail(db,fixture.jobId))!.calls.every(c=>c.estimatedMicros===null&&c.reservedCents===0&&c.mode==='mock'));
  });
  await t.test('pagination stable au-delà de 30, Unicode et recherche littérale, agences filtrées',async()=>{
    // Additional historical fixture jobs through the same circular FK ledger.
    for(let n=0;n<35;n++){const id='admin-job-'+String(n).padStart(2,'0'),r='admin-res-'+n;
      await db.batch([db.prepare("INSERT INTO jobs(id,agency_id,source_url,idempotency_key,status,stage,reservation_id,created_at,updated_at,error_code) VALUES(?,?,'','fixture-'||?,'failed','rendering',?,?,?,'FIXTURE')").bind(id,agency.id,id,r,at,at),
        db.prepare("INSERT INTO reservations(id,agency_id,job_id,allocation_id,status,created_at,updated_at) VALUES(?,?,?,NULL,'unfunded',?,?)").bind(r,agency.id,id,at,at)]);}
    const query=AdminQuery.parse({section:'videos'}),first=await adminPage(db,query);assert.equal(first.total,36);assert.equal(first.rows.length,30);assert.ok(first.nextCursor);
    const second=await adminPage(db,{...query,cursor:first.nextCursor!});assert.equal(second.rows.length,6);assert.equal(second.nextCursor,null);assert.equal(new Set([...first.rows,...second.rows].map(r=>r.id)).size,36);
    assert.equal((await adminPage(db,AdminQuery.parse({section:'videos',q:'%'}))).rows.length,0);
    assert.equal((await adminPage(db,AdminQuery.parse({section:'videos',q:"' OR 1=1 --"}))).rows.length,0);
    await assert.rejects(adminPage(db,{...query,q:'changed',cursor:first.nextCursor!}),/ADMIN_INVALID_QUERY/);
    const own=await adminPage(db,AdminQuery.parse({section:'videos',agency:agency.id}));assert.equal(own.total,35);
    await db.prepare("UPDATE agencies SET name='Agence Élysée' WHERE id=?").bind(agency.id).run();
    const unicode=await adminPage(db,AdminQuery.parse({section:'videos',q:'Élysée'}));assert.ok(unicode.nextCursor);
    assert.equal((await adminPage(db,AdminQuery.parse({section:'videos',q:'Élysée',cursor:unicode.nextCursor!}))).rows.length,5);
    assert.ok(await adminVideoDetail(db,fixture.jobId));assert.equal(await adminVideoDetail(db,'unknown-job'),null);
  });
  await t.test('lecture MP4 privée par admin, range/HEAD et fichier expiré',async()=>{
    await db.prepare('INSERT INTO generation_access(agency_id,allocation_id,enabled) VALUES(?,?,1)').bind(fixture.agencyId,'allocation-admin-test').run();
    const ready=await admitGeneration(db,fixture.agencyId,'admin-media-ready-123456',{listingId:'listing-admin-test'},'true');
    const f=await videoFixture(),bytes=new Uint8Array([1,2,3,4,5,6]),report=videoReport('a'.repeat(64),f.manifest,bytes),key=`agencies/${fixture.agencyId}/jobs/${ready.jobId}/video/output.mp4`;
    await bucket.put(key,bytes,{customMetadata:{sha256:report.sha256}});
    await db.batch([db.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)').bind(ready.jobId,key,JSON.stringify(report),at),db.prepare("UPDATE jobs SET status='ready',lease_until=NULL WHERE id=?").bind(ready.jobId)]);
    const path='/api/admin/jobs/'+ready.jobId+'/video';
    const file=await adminJobRequest(req(path,cookies[0],{headers:{range:'bytes=1-3'}}),env,ready.jobId,true);assert.equal(file.status,206);assert.deepEqual(new Uint8Array(await file.arrayBuffer()),new Uint8Array([2,3,4]));
    assert.equal(file.headers.get('cache-control'),'private, no-store');
    const head=await adminJobRequest(req(path,cookies[0],{method:'HEAD'}),env,ready.jobId,true);assert.equal(head.status,200);assert.equal(await head.text(),'');
    assert.equal((await adminJobRequest(req(path,cookies[1]),env,ready.jobId,true)).status,403);
    assert.equal((await adminJobRequest(req(path+'?variant=other'),env,ready.jobId,true)).status,422);
    await db.prepare("UPDATE generation_runs SET expires_at=? WHERE job_id=?").bind(new Date(Date.now()-1000).toISOString(),ready.jobId).run();
    assert.equal((await adminJobRequest(req(path),env,ready.jobId,true)).status,404);
    assert.ok(await adminVideoDetail(db,ready.jobId));
  });
  await t.test('CSRF, champs supplémentaires et conflits refusés ; audit et contrôle atomiques',async()=>{
    const action={action:'generation_gate',enabled:false,expected:true,reason:'Pause de recette'};
    const post=(body:unknown,origin=env.BETTER_AUTH_URL)=>adminRequest(req('/api/admin',cookies[0],{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)}),env);
    assert.equal((await post(action,'https://evil.example')).status,403);assert.equal((await post({...action,actorId:users[1].id})).status,422);
    assert.equal((await post(action)).status,200);assert.equal((await db.prepare('SELECT enabled FROM generation_control').first<{enabled:number}>())?.enabled,0);
    assert.equal((await post(action)).status,409);assert.equal((await adminPage(db,AdminQuery.parse({section:'audit'}))).total,1);
    await assert.rejects(db.prepare("DELETE FROM admin_audit").run(),/ADMIN_AUDIT_IMMUTABLE/);
    await adminAction(db,users[0].id,{action:'generation_gate',enabled:true,expected:false,reason:'Fin de recette'});
  });
  await t.test('quota protégé contre sous-consommation, expiration, concurrence et faux payant',async()=>{
    const id='admin-allocation';await db.prepare("INSERT INTO allocations(id,agency_id,kind,period_key,quota_limit,consumed,reserved,valid_from,valid_until) VALUES(?,?,'free','fixture',3,1,1,?,?)")
      .bind(id,otherAgency.id,new Date(Date.now()-1000).toISOString(),new Date(Date.now()+86400_000).toISOString()).run();
    await assert.rejects(adminAction(db,users[0].id,{action:'quota',id,expected:3,limit:1,reason:'Sous consommation'}),/ADMIN_CONFLICT/);
    await adminAction(db,users[0].id,{action:'quota',id,expected:3,limit:4,reason:'Compensation de recette'});
    await assert.rejects(adminAction(db,users[0].id,{action:'quota',id,expected:3,limit:5,reason:'Version périmée'}),/ADMIN_CONFLICT/);
    assert.equal((await db.prepare('SELECT kind FROM allocations WHERE id=?').bind(id).first<{kind:string}>())?.kind,'free');
    await db.prepare('UPDATE allocations SET valid_until=? WHERE id=?').bind(new Date(Date.now()-100).toISOString(),id).run();
    await assert.rejects(adminAction(db,users[0].id,{action:'quota',id,expected:4,limit:5,reason:'Période expirée'}),/ADMIN_CONFLICT/);
  });
  await t.test('signalement modifié sans effacer le contenu et acteur jamais choisi par le client',async()=>{
    const id=crypto.randomUUID();await db.prepare("INSERT INTO generation_reports(id,job_id,author_key,category,comment,created_at,idempotency_key,input_hash) VALUES(?,?,'fixture','technical','Image décalée',?,'fixture',?)").bind(id,fixture.jobId,at,'f'.repeat(64)).run();
    await adminAction(db,users[0].id,{action:'report_status',id,expected:'new',status:'reviewing',reason:'Analyse du signalement'});
    const row=await db.prepare('SELECT status,comment FROM generation_reports WHERE id=?').bind(id).first();assert.deepEqual(row,{status:'reviewing',comment:'Image décalée'});
    await assert.rejects(adminAction(db,users[0].id,{action:'report_status',id,expected:'new',status:'closed',reason:'Version ancienne'}),/ADMIN_CONFLICT/);
  });
  await t.test('performance et coûts mensuels : durée figée, inconnus et fixtures distingués',async()=>{
    const now=Date.now(),created=new Date(now-120000).toISOString(),ready=new Date(now-30000).toISOString();
    const row=await db.prepare("SELECT j.id FROM jobs j JOIN generation_events e ON e.job_id=j.id AND e.event='ready' WHERE j.status='ready' LIMIT 1").first<{id:string}>();assert.ok(row);
    await db.prepare('UPDATE jobs SET created_at=?,updated_at=? WHERE id=?').bind(created,ready,row.id).run();
    await db.prepare("UPDATE generation_events SET created_at=? WHERE job_id=? AND event='ready'").bind(ready,row.id).run();
    const config={generations:true,anonymousTrials:true,imports:'disabled',email:'local',google:false,origin:env.BETTER_AUTH_URL};
    const before=await adminOverview(db,config,now);
    await db.prepare('UPDATE jobs SET updated_at=? WHERE id=?').bind(new Date(now).toISOString(),row.id).run();
    const data=await adminOverview(db,config,now);
    assert.equal(data.performance.measuredReady,1);assert.ok(Math.abs(data.performance.averageSeconds!-90)<.01);assert.equal(data.performance.averageSeconds,before.performance.averageSeconds);
    assert.ok(data.performance.total>=2);assert.ok(data.performance.failed>=1);
    const cost=data.monthlyCosts.find(c=>c.provider==='google');assert.ok(cost);assert.equal(cost.amountMicros,null);assert.equal(cost.realCalls,0);assert.equal(cost.mockCalls,2);
    assert.ok(data.counts.unverifiedUsers>=1);assert.ok(data.counts.failedToday>=1);
  });

});
