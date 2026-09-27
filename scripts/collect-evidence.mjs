import {mkdir,readFile,writeFile} from 'node:fs/promises';
const dir='docs/preuves/sprint-00';await mkdir(dir,{recursive:true});
const entries=[
  ['evidence/local/web-probe.json','web-workerd.json'],
  ['evidence/local/access-and-costs.json','acces-et-couts.json'],
  ['evidence/local/versions.json','versions.json'],
  ['/tmp/bienvu-web-build.log','build-opennext.log'],
  ['/tmp/bienvu-migration.log','migration-d1-local.log'],
  ['/tmp/bienvu-dry-run-final.log','build-workers.log'],
  ['/tmp/bienvu-typecheck-last.log','typecheck.log'],
  ['/tmp/bienvu-tests-last.log','tests-fixtures.log'],
  ['/tmp/bienvu-native-short.log','echec-renderer-natif.log'],
  ['/tmp/bienvu-docker-build.log','echec-build-docker.log'],
];
for(const [source,target] of entries){try{
  // Retirer uniquement les codes ANSI ; ne jamais lire de fichier de secrets.
  const text=await readFile(source,'utf8');
  await writeFile(`${dir}/${target}`,text.replace(/\u001b\[[0-9;]*m/g,''));
  console.log(target);
}catch(error){if(error.code!=='ENOENT')throw error;console.log(`${target} : aucune preuve disponible`);}}
