import {mkdir,writeFile,access,readFile,appendFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
await mkdir('evidence/local',{recursive:true});
const probe=randomBytes(32).toString('hex'),render=randomBytes(32).toString('hex');
for(const [file,body] of [['apps/web/.dev.vars',`PROBE_TOKEN=${probe}\n`],['apps/pipeline/.dev.vars',`PROBE_TOKEN=${probe}\nRENDER_TOKEN=${render}\n`]]) {
  try{await access(file);console.log(`${file} existe, conservé.`);}catch{await writeFile(file,body,{mode:0o600,flag:'wx'});console.log(`${file} créé, secret non affiché.`);}
}
const webFile = 'apps/web/.dev.vars';
const existing = await readFile(webFile, 'utf8');
const additions = [];
if (!/^BETTER_AUTH_SECRET=.+$/m.test(existing)) {
  if (/^BETTER_AUTH_SECRET=/m.test(existing)) throw new Error('BETTER_AUTH_SECRET est vide : renseigner un secret local aléatoire de 32 caractères minimum.');
  additions.push(`BETTER_AUTH_SECRET=${randomBytes(32).toString('hex')}`);
}
if (!/^GOOGLE_CLIENT_SECRET=/m.test(existing)) additions.push('GOOGLE_CLIENT_SECRET=');
if (!/^LOCAL_IMPORT_TOKEN=.+$/m.test(existing)) additions.push(`LOCAL_IMPORT_TOKEN=${randomBytes(32).toString('hex')}`);
if (!/^IMPORT_MODE=/m.test(existing)) additions.push('IMPORT_MODE=local');
if (additions.length) {await appendFile(webFile, `\n${additions.join('\n')}\n`); console.log('Configuration auth locale ajoutée, secret non affiché.');}
