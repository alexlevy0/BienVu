import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('renderer : flux transformé vers R2 dans workerd, taille et empreinte imposées',async t=>{
  const source=await readFile(new URL('../apps/pipeline/src/render-artifact.ts',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  const bytes=Buffer.alloc(65536,37),sha256=createHash('sha256').update(bytes).digest('hex');
  const script=code+`\nexport default {async fetch(request,env){
    const mode=new URL(request.url).pathname.slice(1),data=new Uint8Array(65536).fill(37);
    // Un TransformStream fait perdre la longueur connue, comme le proxy Containers.
    const body=new Response(data).body.pipeThrough(new TransformStream());
    const sizeBytes=mode==='short'?65535:mode==='long'?65537:65536;
    let error=null;
    try{await storeRenderArtifact(env.MEDIA,mode,body,{sizeBytes,sha256:mode==='checksum'?'0'.repeat(64):${JSON.stringify(sha256)}});}
    catch(e){error=e.message;}
    const stored=await env.MEDIA.get(mode);
    return Response.json({error,size:stored?.size??null,sha256:stored?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await stored.arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join(''):null});
  }};`;
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script,compatibilityDate:'2026-09-27',r2Buckets:['MEDIA']}));
  t.after(()=>mf.dispose());
  for(const mode of ['valid','short','long','checksum'])await t.test(mode,async()=>{
    const response=await mf.dispatchFetch(`http://test/${mode}`);
    assert.equal(response.status,200);const result=await response.json() as {error:string|null;size:number|null;sha256:string|null};
    if(mode==='valid'){assert.equal(result.error,null);assert.equal(result.size,bytes.length);assert.equal(result.sha256,sha256);}
    else {assert.ok(result.error);assert.equal(result.size,null);}
  });
});
