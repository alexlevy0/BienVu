import {execFileSync} from 'node:child_process';
import {evidence} from './probe-common.mjs';
const packages=JSON.parse(execFileSync('pnpm',['list','-r','--depth','0','--json'],{encoding:'utf8'}));
await evidence('versions',{at:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,pnpm:execFileSync('pnpm',['--version'],{encoding:'utf8'}).trim(),packages});
