import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {AvatarLook,AvatarCatalog,DEFAULT_AVATAR_SETTINGS} from '../packages/contracts/src/index';
import {avatarGallery} from '../packages/db/src/avatars';
import {publicAvatarGalleryRequest} from '../apps/web/lib/avatars';
const look=AvatarLook.parse({id:'demo',name:'Avatar',gender:'female',type:'studio_avatar',engines:['avatar_iii'],enabled:true,thumbnail:'/portrait',preview:'/preview',transparentVerified:false,ownership:'public',updatedAt:'2026-10-10'});
test('Galerie publique : pagination SQL, visibilité, moteurs, filtres littéraux et aucune URL fournisseur',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB']}));t.after(()=>mf.dispose());
  const DB=await mf.getD1Database('DB');
  await DB.exec('CREATE TABLE avatar_settings(id INTEGER PRIMARY KEY,settings_json TEXT,revision INTEGER); CREATE TABLE avatar_looks(id TEXT PRIMARY KEY,look_json TEXT,source_json TEXT,enabled INTEGER);');
  await DB.prepare('INSERT INTO avatar_settings VALUES(1,?,1)').bind(JSON.stringify({...DEFAULT_AVATAR_SETTINGS,enabled:true,defaultLookId:'look-40'})).run();
  const rows=Array.from({length:70},(_,i)=>({...look,id:'look-'+i,name:'Avatar '+String(i).padStart(2,'0'),gender:i%2?'male':'female'}));
  rows.push({...look,id:'disabled',enabled:false},{...look,id:'private',ownership:'private'},{...look,id:'premium',engines:['avatar_iv']},{...look,id:'literal',name:'Avatar 100%_test'});
  await DB.batch(rows.map(value=>DB.prepare('INSERT INTO avatar_looks VALUES(?,?,?,?)').bind(value.id,JSON.stringify(value),'SECRET_PROVIDER_URL',value.enabled?1:0)));
  const first=await avatarGallery(DB,{query:'',gender:'all',offset:0});assert.equal(first.total,71);assert.equal(first.looks.length,32);assert.equal(first.looks[0].id,'look-40');assert.equal(first.hasMore,true);
  const next=await avatarGallery(DB,{query:'',gender:'all',offset:32}),last=await avatarGallery(DB,{query:'',gender:'all',offset:64});
  assert.equal(last.hasMore,false);assert.equal(new Set([...first.looks,...next.looks,...last.looks].map(l=>l.id)).size,71);
  assert.equal((await avatarGallery(DB,{query:'',gender:'male',offset:0})).total,35);
  assert.deepEqual((await avatarGallery(DB,{query:'%_',gender:'all',offset:0})).looks.map(l=>l.id),['literal']);
  assert.equal((await avatarGallery(DB,{query:"' OR 1=1 --",gender:'all',offset:0})).total,0);
  const response=await publicAvatarGalleryRequest(new Request('https://bienvu.online/api/avatars/gallery'),{DB});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.ok(!(await response.text()).includes('SECRET_PROVIDER_URL'));
  await DB.prepare('UPDATE avatar_looks SET enabled=0 WHERE id=?').bind('look-40').run();assert.equal((await avatarGallery(DB,{query:'',gender:'all',offset:0})).looks.some(l=>l.id==='look-40'),false);
  for(const query of ['offset=-1','offset=5001','offset=abc','gender=invalid','query='+encodeURIComponent('a'.repeat(101)),'secret=true'])assert.equal((await publicAvatarGalleryRequest(new Request('https://bienvu.online/api/avatars/gallery?'+query),{DB})).status,422);
});
test('Le catalogue complet conserve les avatars au-delà du millième',()=>{
  assert.equal(AvatarCatalog.parse({enabled:true,allowPremium:false,maxSeconds:6,defaultLookId:null,looks:Array.from({length:1257},(_,i)=>({...look,id:'look-'+i}))}).looks.length,1257);
});
