import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {migrateNarrationProbe} from '../scripts/narration-fixtures';
import {schemaJson,seoMetadata,videoSchema} from '../apps/web/lib/seo';
import {featurePages,guidePages} from '../apps/web/lib/marketing-content';
import {publicSeoPaths,seoPage} from '../apps/web/lib/seo-paths';
import {sourceChannel,seoHit,collectSeo,webVitalRequest,seoSummary,purgeSeo,vitalBucket} from '../apps/web/lib/seo-analytics';
import {resolveHomeMedia,imageWidthUrl,previewVideoUrl} from '../apps/web/lib/home-media-view';
const origin='https://bienvu.online',now=Date.parse('2026-10-05T12:00:00Z');
const request=(path:string,headers:Record<string,string>={})=>new Request(origin+path,{headers:{'User-Agent':'Mozilla/5.0',...headers}});
const html=new Response('public',{headers:{'Content-Type':'text/html'}});
test('SEO : métadonnées spécifiques, schémas sûrs et liens publics cohérents',()=>{
  const pages=[...featurePages,...guidePages],slugs=new Set<string>();
  for(const page of pages){assert.ok(!slugs.has(page.slug));slugs.add(page.slug);assert.ok(page.sections.length>=3);const path=(guidePages.includes(page)?'/guides/':'/')+page.slug;assert.ok(publicSeoPaths.includes(path));
    const metadata=seoMetadata({title:page.title,description:page.description,path});assert.equal(metadata.alternates?.canonical,path);assert.ok(metadata.openGraph);assert.ok(metadata.twitter);}
  const malicious='Titre </script><script>alert(1)</script> & guillemets "';
  const safe=schemaJson(videoSchema({title:malicious,description:malicious,path:'/exemples/paris',poster:'/image.webp',src:'/video.mp4',seconds:28,publishedAt:'2026-10-05T09:00:00Z'}));
  assert.doesNotMatch(safe,/<\/script>/);assert.equal(JSON.parse(safe).name,malicious);assert.equal(JSON.parse(safe).duration,'PT28S');
  for(const path of ['/admin','/agence','/editeur','/biens','/validation/private','/connexion','/projets','/laboratoire'])assert.equal(seoPage(path),null);
  assert.equal(seoPage('/explorer/264c088b-5fe7-49f5-aca7-ff4332bc5531'),'/explorer/video');
});
test('SEO : provenance sans URL conservée, préchargements et parcours privés exclus',()=>{
  assert.equal(sourceChannel('https://www.google.fr/search?q=adresse-privee',origin),'google');
  assert.equal(sourceChannel('https://google.fr.attacker.example/',origin),'other');
  assert.equal(sourceChannel('https://l.instagram.com/?u=secret',origin),'social');assert.equal(sourceChannel(origin+'/biens/private',origin),'internal');
  assert.deepEqual(seoHit(request('/video-immobiliere-ia?email=private@example.com',{cookie:'secret',referer:'https://www.google.fr/search?q=secret','cf-connecting-ip':'1.2.3.4'}),html,origin,now),{day:'2026-10-05',page:'/video-immobiliere-ia',channel:'google'});
  for(const path of ['/admin','/biens','/?draft=private','/?homePreview=1','/?code=secret'])assert.equal(seoHit(request(path),html,origin,now),null);
  const ignored:Record<string,string>[]=[{rsc:'1'},{'next-router-prefetch':'1'},{purpose:'prefetch'},{'user-agent':'Googlebot'}];
  for(const headers of ignored)assert.equal(seoHit(request('/',headers),html,origin,now),null);
  assert.equal(seoHit(request('/'),new Response('',{status:404,headers:{'content-type':'text/html'}}),origin,now),null);
});
test('SEO : agrégats atomiques, mesures bornées et purge sans identifiant',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB']}));t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');await migrateNarrationProbe(db);
  const tasks:Promise<unknown>[]=[],env={DB:db,BETTER_AUTH_URL:origin,TRAFFIC_ENABLED:'true'},ctx={waitUntil(task:Promise<unknown>){tasks.push(task);}};
  for(let i=0;i<10;i++)collectSeo(request('/video-immobiliere-ia',{referer:'https://www.google.fr/search?q=secret'}),html,env,ctx);
  collectSeo(request('/'),html,{...env,TRAFFIC_ENABLED:'false'},ctx);await Promise.all(tasks);assert.equal(tasks.length,10);
  const post=(body:unknown,headers:Record<string,string>={})=>new Request(origin+'/api/metrics/web-vitals',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','User-Agent':'Mozilla/5.0',...headers},body:JSON.stringify(body)});
  assert.equal((await webVitalRequest(post({page:'/video-immobiliere-ia',metric:'LCP',value:2100}),env)).status,204);
  assert.equal((await webVitalRequest(post({page:'/admin',metric:'LCP',value:100}),env)).status,422);
  assert.equal((await webVitalRequest(post({page:'/?draft=private',metric:'CLS',value:0}),env)).status,422);
  assert.equal((await webVitalRequest(post({page:'/',metric:'INP',value:-1}),env)).status,422);
  assert.equal((await webVitalRequest(post({page:'/',metric:'INP',value:250,visitor:'secret'}),env)).status,422);
  assert.equal((await webVitalRequest(post({page:'/',metric:'CLS',value:101}),env)).status,422);
  assert.equal((await webVitalRequest(post({page:'/',metric:'LCP',value:100},{Origin:'https://attacker.example'}),env)).status,403);
  const summary=await seoSummary(db,true);assert.deepEqual(summary.pages,[{page:'/video-immobiliere-ia',views:10}]);assert.deepEqual(summary.channels,[{channel:'google',views:10}]);assert.equal(summary.vitals[0]?.bucket,'good');
  for(const table of ['seo_views_daily','seo_vitals_daily']){const columns:string[]=(await db.prepare(`PRAGMA table_info(${table})`).all<{name:string}>()).results.map((row:{name:string})=>row.name);assert.ok(!columns.some(name=>/ip|user|refer|url|cookie|session/.test(name)));}
  await db.prepare("INSERT INTO seo_views_daily VALUES('2020-01-01','/','direct',1)").run();await purgeSeo(db);assert.equal((await db.prepare("SELECT count(*) AS n FROM seo_views_daily WHERE day='2020-01-01'").first<{n:number}>())!.n,0);
  assert.equal(vitalBucket('LCP',2500),'good');assert.equal(vitalBucket('INP',501),'poor');assert.equal(vitalBucket('CLS',.2),'needs-improvement');
});
test('Médias SEO : affichage de la sélection et variantes sans nouvelle URL extérieure',()=>{
  const media=resolveHomeMedia({version:0,slots:{}},'hero.video');assert.equal(media.src,'/videos/studio-home/paris.mp4');
  assert.equal(imageWidthUrl('/api/homepage/media/id?poster=1',640),'/api/homepage/media/id?poster=1&w=640');
  assert.equal(imageWidthUrl('/images/studio-home/paris.webp',320),'/images/studio-home/paris-320.webp');
  assert.equal(imageWidthUrl('/private/logo',640),'/private/logo');assert.equal(previewVideoUrl('/api/homepage/media/id'),'/api/homepage/media/id?preview=1');
});
