import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {migrateNarrationProbe} from '../scripts/narration-fixtures';
import {pageHit,collectTraffic} from '../apps/web/lib/traffic';
import {recordPageHit,adminTraffic,purgeTraffic} from '../packages/db/src/index';
const origin='https://bienvu.online',now=Date.parse('2026-09-30T12:00:00Z');
const html=new Response('page',{headers:{'content-type':'text/html; charset=utf-8'}});
function req(path='/',headers:Record<string,string>={},method='GET'){return new Request(origin+path,{method,headers:{'user-agent':'Mozilla/5.0',...headers}});}
test('Trafic : minimisation, métadonnées Cloudflare uniquement et exclusions',()=>{
  assert.deepEqual(pageHit(req('/?email=private@example.com',{cookie:'secret','cf-ipcountry':'US','cf-connecting-ip':'1.2.3.4',referer:'https://secret.example/'}),html,origin,'FR',now),{day:'2026-09-30',page:'home',country:'FR'});
  assert.equal(pageHit(req('/',{'cf-ipcountry':'FR'}),html,origin,undefined,now)?.country,'XX');
  for(const country of ['T1','USA','fr','<script>',''])assert.equal(pageHit(req(),html,origin,country,now)?.country,'XX');
  for(const path of ['/admin','/api/admin','/historique','/biens','/biens/listing%3Aprivate-id','/agence','/explorer/private-id','/reset-password'])assert.equal(pageHit(req(path),html,origin,'FR',now),null);
  const skipped:Record<string,string>[]=[{rsc:'1'},{'next-router-prefetch':'1'},{purpose:'prefetch'},{'sec-purpose':'prefetch;prerender'},{'user-agent':'Googlebot'},{'user-agent':'curl/8'}];for(const headers of skipped)assert.equal(pageHit(req('/',headers),html,origin,'FR',now),null);
  assert.equal(pageHit(req('/'),html,'https://other.example','FR',now),null);
  assert.equal(pageHit(req('/',{},'POST'),html,origin,'FR',now),null);
  assert.equal(pageHit(req('/'),new Response('error',{status:500,headers:{'content-type':'text/html'}}),origin,'FR',now),null);
  assert.equal(pageHit(req('/'),Response.json({}),origin,'FR',now),null);
  assert.equal(pageHit(req('/connexion'),html,origin,'FR',now)?.page,'login');
  for(const agent of ['Mozilla/5.0 Chrome/153 Safari/537.36 Chrome-Lighthouse','PageSpeed Insights','GTmetrix','WebPageTest'])assert.equal(pageHit(req('/',{'user-agent':agent}),html,origin,'FR',now),null);
  assert.equal(pageHit(req('/?bienvu_audit=1'),html,origin,'FR',now),null);
  assert.equal(pageHit(req('/',{'x-bienvu-audit':'1'}),html,origin,'FR',now),null);
  // PageSpeed can use precisely the same UA as a visitor. Do not guess from
  // browser version or country; an explicit marker excludes such audits.
  assert.equal(pageHit(req('/',{'user-agent':'Mozilla/5.0 Chrome/153.0.0.0 Safari/537.36'}),html,origin,'FR',now)?.page,'home');
});
test('Trafic D1 local : agrégats atomiques, fenêtres bornées, purge et tâches liées au Worker',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB']}));t.after(()=>mf.dispose());
  const db=await mf.getD1Database('DB');await migrateNarrationProbe(db);
  await Promise.all(Array.from({length:16},()=>recordPageHit(db,{day:'2026-09-30',page:'home',country:'FR'})));
  for(const hit of [{day:'2026-09-29',page:'login',country:'US'},{day:'2026-09-10',page:'home',country:'FR'},{day:'2026-08-01',page:'home',country:'DE'}] as const)await recordPageHit(db,hit);
  const seven=await adminTraffic(db,7,true,now);assert.equal(seven.total,17);assert.equal(seven.daily.length,7);assert.deepEqual(seven.countries,[{country:'FR',views:16},{country:'US',views:1}]);
  assert.deepEqual(seven.daily.at(-1),{day:'2026-09-30',views:16,pages:[{page:'home',views:16}],countries:[{country:'FR',views:16}]});
  assert.deepEqual(seven.daily.at(-2),{day:'2026-09-29',views:1,pages:[{page:'login',views:1}],countries:[{country:'US',views:1}]});
  assert.deepEqual(seven.daily[0],{day:'2026-09-24',views:0,pages:[],countries:[]});
  assert.equal((await adminTraffic(db,30,true,now)).total,18);await purgeTraffic(db,now);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM admin_traffic_daily WHERE day='2026-08-01'").first<{n:number}>())?.n,0);
  const columns=await db.prepare('PRAGMA table_info(admin_traffic_daily)').all<{name:string}>();assert.deepEqual(columns.results.map((c:{name:string})=>c.name),['day','page','country','views']);
  await recordPageHit(db,{day:'2026-09-30',page:'home',country:'US'});await recordPageHit(db,{day:'2026-09-30',page:'offers',country:'FR'});
  const breakdown=(await adminTraffic(db,7,true,now)).daily.at(-1)!;
  assert.deepEqual(breakdown.pages,[{page:'home',views:17},{page:'offers',views:1}]);
  assert.deepEqual(breakdown.countries,[{country:'FR',views:17},{country:'US',views:1}]);
  assert.equal(breakdown.views,18);
  const tasks:Promise<unknown>[]=[],env={DB:db,TRAFFIC_ENABLED:'true',BETTER_AUTH_URL:origin},ctx={waitUntil(p:Promise<unknown>){tasks.push(p);}};
  collectTraffic(req('/sources'),html,{...env,TRAFFIC_ENABLED:'false'},ctx,'FR');assert.equal(tasks.length,0);
  collectTraffic(req('/?bienvu_audit=1'),html,env,ctx,'FR');assert.equal(tasks.length,0);
  collectTraffic(req('/sources'),html,env,ctx,'FR');assert.equal(tasks.length,1);await Promise.all(tasks);
  assert.equal((await db.prepare("SELECT sum(views) AS n FROM admin_traffic_daily WHERE page='sources'").first<{n:number}>())?.n,1);
  // Erreur de D1 avalée dans la tâche, sans interruption de la réponse ni données privées dans le log.
  await db.exec('DROP TABLE admin_traffic_daily');const logs:string[]=[],original=console.error;console.error=(v:unknown)=>logs.push(String(v));
  try{collectTraffic(req('/'),html,env,ctx,'FR');await tasks.at(-1);assert.deepEqual(logs,['{"event":"traffic_write_failed"}']);}finally{console.error=original;}
});
