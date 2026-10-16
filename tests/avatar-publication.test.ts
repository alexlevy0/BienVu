import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {AvatarLook,AvatarPublication,DEFAULT_AVATAR_SETTINGS,avatarPresenters,defaultAvatarCustomization,type AvatarPublication as Publication} from '../packages/contracts/src/index';
import {avatarCatalog,avatarGallery,avatarFavorites,setAvatarFavorite,admitAvatar,saveAvatarLook} from '../packages/db/src/avatars';
import {readAvatarPublication,publishAvatarSelection,adminAvatarCatalog} from '../packages/db/src/avatar-publication';
import {parseAvatarIntent} from '../apps/web/lib/avatar-intent';

const at='2026-10-16T10:00:00.000Z';
const look=(id:string,patch:Partial<AvatarLook>={})=>AvatarLook.parse({id,name:'Office '+id,gender:'female',type:'studio_avatar',engines:['avatar_iii'],enabled:true,thumbnail:'/portrait/'+id,preview:'/preview/'+id,transparentVerified:false,ownership:'public',updatedAt:at,...patch});
async function fixture(t:{after(fn:()=>Promise<unknown>):void},rows:AvatarLook[]){
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB']}));t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');
  await db.exec('CREATE TABLE avatar_settings(id INTEGER PRIMARY KEY,settings_json TEXT,revision INTEGER,updated_at TEXT); CREATE TABLE avatar_looks(id TEXT PRIMARY KEY,look_json TEXT,source_json TEXT,enabled INTEGER,revision INTEGER DEFAULT 1,updated_at TEXT); CREATE TABLE avatar_audit(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,target TEXT,payload_json TEXT,created_at TEXT); CREATE TABLE avatar_favorites(user_id TEXT,look_id TEXT,created_at TEXT,PRIMARY KEY(user_id,look_id));');
  await db.prepare('INSERT INTO avatar_settings VALUES(1,?,1,?)').bind(JSON.stringify({...DEFAULT_AVATAR_SETTINGS,enabled:true,defaultLookId:rows[0]?.id??null}),at).run();
  for(const row of rows)await saveAvatarLook(db,'fixture',row,{image:'SECRET_PROVIDER_URL',video:null});
  await db.exec((await readFile(new URL('../packages/db/migrations/0077_avatar_publication.sql',import.meta.url),'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
  return db;
}
const publication=(ids:string[],defaultLookId=ids[0]??null):Publication=>({groups:ids.map(id=>({id,name:'Présentateur '+id,lookIds:[id],recommended:false})),defaultLookId});

test('migration : sélection initiale plafonnée, défaut conservé, aucun changement des disponibilités',async t=>{
  const rows=Array.from({length:45},(_,i)=>look('look-'+i));rows.push(look('private',{ownership:'private'}),look('disabled',{enabled:false}),look('premium',{engines:['avatar_iv']}));
  const db=await fixture(t,rows),selected=await readAvatarPublication(db),catalog=await avatarCatalog(db);
  assert.equal(selected.publication.groups.length,24);assert.equal(selected.publication.groups.filter(group=>group.recommended).length,8);assert.equal(catalog.defaultLookId,'look-0');
  assert.equal(catalog.looks.length,24);assert.equal((await db.prepare('SELECT count(*) AS n FROM avatar_looks').first<{n:number}>())!.n,48);
  assert.ok(!catalog.looks.some(row=>['private','disabled','premium'].includes(row.id)));
  await saveAvatarLook(db,'sync',look('new-look'),{image:null,video:null});assert.equal((await avatarCatalog(db)).looks.some(row=>row.id==='new-look'),false);
});
test('publication atomique : même sélection, ordre, noms et variantes dans les deux parcours',async t=>{
  const db=await fixture(t,[look('a'),look('b'),look('c'),look('other')]);
  const selected:Publication={groups:[{id:'c',name:'Camille',lookIds:['c'],recommended:false},{id:'ab',name:'Alex',lookIds:['a','b'],recommended:true}],defaultLookId:'b'};
  const saved=await publishAvatarSelection(db,'admin',selected,1),catalog=await avatarCatalog(db),gallery=await avatarGallery(db,{query:'',gender:'all',offset:0});
  assert.equal(saved.revision,2);assert.equal(catalog.revision,2);assert.equal(gallery.revision,2);assert.equal(gallery.total,2);
  assert.deepEqual(catalog.looks.map(row=>row.id),['a','b','c']);assert.deepEqual(gallery.looks,catalog.looks);assert.equal(catalog.defaultLookId,'b');
  assert.deepEqual(avatarPresenters(catalog.looks).map(group=>[group.name,group.looks.length]),[['Alex',2],['Camille',1]]);
  assert.deepEqual(avatarPresenters(catalog.looks,['c']).map(group=>group.name),['Camille','Alex']);
  await assert.rejects(publishAvatarSelection(db,'other-admin',publication(['other']),1),/CONFLICT/);assert.deepEqual((await readAvatarPublication(db)).publication,selected);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM avatar_audit WHERE action='selection_published'").first<{n:number}>())!.n,1);
  assert.ok(!JSON.stringify(catalog).includes('SECRET_PROVIDER_URL'));
});
test('pagination par présentateur : les variantes ne sont jamais séparées entre deux pages',async t=>{
  const rows=Array.from({length:70},(_,i)=>look('look-'+i)),db=await fixture(t,rows);
  const groups=Array.from({length:35},(_,i)=>({id:'group-'+i,name:'Groupe '+i,lookIds:['look-'+(i*2),'look-'+(i*2+1)],recommended:false}));
  await publishAvatarSelection(db,'admin',{groups,defaultLookId:'look-0'},1);
  const first=await avatarGallery(db,{query:'',gender:'all',offset:0}),last=await avatarGallery(db,{query:'',gender:'all',offset:32});
  assert.equal(first.total,35);assert.equal(first.looks.length,64);assert.equal(avatarPresenters(first.looks).length,32);assert.equal(last.looks.length,6);assert.equal(last.hasMore,false);
  assert.equal(new Set([...first.looks,...last.looks].map(row=>row.id)).size,70);
  assert.equal((await avatarGallery(db,{query:'Groupe 34',gender:'all',offset:0})).looks.length,2);
});
test('favoris conservés en base après retrait ; ancien choix utilisable, catalogue public limité',async t=>{
  const db=await fixture(t,[look('a'),look('b')]);
  await setAvatarFavorite(db,'user',{lookId:'b',favorite:true});await publishAvatarSelection(db,'admin',publication(['a']),1);
  assert.deepEqual(await avatarFavorites(db,'user'),{ids:[]});assert.equal((await db.prepare('SELECT count(*) AS n FROM avatar_favorites').first<{n:number}>())!.n,1);
  await assert.rejects(setAvatarFavorite(db,'user',{lookId:'b',favorite:true}),/AVATAR_UNAVAILABLE/);
  const catalog=await avatarCatalog(db,'b');assert.deepEqual(catalog.looks.map(row=>row.id),['a']);assert.equal(catalog.current?.id,'b');
  assert.ok(await admitAvatar(db,defaultAvatarCustomization('b'),'fish-manon',true));
  await publishAvatarSelection(db,'admin',publication(['a','b']),2);assert.deepEqual(await avatarFavorites(db,'user'),{ids:['b']});
});
test('rejets de publication : privé, désactivé, moteur indisponible, doublon et défaut hors sélection',async t=>{
  const db=await fixture(t,[look('a'),look('private',{ownership:'private'}),look('off',{enabled:false}),look('iv',{engines:['avatar_iv']})]);
  for(const id of ['private','off','iv','missing'])await assert.rejects(publishAvatarSelection(db,'admin',publication([id]),1),/AVATAR_UNAVAILABLE/);
  assert.equal((await readAvatarPublication(db)).revision,1);
  assert.equal(AvatarPublication.safeParse(publication(['a','a'])).success,false);assert.equal(AvatarPublication.safeParse(publication(['a'],'missing')).success,false);
  const catalogue=await adminAvatarCatalog(db,{catalog:'1',query:'',gender:'all',offset:0,type:'all',availability:'all'},false);assert.equal(catalogue.total,4);
  const available=await adminAvatarCatalog(db,{catalog:'1',query:'',gender:'all',offset:0,type:'all',availability:'available'},false);assert.deepEqual(available.looks.map(row=>row.id),['a']);
  await publishAvatarSelection(db,'admin',{groups:[],defaultLookId:null},1);assert.equal((await avatarCatalog(db)).looks.length,0);
});
test('transfert du choix depuis la galerie : identifiant borné et expiration',()=>{
  assert.deepEqual(parseAvatarIntent(JSON.stringify({lookId:'look-123',at:100}),200),{lookId:'look-123',at:100});
  for(const value of [null,'{}','invalid',JSON.stringify({lookId:'../private',at:100}),JSON.stringify({lookId:'a',at:300}),JSON.stringify({lookId:'a',at:100})])assert.equal(parseAvatarIntent(value,value?.includes('"lookId":"a","at":100')?86400200:200),null);
});
