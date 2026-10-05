// Operator command for public snapshots only. Originals are immutable; all writes
// are derived previews under homepage/<published asset>/seo/ in the same bucket.
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {dirname,join} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {accountId,cloudflare,remoteSql} from './cloudflare-operator.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(new URL('../apps/renderer/package.json',import.meta.url)),sharp=require('sharp');
const rendererRequire=createRequire(require.resolve('@remotion/renderer'));
const binaries=dirname(rendererRequire.resolve(`@remotion/compositor-${process.platform==='darwin'?'darwin':'linux'}-${process.arch}/package.json`));
const ffmpeg=join(binaries,'ffmpeg');
const apply=process.argv.includes('--upload'),work=await mkdtemp(join(tmpdir(),'bienvu-home-seo-')),report=[];
const run=(command,args)=>new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,env:command===ffmpeg?{...process.env,DYLD_LIBRARY_PATH:binaries}:process.env,stdio:['ignore','ignore','pipe']});let error='';child.stderr.on('data',chunk=>{error+=chunk;});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`OPTIMIZATION_COMMAND_FAILED_${code}: ${error.slice(-500)}`)));});
// Same R2 endpoint as Wrangler, without starting a CLI for every derivative.
async function upload(key,bytes,type){
 const config=await readFile(join(homedir(),'Library/Preferences/.wrangler/config/default.toml'),'utf8'),token=config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
 if(!token)throw Error('WRANGLER_AUTH_REQUIRED');
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/bienvu-s00-private/objects/${key}`,{method:'PUT',body:bytes,signal:AbortSignal.timeout(60000),headers:{Authorization:`Bearer ${token}`,'Content-Type':type,'Content-Length':String(bytes.length),'cf-r2-data-catalog-check':'true'}});
   await response.body?.cancel();
   if(response.ok)return;
   if(response.status!==429&&response.status<500||attempt===2)throw Error(`R2_UPLOAD_${response.status}`);
  }catch(error){if(attempt===2||error.message.startsWith('R2_UPLOAD_'))throw error;}
  await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
 }
}
try{
 const rows=await remoteSql(`SELECT a.id,a.object_key,a.metadata_json,a.poster_json FROM homepage_assets a JOIN homepage_settings s ON s.id=1
   WHERE a.state='active' AND a.id IN (SELECT value FROM json_each(s.published_json)) ORDER BY a.id`);
 const settings=await cloudflare(`/accounts/${accountId}/workers/scripts/bienvu-web-probe-staging/settings`);
 if(!settings.bindings.some(binding=>binding.type==='r2_bucket'&&binding.name==='MEDIA'&&binding.bucket_name==='bienvu-s00-private'))throw Error('HOMEPAGE_BUCKET_MISMATCH');
 const files=new Map(),outputs=new Map();
 for(const row of rows){if(!/^[a-f0-9-]{36}$/.test(row.id))throw Error('PUBLIC_ASSET_ID_INVALID');const media=JSON.parse(row.metadata_json),poster=row.poster_json?JSON.parse(row.poster_json):null;
  for(const item of [{...media,url:`https://bienvu.online/api/homepage/media/${row.id}`},...(poster?[{...poster,url:`https://bienvu.online/api/homepage/media/${row.id}?poster=1`}]:[])]){
   let bytes=files.get(item.sha256);if(!bytes){const response=await fetch(item.url,{redirect:'error',signal:AbortSignal.timeout(60000)});
    const length=response.headers.get('content-length');if(!response.ok||length!==null&&Number(length)!==item.sizeBytes)throw Error(`PUBLIC_SNAPSHOT_UNAVAILABLE_${response.status}`);bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length!==item.sizeBytes||createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('PUBLIC_SNAPSHOT_HASH_MISMATCH');files.set(item.sha256,bytes);}
   const widths=item.mime==='video/mp4'?[720]:[320,640,960];
   for(const width of widths){const key=`homepage/${row.id}/seo/${item.sha256}-${width}.${item.mime==='video/mp4'?'mp4':'webp'}`,cacheKey=`${item.sha256}-${width}`,file=join(work,`${cacheKey}.${item.mime==='video/mp4'?'mp4':'webp'}`);
    if(!outputs.has(cacheKey)&&item.mime==='video/mp4'){const source=join(work,`${item.sha256}.mp4`);await writeFile(source,bytes);
     await run(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',source,'-vf',"scale='min(720,iw)':-2",'-c:v','libx264','-preset','slow','-crf','28','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-movflags','+faststart',file]);
    }else if(!outputs.has(cacheKey))await sharp(bytes).rotate().resize({width,withoutEnlargement:true}).webp({quality:72}).toFile(file);
    const output=outputs.get(cacheKey)??await readFile(file);outputs.set(cacheKey,output);if(output.length>=bytes.length){report.push({id:row.id,width,original:bytes.length,skipped:'not_smaller'});continue;}
    if(apply){ // Re-check revocation before each remote write.
     const current=await remoteSql(`SELECT 1 AS available FROM homepage_assets a,homepage_settings s WHERE a.id='${row.id}' AND a.state='active' AND EXISTS(SELECT 1 FROM json_each(s.published_json) WHERE value=a.id)`);
     if(!current.length)throw Error('PUBLIC_SNAPSHOT_WITHDRAWN');
     await upload(key,output,item.mime==='video/mp4'?'video/mp4':'image/webp');
    }
    report.push({id:row.id,width,original:bytes.length,optimized:output.length,uploaded:apply});
   }
  }
 }
 await mkdir(join(root,'evidence/local/seo'),{recursive:true});await writeFile(join(root,'evidence/local/seo/homepage-assets.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({assets:rows.length,variants:report.length,uploaded:apply,originalBytes:files.size?Array.from(files.values()).reduce((sum,bytes)=>sum+bytes.length,0):0}));
}finally{await rm(work,{recursive:true,force:true});}
