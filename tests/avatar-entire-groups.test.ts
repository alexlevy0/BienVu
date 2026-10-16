import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AvatarLook,addAvatarGroupToPublication,groupAvatarPublication,type AvatarPublication} from '../packages/contracts/src/index';
import {loadAdminAvatarGroup} from '../apps/web/lib/avatar-group-selection';
const look=(id:string)=>AvatarLook.parse({id,name:'Annie '+id,gender:'female',groupId:'heygen-annie',groupName:'Annie',type:'studio_avatar',engines:['avatar_iii'],enabled:true,thumbnail:null,preview:null,ownership:'public',transparentVerified:false,updatedAt:'2026-10-17'});

test('ancien brouillon : des métadonnées partielles ne doivent pas effacer le group_id connu',()=>{
  const saved:AvatarPublication={groups:[{id:'a',name:'Annie veste',recommended:true,lookIds:['a']},{id:'b',name:'Annie chemise',recommended:false,lookIds:['b']}],defaultLookId:'b'};
  const authoritative=[look('a'),look('b')],legacy=[{id:'a'},{id:'b'}];
  const restored=groupAvatarPublication(saved,[...authoritative,...legacy]);
  assert.deepEqual(restored.groups,[{id:'heygen-annie',name:'Annie',recommended:true,lookIds:['a','b']}]);assert.equal(restored.defaultLookId,'b');
});
test('groupe entier : toutes les pages sont lues avant fusion, sans doublon ni perte du défaut',async()=>{
  const rows=Array.from({length:70},(_,i)=>look('look-'+i)),offsets:number[]=[];
  const fetched=await loadAdminAvatarGroup('heygen-annie',new AbortController().signal,async input=>{
    const url=new URL(String(input),'https://fixture.test'),offset=Number(url.searchParams.get('offset'));offsets.push(offset);
    return Response.json({looks:rows.slice(offset,offset+32),total:70,offset,hasMore:offset+32<70,revision:0});
  });assert.deepEqual(offsets,[0,32,64]);assert.equal(fetched.length,70);
  const current:AvatarPublication={groups:[{id:'heygen-annie',name:'Annie préférée',recommended:true,lookIds:['look-3']}],defaultLookId:'look-3'};
  const next=addAvatarGroupToPublication(current,'heygen-annie',fetched);assert.equal(next.groups.length,1);assert.equal(next.groups[0].lookIds.length,70);assert.equal(next.groups[0].name,'Annie préférée');assert.equal(next.defaultLookId,'look-3');
  assert.deepEqual(addAvatarGroupToPublication(next,'heygen-annie',fetched),next);
  assert.throws(()=>addAvatarGroupToPublication(current,'different-identity',fetched),/MISMATCH/);
});
test('groupe entier : curseur incohérent ou erreur réseau ne produit aucune sélection partielle',async()=>{
  await assert.rejects(loadAdminAvatarGroup('heygen-annie',new AbortController().signal,async()=>Response.json({looks:[],total:70,offset:0,hasMore:true,revision:0})),/catalogue a changé/);
  await assert.rejects(loadAdminAvatarGroup('heygen-annie',new AbortController().signal,async()=>new Response(null,{status:503})),/charger ce groupe/);
  await assert.rejects(loadAdminAvatarGroup('heygen-annie',new AbortController().signal,async()=>Response.json({looks:[{...look('other'),groupId:'homonym'}],total:1,offset:0,hasMore:false,revision:0})),/catalogue a changé/);
});
