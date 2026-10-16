// Read-only by default. --apply updates identity metadata only: no new public
// looks, no media downloads, no generation, no change to availability or prices.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {AvatarId} from '../packages/contracts/src/index.ts';
import {remoteSql} from './cloudflare-operator.mjs';
const args=new Set(process.argv.slice(2)),dir='evidence/local/avatar-identities';await mkdir(dir,{recursive:true});
const key=parseEnv(await readFile('.env.heygen','utf8')).HEYGEN_API_KEY;if(!key)throw Error('HEYGEN_API_KEY_REQUIRED');
async function pages(path){const rows=[],cursors=new Set();let token;
  do{const response=await fetch('https://api.heygen.com'+path+'&limit=50'+(token?'&token='+encodeURIComponent(token):''),{headers:{'X-Api-Key':key},redirect:'error',signal:AbortSignal.timeout(25000)});
    if(!response.ok)throw Error('HEYGEN_HTTP_'+response.status);const body=await response.json();if(!Array.isArray(body.data))throw Error('HEYGEN_RESPONSE_INVALID');
    rows.push(...body.data);token=body.next_token;if(token){if(cursors.has(token)||cursors.size>=200)throw Error('CATALOG_CURSOR_INVALID');cursors.add(token);}
  }while(token);return rows;
}
let metadata;
if(args.has('--cached'))metadata=JSON.parse(await readFile(dir+'/metadata.json','utf8'));
else{
  const groups=new Map((await pages('/v3/avatars?ownership=public')).map(group=>[group.id,group.name]));
  metadata=(await pages('/v3/avatars/looks?ownership=public')).flatMap(look=>{
    const name=groups.get(look.group_id);return AvatarId.safeParse(look.id).success&&AvatarId.safeParse(look.group_id).success&&typeof name==='string'&&name.trim()?[{id:look.id,groupId:look.group_id,groupName:name.trim().slice(0,100),tags:Array.isArray(look.tags)?look.tags.filter(tag=>typeof tag==='string'&&tag.length<=100).slice(0,32):[]}]:[];
  });
  await writeFile(dir+'/metadata.json',JSON.stringify(metadata),{mode:0o600});
}
console.log(JSON.stringify({looks:metadata.length,identities:new Set(metadata.map(look=>look.groupId)).size,apply:args.has('--apply')}));
if(!args.has('--apply'))process.exit(0);
const before=await remoteSql("SELECT id,look_json FROM avatar_looks ORDER BY id"),publication=await remoteSql('SELECT * FROM avatar_publication');
await writeFile(dir+'/database-before-'+Date.now()+'.json',JSON.stringify({looks:before,publication}),{mode:0o600});
const stored=new Set(before.map(look=>look.id));metadata=metadata.filter(look=>stored.has(look.id));
let changed=0;const literal=value=>"'"+value.replaceAll("'","''")+"'";
for(let offset=0;offset<metadata.length;offset+=40){const batch=literal(JSON.stringify(metadata.slice(offset,offset+40)));
 const rows=await remoteSql(`UPDATE avatar_looks SET look_json=json_patch(look_json,(SELECT json_remove(value,'$.id') FROM json_each(${batch}) WHERE json_extract(value,'$.id')=avatar_looks.id)),revision=revision+1
 WHERE EXISTS(SELECT 1 FROM json_each(${batch}) WHERE json_extract(value,'$.id')=avatar_looks.id AND
 (json_extract(look_json,'$.groupId') IS NOT json_extract(value,'$.groupId') OR json_extract(look_json,'$.groupName') IS NOT json_extract(value,'$.groupName') OR json_extract(look_json,'$.tags') IS NOT json_extract(value,'$.tags'))) RETURNING id`);changed+=rows.length;
}
if(changed)await remoteSql(`INSERT INTO avatar_audit VALUES(${literal(crypto.randomUUID())},'operator:avatar-identities','identity_metadata_synced','catalogue',${literal(JSON.stringify({changed}))},${literal(new Date().toISOString())})`);
const after=await remoteSql('SELECT id,look_json FROM avatar_looks ORDER BY id'),pubAfter=await remoteSql('SELECT * FROM avatar_publication');
if(JSON.stringify(publication)!==JSON.stringify(pubAfter)||before.length!==after.length)throw Error('CATALOGUE_INVARIANT_FAILED');
for(let i=0;i<before.length;i++){const a=JSON.parse(before[i].look_json),b=JSON.parse(after[i].look_json);for(const key of ['groupId','groupName','tags']){delete a[key];delete b[key];}if(JSON.stringify(a)!==JSON.stringify(b))throw Error('LOOK_INVARIANT_FAILED');}
console.log(JSON.stringify({updated:changed,publicationUnchanged:true,availabilityAndMediaUnchanged:true}));
