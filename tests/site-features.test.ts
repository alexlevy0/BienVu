import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {migrateNarrationProbe} from '../scripts/narration-fixtures';
import {siteFeatures,setSiteFeatures} from '../packages/db/src/index';
import {publicSiteFeaturesRequest,adminSiteFeaturesRequest} from '../apps/web/lib/site-features';
import {createAuth} from '../apps/web/lib/auth';

test('Visibilité : désactivée par défaut, réactivation persistante, conflit et journal immuable',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB']}));t.after(()=>mf.dispose());
 const db=await mf.getD1Database('DB');await migrateNarrationProbe(db);
 const before=await siteFeatures(db);assert.deepEqual(before.features,{explorer:false});
 const published=await db.prepare('SELECT published_json FROM homepage_settings WHERE id=1').first();
 const enabled=await setSiteFeatures(db,'owner-fixture',{explorer:true},before.revision);assert.equal(enabled.revision,before.revision+1);
 assert.equal((await siteFeatures(db)).features.explorer,true);
 await assert.rejects(setSiteFeatures(db,'owner-fixture',{explorer:false},before.revision),/SITE_FEATURE_CONFLICT/);
 assert.equal((await siteFeatures(db)).features.explorer,true,'Un ancien onglet ne peut pas écraser une modification plus récente.');
 const disabled=await setSiteFeatures(db,'owner-fixture',{explorer:false},enabled.revision);assert.equal(disabled.features.explorer,false);
 assert.deepEqual(await db.prepare('SELECT published_json FROM homepage_settings WHERE id=1').first(),published,'Les médias de découverte restent configurés.');
 const response=await publicSiteFeaturesRequest(db);assert.equal(response.status,200);assert.deepEqual(await response.json(),{revision:disabled.revision,features:{explorer:false}});
 assert.match(response.headers.get('cache-control')??'',/no-store/);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM site_feature_events').first<{n:number}>())?.n,2);
 await assert.rejects(db.prepare('DELETE FROM site_feature_events').run(),/SITE_FEATURE_AUDIT_IMMUTABLE/);
 await assert.rejects(db.prepare("UPDATE site_feature_events SET actor_id='other'").run(),/SITE_FEATURE_AUDIT_IMMUTABLE/);
});

test('Visibilité : modification réservée au Super admin, contrôle d’origine et validation du contrat',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB']}));t.after(()=>mf.dispose());
 const db=await mf.getD1Database('DB');await migrateNarrationProbe(db);
 const env={DB:db,PROBE_MODE:'local',SUPER_ADMIN_EMAIL:'owner@example.com',ADMIN_EMAIL:'greg@example.com',BETTER_AUTH_URL:'http://localhost:8787',BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',AUTH_EMAIL_MODE:'local'};
 const context=await createAuth(env).$context,cookies:string[]=[];
 for(const [email,verified] of [['owner@example.com',1],['greg@example.com',1],['owner-pending@example.com',0]] as const){
  const id=crypto.randomUUID(),token=randomBytes(32).toString('hex');
  await db.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').bind(id,'Fixture',email,verified,Date.now(),Date.now()).run();
  await db.prepare('INSERT INTO auth_session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),Date.now()+86400_000,token,Date.now(),Date.now(),id).run();
  cookies.push(context.authCookies.sessionToken.name+'='+encodeURIComponent(token+'.'+createHmac('sha256',env.BETTER_AUTH_SECRET).update(token).digest('base64')));
 }
 const request=(method='GET',cookie='',body:unknown={revision:1,features:{explorer:true}},origin=env.BETTER_AUTH_URL)=>new Request(env.BETTER_AUTH_URL+'/api/admin/features',
  {method,headers:{cookie,Origin:origin,'Content-Type':'application/json'},...(method==='PATCH'?{body:JSON.stringify(body)}:{})});
 assert.equal((await adminSiteFeaturesRequest(request(),env)).status,401);
 assert.equal((await adminSiteFeaturesRequest(request('GET',cookies[1]),env)).status,403);
 assert.equal((await adminSiteFeaturesRequest(request('GET',cookies[2]),env)).status,401);
 assert.equal((await adminSiteFeaturesRequest(request('PATCH',cookies[0],undefined,'https://other.example'),env)).status,403);
 assert.equal((await adminSiteFeaturesRequest(request('PATCH',cookies[0],{revision:1,features:{explorer:'true'}}),env)).status,422);
 assert.equal((await adminSiteFeaturesRequest(request('PATCH',cookies[0],{revision:1,features:{explorer:true,admin:true}}),env)).status,422);
 assert.equal((await adminSiteFeaturesRequest(request('PATCH',cookies[0]),env)).status,200);
 assert.equal((await adminSiteFeaturesRequest(request('PATCH',cookies[0]),env)).status,409);
 const publicBody=await (await publicSiteFeaturesRequest(db)).json();assert.deepEqual(publicBody,{revision:2,features:{explorer:true}});
 assert.equal((await adminSiteFeaturesRequest(request('PATCH',cookies[0],{revision:2,features:{explorer:false}}),env)).status,200);
 assert.equal((await siteFeatures(db)).features.explorer,false);
});
