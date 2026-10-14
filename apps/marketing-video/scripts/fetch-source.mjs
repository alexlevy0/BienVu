// Local, read-only asset recovery. Credentials and private storage keys are never logged.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {accountId,remoteSql} from '../../../scripts/cloudflare-operator.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const campaign=JSON.parse(await readFile(join(root,'campaigns/2026-10-launch.json'),'utf8'));
const sourceCache=join(repo,'evidence/local/marketing-video/source.json');
let record;
try{record=JSON.parse(await readFile(sourceCache,'utf8'))[0];}catch{}
if(record?.id!==campaign.sourceVideoId){
 if(!/^[a-f0-9-]{36}$/.test(campaign.sourceVideoId))throw new Error('INVALID_SOURCE_ID');
 const result=await remoteSql(`SELECT j.id,j.status,a.object_key AS videoKey,a.report_json AS report,v.manifest_json AS manifest FROM jobs j LEFT JOIN generation_artifacts a ON a.job_id=j.id LEFT JOIN video_manifests v ON v.job_id=j.id WHERE j.id='${campaign.sourceVideoId}'`);
 record=result[0];if(record?.status!=='ready')throw new Error('SOURCE_NOT_READY');
 await mkdir(join(repo,'evidence/local/marketing-video'),{recursive:true});
 await writeFile(sourceCache,JSON.stringify([record]),{mode:0o600});
}
const manifest=JSON.parse(record.manifest);
const report=JSON.parse(record.report);
const config=await readFile(join(homedir(),'Library/Preferences/.wrangler/config/default.toml'),'utf8');
const token=config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
if(!token)throw new Error('WRANGLER_AUTH_REQUIRED');
await mkdir(join(root,'public/source'),{recursive:true});
const assets=[['example.mp4',{objectKey:record.videoKey,sha256:report.sha256}],
 ...manifest.photos.slice(0,6).map((a,i)=>[`photo-${i+1}.jpg`,a]),
 ...manifest.photoAnimations.slice(0,3).map((a,i)=>[`animation-${i+1}.mp4`,a.asset]),
 ['avatar.webm',manifest.avatar.clips[0].asset],...manifest.audio.map((a,i)=>[`voice-${i+1}.wav`,a])];
const inventory=[];
for(const [name,asset] of assets){
 const path=join(root,'public/source',name);
 try{const cached=await readFile(path);if(createHash('sha256').update(cached).digest('hex')===asset.sha256){inventory.push({name,bytes:cached.length,sha256:asset.sha256});continue;}}catch{}
 const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/bienvu-s00-private/objects/${asset.objectKey}`,{headers:{Authorization:`Bearer ${token}`,'cf-r2-data-catalog-check':'true'},signal:AbortSignal.timeout(90000)});
 if(!response.ok)throw new Error(`ASSET_DOWNLOAD_${response.status}`);
 const bytes=Buffer.from(await response.arrayBuffer());
 const hash=createHash('sha256').update(bytes).digest('hex');
 if(hash!==asset.sha256)throw new Error('ASSET_HASH_MISMATCH');
 await writeFile(path,bytes);
 inventory.push({name,bytes:bytes.length,sha256:hash});
 console.log(JSON.stringify({name,bytes:bytes.length,sha256:hash}));
}
await mkdir(join(root,'public/fonts'),{recursive:true});await mkdir(join(root,'public/images'),{recursive:true});
for(const name of ['inter-tight.woff2','newsreader.woff2','newsreader-italic.woff2','inter-tight-OFL.txt','newsreader-OFL.txt'])await copyFile(join(repo,'apps/web/public/fonts',name),join(root,'public/fonts',name));
await copyFile(join(repo,'apps/web/public/media/ui/home-paper-noise.svg'),join(root,'public/images/home-paper-noise.svg'));
for(const name of ['paris.webp','sud.webp','lyon.webp'])await copyFile(join(repo,'apps/web/public/images/studio-home',name),join(root,'public/images',name));
await writeFile(join(root,'public/source/presentation.json'),JSON.stringify(manifest.presentation,null,2)+'\n');
await writeFile(join(root,'campaigns/assets-provenance.json'),JSON.stringify({sourceVideoId:campaign.sourceVideoId,privateMedia:true,assets:inventory},null,2)+'\n');
console.log(`Ready: ${inventory.length} verified source files, local brand assets copied.`);
