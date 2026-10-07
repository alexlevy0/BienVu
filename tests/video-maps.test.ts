import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {MapLocation,VideoCustomization,GenerationCustomization,VideoManifest,videoAssets,videoManifestHash,videoPhotoTimeline,
  defaultVideoCustomization,mapPlaneGeometry,mapInk,mapPublicLocation,mapFrame,mapInterval,mapZoomScale,
  createEditorDocument,editorClipStarts,editorActiveClip,editorSourceFrame,splitEditorClip,resizeEditorVisualClip,EditorDocument,MapBuildings,mapBuildingCamera,mapCredits,
  mapDefaultZooms,mapRasterLevels,mapZoomAt,mapRasterScale,mapRasterOpacity,type VideoMap} from '../packages/contracts/src/index';
import {geocodeMap,fetchMapPlate,fetchMapBuildings,prepareMapImage,findMapImage,limitMapRequest,mapRateLimit,mapHash,MapFailure} from '../packages/maps/src/index';
import {videoFixture} from '../fixtures/video';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {findImport,admitGeneration} from '../packages/db/src/index';
import {prepareJobNarration} from '../apps/pipeline/src/narration';
import {prepareJobVideo} from '../apps/pipeline/src/video-manifest';
import {GoogleVoiceConfig} from '../packages/contracts/src/index';
import {googleTts} from '../packages/voice/src/index';
import {toneFixture} from '../fixtures/voice';
import {DEFAULT_SCRIPT_MODEL} from '../packages/narration/src/index';

const location=MapLocation.parse({latitude:45.772489,longitude:4.855804,label:'Lyon 6e Arrondissement',precision:'approximate',sourceType:'municipality'});
const map:VideoMap={position:'start',durationSeconds:4,location};
const png=async(width=2160,height=3840)=>new Uint8Array(await sharp({create:{width,height,channels:3,background:'#e0ebdd'}}).png().toBuffer());
async function environment(t:{after(fn:()=>Promise<void>):void}){
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("maps")}}',compatibilityDate:'2026-10-01',d1Databases:['DB'],r2Buckets:['MEDIA']}));
  t.after(()=>mf.dispose());const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();
  for(const file of ['0049_video_maps.sql','0050_map_buildings.sql'])await env.DB.exec((await readFile(new URL('../packages/db/migrations/'+file,import.meta.url),'utf8')).replace(/\n/g,' '));return env;
}
test('carte facultative : ancienne personnalisation inchangée et confirmation obligatoire à la génération',()=>{
  const settings=defaultVideoCustomization();assert.equal('map' in settings,false);
  assert.deepEqual(VideoCustomization.parse(settings),settings);assert.ok(GenerationCustomization.safeParse(settings).success);
  assert.ok(VideoCustomization.safeParse({...settings,map:{...map,location:null}}).success);
  assert.equal(GenerationCustomization.safeParse({...settings,map:{...map,location:null}}).success,false);
  assert.ok(GenerationCustomization.safeParse({...settings,map}).success);
  for(const bad of [{...map,durationSeconds:6},{...map,position:'middle'},{...map,location:{...location,precision:'exact'}},{...map,location:{...location,label:'<img>'}},
    {...map,location:{...location,latitude:Infinity}},{...map,location:{...location,longitude:181}},{...map,url:'https://attacker.invalid'}])
    assert.equal(VideoCustomization.safeParse({...settings,map:bad}).success,false);
});
test('localisation approximative : coordonnées arrondies avant les requêtes, adresse précise seulement après confirmation',()=>{
  const rounded=mapPublicLocation(location);assert.equal(rounded.latitude,45.772);assert.equal(rounded.longitude,4.856);
  const exact={...location,precision:'exact' as const,sourceType:'housenumber' as const};assert.deepEqual(mapPublicLocation(exact),exact);
  assert.equal(mapPublicLocation({...location,sourceType:'housenumber',label:'12 bis Rue Cuvier 69006 Lyon'}).label,'Rue Cuvier 69006 Lyon');
  for(const ratio of ['9:16','16:9'] as const){const g=mapPlaneGeometry(location,ratio);assert.equal(g.location.latitude,rounded.latitude);
    assert.equal(g.width*g.height,2160*3840);assert.ok(g.bounds[0]<rounded.longitude&&g.bounds[2]>rounded.longitude);
    assert.ok(g.bounds[1]<rounded.latitude&&g.bounds[3]>rounded.latitude);}
});
test('carte et photos couvrent exactement les 20/30/40 secondes, chaque image reste présente même avec les animations',()=>{
  for(const seconds of [20,30,40])for(const durationSeconds of [3,4,5])for(const position of ['start','end'] as const)for(const count of [3,8,12]){
    const settings={...map,position,durationSeconds},total=seconds*30,range=mapInterval(settings,total),photos=Array.from({length:count},(_,i)=>({id:`p-${i}`}));
    for(const animated of [[],photos.slice(0,2).map(p=>p.id),photos.map(p=>p.id)]){
      const clips=videoPhotoTimeline(photos,total,animated,range.durationFrames);assert.deepEqual(clips.map(c=>c.photoAssetId),photos.map(p=>p.id));
      assert.equal(clips.reduce((sum,c)=>sum+c.durationFrames,0)+range.durationFrames,total);assert.ok(clips.every(c=>c.durationFrames>=30));}
    assert.equal(Array.from({length:total},(_,f)=>mapFrame(settings,total,f)).filter(v=>v!==null).length,durationSeconds*30);
  }
});
test('zoom déterministe : mêmes frames dans l’aperçu et l’export, sans dépassement du fond préparé',()=>{
  assert.equal(mapZoomScale(0,120),.52);assert.equal(mapZoomScale(119,120),1);
  assert.ok(Array.from({length:120},(_,i)=>mapZoomScale(i,120)).every((v,i,a)=>v>=.52&&v<=1&&(!i||v>=a[i-1])));
});
test('zooms réglables : départ et arrivée exacts, dézoom et vue fixe, bornes et couverture des deux formats',()=>{
  assert.ok(mapDefaultZooms('buildings-3d').zoomStart<17.1);
  for(const view of ['plan','satellite','buildings-3d'] as const)for(const [zoomStart,zoomEnd] of [[12,18],[18,12],[15.25,15.25]]){
    const settings={...map,view,zoomStart,zoomEnd};assert.ok(VideoCustomization.safeParse({...defaultVideoCustomization(),map:settings}).success);
    assert.equal(mapZoomAt(settings,0,120),zoomStart);assert.equal(mapZoomAt(settings,119,120),zoomEnd);
    const levels=mapRasterLevels(settings);assert.ok(levels.length<=7);assert.equal(levels[0],Math.floor(Math.min(zoomStart,zoomEnd)));
    if(view==='buildings-3d'){assert.equal(mapBuildingCamera(location,0,120,settings).zoom,zoomStart);assert.equal(mapBuildingCamera(location,119,120,settings).zoom,zoomEnd);}
    else for(let frame=0;frame<120;frame++){
      const zoom=mapZoomAt(settings,frame,120),visible=levels.filter((z,i)=>i===0||mapRasterOpacity(view,zoom,z)>0);
      for(const z of visible){assert.ok(mapRasterScale(settings,frame,z)>=.5);for(const ratio of ['9:16','16:9'] as const){
        const wide=mapPlaneGeometry(location,ratio,view,levels[0]),near=mapPlaneGeometry(location,ratio,view,z);assert.ok(near.box[2]-near.box[0]<=wide.box[2]-wide.box[0]);}}
    }
  }
  for(const value of [11.9,18.1,Infinity,NaN,'15'])for(const field of ['zoomStart','zoomEnd'])assert.equal(VideoCustomization.safeParse({...defaultVideoCustomization(),map:{...map,[field]:value}}).success,false);
});
test('éditeur : les plans se réorganisent autour de la carte, scission et redimensionnement respectent la voix intacte',()=>{
  const doc=createEditorDocument([{sourceOrder:0},{sourceOrder:1},{sourceOrder:2}],{title:'La visite'}, {durationSeconds:20});
  for(const position of ['start','end'] as const){const settings={...map,position},starts=editorClipStarts(doc,settings),range=mapInterval(settings,600);
    assert.equal(starts[0].startFrame,range.photoStartFrame);assert.equal(starts.at(-1)!.startFrame+starts.at(-1)!.durationFrames,range.photoStartFrame+480);
    assert.equal(editorActiveClip(doc,range.startFrame,settings),undefined);assert.equal(editorSourceFrame(doc,range.startFrame,settings),null);
    const at=starts[0].startFrame+50,sourceAt=editorSourceFrame(doc,at,settings)!;
    const split=splitEditorClip(doc,starts[0].id,sourceAt,'split-map');assert.equal(split.clips.length,4);assert.equal(split.durationSeconds,20);
    assert.ok(EditorDocument.safeParse(resizeEditorVisualClip(doc,starts[0].id,180,settings)).success);
    assert.ok(editorClipStarts(split,settings).every(c=>c.durationFrames>=15));assert.equal(split.voiceEnabled,doc.voiceEnabled);}
});
test('manifeste de carte : fond privé figé, narration conservée, aucun champ par défaut ajouté aux anciennes vidéos',async()=>{
  const {manifest:m}=await videoFixture('paid',4),hash=await videoManifestHash(m),total=m.scenes.reduce((n,s)=>n+s.durationFrames,0);
  const asset={id:'map-fixture',mime:'image/png' as const,width:2160,height:3840,sizeBytes:100,sha256:'d'.repeat(64),objectKey:`agencies/${m.agencyId}/jobs/${m.jobId}/map/fixture.png`};
  const value=VideoManifest.parse({...m,map:{settings:map,asset,capturedAt:'2026-10-06T00:00:00.000Z'},photoTimeline:videoPhotoTimeline(m.photos,total,[],120)});
  assert.deepEqual(value.scenes,m.scenes);assert.deepEqual(value.audio,m.audio);assert.ok(videoAssets(value).some(a=>a.id===asset.id));
  assert.equal(await videoManifestHash(m),hash);assert.equal('map' in VideoManifest.parse(m),false);
  for(const invalid of [{...value,map:{...value.map,asset:{...asset,objectKey:'agencies/other/jobs/job/map.png'}}},
    {...value,map:{...value.map,asset:{...asset,width:1080}}},{...value,photoTimeline:m.photoTimeline}])assert.equal(VideoManifest.safeParse(invalid).success,false);
});
test('géocodage : endpoint IGN fixe, résultats validés, pas de redirection ni de résultat incohérent',async()=>{
  let calls=0;const candidates=await geocodeMap('Lyon 6e',async(url,init)=>{calls++;assert.equal(new URL(String(url)).origin,'https://data.geopf.fr');assert.equal(init?.redirect,'manual');
    return Response.json({features:[{geometry:{type:'Point',coordinates:[4.85,45.77]},properties:{label:'Lyon 6e',type:'municipality'}},
      {geometry:{type:'Point',coordinates:[4.85,45.77]},properties:{label:'12 rue Cuvier 69006 Lyon',type:'housenumber'}},
      {geometry:{type:'Point',coordinates:[999,999]},properties:{label:'Invalide',type:'municipality'}}]});});
  assert.equal(calls,1);assert.equal(candidates.length,2);assert.equal(candidates[0].precision,'approximate');assert.equal(candidates[1].precision,'exact');
  await assert.rejects(geocodeMap('Lyon',async()=>new Response('no',{status:503})),MapFailure);
  await assert.rejects(geocodeMap('Lyon',async()=>Response.json({not:'GeoJSON'})),MapFailure);
  await assert.rejects(geocodeMap('Lyon',async()=>new Response(null,{status:302,headers:{Location:'https://attacker.invalid/'}})),MapFailure);
});
test('fond raster : bonnes dimensions, URL serveur fixe et rejet des faux PNG ou des réponses excessives',async()=>{
  const bytes=await png();let calls=0;
  const result=await fetchMapPlate(location,'9:16',async(url,init)=>{calls++;const u=new URL(String(url));assert.equal(u.host,'data.geopf.fr');assert.equal(u.searchParams.get('WIDTH'),'2160');
    assert.equal(u.searchParams.get('HEIGHT'),'3840');assert.equal(u.searchParams.get('CRS'),'EPSG:3857');assert.equal(init?.redirect,'manual');return new Response(bytes,{headers:{'Content-Type':'image/png'}});});
  assert.equal(calls,1);assert.deepEqual(result.bytes,bytes);
  for(const response of [new Response('<xml/>',{headers:{'Content-Type':'image/png'}}),new Response(bytes,{headers:{'Content-Type':'image/png','Content-Length':'9000000'}}),
    new Response(bytes,{headers:{'Content-Type':'text/html'}}),new Response(await png(64,64),{headers:{'Content-Type':'image/png'}})])
    await assert.rejects(fetchMapPlate(location,'9:16',async()=>response),MapFailure);
});
test('satellite : photographies aériennes IGN, échelles distinctes et attribution conservée',async()=>{
  const bytes=await png(),boxes:string[]=[];
  for(const zoom of [12,18])await fetchMapPlate(location,'9:16',async url=>{const u=new URL(String(url));assert.equal(u.origin,'https://data.geopf.fr');
    assert.equal(u.searchParams.get('LAYERS'),'ORTHOIMAGERY.ORTHOPHOTOS');boxes.push(u.searchParams.get('BBOX')!);return new Response(bytes,{headers:{'Content-Type':'image/png'}});},'satellite',zoom);
  assert.notEqual(boxes[0],boxes[1]);assert.match(mapCredits('2026-10-06T00:00:00Z','satellite'),/BD ORTHO.*photographies aériennes.*bdortho/);
});
test('cache multi-échelles : deux points précis réutilisent les fonds existants, styles isolés et bâtiments téléchargés une fois',async t=>{
  const env=await environment(t),bytes=await png();let raster=0,buildings=0;
  const transport:typeof fetch=async url=>{if(new URL(String(url)).pathname==='/wfs/ows'){buildings++;return Response.json(rawBuildings);}raster++;return new Response(bytes,{headers:{'Content-Type':'image/png'}});};
  const three=await prepareMapImage(env,location,'9:16',transport,'buildings-3d',{zoomStart:15.5,zoomEnd:17.25});
  assert.equal(raster,3);assert.equal(buildings,1);assert.deepEqual(three.info.details?.map(d=>d.zoom),[16,17]);
  const again=await prepareMapImage(env,location,'9:16',async()=>{throw Error('MUST_REUSE');},'buildings-3d',{zoomStart:15.75,zoomEnd:17.75});assert.deepEqual(again,three);
  const sat=await prepareMapImage(env,location,'9:16',transport,'satellite',{zoomStart:15,zoomEnd:17});assert.equal(raster,6);assert.equal(buildings,1);assert.notEqual(sat.info.id,three.info.id);
  const zoomOut=await prepareMapImage(env,location,'9:16',async()=>{throw Error('MUST_REUSE');},'satellite',{zoomStart:17,zoomEnd:15});assert.deepEqual(zoomOut,sat);
  assert.equal('zoomStart' in sat.info,false);assert.equal('location' in sat.info,false);
});
test('cache D1/R2 : un seul téléchargement concurrent, réutilisation immuable et absence de données client dans le fond partagé',async t=>{
  const env=await environment(t),bytes=await png();let calls=0;
  const transport:typeof fetch=async()=>{calls++;await new Promise(r=>setTimeout(r,100));return new Response(bytes,{headers:{'Content-Type':'image/png'}});};
  const results=await Promise.all([1,2,3].map(()=>prepareMapImage(env,location,'9:16',transport)));assert.equal(calls,1);assert.deepEqual(results[0],results[2]);
  const cached=await prepareMapImage(env,{...location,label:'Une autre agence'},'9:16',async()=>{throw Error('MUST_REUSE');});assert.deepEqual(cached,results[0]);
  assert.ok(cached.objectKey.startsWith('maps/ign-plan-v1/'));assert.equal(cached.sha256,await mapHash(bytes));
  const row=await findMapImage(env.DB,cached.info.id);assert.equal(row?.state,'ready');assert.equal((await env.MEDIA.get(cached.objectKey))?.size,bytes.length);
  assert.equal(await findMapImage(env.DB,'not-a-key'),null);
});
test('échec de carte : aucun fond de remplacement silencieux et aucun cache déclaré prêt',async t=>{
  const env=await environment(t);await assert.rejects(prepareMapImage(env,location,'9:16',async()=>new Response('down',{status:503})),/MAP_UNAVAILABLE/);
  assert.equal((await env.DB.prepare('SELECT state FROM map_images').first<{state:string}>())?.state,'failed');
});
test('quotas de carte indépendants des imports et crédits, limites atomiques et nouvelle fenêtre rétablie',async t=>{
  const env=await environment(t),now=Date.now();
  for(let i=0;i<12;i++)await limitMapRequest(env.DB,'visitor-fixture',now);
  await assert.rejects(limitMapRequest(env.DB,'visitor-fixture',now),/MAP_RATE_LIMIT/);await limitMapRequest(env.DB,'visitor-fixture',now+60000);
  const replies=await Promise.allSettled(Array.from({length:5},()=>mapRateLimit(env.DB,'atomic',2,now+60000)));
  assert.equal(replies.filter(r=>r.status==='fulfilled').length,2);
});


for(const view of ['legacy','satellite','buildings-3d'] as const)test(`pipeline ${view} : fonds privés, voix intégrale et réexport figé sans téléchargement`,async t=>{
  const settingsMap:VideoMap=view==='legacy'?map:{...map,view,zoomStart:15.5,zoomEnd:17.25};
  const env=await environment(t);await env.DB.exec('DROP TABLE map_images; DROP TABLE map_request_limits;');await migrateNarrationProbe(env.DB);
  const seeded=await seedNarrationFixture(env.DB,'map-export',true),{agencyId}=seeded;
  await env.DB.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id=?").bind(seeded.jobId).run();
  await env.DB.prepare('INSERT INTO hosted_import_budget(month,baseline_cents,ceiling_cents,paused) VALUES(?,0,9500,0)').bind(new Date().toISOString().slice(0,7)).run();
  await env.DB.exec('UPDATE generation_control SET enabled=1');
  await env.DB.prepare('INSERT INTO generation_access(agency_id,allocation_id,enabled) VALUES(?,?,1)').bind(agencyId,'allocation-map-export').run();
  const listing=JSON.parse((await findImport(env.DB,agencyId,'listing-map-export'))!.result!),fixture=await videoFixture('paid');
  for(let i=0;i<listing.photos.length;i++){const photo=listing.photos[i],asset=fixture.manifest.photos[i];Object.assign(photo,{contentHash:asset.sha256,sizeBytes:asset.sizeBytes,width:asset.width,height:asset.height});await env.MEDIA.put(photo.objectKey,fixture.files.get(asset.id)!);}
  await env.DB.prepare('UPDATE listing_imports SET result_json=? WHERE id=?').bind(JSON.stringify(listing),listing.id).run();
  const settings={...defaultVideoCustomization(),map:settingsMap,voice:'fr-FR-Chirp3-HD-Kore' as const,photoOrder:[0,1,2],narration:[
    'Découvrez cet appartement à Lyon, à vendre.','Une nouvelle adresse à découvrir en images.','Prenons le temps de parcourir les lieux.','Pour en savoir plus, contactez votre agence.']};
  const row=await admitGeneration(env.DB,agencyId,'map-generation-key-001',{listingId:listing.id,customization:settings,durationSeconds:20},'true');
  await env.DB.prepare("UPDATE jobs SET status='scripting',stage='scripting',listing_id=? WHERE id=?").bind(listing.id,row.jobId).run();
  const config=GoogleVoiceConfig.parse({projectId:'fixture-map',voice:settings.voice});let calls=0;
  const voice=googleTts(config,async()=> 'fixture-token-never-networked',{fetch:async()=>{calls++;return Response.json({audioContent:Buffer.from(toneFixture(4900)).toString('base64')});}});
  const narration=await prepareJobNarration(env,agencyId,row.jobId,{mode:'mock',script:{model:DEFAULT_SCRIPT_MODEL,plan:async():Promise<never>=>{throw Error('NO_SCRIPT_CALL');}},voice:{config,synthesize:voice.synthesize}});
  const bytes=await png(),plate=await prepareMapImage(env,location,'9:16',async url=>new URL(String(url)).pathname==='/wfs/ows'?Response.json(rawBuildings):new Response(bytes,{headers:{'Content-Type':'image/png'}}),settingsMap.view,{zoomStart:settingsMap.zoomStart,zoomEnd:settingsMap.zoomEnd});
  const frozen=await prepareJobVideo(env,agencyId,row.jobId);assert.equal(frozen.state,'prepared');assert.equal(calls,4);
  assert.deepEqual(frozen.manifest.scenes.map(s=>s.narrationText),settings.narration);
  assert.equal(frozen.manifest.scenes.reduce((n,s)=>n+s.durationFrames,0),600);assert.equal(frozen.manifest.photoTimeline!.reduce((n,c)=>n+c.durationFrames,0),480);
  assert.equal(frozen.manifest.map!.settings.location.latitude,45.772);assert.equal(frozen.manifest.map!.asset.sha256,plate.sha256);
  assert.ok(frozen.manifest.map!.asset.objectKey.startsWith(`agencies/${agencyId}/jobs/${row.jobId}/map/`));
  assert.equal(await mapHash(new Uint8Array(await (await env.MEDIA.get(frozen.manifest.map!.asset.objectKey))!.arrayBuffer())),plate.sha256);
  if(view!=='legacy'){assert.equal(frozen.manifest.map!.rasterZoom,15);assert.equal(frozen.manifest.map!.settings.zoomEnd,17.25);assert.deepEqual(frozen.manifest.map!.details?.map(d=>d.zoom),[16,17]);
    for(const d of frozen.manifest.map!.details!){assert.ok(d.asset.objectKey.startsWith(`agencies/${agencyId}/jobs/${row.jobId}/map/`));assert.ok(await env.MEDIA.get(d.asset.objectKey));}
    assert.equal(VideoManifest.safeParse({...frozen.manifest,map:{...frozen.manifest.map,details:[]}}).success,false);
  }
  await env.MEDIA.delete(plate.objectKey);if('details' in plate)for(const d of plate.details)await env.MEDIA.delete(d.objectKey);assert.deepEqual(await prepareJobVideo(env,agencyId,row.jobId),frozen);
  assert.equal(narration.durationFrames.reduce((n,f)=>n+f,0),600);assert.equal(calls,4);
});


test('couleurs d’agence : textes et repère restent lisibles avec une couleur secondaire claire',()=>{
  assert.equal(mapInk('#183021','#ffffff'),'#183021');assert.equal(mapInk('#ffffff','#171714'),'#171714');assert.equal(mapInk('#ffffff','#eeeeee'),'#183021');
});
const rawBuildings={numberMatched:1,features:[{type:'Feature',properties:{hauteur:17.4,owner:'must-not-be-retained'},geometry:{type:'MultiPolygon',coordinates:[[[[4.855,45.772,100],[4.8555,45.772,100],[4.8555,45.7725,100],[4.855,45.772,100]]]]}}]};
test('bâtiments 3D : API fixe, emprises et hauteurs réelles, données supplémentaires supprimées et réponse bornée',async()=>{
  const value=await fetchMapBuildings(location,async(url,init)=>{
    const u=new URL(String(url));assert.equal(u.origin,'https://data.geopf.fr');assert.equal(u.pathname,'/wfs/ows');assert.equal(init?.redirect,'manual');
    assert.equal(u.searchParams.get('TYPENAMES'),'BDTOPO_V3:batiment');assert.equal(u.searchParams.get('PROPERTYNAME'),'geometrie,hauteur');return Response.json(rawBuildings);
  });
  assert.equal(value.data.features[0].properties.height,17.4);assert.deepEqual(value.data.features[0].geometry.coordinates[0][0][0],[4.855,45.772]);
  assert.equal(new TextDecoder().decode(value.bytes).includes('owner'),false);assert.ok(MapBuildings.safeParse(value.data).success);
  for(const response of [Response.json({...rawBuildings,numberMatched:2001}),new Response('{}',{headers:{'Content-Type':'application/json','Content-Length':'5000000'}}),
    Response.json({...rawBuildings,features:[{...rawBuildings.features[0],properties:{hauteur:900}}]}),new Response('redirect',{status:302,headers:{Location:'https://attacker.invalid'}})])
    await assert.rejects(fetchMapBuildings(location,async()=>response),MapFailure);
  assert.equal((await fetchMapBuildings(location,async()=>Response.json({...rawBuildings,features:[{...rawBuildings.features[0],properties:{hauteur:0}}]}))).data.features.length,0);
});
test('cache et manifeste 3D : copie privée de la géométrie, style conservé et ancien cache Plan inchangé',async t=>{
  const env=await environment(t),bytes=await png();let calls=0;
  const transport:typeof fetch=async url=>{calls++;return new URL(String(url)).pathname==='/wfs/ows'?Response.json(rawBuildings):new Response(bytes,{headers:{'Content-Type':'image/png'}});};
  const plain=await prepareMapImage(env,location,'9:16',transport),three=await prepareMapImage(env,location,'9:16',transport,'buildings-3d');
  assert.notEqual(three.info.id,plain.info.id);assert.equal(three.info.buildingCount,1);assert.ok(three.info.buildingsUrl?.endsWith('/buildings'));assert.equal(calls,3);
  assert.deepEqual(await prepareMapImage(env,location,'9:16',async()=>{throw Error('must reuse');},'buildings-3d'),three);
  assert.equal((await env.MEDIA.get(three.buildings!.objectKey))?.size,three.buildings!.sizeBytes);
  const {manifest:m}=await videoFixture('paid',4),total=m.scenes.reduce((n,s)=>n+s.durationFrames,0),prefix=`agencies/${m.agencyId}/jobs/${m.jobId}/map/`,
    asset={id:'plate-3d',objectKey:prefix+'plate.png',mime:'image/png' as const,sha256:'a'.repeat(64),sizeBytes:100,width:2160,height:3840},
    buildings={id:'buildings-3d',mime:'application/json' as const,...three.buildings!,objectKey:prefix+'buildings.json'};
  const manifest=VideoManifest.parse({...m,map:{settings:{...map,view:'buildings-3d'},asset,buildings,capturedAt:'2026-10-06T00:00:00.000Z'},photoTimeline:videoPhotoTimeline(m.photos,total,[],120)});
  assert.ok(videoAssets(manifest).some(a=>a.id==='buildings-3d'));assert.deepEqual(manifest.audio,m.audio);
  assert.equal(VideoManifest.safeParse({...manifest,map:{...manifest.map,buildings:undefined}}).success,false);
  assert.equal(VideoManifest.safeParse({...manifest,map:{...manifest.map,buildings:{...buildings,objectKey:'agencies/other/jobs/wrong/map.json'}}}).success,false);
  const first=mapBuildingCamera(location,0,120),last=mapBuildingCamera(location,119,120);assert.ok(first.zoom<last.zoom);assert.equal(last.pitch,52);assert.deepEqual(last.center,[location.longitude,location.latitude]);
  assert.ok(mapCredits(manifest.map!.capturedAt,'buildings-3d').includes('BD TOPO'));assert.equal(defaultVideoCustomization().map,undefined);
});
