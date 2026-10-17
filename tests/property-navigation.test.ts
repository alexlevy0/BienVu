import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyCreationFields,type PropertyDetail,type PropertySummary} from '../packages/contracts/src/index';
import {cachedProperty,cachedPropertyPage,clearPropertyNavigation,forgetProperty,prepareProperty,rememberPropertyPage} from '../apps/web/lib/property-navigation';
const property:PropertySummary={id:'listing:sample',title:'Maison de démonstration',reference:'BV-01',fields:emptyCreationFields(),archived:false,createdAt:'2026-10-17T10:00:00Z',updatedAt:'2026-10-17T10:00:00Z',coverUrl:null,thumbnails:[],photoCount:0,videoCount:0,draftCount:0,visualCount:0,textCount:0,attentionCount:0,projectId:null};
const detail:PropertyDetail={property,photos:[],drafts:[],jobs:[],nextCursor:null,shares:[],caption:'',publications:[]};

test('Navigation privée : déduplication, séparation des comptes, expiration et oubli',async t=>{
 clearPropertyNavigation();t.after(clearPropertyNavigation);let calls=0,now=1000;
 t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json(detail);});
 const a=prepareProperty('alice:agency',property.id),b=prepareProperty('alice:agency',property.id);
 assert.equal(a,b);await a;assert.equal(calls,1);assert.equal(cachedProperty('bob:agency',property.id),null);
 await prepareProperty('alice:agency',property.id);assert.equal(calls,1);
 now+=30_001;assert.equal(cachedProperty('alice:agency',property.id),null);
 await prepareProperty('alice:agency',property.id);assert.equal(calls,2);
 forgetProperty('alice:agency',property.id);assert.equal(cachedProperty('alice:agency',property.id),null);
 for(let i=0;i<14;i++)await prepareProperty('alice:agency','listing:'+i);
 assert.equal(cachedProperty('alice:agency','listing:0'),null);assert.ok(cachedProperty('alice:agency','listing:13'));
});
test('Une requête en vol ne repeuple pas le cache après déconnexion',async t=>{
 clearPropertyNavigation();t.after(clearPropertyNavigation);let resolve!:(value:Response)=>void;
 t.mock.method(globalThis,'fetch',()=>new Promise<Response>(done=>{resolve=done;}));
 const pending=prepareProperty('alice:agency',property.id);clearPropertyNavigation();resolve(Response.json(detail));await pending;
 assert.equal(cachedProperty('alice:agency',property.id),null);
});
test('Un refus de lecture ne reste pas en cache et peut être retenté',async t=>{
 clearPropertyNavigation();t.after(clearPropertyNavigation);let calls=0;
 t.mock.method(globalThis,'fetch',async()=>++calls===1?Response.json({error:{message:'Accès refusé'}},{status:403}):Response.json(detail));
 await assert.rejects(prepareProperty('alice:agency',property.id),/Accès refusé/);
 assert.equal(cachedProperty('alice:agency',property.id),null);await prepareProperty('alice:agency',property.id);assert.equal(calls,2);
});
test('Le retour au catalogue utilise un cache borné, temporaire et propre au compte',t=>{
 clearPropertyNavigation();t.after(clearPropertyNavigation);let now=1000;t.mock.method(Date,'now',()=>now);
 const page={properties:[property],total:1,nextCursor:null};
 rememberPropertyPage('alice:agency','all',page);assert.equal(cachedPropertyPage('bob:agency','all'),null);
 assert.equal(cachedPropertyPage('alice:agency','all'),page);
 for(let i=0;i<3;i++)rememberPropertyPage('alice:agency','filter:'+i,page);
 assert.equal(cachedPropertyPage('alice:agency','all'),null);assert.ok(cachedPropertyPage('alice:agency','filter:2'));
 now+=30_001;assert.equal(cachedPropertyPage('alice:agency','filter:2'),null);
});
