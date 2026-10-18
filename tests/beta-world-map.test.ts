import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {admitGeneration} from '../packages/db/src/index';
import {VideoManifest,videoManifestHash,videoPhotoTimeline} from '../packages/contracts/src/index';
import {videoFixture,videoReport} from '../fixtures/video';
import {readBetaWorldMap,betaWorldVideo} from '../apps/web/lib/beta-world-map';
import {changeHomepage} from '../apps/web/lib/homepage-media';
import {groupWorldLocations,worldClusters} from '../apps/web/lib/world-map-view';

test('carte monde : coordonnées arrondies, données invalides écartées et groupes cohérents au zoom',()=>{
 const places=groupWorldLocations([
  {jobId:'one',locality:'Paris',latitude:48.85663,longitude:2.35221},
  {jobId:'two',locality:'Paris',latitude:48.85672,longitude:2.35226},
  {jobId:'three',locality:'Lyon',latitude:45.764,longitude:4.8357},
  {jobId:'four',locality:'Le François',latitude:14.61,longitude:-60.90},
  {jobId:'bad',locality:'Invalid',latitude:NaN,longitude:2},
 ]);
 assert.equal(places.length,3);assert.equal(places[0].count,2);assert.equal(places[0].latitude,48.9);assert.equal(places[0].longitude,2.4);
 assert.equal(worldClusters(places,0).reduce((n,c)=>n+c.count,0),4);
 assert.equal(worldClusters(places,7).length,3);assert.ok(worldClusters(places,0).some(c=>c.places.length>1));
 assert.ok(worldClusters(places,0).every(c=>!worldClusters(places,3).some(other=>other.id===c.id)),'Les écouteurs ne réutilisent pas un ancien cluster après le zoom');
});

test('carte publique : accord du propriétaire, publication existante, révocation, range et absence de fuite des clés',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-10-01',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
 const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>(),db=env.DB;await migrateNarrationProbe(db);
 const owner='world-map-owner',now=Date.now(),at=new Date(now).toISOString();
 await db.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,?,?,?)').bind(owner,'Owner','world@example.test',1,now,now).run();
 await db.exec('UPDATE generation_control SET enabled=1');await db.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9500,0)').bind(at.slice(0,7)).run();
 const {agencyId,jobId:seed}=await seedNarrationFixture(db,'world-map',true);
 await db.prepare('UPDATE agencies SET owner_user_id=? WHERE id=?').bind(owner,agencyId).run();
 await db.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id=?").bind(seed).run();
 await db.prepare("UPDATE allocations SET kind='paid',quota_limit=30 WHERE agency_id=?").bind(agencyId).run();
 await db.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(agencyId,'allocation-world-map').run();
 const job=await admitGeneration(db,agencyId,'beta-world-generation',{listingId:'listing-world-map'},'true');
 const {manifest:original,files}=await videoFixture('paid',4),m=JSON.parse(JSON.stringify(original).replaceAll(`agencies/${original.agencyId}/jobs/${original.jobId}/`,`agencies/${agencyId}/jobs/${job.jobId}/`));
 Object.assign(m,{agencyId,jobId:job.jobId,listingId:'listing-world-map'});
 m.brand.id=agencyId;
 const total=m.scenes.reduce((n:number,s:{durationFrames:number})=>n+s.durationFrames,0);
 const manifest=VideoManifest.parse({...m,presentation:{...m.presentation,locality:'Paris'},map:{settings:{position:'start',durationSeconds:4,location:{latitude:48.85663,longitude:2.35221,label:'Adresse précise privée',precision:'exact',sourceType:'manual'}},asset:{id:'map-fixture',mime:'image/png',width:2160,height:3840,sizeBytes:100,sha256:'d'.repeat(64),objectKey:`agencies/${agencyId}/jobs/${job.jobId}/map/fixture.png`},capturedAt:at},photoTimeline:videoPhotoTimeline(m.photos,total,[],120)});
 const bytes=new Uint8Array([7,8,9,10,11,12,13,14]),hash=await videoManifestHash(manifest),report=videoReport(hash,manifest,bytes),key=`agencies/${agencyId}/jobs/${job.jobId}/video/master.mp4`;
 await env.MEDIA.put(key,bytes,{customMetadata:{sha256:report.sha256}});
 await env.MEDIA.put(manifest.photos[0].objectKey,files.get(manifest.photos[0].id)!);
 await db.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)').bind(job.jobId,key,JSON.stringify(report),at).run();
 await db.prepare("INSERT INTO video_manifests VALUES(?,?,1,?,?,'[]','prepared',?,?)").bind(job.jobId,agencyId,hash,JSON.stringify(manifest),at,new Date(now+86400000).toISOString()).run();
 await db.prepare("UPDATE jobs SET status='ready',lease_until=NULL WHERE id=?").bind(job.jobId).run();
 await db.prepare("UPDATE reservations SET status='consumed' WHERE job_id=?").bind(job.jobId).run();
 let data=await readBetaWorldMap(env);assert.equal(data.videoCount,1);assert.equal(data.places[0].videos.length,0);
 assert.doesNotMatch(JSON.stringify(data),/Adresse précise|agencies\/|48\.85663|owner_agency|objectKey/);
 const request=(suffix='',method='GET')=>new Request(`https://bienvu.online/api/beta/world/videos/${job.jobId}${suffix}`,{method});
 await assert.rejects(betaWorldVideo(request(),env,job.jobId),/NOT_FOUND/);
 await db.prepare('INSERT INTO beta_world_map_contributors VALUES(?,?,1,?)').bind(agencyId,owner,at).run();
 data=await readBetaWorldMap(env);assert.equal(data.places[0].videos.length,1);assert.equal(data.places[0].videos[0].title,'Un bien à Paris');
 const range=await betaWorldVideo(new Request(request().url,{headers:{Range:'bytes=0-3'}}),env,job.jobId);
 assert.equal(range.status,206);assert.deepEqual(new Uint8Array(await range.arrayBuffer()),bytes.slice(0,4));
 const poster=await betaWorldVideo(request('?poster=1','HEAD'),env,job.jobId);assert.equal(poster.status,200);assert.equal(poster.headers.get('Content-Type'),'image/png');
 await db.prepare('UPDATE beta_world_map_contributors SET enabled=0 WHERE agency_id=?').bind(agencyId).run();
 assert.equal((await readBetaWorldMap(env)).places[0].videos.length,0);await assert.rejects(betaWorldVideo(request(),env,job.jobId),/NOT_FOUND/);
 const assigned=await changeHomepage(env,owner,{action:'assign',revision:0,slot:'hero.video',source:{kind:'video',id:job.jobId},requestId:crypto.randomUUID()});
 await changeHomepage(env,owner,{action:'publish',revision:assigned.revision});
 data=await readBetaWorldMap(env);assert.equal(data.places[0].videos.length,1);assert.match(data.places[0].videos[0].url,/^\/api\/homepage\/media\//);
 await db.prepare('UPDATE beta_world_map_contributors SET enabled=1 WHERE agency_id=?').bind(agencyId).run();
 assert.equal((await readBetaWorldMap(env)).places[0].videos.length,1,'Une vidéo publique est prioritaire sur la copie du contributeur');
 await env.MEDIA.delete(key);
 await assert.rejects(betaWorldVideo(request(),env,job.jobId),/NOT_FOUND/);
});
