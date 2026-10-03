import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {generationCreditCost,requestedAnimations,selectedAnimationIndices,defaultVideoCustomization,GenerationRequest,creditPlans,videoPhotoTimeline} from '../packages/contracts/src/index';
import {admitGeneration,failGeneration,findGeneration,creditBalance,creditHistory,createAnonymousSession,admitAnonymous,claimTrial,fundOwnedTrial,generationMasterUnlocked,ensureAgency} from '../packages/db/src/index';
import {migrateNarrationProbe,seedNarrationFixture} from '../scripts/narration-fixtures';
import {narrationListing} from '../fixtures/narration';

async function setup(t:{after(fn:()=>Promise<void>):void},label:string){
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB']}));t.after(()=>mf.dispose());
  const {DB}=await mf.getBindings<{DB:D1Database}>();await migrateNarrationProbe(DB);const seed=await seedNarrationFixture(DB,label),at=new Date().toISOString();
  await DB.exec("UPDATE jobs SET status='failed',error_code='FIXTURE',lease_until=NULL; UPDATE allocations SET kind='paid',quota_limit=40; UPDATE generation_control SET enabled=1; UPDATE trial_policy SET enabled=1,free_enabled=1");
  await DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9000,0)').bind(at.slice(0,7)).run();
  await DB.prepare('INSERT INTO generation_access VALUES(?,?,1)').bind(seed.agencyId,'allocation-'+label).run();
  const listing=narrationListing();listing.id='listing-'+label;listing.agencyId=seed.agencyId;
  const original=listing.photos[0];listing.photos=Array.from({length:8},(_,n)=>({...original,id:'photo-'+n,agencyId:seed.agencyId,listingId:listing.id,sourceOrder:n,contentHash:n.toString(16).padStart(64,'0'),objectKey:`agencies/${seed.agencyId}/imports/${listing.id}/photo-${n}.png`}));
  await DB.prepare('UPDATE listing_imports SET result_json=? WHERE id=?').bind(JSON.stringify(listing),listing.id).run();
  return {DB,...seed,listing,at};
}
async function finish(DB:D1Database,id:string,animations:number){const at=new Date().toISOString();
  const row=(await findGeneration(DB,(await DB.prepare('SELECT agency_id agencyId FROM generation_runs WHERE job_id=?').bind(id).first<{agencyId:string}>())!.agencyId,id))!;
  await DB.prepare("INSERT INTO video_manifests(job_id,agency_id,job_attempt,manifest_hash,manifest_json,sources_json,state,created_at,expires_at) VALUES(?,?,1,?,?,'[]','prepared',?,?)")
    .bind(id,row.agencyId,'a'.repeat(64),JSON.stringify({photoAnimations:Array.from({length:animations},()=>({}))}),at,row.expiresAt).run();
  const requested=JSON.parse(row.input).customization?.runwayPhotos??[];
  const listing=requested.length?JSON.parse((await DB.prepare('SELECT result_json data FROM listing_imports WHERE id=?').bind(JSON.parse(row.input).listingId).first<{data:string}>())!.data):null;
  for(const [slot,index] of requested.slice(0,animations).entries()){const photo=listing.photos[index];await DB.prepare("INSERT INTO photo_animations(id,agency_id,job_id,photo_id,source_sha256,slot,month,mode,model,credits,reserved_cents,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'mock','gen4_turbo',25,0,'ready',?,?)").bind('credit-animation-'+id+'-'+slot,row.agencyId,id,photo.id,photo.contentHash,slot,at.slice(0,7),at,at).run();}
  await DB.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)').bind(id,'master-'+id,'{}',at).run();
  if(row.anonymousSessionId)await DB.prepare('INSERT INTO generation_previews VALUES(?,?,?,?)').bind(id,'preview-'+id,'{}',at).run();
  await DB.prepare("UPDATE jobs SET status='ready',lease_until=NULL,updated_at=? WHERE id=?").bind(at,id).run();
}
const settings=(photos:number[])=>({...defaultVideoCustomization(),runwayPhotos:photos});
test('barème partagé : 1 vidéo + 1/photo, choix exact malgré réordonnancement et contrats stricts',()=>{
  assert.deepEqual(creditPlans.map(p=>p.credits),[3,40,120]);assert.equal(generationCreditCost(),1);assert.equal(generationCreditCost(settings([2,5,7,1])),5);
  assert.deepEqual(selectedAnimationIndices([7,2,5,1],settings([2,1])),[1,3]);assert.equal(requestedAnimations(settings([])),0);
  assert.equal(GenerationRequest.safeParse({listingId:'listing-test',customization:{...settings([2]),photoOrder:[0,1,3]}}).success,false);
  assert.equal(GenerationRequest.safeParse({listingId:'listing-test',customization:settings([2,2])}).success,false);
  const photos=Array.from({length:12},(_,n)=>({id:'photo-'+n})),timeline=videoPhotoTimeline(photos,1200,photos.map(p=>p.id));
  assert.equal(timeline.length,12);assert.equal(timeline.reduce((n,p)=>n+p.durationFrames,0),1200);assert.ok(timeline.every(p=>p.durationFrames>=30));
});
test('réservation atomique, réponse rejouée, animations partielles remboursées et règlement unique',async t=>{
  const {DB,agencyId,listing}=await setup(t,'credit-reserve');const input={listingId:listing.id,durationSeconds:40 as const,customization:settings([0,2,4,6])};
  const [a,b]=await Promise.all([1,2].map(()=>admitGeneration(DB,agencyId,'credit-reserve-key-001',input,'true')));assert.equal(a.jobId,b.jobId);
  assert.deepEqual(await creditBalance(DB,agencyId),{available:35,reserved:5,consumed:0,total:40,renewalAt:(await creditBalance(DB,agencyId)).renewalAt,kind:'paid',purchasedAvailable:0,monthlyAvailable:35});
  await finish(DB,a.jobId,2);assert.equal((await creditBalance(DB,agencyId)).available,37);assert.equal((await creditBalance(DB,agencyId)).consumed,3);
  await DB.prepare("UPDATE jobs SET status='ready' WHERE id=?").bind(a.jobId).run();assert.equal((await creditBalance(DB,agencyId)).consumed,3);
  const history=await creditHistory(DB,agencyId);assert.equal(history.entries[0].reserved,5);assert.equal(history.entries[0].used,3);assert.equal(history.entries[0].refunded,2);
  assert.equal((await creditHistory(DB,'another-agency')).entries.length,0);
  await assert.rejects(DB.prepare('UPDATE generation_runs SET credits_total=1 WHERE job_id=?').bind(a.jobId).run(),/IMMUTABLE/);
});
test('solde insuffisant : aucune admission ; échec complet libère tout sans effacer le coût fournisseur',async t=>{
  const {DB,agencyId,listing}=await setup(t,'credit-fail');await DB.exec('UPDATE allocations SET quota_limit=3');
  await assert.rejects(admitGeneration(DB,agencyId,'credit-insufficient-001',{listingId:listing.id,customization:settings([0,1,2])},'true'),/QUOTA_EXHAUSTED/);
  assert.equal((await DB.prepare('SELECT count(*) n FROM generation_runs').first<{n:number}>())!.n,0);
  const job=await admitGeneration(DB,agencyId,'credit-fail-key-001',{listingId:listing.id,customization:settings([0,1])},'true');
  assert.equal((await creditBalance(DB,agencyId)).reserved,3);await failGeneration(DB,job,'GENERATION_FAILED');await failGeneration(DB,job,'GENERATION_FAILED');
  assert.equal((await creditBalance(DB,agencyId)).available,3);assert.equal((await creditHistory(DB,agencyId)).entries[0].refunded,3);
  assert.equal((await DB.prepare('SELECT baseline_cents n FROM hosted_import_budget').first<{n:number}>())!.n,120);
});
test('essai : un crédit offert, Runway exige connexion, échec remboursé, récupération gratuite et privée',async t=>{
  const {DB}=await setup(t,'credit-anon'),{session}=await createAnonymousSession(DB),input={url:'https://www.century21.fr/trouver_logement/detail/123456789/'},proof={ipHmac:'f'.repeat(64),turnstileHash:'1'.repeat(64)};
  await assert.rejects(admitAnonymous(DB,session,'credit-anon-runway-001',{...input,customization:{...defaultVideoCustomization(),runwayClips:1}},proof,'true'),/RUNWAY_LOGIN_REQUIRED/);
  const failed=await admitAnonymous(DB,session,'credit-anon-fail-001',input,proof,'true');await failGeneration(DB,failed,'GENERATION_FAILED');
  const job=await admitAnonymous(DB,session,'credit-anon-success-001',input,{...proof,turnstileHash:'2'.repeat(64)},'true');await finish(DB,job.jobId,0);
  await assert.rejects(admitAnonymous(DB,session,'credit-anon-second-001',input,{...proof,turnstileHash:'3'.repeat(64)},'true'),/TRIAL_USED/);
  const at=new Date(Date.now()-1000).toISOString();await DB.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind('credit-owner','Owner','credit@example.com',at,at).run();
  const agency=await ensureAgency(DB,{id:'credit-owner',email:'credit@example.com'}),owned=await claimTrial(DB,session,agency.id,job.jobId);
  assert.equal(generationMasterUnlocked(owned),true);assert.equal(generationMasterUnlocked({...owned,ownerAgencyId:null}),false);
  await fundOwnedTrial(DB,agency.id,job.jobId);await claimTrial(DB,session,agency.id,job.jobId);assert.equal((await creditBalance(DB,agency.id)).available,3);
  assert.equal((await creditHistory(DB,agency.id)).entries[0].gift,true);
});
