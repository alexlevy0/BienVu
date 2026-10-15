import {test} from 'node:test';
import assert from 'node:assert/strict';
import {homeComparisonAssets} from '../apps/web/lib/home-comparison-assets';
import {publicHomeComparisonMedia} from '../apps/web/lib/home-comparison-media';
import {resolveHomeMedia} from '../apps/web/lib/home-media-view';

function fixture(){
 const asset=homeComparisonAssets[0],accesses:{key:string;range?:R2GetOptions['range']}[]=[];
 const bucket={head:async(key:string)=>{accesses.push({key});return {size:asset.sizeBytes};},
   get:async(key:string,options?:R2GetOptions)=>{accesses.push({key,range:options?.range});const range=options!.range as {offset:number;length:number};return {body:new Blob([new Uint8Array(Math.min(range.length,32)).fill(7)]).stream()};},
 } as Pick<R2Bucket,'head'|'get'>;
 const request=(headers:HeadersInit={},method='GET',id:string=asset.id)=>publicHomeComparisonMedia(bucket,id,new Request('https://bienvu.test/asset',{headers,method}));
 return {asset,accesses,bucket,request};
}
test('Comparateur public : seuls les médias approuvés sont accessibles, aucun chemin ou job privé',async()=>{
 const {accesses,request}=fixture();for(const id of ['6f8d15e0-927a-496a-95f9-519d27e54553','agencies/private/video.mp4','__proto__','comparison-ai.mp4'])assert.equal((await request({},'GET',id)).status,404);
 assert.equal(accesses.length,0);
 const defaults=resolveHomeMedia({version:0,slots:{}},'comparison.ai.video');assert.equal(defaults.src,`/api/homepage/comparison/${homeComparisonAssets[0].id}`);assert.equal(defaults.poster,'/images/studio-home/comparison-ai.webp');
});
test('Trois rendus publics : copies explicites et posters adaptatifs, identifiants privés toujours inaccessibles',async()=>{
 for(const name of ['standard','avatar','avatar-ai'] as const){
  const media=resolveHomeMedia({version:0,slots:{}},`renders.${name}.video`),asset=homeComparisonAssets.find(item=>media.src.endsWith(item.id));
  assert.ok(asset);assert.equal(media.width,540);assert.equal(media.height,960);assert.equal(media.duration,20);assert.equal(media.poster,`/images/studio-home/renders-${name}.webp`);
  assert.ok(asset.sizeBytes<4*1024*1024);
 }
});
test('Comparateur public : ranges exactes, recherche distante, HEAD, suffixes et validation conditionnelle',async()=>{
 const {asset,accesses,request}=fixture(),etag=`"${asset.sha256}"`;
 const range=await request({Range:'bytes=500-515'});assert.equal(range.status,206);assert.equal(range.headers.get('Content-Range'),`bytes 500-515/${asset.sizeBytes}`);assert.equal(range.headers.get('Content-Length'),'16');assert.equal(range.headers.get('Accept-Ranges'),'bytes');assert.equal((await range.arrayBuffer()).byteLength,16);assert.deepEqual(accesses.at(-1)?.range,{offset:500,length:16});
 const before=accesses.length,head=await request({Range:'bytes=-20'},'HEAD');assert.equal(head.status,206);assert.equal(head.headers.get('Content-Length'),'20');assert.equal((await head.arrayBuffer()).byteLength,0);assert.equal(accesses.length,before+1);
 assert.equal((await request({'If-None-Match':etag})).status,304);
 const full=await request({Range:'bytes=500-515','If-Range':'"old-version"'},'HEAD');assert.equal(full.status,200);assert.equal(full.headers.get('Content-Range'),null);assert.equal(full.headers.get('Content-Length'),String(asset.sizeBytes));
 assert.ok(accesses.every(a=>a.key===`public/home-comparison/${asset.sha256}.mp4`));
 for(const value of ['bytes=-0','bytes=-','bytes=9-3','bytes=0-5,8-9',`bytes=${asset.sizeBytes}-`,'bytes=9007199254740993-']){const count=accesses.length;assert.equal((await request({Range:value})).status,416);assert.equal(accesses.length,count+1);}
});
test('Comparateur public : copie manquante, taille ou empreinte incohérentes refusées sans accès au corps',async()=>{
 const {bucket,asset}=fixture();bucket.get=async()=>{throw Error('Must not read missing or incoherent copy');};
 for(const head of [null,{size:1},{size:asset.sizeBytes,customMetadata:{sha256:'0'.repeat(64)}}]){bucket.head=async()=>head as R2Object|null;assert.equal((await publicHomeComparisonMedia(bucket,asset.id,new Request('https://bienvu.test/asset'))).status,404);}
});
