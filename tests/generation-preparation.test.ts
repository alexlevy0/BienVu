import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {GenerationView,GenerationAnimationProgress,defaultVideoCustomization} from '../packages/contracts/src/index';
import {admitGeneration,findGeneration,generationView,setGenerationPreparation,claimGenerationResource} from '../packages/db/src/index';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {generationSteps,generationProgressText,generationMapOmissionText} from '../apps/web/lib/generation-steps';

const job=GenerationView.parse({id:'progress-fixture',status:'voicing',stage:'voicing',attempt:1,errorCode:null,
  createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),expiresAt:null,title:'Bien de recette',videoUrl:null,downloadUrl:null,
  syntheticVoice:true,retryAllowed:false,narrationReady:true,preparation:{map:'ready',avatar:'working'},
  avatar:{requested:1,ready:0,failed:0,active:1,creditsUsed:0}});
test('suivi : voix cochée pendant l’avatar, carte et options conditionnelles, aucune fausse réussite',()=>{
  const steps=generationSteps(job,true),voice=steps.find(s=>s.key==='narration')!;
  assert.equal(voice.state,'done');assert.equal(voice.label,'Voix off prête');
  assert.equal(steps.find(s=>s.key==='map')?.state,'done');assert.equal(steps.find(s=>s.state==='current')?.key,'avatar');
  assert.equal(generationProgressText(job),'Génération de l’avatar');assert.equal(steps[0].label,'Informations validées');
  assert.ok(!steps.some(s=>s.key==='animations'));
  const map={...job,status:'importing' as const,stage:'importing' as const,narrationReady:false,avatar:undefined,preparation:{map:'working' as const}};
  assert.equal(generationProgressText(map),'Génération de la carte');assert.equal(generationSteps(map).find(s=>s.key==='narration')?.state,'future');
  assert.equal(generationSteps(map).find(s=>s.key==='photos')?.state,'done');
  const skipped={...job,avatar:{...job.avatar!,failed:1,active:0},preparation:{map:'skipped' as const,avatar:'skipped' as const}};
  assert.equal(generationSteps(skipped).find(s=>s.key==='map')?.state,'skipped');
  assert.equal(generationSteps(skipped).find(s=>s.key==='avatar')?.label,'Avatar non ajouté');
  assert.equal(generationProgressText(skipped),'Assemblage de la vidéo');
  const simple={...job,avatar:undefined,preparation:{},narrationReady:false};
  assert.deepEqual(generationSteps(simple).map(s=>s.key),['importing','photos','narration','rendering']);
  assert.equal(generationProgressText(simple),'Création de la voix off');
  assert.equal(generationSteps({...simple,syntheticVoice:false,narrationReady:true}).find(s=>s.key==='narration')?.label,'Texte prêt');
  assert.equal(generationProgressText({...job,preparation:{avatar:'ready',animations:'working'}}),'Animation des photos');
  for(const status of ['queued','failed'] as const)assert.equal(generationSteps({...job,status,preparation:{map:'pending',avatar:'pending'},narrationReady:false}).filter(s=>s.state==='current').length,0);
  assert.ok(!generationSteps({...job,status:'failed',narrationReady:false,avatar:undefined,preparation:{map:'working',avatar:'pending'}}).some(s=>s.key==='avatar'&&s.state==='done'));
  assert.equal(generationProgressText({...job,status:'retry_wait'}),'Reprise en attente');
  assert.ok(generationSteps(null).every(s=>s.state==='future'));
});

test('carte omise : motif lisible pendant et après la génération, sans inventer une cause historique',()=>{
  const skipped={...job,locality:'La Rochelle',preparation:{map:'skipped' as const}};
  for(const [reason,text] of [['location_missing','ville du bien n’est pas renseignée'],['ambiguous_location','« La Rochelle »'],['map_unavailable','service cartographique était indisponible']] as const){
    const view=GenerationView.parse({...skipped,mapOmissionReason:reason});
    assert.ok(generationMapOmissionText(view)?.includes(text));
    assert.equal(generationSteps(view).find(s=>s.key==='map')?.detail,generationMapOmissionText(view));
    assert.equal(generationMapOmissionText({...view,status:'ready'}),generationMapOmissionText(view));
  }
  assert.ok(generationMapOmissionText(skipped)?.includes('raison n’a pas été enregistrée'));
  assert.equal(generationMapOmissionText({...skipped,preparation:{map:'ready'},mapOmissionReason:'map_unavailable'}),undefined);
  assert.equal(generationMapOmissionText(job),undefined);assert.equal(generationMapOmissionText(null),undefined);
});

test('animations : compteur réel, réutilisations et replis distincts, anciens résultats sans compteur inventé',()=>{
  const base={...job,avatar:undefined,animationsRequested:12,preparation:{animations:'working' as const}};
  for(const ready of [0,2,11,12]){
    const progress={total:12,ready,reused:0,skipped:0,active:ready<12?1:0};
    const step=generationSteps({...base,animationProgress:progress}).find(s=>s.key==='animations')!;
    assert.deepEqual(step.progress,{completed:ready,total:12});assert.equal(step.detail,undefined);
  }
  const mixed={total:12,ready:3,reused:2,skipped:1,active:1};
  const step=generationSteps({...base,animationProgress:mixed}).find(s=>s.key==='animations')!;
  assert.deepEqual(step.progress,{completed:4,total:12});assert.match(step.detail!,/2 animations réutilisées/);assert.match(step.detail!,/1 photo avec mouvements classiques/);
  const finished=generationSteps({...base,preparation:{animations:'ready'},animationProgress:{...mixed,skipped:9,active:0}}).find(s=>s.key==='animations')!;
  assert.equal(finished.label,'Animations terminées');assert.deepEqual(finished.progress,{completed:12,total:12});
  assert.equal(generationSteps(base).find(s=>s.key==='animations')!.progress,undefined);
  assert.equal(GenerationAnimationProgress.safeParse({...mixed,reused:4}).success,false);
  assert.equal(GenerationAnimationProgress.safeParse({...mixed,active:12}).success,false);
});

test('animations D1 : progression pendant le traitement, repli sans soumission et lecture sans débit',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB']}));t.after(()=>mf.dispose());
  const db=await mf.getD1Database('DB');await migrateNarrationProbe(db);const seed=await seedNarrationFixture(db,'animation-progress',true),at=new Date().toISOString();
  await db.exec("UPDATE jobs SET status='failed',error_code='FIXTURE'; UPDATE allocations SET kind='paid',quota_limit=20; UPDATE generation_control SET enabled=1");
  await db.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(seed.agencyId,'allocation-animation-progress').run();
  await db.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9000,0)').bind(at.slice(0,7)).run();
  const row=await admitGeneration(db,seed.agencyId,'animation-progress-key-001',{listingId:'listing-animation-progress',durationSeconds:20,customization:{...defaultVideoCustomization(),runwayPhotos:[0,1,2]}},'true');
  const balance=async()=>(await db.prepare('SELECT reserved,consumed,quota_limit FROM allocations ORDER BY id').all()).results,before=await balance();
  assert.deepEqual(generationView(row).animationProgress,{total:3,ready:0,reused:0,skipped:0,active:0});
  await db.prepare("UPDATE jobs SET status='voicing',stage='voicing' WHERE id=?").bind(row.jobId).run();await setGenerationPreparation(db,row,'animations','working');
  for(const [index,state] of ['ready','failed','submitted'].entries())await db.prepare(`INSERT INTO photo_animations(id,agency_id,job_id,photo_id,source_sha256,slot,month,mode,model,credits,reserved_cents,state,created_at,updated_at,duration_seconds)
    VALUES(?,?,?,?,?,?,?,'mock','gen4_turbo',25,0,?,?,?,5)`).bind('progress-photo-'+index,seed.agencyId,row.jobId,'photo-'+index,'a'.repeat(64),index,at.slice(0,7),state,at,at).run();
  let fresh=(await findGeneration(db,seed.agencyId,row.jobId))!;
  assert.deepEqual(generationView(fresh).animationProgress,{total:3,ready:1,reused:0,skipped:1,active:1});
  assert.deepEqual(generationView({...fresh,animationsRequested:5,animationsReused:2}).animationProgress,{total:5,ready:3,reused:2,skipped:1,active:1});
  assert.deepEqual(generationView(fresh,Date.now(),'anonymous').animationProgress,generationView(fresh).animationProgress);
  await db.prepare("DELETE FROM photo_animations WHERE job_id=? AND state='submitted'").bind(row.jobId).run();
  await setGenerationPreparation(db,row,'animations','ready');fresh=(await findGeneration(db,seed.agencyId,row.jobId))!;
  assert.deepEqual(generationView(fresh).animationProgress,{total:3,ready:1,reused:0,skipped:2,active:0},'Une photo non soumise est comptée en repli seulement après la fin réelle de l’étape');
  assert.equal(generationView({...fresh,animationsRequested:0}).animationProgress,undefined);
  assert.equal(await findGeneration(db,'foreign-agency',row.jobId),null);assert.deepEqual(await balance(),before);
});

test('Animation indisponible : motif durable et public, état final conservé et solde client intact',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB']}));t.after(()=>mf.dispose());
  const db=await mf.getD1Database('DB');await migrateNarrationProbe(db);const seed=await seedNarrationFixture(db,'animation-reason',true),at=new Date().toISOString();
  await db.exec("UPDATE jobs SET status='failed',error_code='FIXTURE'; UPDATE allocations SET kind='paid',quota_limit=20; UPDATE generation_control SET enabled=1");
  await db.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(seed.agencyId,'allocation-animation-reason').run();
  await db.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9000,0)').bind(at.slice(0,7)).run();
  const row=await admitGeneration(db,seed.agencyId,'animation-reason-key-001',{listingId:'listing-animation-reason',durationSeconds:20,customization:{...defaultVideoCustomization(),runwayPhotos:[0,1,2]}},'true');
  const balance=await db.prepare('SELECT reserved,consumed FROM allocations WHERE agency_id=?').bind(row.agencyId).first();
  await setGenerationPreparation(db,row,'animations','working','RUNWAY_BUDGET_LIMIT');
  await setGenerationPreparation(db,{...row,agencyId:'foreign'},'animations','working','RUNWAY_DISABLED');
  await setGenerationPreparation(db,row,'animations','skipped');
  await setGenerationPreparation(db,row,'animations','working','RUNWAY_DISABLED');
  const fresh=(await findGeneration(db,row.agencyId,row.jobId))!,view=generationView(fresh);
  assert.equal(view.animationOmissionReason,'RUNWAY_BUDGET_LIMIT');assert.equal(view.preparation?.animations,'skipped');
  assert.equal(generationSteps(view).find(s=>s.key==='animations')?.detail?.includes('budget du service'),true);
  assert.equal(generationView(fresh,Date.now(),'anonymous').animationOmissionReason,'RUNWAY_BUDGET_LIMIT');
  assert.equal(generationView({...fresh,animationOmissionReason:'PRIVATE_PROVIDER_BODY'}).animationOmissionReason,undefined);
  assert.deepEqual(await db.prepare('SELECT reserved,consumed FROM allocations WHERE agency_id=?').bind(row.agencyId).first(),balance);
});

test('checkpoints D1 : états durables, replay monotone, isolation, anciens jobs et finances intactes',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB']}));t.after(()=>mf.dispose());
  const db=await mf.getD1Database('DB');await migrateNarrationProbe(db);
  const seed=await seedNarrationFixture(db,'progress',true),at=new Date().toISOString();
  await db.exec("UPDATE jobs SET status='failed',error_code='FIXTURE'; UPDATE allocations SET kind='paid',quota_limit=5; UPDATE generation_control SET enabled=1");
  await db.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(seed.agencyId,'allocation-progress').run();
  await db.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9000,0)').bind(at.slice(0,7)).run();
  const row=await admitGeneration(db,seed.agencyId,'progress-fixture-key-001',{listingId:'listing-progress',durationSeconds:20},'true');
  assert.deepEqual(generationView(row).preparation,{map:'pending'});
  const balance=async()=>(await db.prepare('SELECT reserved,consumed,quota_limit FROM allocations ORDER BY id').all()).results;
  const before=await balance();
  await claimGenerationResource(db,seed.agencyId,row.jobId,'preparation');
  await db.prepare("UPDATE jobs SET status='importing',stage='importing' WHERE id=?").bind(row.jobId).run();
  await setGenerationPreparation(db,row,'map','working');
  let fresh=(await findGeneration(db,seed.agencyId,row.jobId))!;
  assert.equal(generationProgressText(generationView(fresh)),'Génération de la carte');
  await setGenerationPreparation(db,{...row,agencyId:'foreign-agency'},'map','skipped');
  await setGenerationPreparation(db,{...row,attempt:row.attempt+1},'map','skipped');
  await setGenerationPreparation(db,row,'avatar','working');
  assert.equal(generationView((await findGeneration(db,seed.agencyId,row.jobId))!).preparation?.map,'working');
  assert.equal(await findGeneration(db,'foreign-agency',row.jobId),null);
  await setGenerationPreparation(db,row,'map','ready');await setGenerationPreparation(db,row,'map','working');
  fresh=(await findGeneration(db,seed.agencyId,row.jobId))!;assert.equal(generationView(fresh).preparation?.map,'ready');
  const omitted={...fresh,preparation:null,mapResolved:1,resolvedMap:null};
  for(const reason of ['location_missing','ambiguous_location','map_unavailable'] as const){
    assert.equal(generationView({...omitted,mapOmissionReason:reason}).mapOmissionReason,reason);
    assert.equal(generationView({...omitted,mapOmissionReason:reason},Date.now(),'anonymous').mapOmissionReason,reason);
    assert.equal(generationView({...fresh,mapOmissionReason:reason}).mapOmissionReason,undefined);
  }
  assert.equal(generationView({...omitted,mapOmissionReason:'private provider error'}).mapOmissionReason,undefined);
  assert.equal(generationView({...omitted,mapOmissionReason:null}).mapOmissionReason,undefined);
  assert.deepEqual(await balance(),before);assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  assert.equal((await db.prepare('SELECT count(*) n FROM generation_preparation_steps WHERE job_id=?').bind(row.jobId).first<{n:number}>())!.n,1);
  // A workflow already waiting on HeyGen still exposes its actual avatar phase.
  const historical={...fresh,status:'voicing' as const,stage:'voicing' as const,narrationState:'prepared',preparation:null,defaultMap:null,avatarCredits:1,avatarActive:1};
  const legacy=generationView(historical);assert.equal(legacy.narrationReady,true);assert.equal(legacy.preparation?.avatar,'working');
  assert.equal(generationProgressText(legacy),'Génération de l’avatar');
  assert.equal(generationView({...historical,avatarActive:0,avatarReady:2}).preparation?.avatar,'ready');
  assert.equal(generationView({...fresh,preparation:null,mapResolved:1,resolvedMap:null}).preparation?.map,'skipped');
  await db.prepare("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL WHERE id=?").bind(row.jobId).run();
  await setGenerationPreparation(db,row,'map','skipped');assert.equal(generationView((await findGeneration(db,seed.agencyId,row.jobId))!).preparation?.map,'ready');
});
