// Prepare the final Cloudflare bundle *before* uploading its source map. Deploy
// with the returned no_bundle config so Wrangler cannot invalidate those frames.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {parseEnv} from 'node:util';
import ts from 'typescript';
const web=resolve('apps/web'),index=process.argv.indexOf('--config');
if(index<0||!process.argv[index+1])throw Error('Usage: pnpm prepare:web --config apps/web/wrangler.<environment>.jsonc');
const original=resolve(process.argv[index+1]),parsed=ts.parseConfigFileTextToJson(original,readFileSync(original,'utf8'));
if(parsed.error)throw Error('Invalid Wrangler config');const config=parsed.config;
const release=JSON.parse(readFileSync(resolve(web,'.open-next/bienvu-release.json'),'utf8'));
const env={...process.env};if(!env.POSTHOG_PERSONAL_API_KEY)env.POSTHOG_PERSONAL_API_KEY=parseEnv(readFileSync('.env.posthog','utf8')).POSTHOG_PERSONAL_API_KEY;
if(!/^phx_/.test(env.POSTHOG_PERSONAL_API_KEY??''))throw Error('Missing PostHog upload credential');
const out=resolve(web,'.open-next/posthog-worker'),evidence=resolve('evidence/local/posthog-error-tracking');mkdirSync(out,{recursive:true});mkdirSync(evidence,{recursive:true,mode:0o700});
function run(label,args,extraEnv={}){const result=spawnSync('pnpm',args,{cwd:resolve('.'),env:{...env,...extraEnv},encoding:'utf8',maxBuffer:32*1024*1024});writeFileSync(resolve(evidence,label+'.log'),(result.stdout??'')+(result.stderr??''),{mode:0o600});if(result.status!==0)throw Error(`${label} failed; see private log`);}
run('worker-bundle',['--filter','@bienvu/web','exec','wrangler','deploy','--config',original,'--keep-vars','--strict','--dry-run','--outdir',out]);
run('worker-symbols',['exec','posthog-cli','sourcemap','process','--directory',out,'--release-name','bienvu-web','--release-version',release.version],{POSTHOG_CLI_HOST:'https://eu.posthog.com',POSTHOG_CLI_PROJECT_ID:'299212',POSTHOG_CLI_API_KEY:env.POSTHOG_PERSONAL_API_KEY});
config.main=resolve(out,'worker.js');config.no_bundle=true;delete config.build;
const workerMap=JSON.parse(readFileSync(resolve(out,'worker.js.map'),'utf8'));
if(!/^[a-f\d-]{36}$/i.test(workerMap.chunk_id??''))throw Error('Missing final Worker chunk ID');
config.vars={...config.vars,BIENVU_RELEASE:release.version,BIENVU_WORKER_CHUNK_ID:workerMap.chunk_id};
if(config.assets?.directory)config.assets.directory=resolve(dirname(original),config.assets.directory);
for(const db of config.d1_databases??[])if(db.migrations_dir)db.migrations_dir=resolve(dirname(original),db.migrations_dir);
const target=resolve(out,'wrangler.jsonc');writeFileSync(target,JSON.stringify(config,null,2),{mode:0o600});
writeFileSync(resolve(out,'prepared.json'),JSON.stringify({version:release.version,config:target}));
console.log(JSON.stringify({version:release.version,config:target,workerSymbolsUploaded:true}));
