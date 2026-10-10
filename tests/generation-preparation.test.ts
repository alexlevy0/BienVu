import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {GenerationView} from '../packages/contracts/src/index';
import {admitGeneration,findGeneration,generationView,setGenerationPreparation} from '../packages/db/src/index';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {generationSteps,generationProgressText} from '../apps/web/lib/generation-steps';

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
