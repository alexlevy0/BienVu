// Opérateur de recette bornée. Médias synthétiques + voix réelle déjà validée.
// Les clés d'opérateur restent dans .secrets, jamais dans les arguments CLI.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {cloudflare,remoteSql,accountId} from './cloudflare-operator.mjs';
import {makeVideoFixture} from './video-fixtures.ts';
import {PreparedNarration,videoAssets,videoAssetFile,videoManifestHash,VideoReport} from '../packages/contracts/src/index.ts';
import {scriptContext} from '../packages/narration/src/index.ts';
const folder='evidence/remote/sprint-06',stateFile=`${folder}/state.json`,configFile='apps/pipeline/wrangler.staging.video.jsonc';
const tokenFile='.secrets/video-operator-token',renderTokenFile='.secrets/video-renderer-token';
const json=file=>readFile(file,'utf8').then(JSON.parse),at=()=>new Date().toISOString();
const save=(file,data,exclusive=false)=>writeFile(file,JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:exclusive?'wx':'w'});
const q=value=>`'${String(value).replaceAll("'","''")}'`,hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const budget=async month=>(await remoteSql(`SELECT *,baseline_cents+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=${q(month)}) engaged_cents FROM hosted_import_budget WHERE month=${q(month)}`))[0];
async function sql(statement) {
  const config=await json(configFile),db=config.d1_databases[0];assert.equal(db.database_name,'bienvu-narration-probe-staging');
  assert.equal(db.database_id,'2a41089f-75a0-4b24-8206-a1a2acfae74c');
  const result=await cloudflare(`/accounts/${accountId}/d1/database/${db.database_id}/query`,{method:'POST',body:JSON.stringify({sql:statement})});
  assert.ok(result.every(r=>r.success));return result.at(-1)?.results??[];
}
async function cli(args,log,stdin) {
  const child=spawn('pnpm',['exec','wrangler',...args],{stdio:['pipe','pipe','pipe']}),chunks=[];
  child.stdout.on('data',c=>chunks.push(c));child.stderr.on('data',c=>chunks.push(c));child.stdin.end(stdin);
  const code=await new Promise((r,j)=>{child.once('error',j);child.once('close',r);});
  await writeFile(`${folder}/${log}`,Buffer.concat(chunks),{mode:0o600});assert.equal(code,0,`CLI_FAILED_SEE_${log}`);
}
async function request(s,path,init={},auth=true) {
  const token=auth?(await readFile(tokenFile,'utf8')).trim():null;
  return fetch(s.url+path,{...init,redirect:'error',signal:AbortSignal.timeout(90_000),headers:{...(token?{Authorization:`Bearer ${token}`}:{}) ,...init.headers}});
}
async function expect(response,status) {assert.equal(response.status,status,`HTTP_${response.status}_EXPECTED_${status}: ${response.status===status?'':(await response.text()).slice(0,300)}`);return response;}
async function main() {
  const action=process.argv[2];assert.ok(['configure','reserve','fund-resume','prepare-retry','retry','seed','secrets','enable','run','status','diagnostic','collect','pause','verify'].includes(action));
  if(action==='configure') {
    assert.ok(!existsSync(stateFile)&&!existsSync(tokenFile),'CAMPAIGN_EXISTS');
    await mkdir(folder,{recursive:true,mode:0o700});await mkdir('.secrets',{recursive:true,mode:0o700});
    // Même taille que les identifiants d'agence produits par l'application.
    // D1 borne les motifs LIKE de l'ancienne contrainte media_assets à 50 caractères.
    const suffix=randomUUID(),fixture=await makeVideoFixture('trial',`s06-${suffix.replaceAll('-','').slice(0,28)}`,`job-video-${suffix}`),m=fixture.manifest;
    const config=await json('apps/pipeline/wrangler.video.jsonc'),ref=await json('apps/pipeline/wrangler.staging.narration.jsonc');
    Object.assign(config,{name:'bienvu-video-staging',account_id:accountId,workers_dev:true,preview_urls:false,d1_databases:ref.d1_databases,r2_buckets:ref.r2_buckets});
    Object.assign(config.vars,{VIDEO_AGENCY_ID:m.agencyId,VIDEO_JOB_ID:m.jobId,VIDEO_ENABLED:'false',VIDEO_BUDGET_MONTH:at().slice(0,7)});
    await save(configFile,config);await writeFile(tokenFile,randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});
    await writeFile(renderTokenFile,randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});
    const s={at:at(),phase:'configured',month:at().slice(0,7),directory:fixture.directory,agencyId:m.agencyId,jobId:m.jobId,
      listingId:m.listingId,globalProvisionCents:60,renderProvisionCents:50,url:'https://bienvu-video-staging.alexlevy0.workers.dev'};
    await save(stateFile,s,true);console.log(JSON.stringify({phase:s.phase,newTtsCalls:0,newTextCalls:0}));return;
  }
  const s=await json(stateFile);assert.equal(s.month,at().slice(0,7),'MONTH_REQUIRES_RECONCILIATION');
  if(action==='fund-resume') {
    assert.equal(s.phase,'paused');assert.ok(!existsSync(`${folder}/resume-budget.json`),'RESUME_ALREADY_RESERVED_REVIEW_RECEIPT');
    const before=await budget(s.month),state=await (await expect(await request(s,'/state'),200)).json();
    assert.equal(before.ceiling_cents,2500);assert.equal(state.budget.attempts,1);assert.equal(state.budget.committedCents,50);
    assert.equal(state.paused,true);assert.equal(state.active,null);assert.ok(['stopped','stopped_with_code'].includes(state.container.status));
    assert.ok(before.engaged_cents+160<=3500);
    const receipt={at:at(),authorization:'Alex : augmenter le budget mensuel de 10 €, soit 40 € ; conserver 5 € de marge.',
      before,oldState:state,addedCents:160,additionalAttempts:3,renderProvisionCents:50,infraProvisionCents:10,
      ceilingCents:3500,envelopeCents:4000};
    await save(`${folder}/resume-budget.json`,receipt,true);
    const changed=await remoteSql(`UPDATE hosted_import_budget SET baseline_cents=baseline_cents+160,ceiling_cents=3500
      WHERE month=${q(s.month)} AND baseline_cents=${before.baseline_cents} AND ceiling_cents=2500
      AND baseline_cents+160+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=${q(s.month)})<=3500 RETURNING baseline_cents`);
    assert.equal(changed.length,1,'BUDGET_CHANGED_REVIEW_RECEIPT');receipt.after=await budget(s.month);await save(`${folder}/resume-budget.json`,receipt);
    const c=await json(configFile);Object.assign(c.vars,{VIDEO_ENABLED:'false',VIDEO_CEILING_CENTS:'3500',VIDEO_ENVELOPE_CENTS:'4000',
      VIDEO_OTHER_CENTS:String(before.engaged_cents-state.budget.committedCents+10),VIDEO_MAX_ATTEMPTS:'4',VIDEO_RETRY_FAILED_AT:'0'});
    await save(configFile,c);s.phase='funded';s.maxAttempts=4;await save(stateFile,s);
    console.log(JSON.stringify({phase:s.phase,budget:receipt.after,reservedForResumeCents:160}));return;
  }
  if(action==='prepare-retry') {
    assert.ok(existsSync(`${folder}/resume-budget.json`),'RESUME_FUNDING_REQUIRED');
    const status=await (await expect(await request(s,'/status'),200)).json(),state=await (await expect(await request(s,'/state'),200)).json();
    assert.equal(status.status,'failed');assert.equal(state.active,null);assert.ok(['stopped','stopped_with_code'].includes(state.container.status));
    assert.ok(state.budget.attempts<s.maxAttempts);assert.ok((await budget(s.month)).engaged_cents<=3500);
    const c=await json(configFile);c.vars.VIDEO_RETRY_FAILED_AT=String(status.updatedAt);c.vars.VIDEO_ENABLED='true';await save(configFile,c);
    s.failedAt=status.updatedAt;s.expectedAttempts=state.budget.attempts+1;s.phase='retry-prepared';await save(stateFile,s);
    console.log(JSON.stringify({deploymentRequired:true,nextAttempt:s.expectedAttempts,failedAt:s.failedAt}));return;
  }
  if(action==='retry') {
    assert.equal(s.phase,'retry-prepared');const previous=await json(`${folder}/run.json`);
    const archive=`${folder}/attempt-${s.expectedAttempts-1}.json`;if(!existsSync(archive))await save(archive,previous,true);
    const status=await (await expect(await request(s,'/status'),200)).json();assert.equal(status.status,'failed');assert.equal(status.updatedAt,s.failedAt);
    await expect(await request(s,'/retry',{method:'POST'},false),401);
    await expect(await request(s,'/retry',{method:'POST',body:JSON.stringify({watermarked:false})}),400);
    const run={at:at(),runtime:'cloudflare-container',syntheticListing:true,syntheticPhotos:true,reusedGoogleVoice:true,newTtsCalls:0,newTextCalls:0,
      budgetBefore:await budget(s.month),phase:'attempted',attempt:s.expectedAttempts,retryOf:s.failedAt};await save(`${folder}/run.json`,run);
    const start=performance.now(),replies=await Promise.all([1,2].map(()=>request(s,'/retry',{method:'POST'})));
    run.acceptanceMs=performance.now()-start;run.receipts=await Promise.all(replies.map(async r=>({status:r.status,body:await r.json()})));
    await save(`${folder}/run.json`,run);assert.ok(run.receipts.every(r=>r.status===202&&r.body.attempt===s.expectedAttempts));
    assert.equal(run.receipts[0].body.id,run.receipts[1].body.id);
    s.phase='running';await save(stateFile,s);console.log(JSON.stringify({acceptanceMs:run.acceptanceMs,receipts:run.receipts}));return;
  }
  if(action==='reserve') {
    assert.equal(s.phase,'configured');const before=await budget(s.month);assert.ok(before.engaged_cents+60<=Math.min(2500,before.ceiling_cents));
    await save(`${folder}/budget-reservation.json`,{at:at(),before,addedCents:60,afterBaselineCents:before.baseline_cents+60},true);
    const changed=await remoteSql(`UPDATE hosted_import_budget SET baseline_cents=baseline_cents+60 WHERE month=${q(s.month)} AND baseline_cents=${before.baseline_cents}
      AND baseline_cents+60+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=${q(s.month)})<=min(2500,ceiling_cents) RETURNING baseline_cents`);
    assert.equal(changed.length,1,'BUDGET_CHANGED_REVIEW_RECEIPT');const c=await json(configFile);c.vars.VIDEO_OTHER_CENTS=String(before.engaged_cents+10);await save(configFile,c);
    s.phase='reserved';await save(stateFile,s);console.log(JSON.stringify({phase:s.phase,budget:await budget(s.month)}));return;
  }
  if(action==='seed') {
    assert.equal(s.phase,'reserved');const m=await json(`${s.directory}/manifest.json`),fixture=await json(`${s.directory}/fixture.json`);
    assert.equal((await sql(`SELECT count(*) n FROM agencies WHERE id=${q(s.agencyId)}`))[0].n,0,'SEED_ALREADY_EXISTS');
    const source=await json('evidence/remote/sprint-05/naturalness/run.json');assert.equal(source.humanListening.status,'validated');
    const prepared=PreparedNarration.parse({...source.response.result,script:fixture.script,audio:source.response.result.audio.map((a,i)=>({...a,...{
      id:m.audio[i].id,objectKey:m.audio[i].objectKey,sha256:m.audio[i].sha256,sizeBytes:m.audio[i].sizeBytes}}))});
    const context=await scriptContext(fixture.listing,m.brand,m.contact),now=at(),expires=new Date(Date.now()+30*86400_000).toISOString();
    const b=m.brand,l=fixture.listing,reservation=`reservation-${randomUUID()}`,logoSource=`agencies/${s.agencyId}/brand/${m.logo.sha256}.png`;
    await sql(`INSERT INTO agencies(id,owner_user_id,name,logo_asset_id,phone,email,website,primary_color,secondary_color,created_at,updated_at)
      VALUES(${q(b.id)},${q(b.ownerUserId)},${q(b.name)},NULL,${q(b.phone)},${q(b.email)},NULL,${q(b.primaryColor)},${q(b.secondaryColor)},${q(now)},${q(now)});
      INSERT INTO listings(id,agency_id,source_kind,source_url,canonical_url,source_host,fetched_at,adapter_version,transaction_kind,facts_json)
      VALUES(${q(l.id)},${q(l.agencyId)},'manual','','','',${q(l.fetchedAt)},${q(l.adapterVersion)},${q(l.transaction)},${q(JSON.stringify(l.facts))});
      INSERT INTO allocations(id,agency_id,kind,period_key,quota_limit,reserved,valid_from,valid_until)
      VALUES(${q(m.rights.allocationId)},${q(s.agencyId)},'trial','s06-fixture',1,1,${q(now)},${q(expires)});
      INSERT INTO jobs(id,agency_id,listing_id,source_url,idempotency_key,status,stage,reservation_id,created_at,updated_at)
      VALUES(${q(s.jobId)},${q(s.agencyId)},${q(s.listingId)},'',${q(s.jobId)},'voicing','voicing',${q(reservation)},${q(now)},${q(now)});
      INSERT INTO reservations(id,agency_id,job_id,allocation_id,status,created_at,updated_at)
      VALUES(${q(reservation)},${q(s.agencyId)},${q(s.jobId)},${q(m.rights.allocationId)},'reserved',${q(now)},${q(now)});
      INSERT INTO media_assets(id,agency_id,kind,object_key,content_hash,mime,size_bytes,width,height,created_at)
      VALUES(${q(m.logo.id)},${q(s.agencyId)},'brand',${q(logoSource)},${q(m.logo.sha256)},'image/png',${m.logo.sizeBytes},256,256,${q(now)});
      UPDATE agencies SET logo_asset_id=${q(m.logo.id)} WHERE id=${q(s.agencyId)};
      INSERT INTO narration_runs(job_id,agency_id,input_hash,config_hash,snapshot_json,provider_mode,state,script_json,result_json,job_attempt,created_at,expires_at)
      VALUES(${q(s.jobId)},${q(s.agencyId)},${q(context.inputHash)},${q('0'.repeat(64))},${q(JSON.stringify({listing:l,brand:b,contact:m.contact,copyVersion:prepared.script.copyVersion}))},
      'real','prepared',${q(JSON.stringify(prepared.script))},${q(JSON.stringify(prepared))},1,${q(now)},${q(expires)});`);
    // Ce transfert est idempotent et ne déclenche aucun fournisseur de voix.
    for(const [i,asset]of videoAssets(m).entries())await cli(['r2','object','put',`bienvu-s00-private/${asset.id===m.logo.id?logoSource:asset.objectKey}`,
      '--remote','--file',`${s.directory}/${videoAssetFile(asset)}`,'--content-type',asset.mime],`asset-${i}.log`);
    s.phase='seeded';await save(stateFile,s);console.log(JSON.stringify({phase:s.phase,syntheticListing:true,syntheticPhotos:true,reusedGoogleVoice:true}));return;
  }
  if(action==='secrets') {
    await cli(['secret','bulk','--config',configFile],'secrets.log',JSON.stringify({PROBE_TOKEN:(await readFile(tokenFile,'utf8')).trim(),RENDER_TOKEN:(await readFile(renderTokenFile,'utf8')).trim()}));
    console.log(JSON.stringify({secretNames:['PROBE_TOKEN','RENDER_TOKEN']}));return;
  }
  if(action==='enable') {
    assert.equal(s.phase,'seeded');assert.ok((await budget(s.month)).engaged_cents<=2500);
    const c=await json(configFile);c.vars.VIDEO_ENABLED='true';await save(configFile,c);console.log(JSON.stringify({deploymentRequired:true}));return;
  }
  if(action==='run') {
    assert.equal(s.phase,'seeded');assert.ok(!existsSync(`${folder}/run.json`),'RUN_EXISTS_DO_NOT_RERENDER');
    await expect(await request(s,'/state',{},false),401);
    const prepared=await (await expect(await request(s,'/prepare',{method:'POST'}),200)).json();
    assert.equal(prepared.hash,await videoManifestHash(prepared.manifest));assert.equal(prepared.manifest.rights.watermarked,true);
    await save(`${folder}/manifest.json`,prepared.manifest,true);
    await expect(await request(s,'/render',{method:'POST',body:JSON.stringify({watermarked:false})}),400);
    const report={at:at(),runtime:'cloudflare-container',syntheticListing:true,syntheticPhotos:true,reusedGoogleVoice:true,newTtsCalls:0,newTextCalls:0,
      budgetBefore:await budget(s.month),phase:'attempted'};await save(`${folder}/run.json`,report,true);
    const start=performance.now();const replies=await Promise.all([1,2].map(()=>request(s,'/render',{method:'POST'})));
    report.acceptanceMs=performance.now()-start;report.receipts=await Promise.all(replies.map(async r=>({status:r.status,body:await r.json()})));
    await save(`${folder}/run.json`,report);assert.ok(report.receipts.every(r=>[200,202].includes(r.status)));assert.equal(report.receipts[0].body.id,report.receipts[1].body.id);
    s.phase='running';await save(stateFile,s);console.log(JSON.stringify({acceptanceMs:report.acceptanceMs,receipts:report.receipts}));return;
  }
  if(action==='status') {
    const status=await (await request(s,'/status')).json(),state=await (await request(s,'/state')).json();
    await save(`${folder}/last-status.json`,{at:at(),status,state});console.log(JSON.stringify({status,state}));return;
  }
  if(action==='diagnostic') {
    const report=await (await expect(await request(s,'/diagnostic'),200)).json();
    await save(`${folder}/diagnostic-${Date.now()}.json`,{at:at(),report});console.log(JSON.stringify(report));return;
  }
  if(action==='collect'||action==='verify') {
    const status=await (await expect(await request(s,'/status'),200)).json();
    if(action==='verify'&&status.status==='failed') {
      const state=await (await expect(await request(s,'/state'),200)).json();
      assert.equal(state.paused,true);assert.equal(state.active,null);assert.ok(['stopped','stopped_with_code'].includes(state.container.status));
      assert.equal(state.budget.attempts,s.expectedAttempts??1);assert.equal(state.budget.committedCents,(s.expectedAttempts??1)*50);
      await expect(await request(s,'/prepare',{method:'POST'}),503);await expect(await request(s,'/render',{method:'POST'}),503);await expect(await request(s,'/file'),409);
      await expect(await request(s,'/status',{},false),401);
      const run=await json(`${folder}/run.json`);Object.assign(run,{phase:'failed',status,state,budgetAfter:await budget(s.month),
        closed:{at:at(),readStatus:200,prepareStatus:503,renderStatus:503,fileStatus:409,remoteMp4Validated:false}});
      await save(`${folder}/run.json`,run);console.log(JSON.stringify({status,state,budget:run.budgetAfter,closed:run.closed}));return;
    }
    assert.equal(status.status,'ready');const report=VideoReport.parse(status.report);
    const bytes=new Uint8Array(await (await expect(await request(s,'/file'),200)).arrayBuffer());assert.equal(bytes.length,report.sizeBytes);assert.equal(hash(bytes),report.sha256);
    const range=await expect(await request(s,'/file',{headers:{Range:'bytes=0-1023'}}),206);assert.equal((await range.arrayBuffer()).byteLength,1024);
    await writeFile(`${folder}/video-cloudflare.mp4`,bytes,{mode:0o600});
    const state=await (await expect(await request(s,'/state'),200)).json();assert.equal(state.budget.attempts,s.expectedAttempts??1);assert.equal(state.budget.committedCents,(s.expectedAttempts??1)*50);
    const attempts=await (await expect(await request(s,'/attempts'),200)).json();assert.equal(attempts.length,s.expectedAttempts??1);
    assert.equal(attempts.at(-1).status,'ready');assert.ok(attempts.slice(0,-1).every(a=>a.status==='failed'));
    const run=await json(`${folder}/run.json`);Object.assign(run,{phase:'ready',status,state,budgetAfter:await budget(s.month),collectedAt:at(),rangeVerified:true});
    run.attempts=attempts;
    if(action==='collect') {
      const replay=await (await expect(await request(s,'/render',{method:'POST'}),200)).json();assert.equal(replay.report.sha256,report.sha256);
      const after=await (await expect(await request(s,'/state'),200)).json();assert.deepEqual(after.budget,state.budget);run.replayWithoutNewAttempt=true;
    }
    if(action==='verify'){
      assert.equal(state.paused,true);assert.equal(state.active,null);assert.ok(['stopped','stopped_with_code'].includes(state.container.status));
      await expect(await request(s,'/prepare',{method:'POST'}),503);await expect(await request(s,'/render',{method:'POST'}),503);
      await expect(await request(s,'/retry',{method:'POST'}),503);await expect(await request(s,'/file',{},false),401);
      const head=await expect(await request(s,'/file',{method:'HEAD'}),200);assert.equal(Number(head.headers.get('Content-Length')),report.sizeBytes);
      await expect(await request(s,'/file',{headers:{Range:`bytes=${report.sizeBytes}-`}}),416);
      run.closed={at:at(),readStatus:200,fileStatus:200,rangeStatus:206,headStatus:200,invalidRangeStatus:416,
        anonymousFileStatus:401,prepareStatus:503,renderStatus:503,retryStatus:503,remoteMp4Validated:true};
    }
    await save(`${folder}/run.json`,run);console.log(JSON.stringify({file:resolve(`${folder}/video-cloudflare.mp4`),report,state}));return;
  }
  if(action==='pause') {
    await expect(await request(s,'/pause',{method:'POST'}),200);const c=await json(configFile);c.vars.VIDEO_ENABLED='false';await save(configFile,c);
    s.phase='paused';await save(stateFile,s);console.log(JSON.stringify({paused:true,deploymentRequired:true}));
  }
}
main().catch(error=>{console.error(JSON.stringify({error:error instanceof Error?error.message:'VIDEO_PROBE_FAILED'}));process.exitCode=1;});
