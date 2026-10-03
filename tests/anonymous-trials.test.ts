import {admitLegacyAnonymous as admitAnonymous} from './legacy-trial-fixture';
// These claim/debit scenarios cover pre-rollout trials. New gifts are covered
// by product-credits, trial-api and trial-workflow tests.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {migrateNarrationProbe} from '../scripts/narration-fixtures';
import {createAnonymousSession,claimTrial,fundOwnedTrial,creditGrant,creditPeriod,ensureAgency,findGeneration,
  findOwnedGeneration,failGeneration,trialForSession,listGenerations,generationView,anonymousSession} from '../packages/db/src/index';
import {trialInput} from '../packages/db/src/anonymous';
const input={url:'https://www.century21.fr/trouver_logement/detail/123456789/'};
test('essai Orpi : slash final optionnel, recherche distinguée d’une source non autorisée', () => {
  const url='https://www.orpi.com/annonce-vente-appartement-test-12345678-1234-1234-1234-123456789012';
  for(const value of [url,url+'/',url.replace('annonce-vente-', 'annonce-location-')])assert.equal(trialInput({url:value}).url,value);
  assert.throws(()=>trialInput({url:'https://www.orpi.com/annonces-immobilieres/'}),/NOT_A_LISTING/);
  assert.throws(()=>trialInput({url:'https://www.orpi.com.evil.example/annonce-vente-test/'}),/TRIAL_SOURCE_UNSUPPORTED/);
});
async function setup(t:any) {
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
  const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
  await env.DB.exec('UPDATE trial_policy SET enabled=1,free_enabled=1; UPDATE generation_control SET enabled=1');
  await env.DB.prepare('INSERT INTO hosted_import_budget(month,baseline_cents,ceiling_cents,paused) VALUES(?,0,2500,0)').bind(new Date().toISOString().slice(0,7)).run();
  return env;
}
async function owner(DB:D1Database,label:string,at:number|string=Date.now()-1000) {
  await DB.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind(label,label,label+'@example.com',at,at).run();
  return ensureAgency(DB,{id:label,email:label+'@example.com'});
}
const proof=(n=1)=>({ipHmac:'a'.repeat(64),turnstileHash:n.toString(16).padStart(64,'0')});
async function ready(DB:D1Database,id:string){const at=new Date().toISOString();await DB.batch([
  DB.prepare('INSERT INTO generation_artifacts VALUES(?,?,?,?)').bind(id,`master-${id}`,'{}',at),
  DB.prepare('INSERT INTO generation_previews VALUES(?,?,?,?)').bind(id,`preview-${id}`,'{}',at),
  DB.prepare("UPDATE jobs SET status='ready',lease_until=NULL,updated_at=? WHERE id=?").bind(at,id)]);}

test('anniversaire UTC : mois courts, année bissextile, aucun cumul',()=>{
  const from=Date.parse('2024-01-31T10:42:03.123Z');
  assert.deepEqual(creditPeriod(from,Date.parse('2024-02-29T10:42:03.123Z')),{from:'2024-02-29T10:42:03.123Z',until:'2024-03-31T10:42:03.123Z'});
  assert.deepEqual(creditPeriod('2024-01-31T10:42:03.123Z',Date.parse('2024-02-29T10:42:03.123Z')),
    {from:'2024-02-29T10:42:03.123Z',until:'2024-03-31T10:42:03.123Z'});
  assert.equal(creditPeriod(from,Date.parse('2025-03-30T20:00:00Z')).from,'2025-02-28T10:42:03.123Z');
  assert.throws(()=>creditPeriod('invalid',Date.now()),/INVALID_CREDIT_ANCHOR/);
});
test('date ISO écrite par Better Auth : allocation gratuite et période d’inscription',async t=>{
  const {DB}=await setup(t),signup=new Date(Date.now()-60_000).toISOString();
  const agency=await owner(DB,'iso-owner',signup),grant=await creditGrant(DB,agency.id);
  assert.equal(grant?.kind,'free');assert.equal(grant?.remaining,3);
  const row=await DB.prepare('SELECT period_key AS periodKey,valid_from AS validFrom FROM allocations WHERE agency_id=?')
    .bind(agency.id).first<{periodKey:string;validFrom:string}>();
  assert.deepEqual(row,{periodKey:signup,validFrom:signup});
});
test('session opaque, admission concurrente, preview uniquement, propriété et débit atomiques',async t=>{
  const {DB}=await setup(t),{session,proof:cookie}=await createAnonymousSession(DB);
  assert.deepEqual(await anonymousSession(DB,cookie),session);assert.equal(await anonymousSession(DB,'wrong'),null);
  const [a,b]=await Promise.all([1,2].map(()=>admitAnonymous(DB,session,'anonymous-idempotency-key',input,proof(),'true')));
  assert.equal(a.jobId,b.jobId);assert.equal(a.creditStatus,'unfunded');assert.equal(a.ownerAgencyId,null);
  assert.equal((await DB.prepare('SELECT baseline_cents AS n FROM hosted_import_budget').first<{n:number}>())!.n,150);
  assert.equal((await trialForSession(DB,session))?.jobId,a.jobId);
  const other=await createAnonymousSession(DB);assert.equal(await trialForSession(DB,other.session,a.jobId),null);
  const user=await owner(DB,'owner-one'),stranger=await owner(DB,'owner-two');
  await assert.rejects(claimTrial(DB,other.session,user.id,a.jobId),/NOT_FOUND/);
  await ready(DB,a.jobId);
  const [c,d]=await Promise.all([1,2].map(()=>claimTrial(DB,session,user.id,a.jobId)));
  assert.equal(c.jobId,d.jobId);assert.equal(c.creditStatus,'consumed');assert.equal((await creditGrant(DB,user.id))!.remaining,2);
  await claimTrial(DB,session,user.id,a.jobId);await fundOwnedTrial(DB,user.id,a.jobId);
  assert.equal((await creditGrant(DB,user.id))!.remaining,2);
  assert.equal((await DB.prepare('SELECT count(*) AS n FROM generation_runs WHERE owner_agency_id=?').bind(user.id).first<{n:number}>())!.n,1);
  assert.equal(await findOwnedGeneration(DB,stranger.id,a.jobId),null);
  await assert.rejects(claimTrial(DB,session,stranger.id,a.jobId),/FORBIDDEN/);
  assert.equal((await DB.prepare('SELECT count(*) AS n FROM generation_shares').first<{n:number}>())!.n,0);
  await DB.exec('UPDATE trial_policy SET enabled=0; UPDATE generation_control SET enabled=0');
  assert.equal((await admitAnonymous(DB,session,'anonymous-idempotency-key',input,proof(),'false')).jobId,a.jobId);
  assert.equal((await claimTrial(DB,session,user.id,a.jobId)).creditStatus,'consumed');
});
test('récupération en cours, règlement original, échec : coût et tentatives conservés',async t=>{
  const {DB}=await setup(t),{session}=await createAnonymousSession(DB),user=await owner(DB,'during-render');
  const a=await admitAnonymous(DB,session,'render-in-progress-key',input,proof(),'true');
  const claimed=await claimTrial(DB,session,user.id,a.jobId);assert.equal(claimed.creditStatus,'reserved');assert.equal((await creditGrant(DB,user.id))!.remaining,2);
  await ready(DB,a.jobId);assert.equal((await findGeneration(DB,session.scopeId,a.jobId))!.creditStatus,'consumed');
  const next=await createAnonymousSession(DB),b=await admitAnonymous(DB,next.session,'failed-render-key-123',input,proof(2),'true');
  await claimTrial(DB,next.session,user.id,b.jobId);
  const allocation=(await creditGrant(DB,user.id))!;
  await failGeneration(DB,b,'GENERATION_FAILED');await failGeneration(DB,b,'GENERATION_FAILED');
  assert.deepEqual(await DB.prepare('SELECT reserved,consumed FROM allocations WHERE id=?').bind(allocation.id).first(),{reserved:0,consumed:1});
  assert.equal((await DB.prepare('SELECT baseline_cents AS n FROM hosted_import_budget').first<{n:number}>())!.n,300);
  assert.equal((await DB.prepare('SELECT count(*) AS n FROM generation_runs').first<{n:number}>())!.n,2);
});
test('quota épuisé : claim privé verrouillé, réallocation idempotente, garde abonnement',async t=>{
  const {DB}=await setup(t),{session}=await createAnonymousSession(DB),user=await owner(DB,'exhausted-owner');
  const grant=(await creditGrant(DB,user.id))!;await DB.prepare('UPDATE allocations SET consumed=quota_limit WHERE id=?').bind(grant.id).run();
  const a=await admitAnonymous(DB,session,'quota-exhausted-key',input,proof(),'true');await ready(DB,a.jobId);
  const claimed=await claimTrial(DB,session,user.id,a.jobId);assert.equal(claimed.creditStatus,'unfunded');assert.equal(claimed.ownerAgencyId,user.id);
  await DB.prepare('UPDATE allocations SET consumed=2 WHERE id=?').bind(grant.id).run();
  await Promise.all([1,2].map(()=>fundOwnedTrial(DB,user.id,a.jobId)));
  assert.deepEqual(await DB.prepare('SELECT reserved,consumed FROM allocations WHERE id=?').bind(grant.id).first(),{reserved:0,consumed:3});
  const paid=await owner(DB,'paid-user');await DB.prepare("INSERT INTO subscriptions(agency_id,stripe_customer_id,stripe_subscription_id,plan_code,status,updated_at) VALUES(?,?,?,'existing','active',?)").bind(paid.id,'cus-test','sub-test',new Date().toISOString()).run();
  assert.equal(await creditGrant(DB,paid.id),null);
});
test('limites persistantes, succès/session, budget et conservation pendant un claim',async t=>{
  const {DB}=await setup(t),{session}=await createAnonymousSession(DB);
  await assert.rejects(admitAnonymous(DB,session,'invalid-source-key-123',{url:'https://127.0.0.1/private'},proof(),'true'),/INVALID_URL|TRIAL_SOURCE_UNSUPPORTED/);
  for(let i=0;i<3;i++){
    const a=await admitAnonymous(DB,session,`failed-attempt-key-${i}`,input,proof(i+1),'true');
    await failGeneration(DB,a,'GENERATION_FAILED');
  }
  await assert.rejects(admitAnonymous(DB,session,'fourth-attempt-key',input,proof(4),'true'),/TRIAL_LIMIT/);
  const fresh=await createAnonymousSession(DB),a=await admitAnonymous(DB,fresh.session,'fresh-session-key',input,proof(5),'true');await ready(DB,a.jobId);
  await assert.rejects(admitAnonymous(DB,fresh.session,'second-success-key',input,proof(6),'true'),/TRIAL_USED/);
  const user=await owner(DB,'expiry-owner');
  // Even an older cleanup worker must not purge a successful anonymous video.
  await Promise.allSettled([claimTrial(DB,fresh.session,user.id,a.jobId),DB.prepare("UPDATE generation_runs SET retention='expiring' WHERE job_id=? AND owner_agency_id IS NULL AND retention='available'").bind(a.jobId).run()]);
  const result=(await findGeneration(DB,fresh.session.scopeId,a.jobId))!;
  assert.equal(result.ownerAgencyId,user.id);assert.equal(result.retention,'available');assert.equal(result.creditStatus,'consumed');assert.equal(result.expiresAt,null);
});

test('deux propriétaires concurrents : un seul débit et aucune réattribution',async t=>{
  const {DB}=await setup(t),{session}=await createAnonymousSession(DB),a=await admitAnonymous(DB,session,'race-owner-key-12345',input,proof(),'true');
  await ready(DB,a.jobId);const [first,second]=await Promise.all([owner(DB,'race-first'),owner(DB,'race-second')]);
  const claims=await Promise.allSettled([claimTrial(DB,session,first.id,a.jobId),claimTrial(DB,session,second.id,a.jobId)]);
  assert.equal(claims.filter(c=>c.status==='fulfilled').length,1);
  assert.equal((await DB.prepare('SELECT sum(consumed) AS n FROM allocations').first<{n:number}>())!.n,1);
});
test('changements de période : seul le quota réservé est consommé ou remboursé',async t=>{
  const {DB}=await setup(t),user=await owner(DB,'period-owner'),{session}=await createAnonymousSession(DB);
  const a=await admitAnonymous(DB,session,'period-original-key',input,proof(),'true');await claimTrial(DB,session,user.id,a.jobId);
  const original=(await creditGrant(DB,user.id))!;
  await DB.prepare('UPDATE allocations SET valid_until=? WHERE id=?').bind(new Date(Date.now()-1).toISOString(),original.id).run();
  const from=new Date().toISOString(),until=new Date(Date.now()+86400_000).toISOString();
  await DB.prepare("INSERT INTO allocations(id,agency_id,kind,period_key,quota_limit,valid_from,valid_until) VALUES('next-period',?,'free','next',3,?,?)").bind(user.id,from,until).run();
  await ready(DB,a.jobId);
  assert.deepEqual(await DB.prepare('SELECT reserved,consumed FROM allocations WHERE id=?').bind(original.id).first(),{reserved:0,consumed:1});
  assert.deepEqual(await DB.prepare("SELECT reserved,consumed FROM allocations WHERE id='next-period'").first(),{reserved:0,consumed:0});
});
test('plafonds journalier global, IP et budget refusent sans nouvelle réservation',async t=>{
  const {DB}=await setup(t);await DB.exec('UPDATE trial_policy SET global_daily=1');
  const first=await createAnonymousSession(DB),a=await admitAnonymous(DB,first.session,'limited-global-one',input,proof(),'true');await failGeneration(DB,a,'GENERATION_FAILED');
  const second=await createAnonymousSession(DB);await assert.rejects(admitAnonymous(DB,second.session,'limited-global-two',input,proof(2),'true'),/TRIAL_LIMIT/);
  await DB.exec('UPDATE trial_policy SET global_daily=5,ip_daily=1');await assert.rejects(admitAnonymous(DB,second.session,'limited-ip-key-1234',input,proof(2),'true'),/TRIAL_LIMIT/);
  await DB.exec('UPDATE trial_policy SET ip_daily=5; UPDATE hosted_import_budget SET ceiling_cents=150');
  await assert.rejects(admitAnonymous(DB,second.session,'limited-cost-key-1234',input,proof(2),'true'),/GENERATION_BUDGET_LIMIT/);
  assert.equal((await DB.prepare('SELECT count(*) AS n FROM generation_runs').first<{n:number}>())!.n,1);
});

test('plafond pilote de 45 € : ancien plafond de 35 € encore contraignant, provision import incluse',async t=>{
  const {DB}=await setup(t),{session}=await createAnonymousSession(DB);
  await DB.exec('UPDATE hosted_import_budget SET ceiling_cents=3500,baseline_cents=3350');
  // Generation + preview = 150; the future 50-cent import must also fit.
  await assert.rejects(admitAnonymous(DB,session,'pilot-ceiling-import-key',input,proof(),'true'),/GENERATION_BUDGET_LIMIT/);
  await DB.exec('UPDATE hosted_import_budget SET ceiling_cents=4500,baseline_cents=4350');
  await assert.rejects(admitAnonymous(DB,session,'pilot-ceiling-current-key',input,proof(2),'true'),/GENERATION_BUDGET_LIMIT/);
  assert.equal((await DB.prepare('SELECT count(*) AS n FROM generation_runs').first<{n:number}>())!.n,0);
  assert.equal((await DB.prepare('SELECT baseline_cents AS n FROM hosted_import_budget').first<{n:number}>())!.n,4350);
});
