import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {parseEnv} from 'node:util';
const env={...process.env};
// OpenNext loads Next's config before Next's --webpack flag is parsed. The
// PostHog wrapper must select the same compiler as apps/web's build command.
env.WEBPACK='1';delete env.TURBOPACK;
// Read only this upload credential; do not make the ignored file a runtime config.
if(!env.POSTHOG_PERSONAL_API_KEY)try{env.POSTHOG_PERSONAL_API_KEY=parseEnv(readFileSync(new URL('../.env.posthog',import.meta.url),'utf8')).POSTHOG_PERSONAL_API_KEY;}catch{}
if(!env.BIENVU_RELEASE){
 const commit=env.GITHUB_SHA??execFileSync('git',['rev-parse','--short=12','HEAD'],{encoding:'utf8'}).trim();
 const dirty=!env.GITHUB_SHA&&execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim();
 env.BIENVU_RELEASE=dirty?`${commit}-${Date.now()}`:commit;
}
console.log(`Build BienVu ${env.BIENVU_RELEASE} · sourcemaps ${env.POSTHOG_PERSONAL_API_KEY?'privées vers PostHog EU':'désactivées (clé d’envoi absente)'}`);
const run=spawnSync('pnpm',['--filter','@bienvu/web','build:worker'],{stdio:'inherit',env});
if(run.status===0)writeFileSync(new URL('../apps/web/.open-next/bienvu-release.json',import.meta.url),JSON.stringify({version:env.BIENVU_RELEASE,sourcemaps:!!env.POSTHOG_PERSONAL_API_KEY}));
process.exit(run.status??1);
