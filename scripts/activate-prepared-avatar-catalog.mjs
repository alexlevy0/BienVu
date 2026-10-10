// Explicit operator action after the gallery build is deployed. Reuses the
// verified public presets and optimized R2 assets, with an audit per new look.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {cloudflare,accountId} from './cloudflare-operator.mjs';
import {AvatarLook} from '../packages/contracts/src/avatars.ts';
import {findAvatarLook,saveAvatarLook} from '../packages/db/src/avatars.ts';
const path=process.argv[2];if(!path||!process.argv.includes('--activate'))throw Error('Usage: node --import tsx scripts/activate-prepared-avatar-catalog.mjs evidence/local/... --activate');
const out=resolve(path),prepared=JSON.parse(await readFile(out+'/prepared-catalog.json','utf8'));
const response=await fetch('https://bienvu.online/api/avatars/gallery?offset=1001');assert.equal(response.status,200,'Deploy gallery with complete catalogue support before activation');await response.body?.cancel();
async function query(sql,params=[]){const result=await cloudflare(`/accounts/${accountId}/d1/database/0219384e-d439-4421-840e-32c551afdb0d/query`,{method:'POST',body:JSON.stringify({sql,params})});if(result.some(r=>!r.success))throw Error('D1_FAILED');return result.at(-1)?.results??[];}
const db={prepare(sql){let params=[];return{bind(...values){params=values;return this;},async first(){return(await query(sql,params))[0]??null;},async run(){return query(sql,params);}};}};
const settings=await query('SELECT * FROM avatar_settings'),configuration=await cloudflare(`/accounts/${accountId}/workers/scripts/bienvu-web-probe-staging/settings`),email=configuration.bindings.find(b=>b.name==='SUPER_ADMIN_EMAIL')?.text;
const [actor]=await query('SELECT id FROM auth_user WHERE lower(email)=lower(?) AND emailVerified=1',[email]);if(!actor)throw Error('ADMIN_NOT_FOUND');
let cursor=0,changed=0;
await Promise.all(Array.from({length:6},async()=>{while(cursor<prepared.length){const item=prepared[cursor++],look=AvatarLook.parse(item.look);
 if(look.ownership!=='public'||!look.enabled||!look.engines.includes('avatar_iii'))throw Error('PUBLIC_STANDARD_ONLY');
 const old=await findAvatarLook(db,look.id);if(old?.look.enabled&&old.source.image===item.source.image&&old.source.video===item.source.video)continue;
 await saveAvatarLook(db,actor.id,{...look,transparentVerified:old?.look.transparentVerified??false},item.source);changed++;
 if(changed%100===0)console.log(JSON.stringify({activated:changed}));
}}));
assert.deepEqual(await query('SELECT * FROM avatar_settings'),settings,'Default, provider spending and premium settings unchanged');
const counts=await query('SELECT count(*) AS total,sum(enabled) AS enabled FROM avatar_looks');
await writeFile(out+'/activation.json',JSON.stringify({changed,counts}),{mode:0o600});console.log(JSON.stringify({changed,counts}));
