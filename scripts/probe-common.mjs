import {readFile,mkdir,writeFile} from 'node:fs/promises';
export async function localSecret(file,key='PROBE_TOKEN') {
  if(process.env[key])return process.env[key];
  const body=await readFile(file,'utf8');const value=body.split('\n').find(l=>l.startsWith(`${key}=`))?.slice(key.length+1);
  if(!value)throw new Error(`${key} absent`);return value;
}
export async function evidence(name,report,remote=false) {
  const dir=`evidence/${remote?'remote':'local'}`;await mkdir(dir,{recursive:true});
  await writeFile(`${dir}/${name}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
export function remoteUrl(url){return !['localhost','127.0.0.1'].includes(new URL(url).hostname);}
