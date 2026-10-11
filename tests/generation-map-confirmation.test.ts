import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import sharp from 'sharp';
import {admitGeneration,findGeneration,generationView,confirmGenerationMap,findGenerationMapConfirmation,expireGenerationMapConfirmation,setGenerationPreparation,failGeneration} from '../packages/db/src/index';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {prepareDefaultGenerationMap,MapConfirmationRequired} from '../apps/pipeline/src/default-video-map';
import {generationSteps,generationMapOmissionText} from '../apps/web/lib/generation-steps';

test('confirmation inline : attente sans dépense, choix figé et validé, isolation, concurrence, omission et expiration',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-10-01',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
  const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
  await env.DB.prepare('INSERT INTO hosted_import_budget(month,baseline_cents,ceiling_cents,paused) VALUES(?,0,9000,0)').bind(new Date().toISOString().slice(0,7)).run();
  await env.DB.exec('UPDATE generation_control SET enabled=1');
  const transport:typeof fetch=async raw=>{
    const url=new URL(String(raw));assert.equal(url.hostname,'data.geopf.fr');
    if(url.pathname.endsWith('/search'))return Response.json({features:[
      {geometry:{type:'Point',coordinates:[-1.15,46.16]},properties:{label:'La Rochelle',type:'municipality',postcode:'17000'}},
      {geometry:{type:'Point',coordinates:[5.73,47.76]},properties:{label:'La Rochelle',type:'municipality',postcode:'70120'}},
      {geometry:{type:'Point',coordinates:[5.73,47.76]},properties:{label:'La Rochelle',type:'municipality',postcode:'70120'}},
      {geometry:{type:'Point',coordinates:[5.74,47.76]},properties:{label:'Rue de La Rochelle',type:'street',postcode:'70120'}},
    ]});
    const bytes=await sharp({create:{width:Number(url.searchParams.get('WIDTH')),height:Number(url.searchParams.get('HEIGHT')),channels:3,background:'#aec0a4'}}).jpeg().toBuffer();
    return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'image/jpeg'}});
  };
  async function create(label:string){
    const scope=await seedNarrationFixture(env.DB,label,true);
    await env.DB.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id=?").bind(scope.jobId).run();
    await env.DB.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(scope.agencyId,`allocation-${label}`).run();
    const listingId=`listing-${label}`,result=await env.DB.prepare('SELECT result_json FROM listing_imports WHERE id=?').bind(listingId).first<{result_json:string}>();
    const listing=JSON.parse(result!.result_json);listing.facts.locality.value='La Rochelle';
    await env.DB.prepare('UPDATE listing_imports SET result_json=? WHERE id=?').bind(JSON.stringify(listing),listingId).run();
    const row=await admitGeneration(env.DB,scope.agencyId,`${label}-idempotency`,{listingId,durationSeconds:20,voiceEnabled:false},'true');
    await env.DB.prepare("UPDATE jobs SET status='importing',stage='importing' WHERE id=?").bind(row.jobId).run();
    await setGenerationPreparation(env.DB,row,'map','working');
    return (await findGeneration(env.DB,row.agencyId,row.jobId))!;
  }
  const noNetwork:typeof fetch=async()=>{throw Error('UNEXPECTED_GEOCODING_RETRY');};
  async function offer(row:Awaited<ReturnType<typeof create>>){
    await assert.rejects(prepareDefaultGenerationMap(env,row,transport),MapConfirmationRequired);
    const state=(await findGenerationMapConfirmation(env.DB,row.agencyId,row.jobId))!;
    assert.equal(state.state,'pending');assert.deepEqual(state.options.map(c=>c.label),['La Rochelle · 17000','La Rochelle · 70120']);
    assert.ok(Date.parse(state.expiresAt)<=Date.parse(row.deadline)-180_000);
    await assert.rejects(prepareDefaultGenerationMap(env,row,noNetwork),MapConfirmationRequired);
    return state;
  }
  await t.test('choix explicite, double clic, ville correcte et motif public sans coordonnées privées',async()=>{
    const row=await create('inline-map-select'),before=await env.DB.prepare('SELECT reserved,consumed FROM allocations WHERE agency_id=?').bind(row.agencyId).first();
    const offered=await offer(row),fresh=(await findGeneration(env.DB,row.agencyId,row.jobId))!,view=generationView(fresh);
    assert.equal(view.mapConfirmation?.options.length,2);assert.deepEqual(Object.keys(view.mapConfirmation!.options[0]).sort(),['id','label']);
    assert.equal(generationSteps(view).filter(s=>s.state==='current').length,1);
    assert.equal(generationSteps(view).find(s=>s.key==='map')?.label,'Confirmez la ville pour la carte');
    assert.equal(generationView(fresh,Date.now(),'anonymous').mapConfirmation?.options.length,2);
    for(const table of ['narration_runs','photo_animations','avatar_tasks','video_manifests'])assert.equal((await env.DB.prepare(`SELECT count(*) n FROM ${table} WHERE job_id=?`).bind(row.jobId).first<{n:number}>())!.n,0);
    assert.equal(await findGenerationMapConfirmation(env.DB,'foreign-agency',row.jobId),null);
    await assert.rejects(confirmGenerationMap(env.DB,'foreign-agency',row.jobId,{candidateId:'city-0'}),/NOT_FOUND/);
    for(const body of [{candidateId:'city-4'},{candidateId:'city-0',latitude:0},{candidateId:'city-9'},{}])await assert.rejects(confirmGenerationMap(env.DB,row.agencyId,row.jobId,body),/VALIDATION_ERROR/);
    await assert.rejects(env.DB.prepare("UPDATE generation_map_confirmations SET state='selected',selected_id='city-4' WHERE job_id=?").bind(row.jobId).run(),/IMMUTABLE/);
    const selected=await confirmGenerationMap(env.DB,row.agencyId,row.jobId,{candidateId:'city-0'});
    assert.equal(selected.selectedId,'city-0');assert.equal((await confirmGenerationMap(env.DB,row.agencyId,row.jobId,{candidateId:'city-0'})).state,'selected');
    await assert.rejects(confirmGenerationMap(env.DB,row.agencyId,row.jobId,{candidateId:'city-1'}),/CONFLICT/);
    assert.equal(generationView((await findGeneration(env.DB,row.agencyId,row.jobId))!).mapConfirmation,undefined);
    const map=await prepareDefaultGenerationMap(env,row,async raw=>{assert.ok(!new URL(String(raw)).pathname.endsWith('/search'));return transport(raw);});
    assert.equal(map?.location.latitude,offered.options[0].location.latitude);assert.equal(map?.location.longitude,-1.15);
    assert.equal(map?.zoomStart,12);assert.equal(map?.zoomEnd,14.5);
    assert.deepEqual(await prepareDefaultGenerationMap(env,row,noNetwork),map);
    assert.deepEqual(await env.DB.prepare('SELECT reserved,consumed FROM allocations WHERE agency_id=?').bind(row.agencyId).first(),before);
    await failGeneration(env.DB,row,'GENERATION_FAILED');
  });
  await t.test('deux villes confirmées en concurrence : une seule décision et replay stable',async()=>{
    const row=await create('inline-map-race');await offer(row);
    const outcomes=await Promise.allSettled(['city-0','city-1'].map(candidateId=>confirmGenerationMap(env.DB,row.agencyId,row.jobId,{candidateId})));
    assert.equal(outcomes.filter(v=>v.status==='fulfilled').length,1);assert.equal(outcomes.filter(v=>v.status==='rejected').length,1);
    const winner=(await findGenerationMapConfirmation(env.DB,row.agencyId,row.jobId))!;
    assert.equal((await confirmGenerationMap(env.DB,row.agencyId,row.jobId,{candidateId:winner.selectedId})).selectedId,winner.selectedId);
    await failGeneration(env.DB,row,'GENERATION_FAILED');
  });
  await t.test('continuer sans carte : omission explicite, sans appel image ni géocodage supplémentaire',async()=>{
    const row=await create('inline-map-skip');await offer(row);
    await confirmGenerationMap(env.DB,row.agencyId,row.jobId,{candidateId:null});
    assert.equal(await prepareDefaultGenerationMap(env,row,noNetwork),null);
    await setGenerationPreparation(env.DB,row,'map','skipped');
    const view=generationView((await findGeneration(env.DB,row.agencyId,row.jobId))!);
    assert.equal(view.preparation?.map,'skipped');assert.equal(view.mapOmissionReason,'confirmation_skipped');
    assert.ok(generationMapOmissionText(view)?.includes('Vous avez choisi'));
    await assert.rejects(confirmGenerationMap(env.DB,row.agencyId,row.jobId,{candidateId:'city-0'}),/CONFLICT/);
    await failGeneration(env.DB,row,'GENERATION_FAILED');
  });
  await t.test('expiration bornée, choix tardif refusé et génération poursuivie sans carte',async()=>{
    const row=await create('inline-map-timeout'),state=await offer(row),late=Date.parse(state.expiresAt)+1;
    assert.equal((await expireGenerationMapConfirmation(env.DB,row.agencyId,row.jobId))?.state,'pending');
    await assert.rejects(confirmGenerationMap(env.DB,row.agencyId,row.jobId,{candidateId:'city-0'},late),/CONFLICT/);
    assert.equal(generationView((await findGeneration(env.DB,row.agencyId,row.jobId))!,late).mapConfirmation,undefined);
    assert.equal(await prepareDefaultGenerationMap(env,row,noNetwork,late),null);
    await setGenerationPreparation(env.DB,row,'map','skipped');
    const view=generationView((await findGeneration(env.DB,row.agencyId,row.jobId))!);
    assert.equal(view.mapOmissionReason,'confirmation_timeout');assert.ok(generationMapOmissionText(view)?.includes('à temps'));
    await failGeneration(env.DB,row,'GENERATION_FAILED');
  });
  await t.test('aucun choix ne peut modifier une génération déjà passée à la narration',async()=>{
    const row=await create('inline-map-late');await offer(row);
    await env.DB.prepare("UPDATE jobs SET status='scripting',stage='scripting' WHERE id=?").bind(row.jobId).run();
    await assert.rejects(confirmGenerationMap(env.DB,row.agencyId,row.jobId,{candidateId:'city-0'}),/CONFLICT/);
    assert.equal(generationView((await findGeneration(env.DB,row.agencyId,row.jobId))!).mapConfirmation,undefined);
    await failGeneration(env.DB,row,'GENERATION_FAILED');
  });
  assert.deepEqual(await env.DB.prepare('PRAGMA foreign_key_check').first(),null);
});
