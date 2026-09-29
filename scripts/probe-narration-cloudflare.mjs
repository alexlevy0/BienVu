// Recette opérateur réelle, isolée dans l'agence synthétique de ce journal.
// Aucun appel fournisseur depuis ce processus : ils sont effectués par le Worker.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, chmod, rename} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {randomUUID, randomBytes, createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {remoteSql, cloudflare, accountId} from './cloudflare-operator.mjs';
import {narrationListing, narrationBrand} from '../fixtures/narration.ts';
import {GeneratableListing, GoogleVoiceConfig, PreparedNarration} from '../packages/contracts/src/index.ts';
import {googleServiceAccountAccess, measureVoiceWav} from '../packages/voice/src/index.ts';
import {narrationPreview} from './narration-preview.ts';

const naturalness = process.argv.includes('--natural');
const originalFolder = 'evidence/remote/sprint-05';
const folder = naturalness ? `${originalFolder}/naturalness` : originalFolder;
const configFile = 'apps/pipeline/wrangler.staging.narration.jsonc';
const bootstrapFile = 'apps/pipeline/wrangler.staging.narration-bootstrap.jsonc';
const stateFile = `${folder}/state.json`, tokenFile = '.secrets/narration-operator-token';
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const json = file => readFile(file, 'utf8').then(JSON.parse);
const save = (file, value, exclusive = false) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600, flag: exclusive ? 'wx' : 'w'});
const at = () => new Date().toISOString();
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const budget = async month => (await remoteSql(`SELECT *,baseline_cents+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=${q(month)}) engaged_cents FROM hosted_import_budget WHERE month=${q(month)}`))[0];
async function narrationSql(sql) {
  const config = await json(configFile), database = config.d1_databases[0];
  assert.equal(database.database_name, 'bienvu-narration-probe-staging', 'ISOLATED_DATABASE_REQUIRED');
  assert.notEqual(database.database_id, '0219384e-d439-4421-840e-32c551afdb0d', 'ISOLATED_DATABASE_REQUIRED');
  const results = await cloudflare(`/accounts/${accountId}/d1/database/${database.database_id}/query`, {method:'POST',body:JSON.stringify({sql})});
  assert.ok(results.every(result=>result.success), 'D1_QUERY_FAILED');
  return results.at(-1)?.results ?? [];
}
const calls = s => narrationSql(`SELECT id,provider,provider_mode,state,reservation_cents,result_json,error_code FROM narration_calls WHERE agency_id=${q(s.agencyId)} AND job_id=${q(s.jobId)} ORDER BY created_at,id`);
async function request(s, path, options = {}, authenticated = true) {
  const token = authenticated ? (await readFile(tokenFile, 'utf8')).trim() : null;
  return fetch(`${s.url}${path}`, {...options, redirect: 'error', signal: AbortSignal.timeout(600_000),
    headers: {...(token ? {Authorization: `Bearer ${token}`} : {}), ...options.headers}});
}
async function expect(response, status) {assert.equal(response.status, status, `HTTP_EXPECTED_${status}_GOT_${response.status}`); return response;}
const jobPath = s => `/agencies/${s.agencyId}/jobs/${s.jobId}`;

async function collect(s, result) {
  result = PreparedNarration.parse(result);
  assert.equal(result.script.agencyId, s.agencyId); assert.equal(result.script.listingId, s.listingId);
  assert.equal(result.script.sourceKind, 'manual');
  assert.ok(result.script.provenance.every(fact => fact.status === 'user_provided'));
  const clips = [];
  for (const [index, asset] of result.audio.entries()) {
    const response = await expect(await request(s, `${jobPath(s)}/audio/${asset.id}`), 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(bytes.length, asset.sizeBytes); assert.equal(sha256(bytes), asset.sha256);
    assert.equal(measureVoiceWav(bytes).durationMs, asset.durationMs);
    assert.ok(asset.objectKey.startsWith(`agencies/${s.agencyId}/jobs/${s.jobId}/audio/`));
    clips.push(bytes); await writeFile(`${folder}/scene-${index+1}.wav`, bytes, {mode: 0o600});
  }
  const file = `${folder}/narration-cloudflare.wav`;
  await writeFile(file, narrationPreview(clips, result.durationFrames), {mode: 0o600});
  await writeFile(`${folder}/script.txt`, result.script.scenes.map((scene, i) => `${i+1}. ${scene.narrationText}\nAffiché : ${scene.captionText}`).join('\n\n')+'\n', {mode: 0o600});
  return resolve(file);
}
async function main() {
  const action = process.argv[2];
  assert.ok(['configure','isolate','secrets','reserve','seed','enable','run','verify','pause','verify-paused','review-runtime-retry','prepare-naturalness'].includes(action), 'ACTION_INVALID');
  if(action==='prepare-naturalness') {
    assert.ok(naturalness && !existsSync(stateFile), 'REVIEW_EXISTING_CAMPAIGN');
    const previous=await json(`${originalFolder}/state.json`), report=await json(`${originalFolder}/run.json`);
    assert.equal(previous.phase,'paused');assert.equal(previous.month,at().slice(0,7),'BUDGET_MONTH_CHANGED');
    assert.equal(report.response.result.script.copyVersion,'factual-copy/1');
    const before=await budget(previous.month);
    assert.ok(before.engaged_cents<=Math.min(2500,before.ceiling_cents),'BUDGET_LIMIT');
    const envelope=(await narrationSql(`SELECT *, (SELECT coalesce(sum(reservation_cents),0) FROM narration_calls WHERE month=${q(previous.month)}) used_cents FROM narration_budget WHERE month=${q(previous.month)}`))[0];
    assert.equal(envelope.paused,1);assert.equal(envelope.envelope_cents,previous.providerEnvelopeCents);
    assert.ok(envelope.envelope_cents-envelope.used_cents>=35,'BUDGET_LIMIT');
    const config=await json(configFile);assert.equal(config.vars.NARRATION_ENABLED,'false');
    const suffix=randomUUID();
    const s={...previous,at:at(),phase:'reserved',qualityComparison:true,parentJobId:previous.jobId,
      agencyId:`s05-${suffix}`,jobId:`job-${suffix}`,listingId:`listing-${suffix}`,
      allocationId:`allocation-${suffix}`,reservationId:`reservation-${suffix}`};
    await mkdir(folder,{recursive:true,mode:0o700});
    await save(`${folder}/budget-existing-envelope.json`,{at:at(),before,envelope,additionalGlobalProvisionCents:0},true);
    await save(stateFile,s,true);
    Object.assign(config.vars,{NARRATION_AGENCY_ID:s.agencyId,NARRATION_JOB_ID:s.jobId});
    await save(configFile,config);
    console.log(JSON.stringify({phase:s.phase,remainingProviderProvisionCents:envelope.envelope_cents-envelope.used_cents,
      additionalGlobalProvisionCents:0,originalFilesPreserved:true}));return;
  }
  if (action === 'configure') {
    await mkdir(folder, {recursive: true, mode: 0o700}); await chmod(folder, 0o700);
    await mkdir('.secrets', {recursive: true, mode: 0o700});
    assert.ok(!existsSync(stateFile) && !existsSync(tokenFile), 'REVIEW_EXISTING_CAMPAIGN');
    process.loadEnvFile('.env.voice'); process.loadEnvFile('.env.script');
    const voice = GoogleVoiceConfig.parse({projectId: process.env.GOOGLE_CLOUD_PROJECT, voice: process.env.GOOGLE_TTS_VOICE});
    const config = await json('apps/pipeline/wrangler.narration.jsonc');
    const reference = await json('apps/pipeline/wrangler.staging.import.jsonc');
    assert.equal(reference.d1_databases[0].database_id, '0219384e-d439-4421-840e-32c551afdb0d');
    assert.equal(reference.r2_buckets[0].bucket_name, 'bienvu-s00-private');
    const suffix = randomUUID();
    const s = {at: at(), month: at().slice(0,7), agencyId: `s05-${suffix}`, jobId: `job-${suffix}`, listingId: `listing-${suffix}`,
      allocationId: `allocation-${suffix}`, reservationId: `reservation-${suffix}`, globalProvisionCents: 80, providerEnvelopeCents: 70,
      name: 'bienvu-narration-staging', url: 'https://bienvu-narration-staging.alexlevy0.workers.dev', phase: 'configured'};
    await save(stateFile, s, true);
    await writeFile(tokenFile, randomBytes(32).toString('hex'), {mode: 0o600, flag: 'wx'});
    config.name = s.name; config.account_id = accountId;
    config.d1_databases = reference.d1_databases; config.r2_buckets = reference.r2_buckets;
    Object.assign(config.vars, {NARRATION_AGENCY_ID:s.agencyId,NARRATION_JOB_ID:s.jobId,GOOGLE_CLOUD_PROJECT:voice.projectId,GOOGLE_TTS_VOICE:voice.voice,
      SCRIPT_MODEL:process.env.SCRIPT_MODEL || config.vars.SCRIPT_MODEL});
    await save(configFile, config); await save(bootstrapFile, {...config, secrets:{required:[]}});
    console.log(JSON.stringify({phase:s.phase,worker:s.name,enabled:false})); return;
  }
  const s = await json(stateFile); assert.equal(s.month, at().slice(0,7), 'BUDGET_MONTH_CHANGED');
  if(action==='review-runtime-retry') {
    // Reprise opérateur unique du défaut workerd reproduit hors réseau.
    // Le job raté et sa provision restent intacts ; aucun compteur remis à zéro.
    const report=await json(`${folder}/run.json`), rows=await calls(s);
    assert.equal(s.phase,'seeded');assert.ok(!s.previousScope && !existsSync(`${folder}/failed-attempt-1.json`));
    assert.equal(report.status,502);assert.equal(report.response.error,'SCRIPT_UNAVAILABLE');
    assert.equal(rows.length,1);assert.equal(rows[0].provider,'openai');assert.equal(rows[0].state,'failed');
    assert.equal(rows[0].result_json,null);
    const diagnosis=await json(`${folder}/runtime-diagnosis.json`);
    assert.equal(diagnosis.name,'TypeError');assert.ok(diagnosis.message.startsWith('Invalid redirect value'));
    await save(`${folder}/failed-attempt-1-state.json`,s,true);
    await narrationSql(`UPDATE jobs SET status='failed',error_code='SCRIPT_UNAVAILABLE',lease_until=NULL,updated_at=${q(at())} WHERE id=${q(s.jobId)} AND agency_id=${q(s.agencyId)};
      UPDATE reservations SET status='released',updated_at=${q(at())} WHERE id=${q(s.reservationId)} AND agency_id=${q(s.agencyId)} AND status='reserved';
      UPDATE allocations SET reserved=0 WHERE id=${q(s.allocationId)} AND agency_id=${q(s.agencyId)} AND reserved=1;`);
    await rename(`${folder}/run.json`,`${folder}/failed-attempt-1.json`);
    s.previousScope={agencyId:s.agencyId,jobId:s.jobId,reason:'WORKER_REDIRECT_ERROR_REPRODUCED_OFFLINE'};
    const suffix=randomUUID();Object.assign(s,{agencyId:`s05-${suffix}`,jobId:`job-${suffix}`,listingId:`listing-${suffix}`,
      allocationId:`allocation-${suffix}`,reservationId:`reservation-${suffix}`,phase:'reserved'});
    const config=await json(configFile);Object.assign(config.vars,{NARRATION_AGENCY_ID:s.agencyId,NARRATION_JOB_ID:s.jobId,NARRATION_ENABLED:'false'});
    await save(configFile,config);await save(stateFile,s);
    console.log(JSON.stringify({phase:s.phase,previousFailedReservationPreserved:true,additionalGlobalProvisionCents:0}));return;
  }
  if (action === 'isolate') {
    assert.ok(['configured','reserved'].includes(s.phase));
    const id=process.argv[3];assert.match(id??'',/^[a-f0-9-]{36}$/,'DATABASE_ID_INVALID');
    const database=await cloudflare(`/accounts/${accountId}/d1/database/${id}`);
    assert.equal(database.name,'bienvu-narration-probe-staging');
    const config=await json(configFile);
    config.d1_databases=[{binding:'DB',database_name:database.name,database_id:id,migrations_dir:'../../packages/db/migrations'}];
    await save(configFile,config);await save(bootstrapFile,{...config,secrets:{required:[]}});
    s.databaseId=id;await save(stateFile,s);
    console.log(JSON.stringify({database:database.name,migrationRequired:true,deploymentRequired:true}));return;
  }
  if (action === 'secrets') {
    process.loadEnvFile('.env.voice'); process.loadEnvFile('.env.script');
    const google = await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS || '.secrets/google-tts.json','utf8');
    assert.ok(google.length <= 16_384 && process.env.OPENAI_API_KEY?.length >= 20, 'CREDENTIALS_INVALID');
    await googleServiceAccountAccess(JSON.parse(google), process.env.GOOGLE_CLOUD_PROJECT); // validation locale, aucun échange OAuth
    const payload = {NARRATION_TOKEN:(await readFile(tokenFile,'utf8')).trim(),OPENAI_API_KEY:process.env.OPENAI_API_KEY,GOOGLE_SERVICE_ACCOUNT_JSON:google};
    // Secrets transmis uniquement par stdin ; jamais arguments, sortie ou fichier intermédiaire.
    const child = spawn('pnpm',['exec','wrangler','secret','bulk','--config',bootstrapFile],{stdio:['pipe','pipe','pipe']});
    const output=[]; child.stdout.on('data', chunk=>output.push(chunk));child.stderr.on('data', chunk=>output.push(chunk));
    child.stdin.end(JSON.stringify(payload));
    const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
    await writeFile(`${folder}/secrets.log`,Buffer.concat(output),{mode:0o600});
    assert.equal(code,0,'SECRET_BULK_FAILED'); console.log(JSON.stringify({secretsUploaded:Object.keys(payload)}));return;
  }
  if (action === 'reserve') {
    assert.equal(s.phase,'configured');
    assert.equal((await remoteSql(`SELECT enabled FROM generation_control WHERE id='generations'`))[0].enabled,0);
    assert.equal((await narrationSql('SELECT count(*) n FROM narration_budget'))[0].n,0, 'REVIEW_EXISTING_NARRATION_BUDGET');
    const before = await budget(s.month); assert.ok(before && before.engaged_cents+s.globalProvisionCents <= Math.min(2500,before.ceiling_cents), 'BUDGET_LIMIT');
    const receipt={at:at(),before,addedCents:s.globalProvisionCents,afterBaselineCents:before.baseline_cents+s.globalProvisionCents};
    await save(`${folder}/budget-reservation.json`,receipt,true); // en cas d'interruption, rapprocher ce reçu avant toute nouvelle écriture
    const updated=await remoteSql(`UPDATE hosted_import_budget SET baseline_cents=baseline_cents+${s.globalProvisionCents}
      WHERE month=${q(s.month)} AND baseline_cents=${before.baseline_cents} AND ceiling_cents=${before.ceiling_cents}
      AND baseline_cents+${s.globalProvisionCents}+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=${q(s.month)})<=min(2500,ceiling_cents) RETURNING baseline_cents`);
    assert.equal(updated.length,1,'BUDGET_CHANGED_REVIEW_REQUIRED');
    s.phase='reserved'; await save(stateFile,s); console.log(JSON.stringify({phase:s.phase,budget:await budget(s.month)}));return;
  }
  if (action === 'seed') {
    assert.equal(s.phase,'reserved'); assert.equal((await narrationSql(`SELECT count(*) n FROM agencies WHERE id=${q(s.agencyId)}`))[0].n,0);
    const now=at(), expires=new Date(Date.now()+30*86400_000).toISOString();
    const listing=narrationListing(true); listing.id=s.listingId;listing.agencyId=s.agencyId;listing.fetchedAt=now;
    for(const photo of listing.photos) {photo.agencyId=s.agencyId;photo.listingId=s.listingId;photo.objectKey=`agencies/${s.agencyId}/imports/${s.listingId}/${photo.id}.png`;}
    GeneratableListing.parse(listing);
    // Agence/annonce synthétiques dédiées, pas de compte utilisateur ni d'import de portail.
    // Photos = métadonnées de fixture : ce sprint ne rend pas de vidéo.
    await narrationSql(`INSERT INTO narration_budget(month,envelope_cents,paused) VALUES(${q(s.month)},${s.providerEnvelopeCents},0) ON CONFLICT(month) DO NOTHING;
      INSERT INTO agencies(id,owner_user_id,name,phone,email,primary_color,secondary_color,created_at,updated_at)
      VALUES(${q(s.agencyId)},${q('owner-'+s.agencyId)},${q(narrationBrand.name)},${q(narrationBrand.phone)},${q(narrationBrand.email)},${q(narrationBrand.primaryColor)},${q(narrationBrand.secondaryColor)},${q(now)},${q(now)});
      INSERT INTO listing_imports(id,agency_id,idempotency_key,source_url,source_kind,input_json,input_hash,status,result_json,created_at,lease_until,expires_at)
      VALUES(${q(s.listingId)},${q(s.agencyId)},${q(s.listingId)},'','manual',${q(JSON.stringify({photos:listing.photos.map(p=>({sha256:p.contentHash}))}))},${q('f'.repeat(64))},'ready',${q(JSON.stringify(listing))},${q(now)},${q(expires)},${q(expires)});
      INSERT INTO listings(id,agency_id,source_kind,source_url,canonical_url,source_host,source_listing_id,fetched_at,adapter_version,transaction_kind,facts_json,description_json)
      VALUES(${q(s.listingId)},${q(s.agencyId)},'manual','','','',NULL,${q(now)},${q(listing.adapterVersion)},${q(listing.transaction)},${q(JSON.stringify(listing.facts))},${q(JSON.stringify(listing.description))});
      INSERT INTO allocations(id,agency_id,kind,period_key,quota_limit,reserved,valid_from,valid_until)
      VALUES(${q(s.allocationId)},${q(s.agencyId)},'trial','s05-cloudflare-fixture',1,1,${q(now)},${q(expires)});
      INSERT INTO jobs(id,agency_id,listing_id,source_url,idempotency_key,status,stage,reservation_id,created_at,updated_at)
      VALUES(${q(s.jobId)},${q(s.agencyId)},${q(s.listingId)},'',${q(s.jobId)},'scripting','scripting',${q(s.reservationId)},${q(now)},${q(now)});
      INSERT INTO reservations(id,agency_id,job_id,allocation_id,status,created_at,updated_at)
      VALUES(${q(s.reservationId)},${q(s.agencyId)},${q(s.jobId)},${q(s.allocationId)},'reserved',${q(now)},${q(now)});`);
    s.phase='seeded';await save(stateFile,s);console.log(JSON.stringify({phase:s.phase,listing:'synthetic_manual',realCustomerModified:false}));return;
  }
  if(action==='enable') {
    assert.equal(s.phase,'seeded');assert.equal((await calls(s)).length,0);
    const current=await budget(s.month);
    assert.ok(current.engaged_cents<=Math.min(2500,current.ceiling_cents),'BUDGET_LIMIT');
    const enabled=await narrationSql(`UPDATE narration_budget SET paused=0 WHERE month=${q(s.month)}
      AND envelope_cents=${s.providerEnvelopeCents}
      AND envelope_cents-(SELECT coalesce(sum(reservation_cents),0) FROM narration_calls WHERE month=${q(s.month)})>=${s.qualityComparison?35:25}
      RETURNING paused`);
    assert.equal(enabled.length,1,'BUDGET_LIMIT');
    const config=await json(configFile);config.vars.NARRATION_ENABLED='true';await save(configFile,config);
    console.log(JSON.stringify({configuration:'enabled',deploymentRequired:true}));return;
  }
  if(action==='run') {
    assert.equal(s.phase,'seeded');assert.equal((await calls(s)).length,0);
    const status=await (await expect(await request(s,'/status'),200)).json();assert.equal(status.enabled,true);
    await expect(await request(s,`${jobPath(s)}/prepare`,{method:'POST'},false),401);
    await expect(await request(s,`/agencies/foreign/jobs/${s.jobId}/prepare`,{method:'POST'}),404);
    await expect(await request(s,`${jobPath(s)}/prepare`,{method:'POST',body:'{"model":"override"}'}),400);
    const report={at:at(),runtime:'cloudflare-worker',listing:'synthetic_manual',providerMock:false,budgetBefore:await budget(s.month),phase:'attempted'};
    await save(`${folder}/run.json`,report,true); // aucun retry aveugle après un appel ou timeout
    const started=Date.now(), response=await request(s,`${jobPath(s)}/prepare`,{method:'POST'});
    report.status=response.status;report.durationMs=Date.now()-started;report.response=await response.json();
    report.calls=await calls(s);report.budgetAfter=await budget(s.month);await save(`${folder}/run.json`,report);
    assert.equal(response.status,200,'REMOTE_NARRATION_FAILED_INSPECT_JOURNAL');
    assert.equal(report.response.providerMock,false);assert.equal(report.response.runtime,'cloudflare-worker');
    if(s.qualityComparison) assert.equal(report.response.result.script.copyVersion,'factual-copy/2');
    assert.ok(report.calls.every(call=>call.provider_mode==='real'&&call.state==='done'));
    report.previewFile=await collect(s,report.response.result);report.phase='prepared';report.humanListening='pending';
    await save(`${folder}/run.json`,report);s.phase='prepared';await save(stateFile,s);
    console.log(JSON.stringify({phase:s.phase,callsThisRun:report.response.callsThisRun,scenes:report.response.result.audio.length,
      durationFrames:report.response.result.durationFrames.reduce((a,b)=>a+b,0),durationMs:report.durationMs,previewFile:report.previewFile}));return;
  }
  if(action==='verify') {
    assert.equal(s.phase,'prepared'); const report=await json(`${folder}/run.json`), before=await calls(s);
    const replay=await (await expect(await request(s,`${jobPath(s)}/prepare`,{method:'POST'}),200)).json();
    assert.deepEqual(replay.callsThisRun,{script:0,voice:0});assert.deepEqual(replay.result,report.response.result);
    assert.deepEqual(await calls(s),before);
    const response=await expect(await request(s,jobPath(s)),200);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual((await response.json()).result,replay.result);
    await expect(await request(s,jobPath(s),{},false),401);
    await expect(await request(s,`${jobPath(s)}/audio/${replay.result.audio[0].id}`,{},false),401);
    await expect(await request(s,`/agencies/foreign/jobs/${s.jobId}/audio/${replay.result.audio[0].id}`),404);
    await collect(s,replay.result);
    report.replay={at:at(),callsThisRun:replay.callsThisRun,costJournalUnchanged:true};await save(`${folder}/run.json`,report);
    console.log(JSON.stringify({replay:report.replay,privateScript:true,privateAudio:true,allAudioHashesVerified:true}));return;
  }
  if(action==='pause') {
    await narrationSql(`UPDATE narration_budget SET paused=1 WHERE month=${q(s.month)}`);
    const config=await json(configFile);config.vars.NARRATION_ENABLED='false';await save(configFile,config);
    console.log(JSON.stringify({providerBudgetPaused:true,configuration:'disabled',deploymentRequired:true}));return;
  }
  if(action==='verify-paused') {
    const report=await json(`${folder}/run.json`),before=await calls(s);
    assert.equal((await (await expect(await request(s,'/status'),200)).json()).enabled,false);
    await expect(await request(s,`${jobPath(s)}/prepare`,{method:'POST'}),503);
    const persisted=await (await expect(await request(s,jobPath(s)),200)).json();
    assert.deepEqual(persisted.result,report.response.result);
    assert.deepEqual(await calls(s),before);
    assert.equal((await narrationSql(`SELECT paused FROM narration_budget WHERE month=${q(s.month)}`))[0].paused,1);
    assert.equal((await remoteSql(`SELECT enabled FROM generation_control WHERE id='generations'`))[0].enabled,0);
    report.closed={at:at(),prepareStatus:503,readStatus:200,costJournalUnchanged:true,budget:await budget(s.month)};
    await save(`${folder}/run.json`,report);s.phase='paused';await save(stateFile,s);
    console.log(JSON.stringify(report.closed));return;
  }
}
main().catch(error=>{console.error(JSON.stringify({error:/^[A-Z][A-Z0-9_]+$/.test(error?.message)?error.message:'NARRATION_CLOUDFLARE_PROBE_FAILED',
  help:'Consulter le journal privé dans evidence/remote/sprint-05 ; ne pas relancer run après un échec sans rapprochement.'}));process.exitCode=1;});
