import {mkdir,writeFile,access} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
await mkdir('evidence/local',{recursive:true});
const probe=randomBytes(32).toString('hex'),render=randomBytes(32).toString('hex');
for(const [file,body] of [['apps/web/.dev.vars',`PROBE_TOKEN=${probe}\n`],['apps/pipeline/.dev.vars',`PROBE_TOKEN=${probe}\nRENDER_TOKEN=${render}\n`]]) {
  try{await access(file);console.log(`${file} existe, conservé.`);}catch{await writeFile(file,body,{mode:0o600,flag:'wx'});console.log(`${file} créé, secret non affiché.`);}
}
