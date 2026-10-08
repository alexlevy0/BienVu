import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import sharp from 'sharp';
import {photoPreview,ImportWorkSlots} from '../scripts/import-photo-preview';
import {photoPreviewUrl} from '../apps/web/lib/photo-preview-url';
import {privatePhotoPreview,respondPhotoPreview} from '../apps/web/lib/photo-previews';
import {createPrivateImport,importResult} from '../apps/web/lib/imports';
import {fixtureImportTransport} from '../scripts/import-fixtures';
import {markImportDeleting} from '../packages/db/src/imports';

test('aperçus : WebP borné, paysage/portrait, aucune modification de l’original',async()=>{
  for(const [width,height] of [[1846,852],[852,1846],[120,80]]){
    const original=await sharp({create:{width,height,channels:3,background:'#718e61'}}).jpeg().toBuffer(),before=Buffer.from(original);
    const preview=await photoPreview(original,'image/jpeg'),meta=await sharp(preview.bytes).metadata();
    assert.equal(meta.format,'webp');assert.equal(meta.exif,undefined);
    assert.ok(meta.width!<=Math.min(640,width)&&meta.height!<=Math.min(640,height));
    assert.ok(preview.bytes.length<256*1024);assert.deepEqual(original,before);
  }
  await assert.rejects(photoPreview(new Uint8Array([1,2,3]),'image/jpeg'));
  const png=await sharp({create:{width:640,height:400,channels:3,background:'#718e61'}}).png().toBuffer();
  await assert.rejects(photoPreview(png,'image/png'));await assert.rejects(photoPreview(png,'image/jpeg'));
  const tooLarge=await sharp({create:{width:2500,height:2500,channels:3,background:'#718e61'}}).jpeg().toBuffer();
  await assert.rejects(photoPreview(tooLarge,'image/jpeg'));
});
test('aperçus : file bornée, deux traitements maximum, annulation et libération idempotente',async()=>{
  const slots=new ImportWorkSlots(2,2),one=slots.tryAcquire()!,two=slots.tryAcquire()!;
  assert.equal(slots.tryAcquire(),undefined);
  const abort=new AbortController(),pending=slots.acquire(abort.signal),next=slots.acquire(AbortSignal.timeout(1000));
  const rejected=assert.rejects(pending);abort.abort();await rejected;
  const replacement=slots.acquire(AbortSignal.timeout(1000));
  await assert.rejects(slots.acquire(AbortSignal.timeout(1000)),/queue full/);
  one();one();const release=await next;assert.equal(slots.tryAcquire(),undefined);
  two();const last=await replacement;release();last();
  const a=slots.tryAcquire(),b=slots.tryAcquire();assert.ok(a);assert.ok(b);assert.equal(slots.tryAcquire(),undefined);a();b();
});
test('aperçus : seules les URL de photos privées utilisent la variante, blobs et démo conservés',()=>{
  assert.equal(photoPreviewUrl('/api/imports/import-1/photos/photo_2'),'/api/imports/import-1/photos/photo_2/preview');
  for(const url of ['blob:fixture','/api/editor-demo/assets/photo','https://other.example/image.jpg','/api/imports/a/photos/b/preview','/api/imports/a/photos/b?x=1'])
    assert.equal(photoPreviewUrl(url),url);
});
test('aperçus : original privé, ETag validé après contrôle de propriété et suppression, aucun objet dérivé',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',
    compatibilityDate:'2026-09-27',d1Databases:['DB'],r2Buckets:['MEDIA']}));t.after(()=>mf.dispose());
  const env=await mf.getBindings<Pick<CloudflareEnv,'DB'|'MEDIA'>>();
  for(const name of (await readdir(new URL('../packages/db/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())
    await env.DB.exec((await readFile(new URL(`../packages/db/migrations/${name}`,import.meta.url),'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
  const at=new Date().toISOString();
  for(const agency of ['preview-a','preview-b'])await env.DB.prepare('INSERT INTO agencies(id,owner_user_id,name,created_at,updated_at) VALUES(?,?,?,?,?)')
    .bind(agency,`owner-${agency}`,agency,at,at).run();
  const row=await createPrivateImport(env,'preview-a','https://fixtures.bienvu.example/vente','preview-fixture-key',fixtureImportTransport());
  const photo=importResult(row).listing!.photos[0],original=await env.MEDIA.get(photo.objectKey),bytes=await original!.arrayBuffer();let conversions=0;
  const convert=async(body:Uint8Array<ArrayBuffer>)=>{conversions++;const value=await photoPreview(body,'image/jpeg');
    return new Response(value.bytes,{headers:{'Content-Type':value.mime}});};
  const get=(agency='preview-a',tag?:string)=>respondPhotoPreview(()=>privatePhotoPreview(new Request('https://bienvu.online/preview',
    {headers:tag?{'If-None-Match':tag}:undefined}),env,agency,row.id,photo.id,convert));
  const first=await get();assert.equal(first.status,200);assert.equal(first.headers.get('Content-Type'),'image/webp');
  assert.equal(first.headers.get('Cache-Control'),'private, no-cache');assert.equal(first.headers.get('Vary'),'Cookie');
  const image=await sharp(await first.arrayBuffer()).metadata();assert.ok(image.width!<=640&&image.height!<=640);
  const tag=first.headers.get('ETag')!;assert.ok(tag);
  const cached=await get('preview-a',tag);assert.equal(cached.status,304);assert.equal((await cached.arrayBuffer()).byteLength,0);assert.equal(conversions,1);
  assert.equal((await get('preview-b',tag)).status,404);assert.equal(conversions,1);
  const after=await env.MEDIA.get(photo.objectKey);assert.deepEqual(await after!.arrayBuffer(),bytes);
  assert.equal((await env.MEDIA.list({prefix:`agencies/preview-a/imports/${row.id}/`})).objects.length,3);
  await markImportDeleting(env.DB,'preview-a',row.id,Date.now()+600_000,true);
  const removed=await get('preview-a',tag);assert.equal(removed.status,404);assert.equal(removed.headers.get('Cache-Control'),'private, no-store');
  assert.equal(conversions,1);
});
