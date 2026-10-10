// Public presets only. No audio upload, avatar creation or billable HeyGen call.
// Run with node --import tsx; --activate explicitly enables the selected public
// presets. Derivatives are bounded and scoped to catalogue/heygen, never jobs.
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {homedir,tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {cloudflare,accountId} from './cloudflare-operator.mjs';
import {heygenClient,downloadHeygenMedia,avatarMediaVersion,avatarCatalogKey} from '../packages/avatars/src/index.ts';
import {findAvatarLook,saveAvatarLook} from '../packages/db/src/avatars.ts';
const option=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const limit=Number(option('limit')??100),apply=process.argv.includes('--activate'),defer=process.argv.includes('--prepare-only');
if(!Number.isInteger(limit)||limit<1||limit>5000)throw Error('LIMIT_1_TO_5000');
const out=resolve(option('output')??'evidence/local/avatar-catalog-2026-10-09');await mkdir(out,{recursive:true});
const envFile=await readFile('.env.heygen','utf8'),key=envFile.match(/^HEYGEN_API_KEY\s*=\s*["']?([^\s"']+)/m)?.[1];
if(!key)throw Error('HEYGEN_CONFIG_REQUIRED');
const config=await cloudflare(`/accounts/${accountId}/workers/scripts/bienvu-web-probe-staging/settings`);
if(!config.bindings.some(b=>b.type==='r2_bucket'&&b.name==='MEDIA'&&b.bucket_name==='bienvu-s00-private'))throw Error('MEDIA_SCOPE_MISMATCH');
await writeFile(join(out,'web-bindings-before.json'),JSON.stringify(config.bindings),{mode:0o600});
async function query(sql,params=[]){const result=await cloudflare(`/accounts/${accountId}/d1/database/0219384e-d439-4421-840e-32c551afdb0d/query`,{method:'POST',body:JSON.stringify({sql,params})});
 if(result.some(r=>!r.success))throw Error('D1_FAILED');return result.at(-1)?.results??[];}
const db={prepare(sql){let params=[];return {bind(...values){params=values;return this;},async first(){return(await query(sql,params))[0]??null;},async run(){return query(sql,params);}};}};
const email=config.bindings.find(b=>b.name==='SUPER_ADMIN_EMAIL')?.text;
const [actor]=await query('SELECT id FROM auth_user WHERE lower(email)=lower(?) AND emailVerified=1',[email]);if(!actor)throw Error('ADMIN_NOT_FOUND');
const before=await query('SELECT id,look_json,source_json,enabled FROM avatar_looks');
await writeFile(join(out,'catalog-before.json'),JSON.stringify(before),{mode:0o600});
const client=heygenClient(key),entries=new Map(),cursors=new Set();let token,pages=0;
if(option('catalog-file')){for(const entry of JSON.parse(await readFile(option('catalog-file'),'utf8')))if(entry.look.ownership==='public'&&entry.look.engines.includes('avatar_iii')&&entry.source.image)entries.set(entry.look.id,entry);}
else do {if(++pages>100)throw Error('CATALOG_PAGE_LIMIT');
 const page=await client.looks('studio_avatar',token);for(const entry of page.looks)if(entry.look.type==='studio_avatar'&&entry.look.engines.includes('avatar_iii')&&entry.source.image)entries.set(entry.look.id,entry);
 if(page.nextToken){if(cursors.has(page.nextToken))throw Error('CATALOG_CURSOR_REPEAT');cursors.add(page.nextToken);}
 token=page.nextToken;if(entries.size>=limit||!token)break;
}while(true);
const selected=[...entries.values()].slice(0,limit);
await writeFile(join(out,'provider-catalog.json'),JSON.stringify(selected),{mode:0o600});
if(!apply&&!defer){console.log(JSON.stringify({eligible:selected.length,apply:false}));process.exit(0);}
const auth=await readFile(join(homedir(),'Library/Preferences/.wrangler/config/default.toml'),'utf8'),oauth=auth.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];if(!oauth)throw Error('WRANGLER_AUTH_REQUIRED');
async function upload(objectKey,bytes,type){
 const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/bienvu-s00-private/objects/${objectKey}`,{method:'PUT',body:bytes,signal:AbortSignal.timeout(60000),headers:{Authorization:`Bearer ${oauth}`,'Content-Type':type,'Content-Length':String(bytes.length),'cf-r2-data-catalog-check':'true'}});
 await response.body?.cancel();if(!response.ok)throw Error(`R2_UPLOAD_${response.status}`);
}
const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url)),rr=createRequire(require.resolve('@remotion/renderer'));
const binaries=dirname(rr.resolve(`@remotion/compositor-${process.platform==='darwin'?'darwin':'linux'}-${process.arch}/package.json`)),ffmpeg=join(binaries,'ffmpeg'),run=promisify(execFile);
const work=await mkdtemp(join(tmpdir(),'bienvu-avatar-catalog-')),report=[],prepared=[];
let cursor=0;
try {await Promise.all(Array.from({length:6},async()=>{while(cursor<selected.length){const entry=selected[cursor++],id=entry.look.id,record=before.find(row=>row.id===id),prior=record?{look:JSON.parse(record.look_json),source:JSON.parse(record.source_json)}:null;
 const row={id,originalBytes:0,thumbnailBytes:0,previewBytes:0,previewReady:false};
 try{
  if(defer&&prior?.look.enabled&&prior.source.image===entry.source.image&&prior.source.video===entry.source.video){prepared.push({look:prior.look,source:prior.source});report.push({...row,alreadyPrepared:true});continue;}
  const original=await downloadHeygenMedia(entry.source.image,2*1024*1024),version=await avatarMediaVersion(entry.source.image);
  const thumbnail=await sharp(original,{limitInputPixels:16_000_000}).rotate().resize({width:320,height:400,fit:'inside',withoutEnlargement:true}).webp({quality:72}).toBuffer();
  await upload(avatarCatalogKey(id,'thumbnail',version),thumbnail,'image/webp');row.originalBytes=original.length;row.thumbnailBytes=thumbnail.length;
  if(entry.source.video){try{
    const source=await downloadHeygenMedia(entry.source.video,10*1024*1024),videoVersion=await avatarMediaVersion(entry.source.video),input=join(work,id+'.mp4'),output=join(work,id+'-demo.mp4');
    await writeFile(input,source);await run(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',input,'-t','8','-vf',"scale='min(320,iw)':-2",'-c:v','libx264','-preset','veryfast','-crf','29','-pix_fmt','yuv420p','-an','-movflags','+faststart',output],{timeout:60000,env:{...process.env,DYLD_LIBRARY_PATH:binaries}});
    const bytes=await readFile(output);await upload(avatarCatalogKey(id,'preview',videoVersion),bytes,'video/mp4');row.previewBytes=bytes.length;row.previewReady=true;
   }catch{row.previewError='DEMO_OPTIMIZATION_UNAVAILABLE';}}
  const look={...entry.look,enabled:true,transparentVerified:prior?.look.transparentVerified??false,
    thumbnail:`/api/avatars/${id}/media?kind=thumbnail&v=${version}`,
    preview:entry.source.video?`/api/avatars/${id}/media?kind=preview&v=${await avatarMediaVersion(entry.source.video)}`:null};
  if(apply){await saveAvatarLook(db,actor.id,look,entry.source);row.activated=true;}else{prepared.push({look,source:entry.source});row.prepared=true;}
 }catch{row.error='CATALOG_ENTRY_UNAVAILABLE';}
 report.push(row);if(report.length%10===0)console.log(JSON.stringify({prepared:report.length,total:selected.length}));
}}));
 await writeFile(join(out,'optimization.json'),JSON.stringify(report,null,2));
 if(defer)await writeFile(join(out,'prepared-catalog.json'),JSON.stringify(prepared),{mode:0o600});
 const totals=await query('SELECT count(*) AS total,sum(enabled) AS enabled FROM avatar_looks');
 console.log(JSON.stringify({catalog:totals[0],prepared:defer?prepared.length:report.filter(r=>r.activated).length,demos:report.filter(r=>r.previewReady).length,
  originalBytes:report.reduce((n,r)=>n+r.originalBytes,0),thumbnailBytes:report.reduce((n,r)=>n+r.thumbnailBytes,0)}));
}finally{await rm(work,{recursive:true,force:true});}
