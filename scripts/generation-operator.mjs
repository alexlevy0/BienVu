// Opérateur privé : campagne isolée et plafonnée, jamais des crédits fournis par le client.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';
import {cloudflare,remoteSql,accountId} from './cloudflare-operator.mjs';
import {narrationListing,narrationBrand} from '../fixtures/narration.ts';
const dir='evidence/remote/sprint-07',stateFile=`${dir}/state.json`,cfg='apps/pipeline/wrangler.staging.generation.jsonc',imp='apps/pipeline/wrangler.staging.generation-import.jsonc';
const at=()=>new Date().toISOString(),q=x=>`'${String(x).replaceAll("'","''")}'`;
const save=(file,data)=>writeFile(file,JSON.stringify(data,null,2)+'\n',{mode:0o600});
const json=file=>readFile(file,'utf8').then(JSON.parse);
async function cli(args,name,input){const p=spawn('pnpm',['exec','wrangler',...args],{stdio:['pipe','pipe','pipe']}),out=[];p.stdout.on('data',c=>out.push(c));p.stderr.on('data',c=>out.push(c));p.stdin.end(input);const code=await new Promise((r,j)=>{p.on('error',j);p.on('close',r);});await writeFile(`${dir}/${name}.log`,Buffer.concat(out),{mode:0o600});assert.equal(code,0,`CLI_${name}_FAILED`);}
async function sql(s,statement){const result=await cloudflare(`/accounts/${accountId}/d1/database/${s.databaseId}/query`,{method:'POST',body:JSON.stringify({sql:statement})});assert.ok(result.every(x=>x.success));return result.at(-1)?.results??[];}
async function request(s,path,options={}){return fetch(s.url+path,{...options,signal:AbortSignal.timeout(60_000),headers:{Authorization:`Bearer ${(await json('.secrets/generation-campaign.json')).GENERATION_TOKEN}`,'X-Agency-ID':s.agencyId,...options.headers}});}
const action=process.argv[2];
await mkdir(dir,{recursive:true,mode:0o700});
if(action==='init'){
  assert.ok(!existsSync(stateFile),'CAMPAIGN_ALREADY_EXISTS');
  const month=at().slice(0,7),before=(await remoteSql(`SELECT *,baseline_cents+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=${q(month)}) AS total FROM hosted_import_budget WHERE month=${q(month)}`))[0];
  assert.ok(before.total+350<=before.ceiling_cents&&before.ceiling_cents<=3500,'BUDGET_LIMIT');
  await save(`${dir}/budget-intent.json`,{at:at(),before,additionalProvisionCents:350,monthlyEnvelopeCents:4000,cutoffCents:3500});
  const updated=await remoteSql(`UPDATE hosted_import_budget SET baseline_cents=baseline_cents+350 WHERE month=${q(month)} AND baseline_cents=${before.baseline_cents} RETURNING baseline_cents`);assert.equal(updated.length,1,'BUDGET_CHANGED');
  await save(`${dir}/budget-reserved.json`,{at:at(),before,afterTotalCents:before.total+350,additionalProvisionCents:350});
  const db=await cloudflare(`/accounts/${accountId}/d1/database`,{method:'POST',body:JSON.stringify({name:'bienvu-generation-s07'})});
  const secrets={GENERATION_TOKEN:randomBytes(32).toString('hex'),IMPORT_TOKEN:randomBytes(32).toString('hex'),PROBE_TOKEN:randomBytes(32).toString('hex'),RENDER_TOKEN:randomBytes(32).toString('hex')};
  await save('.secrets/generation-campaign.json',secrets);
  const s={at:at(),month,agencyId:randomUUID(),otherAgencyId:randomUUID(),databaseId:db.uuid,baselineCents:before.total,ceilingCents:before.total+350,phase:'reserved',url:'https://bienvu-generation-s07.alexlevy0.workers.dev'};
  await save(stateFile,s);
  const common={account_id:accountId,workers_dev:true,preview_urls:false,d1_databases:[{binding:'DB',database_name:'bienvu-generation-s07',database_id:s.databaseId,migrations_dir:'../../packages/db/migrations'}],r2_buckets:[{binding:'MEDIA',bucket_name:'bienvu-s00-private'}]};
  const c=await json('apps/pipeline/wrangler.generation.jsonc'),voice=await json('apps/pipeline/wrangler.staging.narration.jsonc');Object.assign(c,common,{name:'bienvu-generation-s07'});
  Object.assign(c.vars,{GOOGLE_CLOUD_PROJECT:voice.vars.GOOGLE_CLOUD_PROJECT,GOOGLE_TTS_VOICE:voice.vars.GOOGLE_TTS_VOICE,SCRIPT_MODEL:voice.vars.SCRIPT_MODEL,VIDEO_BUDGET_MONTH:month,VIDEO_MAX_ATTEMPTS:'2',VIDEO_OTHER_CENTS:String(before.total+250)});
  c.containers[0].image=(await json('apps/pipeline/wrangler.staging.video.jsonc')).containers[0].image;
  c.workflows[0].name='bienvu-generation-s07';c.services[0].service='bienvu-import-s07';await save(cfg,c);
  const importer=await json('apps/pipeline/wrangler.staging.import.jsonc');Object.assign(importer,common,{name:'bienvu-import-s07'});
  const apps=await cloudflare(`/accounts/${accountId}/containers/applications`);importer.containers[0].image=apps.find(x=>x.name==='bienvu-import-staging-importtransportcontainer').configuration.image;await save(imp,importer);
  console.log(JSON.stringify({phase:s.phase,provisionCents:350,totalProvisionCents:s.ceilingCents,databaseId:s.databaseId}));
}else{
  const s=await json(stateFile);assert.equal(s.month,at().slice(0,7),'MONTH_CHANGED');
  if(action==='deploy'){
    await cli(['d1','migrations','apply','DB','--remote','--config',cfg],'migrations');
    await cli(['deploy','--config',imp],'deploy-import');await cli(['deploy','--config',cfg],'deploy-generation');
    process.loadEnvFile('.env.voice');process.loadEnvFile('.env.script');const secrets=await json('.secrets/generation-campaign.json');
    await cli(['secret','bulk','--config',imp],'secrets-import',JSON.stringify({IMPORT_TOKEN:secrets.IMPORT_TOKEN,PROBE_TOKEN:secrets.PROBE_TOKEN}));
    await cli(['secret','bulk','--config',cfg],'secrets-generation',JSON.stringify({...secrets,OPENAI_API_KEY:process.env.OPENAI_API_KEY,GOOGLE_SERVICE_ACCOUNT_JSON:await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS||'.secrets/google-tts.json','utf8')}));
    s.phase='deployed';await save(stateFile,s);console.log(JSON.stringify({phase:s.phase}));
  }else if(action==='web'){
    const config=await json('apps/web/wrangler.staging.jsonc'),pipeline=await json(cfg);s.webUrl='https://bienvu-s07-web.alexlevy0.workers.dev';
    Object.assign(config,{name:'bienvu-s07-web',workers_dev:true,preview_urls:false,d1_databases:pipeline.d1_databases});delete config.routes;
    Object.assign(config.vars,{BETTER_AUTH_URL:s.webUrl,GOOGLE_CLIENT_ID:'',GENERATIONS_ENABLED:'true'});
    config.services=[{binding:'IMPORT_SERVICE',service:'bienvu-import-s07'},{binding:'GENERATION_SERVICE',service:'bienvu-generation-s07'}];
    const file='apps/web/wrangler.staging.generation.jsonc';await save(file,config);await cli(['deploy','--config',file],'deploy-web');
    const secrets=await json('.secrets/generation-campaign.json');await cli(['secret','bulk','--config',file],'secrets-web',JSON.stringify({BETTER_AUTH_SECRET:randomBytes(32).toString('hex'),GENERATION_TOKEN:secrets.GENERATION_TOKEN,IMPORT_TOKEN:secrets.IMPORT_TOKEN}));
    const require=createRequire(new URL('../apps/web/package.json',import.meta.url)),{hashPassword}=await import(pathToFileURL(require.resolve('better-auth/crypto')).href),users=[];
    for(const agency of[s.agencyId,s.otherAgencyId]){
      const id=`owner-${agency}`,email=`${agency}@example.invalid`,password=randomBytes(32).toString('base64url'),hash=await hashPassword(password),now=Date.now();
      await sql(s,`INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(${q(id)},'Recette privée',${q(email)},1,${now},${now});INSERT INTO auth_account(id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES(${q(randomUUID())},${q(id)},'credential',${q(id)},${q(hash)},${now},${now});`);
      const response=await fetch(s.webUrl+'/api/auth/sign-in/email',{method:'POST',headers:{Origin:s.webUrl,'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(response.status,200);
      const cookie=response.headers.get('set-cookie').split(';')[0];assert.ok(cookie.includes('session_token='));users.push({id,agencyId:agency,email,password,cookie});
    }
    await save('.secrets/generation-users.json',users);await save(stateFile,s);console.log(JSON.stringify({webUrl:s.webUrl,syntheticUsers:2}));
  }else if(action==='seed'){
    assert.equal(s.phase,'deployed');const now=at(),until=new Date(Date.now()+7*86400_000).toISOString();
    for(const [index,agency]of[s.agencyId,s.otherAgencyId].entries()){
      await sql(s,`INSERT INTO agencies(id,owner_user_id,name,phone,email,created_at,updated_at) VALUES(${q(agency)},${q(`owner-${agency}`)},'Atelier — recette privée','04 72 00 00 00','recette@bienvu.example',${q(now)},${q(now)});`);
      if(index===0)await sql(s,`INSERT INTO allocations(id,agency_id,kind,period_key,quota_limit,valid_from,valid_until) VALUES('s07-development',${q(agency)},'paid','s07-controlled',2,${q(now)},${q(until)}); INSERT INTO generation_access VALUES(${q(agency)},'s07-development',1);`);
    }
    await sql(s,`INSERT INTO hosted_import_budget VALUES(${q(s.month)},${s.baselineCents},${s.ceilingCents},0);INSERT INTO narration_budget VALUES(${q(s.month)},140,0);UPDATE generation_control SET enabled=1;`);
    const listing=narrationListing(true);listing.id=randomUUID();listing.agencyId=s.agencyId;
    for(const [i,name]of ['interieur','riviera','maison'].entries()){
      const bytes=await sharp(`apps/web/public/images/landing/${name}.webp`).jpeg({quality:90}).toBuffer(),meta=await sharp(bytes).metadata(),hash=createHash('sha256').update(bytes).digest('hex');
      const p=listing.photos[i];Object.assign(p,{agencyId:s.agencyId,listingId:listing.id,objectKey:`agencies/${s.agencyId}/imports/${listing.id}/${p.id}.jpg`,mime:'image/jpeg',width:meta.width,height:meta.height,sizeBytes:bytes.length,contentHash:hash,sourceUrl:null});
      const file=`${dir}/manual-${i}.jpg`;await writeFile(file,bytes,{mode:0o600});
      // Wrangler put ne fournit pas de customMetadata ; ajouter via API R2 S3 n'est pas nécessaire : le helper Worker privé vérifiera SHA des octets.
      await cli(['r2','object','put',`bienvu-s00-private/${p.objectKey}`,'--file',file,'--remote','--content-type','image/jpeg'],'photo-'+i);
    }
    await save(`${dir}/manual-listing.json`,listing);s.manualListingId=listing.id;
    await sql(s,`INSERT INTO listing_imports(id,agency_id,idempotency_key,source_url,source_kind,input_json,input_hash,status,result_json,created_at,lease_until,expires_at) VALUES(${q(listing.id)},${q(s.agencyId)},'s07-manual-fixture','', 'manual',${q(JSON.stringify({photos:listing.photos.map(p=>({sha256:p.contentHash}))}))},${q('f'.repeat(64))},'ready',${q(JSON.stringify(listing))},${q(now)},${q(until)},${q(until)});`);
    await sql(s,`INSERT INTO listings(id,agency_id,source_kind,source_url,canonical_url,source_host,fetched_at,adapter_version,transaction_kind,facts_json,description_json) VALUES(${q(listing.id)},${q(s.agencyId)},'manual','','','',${q(listing.fetchedAt)},${q(listing.adapterVersion)},${q(listing.transaction)},${q(JSON.stringify(listing.facts))},${q(JSON.stringify(listing.description))});`);
    s.phase='seeded';await save(stateFile,s);console.log(JSON.stringify({phase:s.phase,manualPhotos:3,allocation:2}));
  }else if(action==='enable'){
    const c=await json(cfg);c.vars.GENERATIONS_ENABLED='true';await save(cfg,c);await cli(['deploy','--config',cfg],'deploy-enabled');s.phase='enabled';await save(stateFile,s);console.log(JSON.stringify({phase:s.phase}));
  }else if(action==='run'){
    const kind=process.argv[3];assert.ok(['url','manual'].includes(kind));assert.ok(!s[kind+'Job'],'ALREADY_SUBMITTED');
    const input=kind==='manual'?{listingId:s.manualListingId}:{url:'https://www.century21.fr/trouver_logement/detail/16965965448/'};
    const started=Date.now(),options={method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':`s07-${kind}-single-request`},body:JSON.stringify(input)};
    const response=await request(s,'/generations',options),result=await response.json();await save(`${dir}/${kind}-admission.json`,{at:at(),httpStatus:response.status,latencyMs:Date.now()-started,result});assert.equal(response.status,202,JSON.stringify(result));
    s[kind+'Job']=result.id;await save(stateFile,s);
    const repeated=await request(s,'/generations',options);assert.equal((await repeated.json()).id,result.id);console.log(JSON.stringify({kind,jobId:result.id,status:result.status,admissionMs:Date.now()-started,requestReturned:true}));
  }else if(action==='status'){
    const jobs=await sql(s,`SELECT g.job_id AS id,j.status,j.stage,j.error_code AS error,g.provision_cents,j.created_at,j.updated_at,g.expires_at,a.report_json,(SELECT count(*) FROM narration_calls c WHERE c.job_id=j.id) AS calls FROM generation_runs g JOIN jobs j ON j.id=g.job_id LEFT JOIN generation_artifacts a ON a.job_id=j.id ORDER BY j.created_at`);
    const costs=await sql(s,`SELECT baseline_cents,(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs) AS imports_cents,ceiling_cents,paused FROM hosted_import_budget`);
    await save(`${dir}/status.json`,{at:at(),jobs,costs});console.log(JSON.stringify({jobs:jobs.map(({report_json,...j})=>({...j,video:report_json?{sizeBytes:JSON.parse(report_json).sizeBytes,seconds:JSON.parse(report_json).durationSeconds}:null})),costs}));
  }else if(action==='pause'){
    await sql(s,'UPDATE generation_control SET enabled=0;UPDATE narration_budget SET paused=1;UPDATE hosted_import_budget SET paused=1;');
    const c=await json(cfg);c.vars.GENERATIONS_ENABLED='false';await save(cfg,c);await cli(['deploy','--config',cfg],'deploy-paused');s.phase='paused';await save(stateFile,s);console.log(JSON.stringify({phase:s.phase}));
  }else throw new Error('ACTION_INVALID');
}
