import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {ImportInput} from '../packages/contracts/src/index';
import {ensureAgency,admitGeneration,findImport,listImportPage} from '../packages/db/src/index';
import {migrateNarrationProbe} from '../scripts/narration-fixtures';
import {fixtureImportTransport} from '../scripts/import-fixtures';
import {createPrivateImport,importResult,privateImportPhoto,purgeImport} from '../apps/web/lib/imports';
import {readPropertyGroups} from '../apps/web/lib/properties';

test('estimation : une seule lecture, aucun crédit réservé, bibliothèque privée après action explicite',async t=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));
 t.after(()=>mf.dispose());const env=await mf.getBindings<{DB:D1Database;MEDIA:R2Bucket}>();await migrateNarrationProbe(env.DB);
 const at=new Date().toISOString();for(const id of ['estimate-owner','estimate-foreign'])await env.DB.prepare('INSERT INTO auth_user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,?,?)').bind(id,id,id+'@example.invalid',at,at).run();
 const agency=await ensureAgency(env.DB,{id:'estimate-owner',email:'estimate-owner@example.invalid'}),foreign=await ensureAgency(env.DB,{id:'estimate-foreign',email:'estimate-foreign@example.invalid'});
 await env.DB.prepare('INSERT INTO hosted_import_budget VALUES(?,0,9500,0)').bind(at.slice(0,7)).run();
 const source='https://fixtures.bienvu.example/vente',key='estimate-source-key000',transport=fixtureImportTransport();let pages=0,photos=0;
 const counted={load:async(...args:Parameters<typeof transport.load>)=>{if(args[1]==='page')pages++;else photos++;return transport.load(...args);}};
 const result=await createPrivateImport(env,agency.id,source,key,counted,undefined,{estimate:true});
 assert.equal(result.status,'ready',JSON.stringify({code:result.errorCode}));assert.equal(result.estimateOnly,1);assert.equal(importResult(result).listing!.photos.length,3);
 assert.equal(pages,1);assert.equal(photos,3);
 assert.ok(Date.parse(result.expiresAt)-Date.now()<=86400_000);
 assert.equal((await readPropertyGroups(env,agency.id)).length,0);assert.equal((await listImportPage(env.DB,agency.id)).imports.length,0);
 for(const table of ['generation_runs','reservations','allocations','cost_events'])assert.equal((await env.DB.prepare(`SELECT count(*) n FROM ${table}`).first<{n:number}>())!.n,0);
 assert.equal(await findImport(env.DB,foreign.id,result.id),null);await assert.rejects(privateImportPhoto(env,foreign.id,result.id,importResult(result).listing!.photos[0].id),/NOT_FOUND/);
 const count=await env.DB.prepare('SELECT sum(attempts) n FROM import_usage').first();
 const activated=await createPrivateImport(env,agency.id,source,key,{load:async()=>{throw Error('NETWORK_MUST_NOT_RUN');}});
 assert.equal(activated.id,result.id);assert.equal(activated.estimateOnly,0);assert.equal(activated.result,result.result);
 assert.ok(Date.parse(activated.expiresAt)-Date.now()>29*86400_000);
 assert.deepEqual(await env.DB.prepare('SELECT sum(attempts) n FROM import_usage').first(),count);
 assert.equal((await readPropertyGroups(env,agency.id)).length,1);assert.equal((await listImportPage(env.DB,agency.id)).imports.length,1);
 const again=await createPrivateImport(env,agency.id,source,key,counted,undefined,{estimate:true});assert.equal(again.estimateOnly,0);assert.equal(pages,1);
 // Admission directly from a hidden estimate reveals it in the same D1 operation.
 await env.DB.exec('UPDATE generation_control SET enabled=1; UPDATE trial_policy SET free_enabled=1');
 const second=await createPrivateImport(env,agency.id,source,'estimate-generation-key000',counted,undefined,{estimate:true});
 await admitGeneration(env.DB,agency.id,'estimate-admission-key000',{listingId:second.id,voiceEnabled:false,subtitlesEnabled:false},'true');
 assert.equal((await findImport(env.DB,agency.id,second.id))!.estimateOnly,0);
 // An abandoned preparation is short-lived and can be cleaned normally.
 const abandoned=await createPrivateImport(env,foreign.id,source,'estimate-abandoned-key000',counted,undefined,{estimate:true});
 assert.equal(await purgeImport(env,foreign.id,abandoned.id,Date.now()+2*86400_000),true);
 assert.equal(await findImport(env.DB,foreign.id,abandoned.id),null);
});

test('contrat : le mode estimation est explicite ; les champs inconnus restent refusés',()=>{
 assert.equal(ImportInput.parse({url:'https://www.iadfrance.fr/annonce/test',estimate:true}).estimate,true);
 assert.equal(ImportInput.parse({url:'https://www.iadfrance.fr/annonce/test'}).estimate,undefined);
 assert.equal(ImportInput.safeParse({url:'https://www.iadfrance.fr/annonce/test',estimate:'true'}).success,false);
 assert.equal(ImportInput.safeParse({url:'https://www.iadfrance.fr/annonce/test',agencyId:'foreign'}).success,false);
});
