// Déploiement du parcours privé sur bienvu.online, accès limité à l'agence d'Alex.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {remoteSql} from './cloudflare-operator.mjs';
assert.equal(new Date().toISOString().slice(0,7),'2026-09','MONTH_RECONCILIATION_REQUIRED');
const dir='evidence/remote/sprint-07',cfg='apps/pipeline/wrangler.staging.product-generation.jsonc',web='apps/web/wrangler.staging.jsonc',secretFile='.secrets/generation-development.json';
const json=file=>readFile(file,'utf8').then(JSON.parse),save=(file,data)=>writeFile(file,JSON.stringify(data,null,2)+'\n',{mode:0o600});
async function cli(args,name,input){const p=spawn('pnpm',['exec','wrangler',...args],{stdio:['pipe','pipe','pipe']}),out=[];p.stdout.on('data',c=>out.push(c));p.stderr.on('data',c=>out.push(c));p.stdin.end(input);const code=await new Promise((r,j)=>{p.on('error',j);p.on('close',r);});await writeFile(`${dir}/${name}.log`,Buffer.concat(out),{mode:0o600});assert.equal(code,0,`CLI_${name}_FAILED`);}
if(process.argv[2]==='configure'){
  assert.ok(!existsSync(cfg)&&!existsSync(secretFile),'DEVELOPMENT_ALREADY_CONFIGURED');
  const pipeline=await json('apps/pipeline/wrangler.staging.generation.jsonc'),site=await json(web);
  const budget=(await remoteSql("SELECT baseline_cents+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month='2026-09') AS total,ceiling_cents FROM hosted_import_budget WHERE month='2026-09'"))[0];
  assert.ok(budget.total+170<=budget.ceiling_cents,'BUDGET_LIMIT');
  const importVars=await readFile('apps/pipeline/.dev.vars.import.staging','utf8'),importToken=importVars.match(/^IMPORT_TOKEN=(.+)$/m)?.[1]?.trim();assert.ok(importToken?.length>=32);
  const secrets={GENERATION_TOKEN:randomBytes(32).toString('hex'),RENDER_TOKEN:randomBytes(32).toString('hex'),IMPORT_TOKEN:importToken};await save(secretFile,secrets);
  Object.assign(pipeline,{name:'bienvu-generation-development',d1_databases:site.d1_databases});pipeline.services=[{binding:'IMPORT_SERVICE',service:'bienvu-import-staging'}];pipeline.workflows[0].name='bienvu-generation-development';
  Object.assign(pipeline.vars,{GENERATIONS_ENABLED:'true',VIDEO_OTHER_CENTS:String(budget.total+120),VIDEO_MAX_ATTEMPTS:'1'});await save(cfg,pipeline);
  site.vars.GENERATIONS_ENABLED='true';site.services=site.services.filter(x=>x.binding!=='GENERATION_SERVICE');site.services.push({binding:'GENERATION_SERVICE',service:pipeline.name});await save(web,site);
  await save(`${dir}/development-intent.json`,{at:new Date().toISOString(),existingProvisionCents:budget.total,additionalReservationOnUseCents:170,quota:1,allocationKind:'paid',trialUntouched:true});
  console.log(JSON.stringify({configured:true,controlledQuota:1,additionalCostNow:0}));
}else if(process.argv[2]==='deploy'){
  await cli(['d1','migrations','apply','DB','--remote','--config',web],'product-migrations');
  await cli(['deploy','--config',cfg],'product-pipeline');
  process.loadEnvFile('.env.voice');process.loadEnvFile('.env.script');const secrets=await json(secretFile);
  await cli(['secret','bulk','--config',cfg],'product-pipeline-secrets',JSON.stringify({...secrets,OPENAI_API_KEY:process.env.OPENAI_API_KEY,GOOGLE_SERVICE_ACCOUNT_JSON:await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS||'.secrets/google-tts.json','utf8')}));
  await cli(['secret','bulk','--config',web],'product-web-secret',JSON.stringify({GENERATION_TOKEN:secrets.GENERATION_TOKEN}));
  await cli(['deploy','--config',web],'product-web');
  // INSERT ... ON CONFLICT ne recharge jamais une allocation déjà consommée.
  const now=new Date().toISOString(),until=new Date(Date.now()+7*86400_000).toISOString();
  await remoteSql(`INSERT INTO allocations(id,agency_id,kind,period_key,quota_limit,valid_from,valid_until)
    SELECT 's07-alex-development',a.id,'paid','s07-controlled',1,'${now}','${until}' FROM agencies a JOIN auth_user u ON u.id=a.owner_user_id WHERE u.email='alexlevy0@gmail.com'
    ON CONFLICT(id) DO NOTHING;
    INSERT INTO generation_access(agency_id,allocation_id,enabled) SELECT agency_id,id,1 FROM allocations WHERE id='s07-alex-development' ON CONFLICT(agency_id) DO NOTHING;
    INSERT INTO narration_budget(month,envelope_cents,paused) VALUES('2026-09',70,0) ON CONFLICT(month) DO NOTHING;
    UPDATE generation_control SET enabled=1,updated_at='${now}' WHERE id='generations';`);
  const grant=await remoteSql("SELECT a.quota_limit,a.reserved,a.consumed,g.enabled FROM generation_access g JOIN allocations a ON a.id=g.allocation_id WHERE a.id='s07-alex-development'");
  assert.equal(grant.length,1);await save(`${dir}/development-deployed.json`,{at:new Date().toISOString(),grant,publicTrialEnabled:false});console.log(JSON.stringify({deployed:true,grant,publicTrialEnabled:false}));
}else throw new Error('ACTION_INVALID');
