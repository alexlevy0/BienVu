import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isPublicIp,safeUrl,checkPublicDns,readLimited} from '../packages/importers/src/safety';
import {ProbeRender,VideoFixture} from '../packages/contracts/src/index';

test('URL dangereuses et domaines trompeurs refusés',()=>{
  for(const url of ['http://agency.example/a','https://agency.example:444/a','https://user:pass@agency.example','https://localhost','https://127.1','https://2130706433','https://[::1]','https://[::ffff:127.0.0.1]','https://169.254.169.254','https://agency.example.evil.test','file:///etc/passwd','https://agency.example./']) assert.throws(()=>safeUrl(url,['agency.example']));
  assert.equal(safeUrl('https://agency.example/listing?a=1',['agency.example']).hostname,'agency.example');
});
test('IPv4/IPv6 privés, link-local, multicast et adresses mappées refusés',()=>{
  for(const ip of ['127.0.0.1','10.1.1.1','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','::1','::','fe80::1','fc00::1','::ffff:192.168.1.1','2001:db8::1']) assert.equal(isPublicIp(ip),false,ip);
  assert.equal(isPublicIp('1.1.1.1'),true);assert.equal(isPublicIp('2606:4700:4700::1111'),true);
});
test('DNS mixte privé/public et DNS vide échouent fermés',async()=>{
  const mock=async()=>Response.json({Status:0,Answer:[{type:1,data:'1.1.1.1'},{type:28,data:'::1'}]});
  await assert.rejects(checkPublicDns('agency.example',mock),/privée/);
  await assert.rejects(checkPublicDns('agency.example',async()=>Response.json({Status:0})),/privée/);
});
test('taille limitée même sans Content-Length',async()=>{
  const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array(6));c.enqueue(new Uint8Array(6));c.close();}});
  await assert.rejects(readLimited(new Response(stream),10),/MEDIA_TOO_LARGE/);
});
test('renderer refuse traversée de chemin, URL, durée et droits arbitraires',()=>{
  assert.equal(ProbeRender.safeParse({id:'../other',fixture:'short'}).success,false);
  assert.equal(ProbeRender.safeParse({id:'valid',fixture:'short',url:'https://evil.test'}).success,false);
  assert.equal(ProbeRender.safeParse({id:'valid',fixture:'custom'}).success,false);
  assert.equal(VideoFixture.safeParse({watermarked:false}).success,false);
});
