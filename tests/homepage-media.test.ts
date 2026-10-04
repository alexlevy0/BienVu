import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {admitGeneration,findImport,beginImport,homepageAsset,homepageSettings,homepageSources} from '../packages/db/src/index';
import {GeneratableListing,homepageSlots,defaultVideoCustomization,type HomepageAdmin} from '../packages/contracts/src/index';
import {adminHomepageRequest,adminHomepageSourceRequest,homepageMediaRequest,readHomepageConfig,readHomepageAdmin,readHomepageLibrary,changeHomepage,cleanupHomepageAssets} from '../apps/web/lib/homepage-media';
import {createAuth} from '../apps/web/lib/auth';
import {createPrivateImport} from '../apps/web/lib/imports';
import {fixtureImportTransport} from '../scripts/import-fixtures';
import {videoFixture,videoReport} from '../fixtures/video';

const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
test('Home : banque globale privée, copie indépendante, publication atomique et lecture vidéo',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
 const bindings=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>(),{DB:db,MEDIA:bucket}=bindings;await migrateNarrationProbe(db);
 const env={...bindings,PROBE_MODE:'local',SUPER_ADMIN_EMAIL:'owner@example.com',BETTER_AUTH_URL:'http://localhost:8787',BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',AUTH_EMAIL_MODE:'local'};
 const users=[{id:crypto.randomUUID(),email:'owner@example.com',verified:1},{id:crypto.randomUUID(),email:'regular@example.com',verified:1},{id:crypto.randomUUID(),email:'pending@example.com',verified:0}],cookies:string[]=[];
 const context=await createAuth(env).$context;
 for(const user of users){await db.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').bind(user.id,'Fixture',user.email,user.verified,Date.now(),Date.now()).run();
  const token=randomBytes(32).toString('hex');await db.prepare('INSERT INTO auth_session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),Date.now()+86400_000,token,Date.now(),Date.now(),user.id).run();
  cookies.push(context.authCookies.sessionToken.name+'='+encodeURIComponent(token+'.'+createHmac('sha256',env.BETTER_AUTH_SECRET).update(token).digest('base64')));}
 const req=(path:string,cookie=cookies[0],init:RequestInit={})=>new Request(env.BETTER_AUTH_URL+path,{...init,headers:{cookie,...init.headers}});
 await db.exec('UPDATE generation_control SET enabled=1; UPDATE trial_policy SET enabled=1,free_enabled=1');await db.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9500,0)').bind(new Date().toISOString().slice(0,7)).run();
 const fixture=await videoFixture(),bytes=new Uint8Array([7,8,9,10,11,12,13,14]);
 async function seed(label:string){
  const {agencyId,jobId:seedId}=await seedNarrationFixture(db,label,true),at=new Date().toISOString();
  const imported=await createPrivateImport(env,agencyId,'https://fixtures.bienvu.example/vente','home-import-'+label,fixtureImportTransport());
  const listing=GeneratableListing.parse(JSON.parse(imported.result!));
  await db.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id=?").bind(seedId).run();await db.prepare("UPDATE allocations SET kind='paid',quota_limit=30 WHERE agency_id=?").bind(agencyId).run();await db.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(agencyId,'allocation-'+label).run();
  const job=await admitGeneration(db,agencyId,'homepage-generation-'+label,{listingId:listing.id,customization:{...defaultVideoCustomization(),runwayPhotos:[0]}},'true'),key=`agencies/${agencyId}/jobs/${job.jobId}/video/master.mp4`,clipId=label+'-clip';
  const clip={id:clipId,objectKey:`agencies/${agencyId}/jobs/${job.jobId}/animations/0.mp4`,mime:'video/mp4',sha256:sha(bytes),sizeBytes:bytes.length,durationMs:5000,width:720,height:1280};
  await bucket.put(clip.objectKey,bytes,{customMetadata:{sha256:clip.sha256}});
  await db.prepare("INSERT INTO photo_animations(id,agency_id,job_id,photo_id,source_sha256,slot,month,mode,model,credits,reserved_cents,state,animation_json,created_at,updated_at) VALUES(?,?,?,?,?,0,?,'mock','gen4_turbo',25,0,'ready',?,?,?)").bind(clipId,agencyId,job.jobId,listing.photos[0].id,listing.photos[0].contentHash,at.slice(0,7),JSON.stringify({photoAssetId:listing.photos[0].id,sourceSha256:listing.photos[0].contentHash,provider:'runway',model:'gen4_turbo',asset:clip}),at,at).run();
  const report=videoReport(sha(new TextEncoder().encode(label)),fixture.manifest,bytes);
  await bucket.put(key,bytes,{customMetadata:{sha256:report.sha256}});
  await db.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)').bind(job.jobId,key,JSON.stringify(report),at).run();
  const manifest={...fixture.manifest,agencyId,jobId:job.jobId,listingId:listing.id,photos:listing.photos.map(p=>({id:p.id,objectKey:p.objectKey,mime:p.mime,sha256:p.contentHash,sizeBytes:p.sizeBytes,width:p.width,height:p.height}))};
  await db.prepare("INSERT INTO video_manifests VALUES(?,?,1,?,?,'[]','prepared',?,?)").bind(job.jobId,agencyId,report.manifestHash,JSON.stringify(manifest),at,new Date(Date.now()+86400_000).toISOString()).run();
  const library={...clip,id:label+'-saved',objectKey:`agencies/${agencyId}/imports/animation-library/${sha(bytes)}.mp4`};await bucket.put(library.objectKey,bytes,{customMetadata:{sha256:sha(bytes)}});
  await db.prepare("INSERT INTO animation_library(id,agency_id,source_sha256,aspect_ratio,model,mode,origin_job_id,asset_json,created_at,expires_at) VALUES(?,?,?,'9:16','gen4_turbo','mock',?,?,?,?)").bind(library.id,agencyId,listing.photos[0].contentHash,job.jobId,JSON.stringify(library),at,new Date(Date.now()+86400_000).toISOString()).run();
  await db.prepare("UPDATE jobs SET status='ready',lease_until=NULL WHERE id=?").bind(job.jobId).run();return {agencyId,jobId:job.jobId,key,clip,library,listing};
 }
 const first=await seed('home-one'),second=await seed('home-two');
 const assign=(slot:string,source:{kind:string;id:string}|null,requestId=crypto.randomUUID(),revision?:number)=>homepageSettings(db).then(state=>changeHomepage(env,users[0].id,{action:'assign',revision:revision??state.revision,slot,source,requestId}));
 const publish=()=>homepageSettings(db).then(state=>changeHomepage(env,users[0].id,{action:'publish',revision:state.revision}));
 let selected:HomepageAdmin;
 await t.test('toutes les sources et mutations exigent le super admin et l’origine attendue',async()=>{
  for(const [cookie,status] of [['',401],[cookies[1],403],[cookies[2],401]] as const){
   for(const response of [await adminHomepageRequest(req('/api/admin/homepage',cookie),env),await adminHomepageRequest(req('/api/admin/homepage?section=library',cookie),env),await adminHomepageSourceRequest(req('/api/admin/homepage/sources/photo/'+first.listing.photos[0].id,cookie),env,'photo',first.listing.photos[0].id),await homepageMediaRequest(req('/api/admin/homepage/assets/missing',cookie),env,'missing',env)])assert.equal(response.status,status);
   const mutation=await adminHomepageRequest(req('/api/admin/homepage',cookie,{method:'POST',headers:{origin:env.BETTER_AUTH_URL,'Content-Type':'application/json'},body:JSON.stringify({action:'publish',revision:0})}),env);assert.equal(mutation.status,status);
  }
  assert.equal((await adminHomepageRequest(req('/api/admin/homepage',cookies[0],{method:'POST',headers:{origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify({action:'publish',revision:0})}),env)).status,403);
  assert.equal((await adminHomepageRequest(req('/api/admin/homepage?unknown=1'),env)).status,422);
  assert.deepEqual(await readHomepageConfig(db),{version:0,slots:{}});
 });
 await t.test('photos, exports, plans IA et plans conservés de plusieurs agences sans divulguer leurs clés',async()=>{
  const page=await readHomepageLibrary(env,{kind:'all',q:''});assert.equal(page.total,12);assert.equal(page.items.length,12);assert.ok(page.items.every(p=>p.available));
  assert.deepEqual([...new Set(page.items.map(p=>p.source.kind))].sort(),['animation','library','photo','video']);assert.ok(page.items.some(p=>p.source.id===second.jobId));
  assert.ok(!JSON.stringify(page).includes('agencies/'));assert.ok(!JSON.stringify(page).includes('objectKey'));
  assert.equal((await readHomepageLibrary(env,{kind:'animation',q:''})).total,4);assert.equal((await readHomepageLibrary(env,{kind:'all',agency:first.agencyId,q:''})).total,6);
  const missing=first.listing.photos[2];await bucket.delete(missing.objectKey);assert.equal((await readHomepageLibrary(env,{q:missing.id,kind:'photo'})).items[0].available,false);
  await assert.rejects(assign('life.photo',{kind:'photo',id:missing.id}),/NOT_FOUND/);
  const paging=await beginImport(db,second.agencyId,'https://fixtures.bienvu.example/vente','home-paging-key-001');
  for(let i=0;i<28;i++){const photo={...second.listing.photos[0],id:'page-photo-'+i,sourceOrder:i,listingId:paging.row.id,objectKey:`agencies/${second.agencyId}/imports/${paging.row.id}/page-${i}.png`};await db.prepare('INSERT INTO import_objects VALUES(?,?,?,?,?)').bind(photo.id,second.agencyId,paging.row.id,photo.objectKey,JSON.stringify(photo)).run();}
  const one=await homepageSources(db,{kind:'photo',q:'Démo'});assert.ok(one.nextCursor);const two=await homepageSources(db,{kind:'photo',q:'Démo',cursor:one.nextCursor!});assert.ok(two.rows.length);assert.equal(new Set([...one.rows,...two.rows].map(p=>p.id)).size,one.rows.length+two.rows.length);
  await assert.rejects(homepageSources(db,{kind:'video',q:'Démo',cursor:one.nextCursor!}),/HOMEPAGE_INVALID_CURSOR/);
  assert.equal((await homepageSources(db,{q:'%_'})).total,0,'La recherche ne traite pas les caractères de l’utilisateur comme des jokers SQL');
 });
 await t.test('copie en brouillon privée, idempotence, contraintes des emplacements et publication explicite',async()=>{
  const source={kind:'video',id:first.jobId},requestId=crypto.randomUUID(),revision=(await homepageSettings(db)).revision;
  await assert.rejects(assign('life.photo',source),/VALIDATION_ERROR/);selected=await assign('hero.video',source,requestId);
  assert.equal(selected.draft['hero.video'],requestId);assert.equal(selected.publishedVersion,0);assert.deepEqual(await readHomepageConfig(db),{version:0,slots:{}});
  const privateConfig=await readHomepageConfig(db,true);assert.ok(privateConfig.slots['hero.video']?.url.startsWith('/api/admin/'));assert.ok(privateConfig.slots['hero.video']?.posterUrl);
  assert.equal((await homepageMediaRequest(req('/api/homepage/media/'+requestId,''),env,requestId)).status,404);
  assert.equal((await homepageMediaRequest(req('/api/admin/homepage/assets/'+requestId),env,requestId,env)).status,200);
  assert.equal((await changeHomepage(env,users[0].id,{action:'assign',slot:'hero.video',source,requestId,revision})).revision,selected.revision,'Une réponse perdue ne crée pas de deuxième copie');
  await assert.rejects(assign('hero.video',{kind:'video',id:second.jobId},requestId,revision),/CONFLICT/);
  selected=await publish();const config=await readHomepageConfig(db);assert.equal(config.version,1);assert.ok(config.slots['hero.video']?.url.startsWith('/api/homepage/media/'));assert.ok(!JSON.stringify(config).includes('agencies/'));
  const publicVideo=await homepageMediaRequest(req('/api/homepage/media/'+requestId,''),env,requestId);assert.equal(publicVideo.status,200);assert.equal(publicVideo.headers.get('cache-control'),'public, max-age=60, must-revalidate');assert.deepEqual(new Uint8Array(await publicVideo.arrayBuffer()),bytes);
  for(const [range,expected] of [['bytes=2-4',[9,10,11]],['bytes=-2',[13,14]],['bytes=6-',[13,14]]] as const){const response=await homepageMediaRequest(req('/api/homepage/media/'+requestId,'',{headers:{range}}),env,requestId);assert.equal(response.status,206);assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],expected);}
  for(const range of ['bytes=-','bytes=9-4','bytes=99-','bytes=0-1,4-5','bytes=-0'])assert.equal((await homepageMediaRequest(req('/api/homepage/media/'+requestId,'',{headers:{range}}),env,requestId)).status,416);
  const head=await homepageMediaRequest(req('/api/homepage/media/'+requestId,'',{method:'HEAD'}),env,requestId);assert.equal(head.headers.get('content-length'),String(bytes.length));assert.equal(await head.text(),'');
  assert.equal((await homepageMediaRequest(req('/api/homepage/media/'+requestId,'',{headers:{'if-none-match':head.headers.get('etag')!}}),env,requestId)).status,304);
  const poster=await homepageMediaRequest(req('/api/homepage/media/'+requestId+'?poster=1',''),env,requestId);assert.equal(poster.status,200);assert.equal(poster.headers.get('content-type'),first.listing.photos[0].mime);
  const original=await adminHomepageSourceRequest(req('/api/admin/homepage/sources/animation/'+first.clip.id),env,'animation',first.clip.id);assert.equal(original.status,200);assert.equal(original.headers.get('cache-control'),'private, no-store');
 });
 await t.test('copies interrompues réparables, pas de publication partielle et conflits sans écrasement',async()=>{
  const before=await readHomepageAdmin(db),id=crypto.randomUUID(),command={action:'assign',slot:'discover.paris.video',source:{kind:'animation',id:second.clip.id},requestId:id,revision:before.revision};
  const broken={...env,MEDIA:{head:bucket.head.bind(bucket),get:bucket.get.bind(bucket),delete:bucket.delete.bind(bucket),put:async()=>{throw Error('SIMULATED_COPY_FAILURE');}}};
  await assert.rejects(changeHomepage(broken,users[0].id,command),/SIMULATED_COPY_FAILURE/);assert.equal((await homepageSettings(db)).revision,before.revision);assert.equal((await homepageAsset(db,id))?.state,'staging');
  assert.equal((await homepageMediaRequest(req('/api/homepage/media/'+id,''),env,id)).status,404);selected=await changeHomepage(env,users[0].id,command);assert.equal(selected.draft['discover.paris.video'],id);
  const row=(await homepageAsset(db,id))!;await bucket.delete(row.object_key);await assert.rejects(publish(),/NOT_FOUND/);assert.equal((await homepageSettings(db)).published_version,1);
  await bucket.put(row.object_key,bytes,{customMetadata:{sha256:sha(bytes)}});
  const revision=selected.revision;
  const writes=await Promise.allSettled([assign('life.video',{kind:'animation',id:first.clip.id},crypto.randomUUID(),revision),assign('share.site.video',{kind:'library',id:second.library.id},crypto.randomUUID(),revision)]);assert.equal(writes.filter(r=>r.status==='fulfilled').length,1);assert.ok(writes.find(r=>r.status==='rejected')?.status==='rejected');
  selected=await publish();assert.equal(selected.publishedVersion,2);
 });
 await t.test('fichiers publiés conservés après retrait des originaux, rétablissement et purge limités aux copies inutilisées',async()=>{
  const live=(await readHomepageConfig(db)).slots['hero.video']!;await bucket.delete(first.key);await bucket.delete(first.listing.photos[0].objectKey);
  assert.equal((await homepageMediaRequest(req(live.url,''),env,live.id)).status,200);assert.equal((await homepageMediaRequest(req(live.posterUrl!,''),env,live.id)).status,200);
  await assert.rejects(db.prepare("DELETE FROM homepage_assets WHERE id=?").bind(live.id).run(),/HOMEPAGE_ASSET_IN_USE/);
  await assert.rejects(db.prepare("UPDATE homepage_assets SET state='deleting' WHERE id=?").bind(live.id).run(),/HOMEPAGE_ASSET_IN_USE/);
  const reset=await assign('hero.video',null);assert.equal(reset.draft['hero.video'],null);assert.ok((await readHomepageConfig(db)).slots['hero.video']);
  selected=await changeHomepage(env,users[0].id,{action:'discard',revision:reset.revision});assert.equal(selected.draft['hero.video'],live.id);
  const unused=crypto.randomUUID();selected=await assign('life.photo',{kind:'photo',id:second.listing.photos[1].id},unused);selected=await assign('life.photo',null);await publish();
  assert.equal((await cleanupHomepageAssets(env)).removed,0);const result=await cleanupHomepageAssets(env,Date.now()+2*86400_000);assert.ok(result.removed>=1);assert.equal(await homepageAsset(db,unused),null);assert.ok(await homepageAsset(db,live.id));assert.ok(await bucket.head(second.key));
  assert.equal((await homepageMediaRequest(req(live.url,''),env,live.id)).status,200);assert.ok((await readHomepageAdmin(db)).history.length);
  await assert.rejects(db.prepare("UPDATE homepage_audit SET action='discard'").run(),/HOMEPAGE_AUDIT_IMMUTABLE/);
  await assert.rejects(db.prepare('DELETE FROM homepage_audit').run(),/HOMEPAGE_AUDIT_IMMUTABLE/);
  await assign('hero.video',null);await publish();assert.equal((await homepageMediaRequest(req(live.url,''),env,live.id)).status,404,'Une sélection retirée n’est plus lisible publiquement');
  assert.equal(homepageSlots.length,24);
 });
});
