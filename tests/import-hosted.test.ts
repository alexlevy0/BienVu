import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertImportMode,photoNormalizer} from '../apps/web/lib/import-transport';
import {RequestFailure} from '../apps/web/lib/http';
import type {Database} from '../packages/db/src/index';
test('transport Cloudflare fermé sans origine, binding ou secret cohérents', () => {
 const request=new Request('https://bienvu.online/api/imports');
 const config={DB:{} as Database,PROBE_MODE:'remote',IMPORT_MODE:'cloudflare',BETTER_AUTH_URL:'https://bienvu.online',IMPORT_TOKEN:'a'.repeat(32),IMPORT_SERVICE:{fetch:async()=>new Response()} as unknown as Fetcher};
 assert.equal(assertImportMode(request,config),'cloudflare');
 for(const change of [{PROBE_MODE:'local'},{IMPORT_MODE:'local'},{IMPORT_TOKEN:undefined},{IMPORT_SERVICE:undefined},{BETTER_AUTH_URL:'https://elsewhere.example'}])
  assert.throws(()=>assertImportMode(request,{...config,...change}),e=>e instanceof RequestFailure&&e.code==='IMPORTS_UNAVAILABLE');
});
test('normalisation hébergée : propriétaire imposé, signal et corps borné, erreur de transfert explicite',async()=>{
 const calls:Request[]=[];
 const env={DB:{} as Database,PROBE_MODE:'remote',IMPORT_MODE:'cloudflare',BETTER_AUTH_URL:'https://bienvu.online',IMPORT_TOKEN:'a'.repeat(32),IMPORT_SERVICE:{fetch:async(request:Request)=>{calls.push(request);return new Response(null,{status:429,headers:{'X-Import-Error':'IMPORT_RESOURCE_LIMIT'}});}} as unknown as Fetcher};
 const normalize=photoNormalizer(new Request('https://bienvu.online/api/imports'),env,'agency-a','import-a');
 await assert.rejects(normalize(new Uint8Array([1,2]),'image/png',AbortSignal.timeout(1000)),e=>e instanceof RequestFailure&&e.code==='IMPORT_RESOURCE_LIMIT');
 assert.equal(calls[0].url,'https://import.internal/normalize-photo');assert.equal(calls[0].headers.get('X-Agency-ID'),'agency-a');assert.equal(calls[0].headers.get('X-Import-ID'),'import-a');
 assert.equal(calls[0].headers.get('Authorization'),`Bearer ${env.IMPORT_TOKEN}`);assert.equal(new URL(calls[0].url).search,'');
});
