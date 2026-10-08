import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import {ImportFailure} from '../packages/contracts/src/index';
import {importListing} from '../packages/importers/src/import-listing';
import {pinnedBrowserPlan,nativeBrowserPage,readBrowserStream,type BrowserPorts,type Paused} from '../scripts/import-browser-transport';

const url='https://www.human-immobilier.fr/annonce-achat-appartement-tulle_259-4183',hosts=['www.human-immobilier.fr','human-immobilier.fr'];
const address=[{address:'93.184.216.34',family:4}], code=(value:string)=>(error:unknown)=>error instanceof ImportFailure&&error.code===value;
test('navigateur natif : une source sans recette hébergée positive reste désactivée',async()=>{
  const figaro='https://immobilier.lefigaro.fr/annonces/annonce-109267703.html';
  await assert.rejects(pinnedBrowserPlan(figaro,['immobilier.lefigaro.fr'],async()=>address),code('UNSAFE_URL'));
  await assert.rejects(pinnedBrowserPlan('https://immobilier.lefigaro.fr/annonces/',['immobilier.lefigaro.fr'],async()=>address),code('NOT_A_LISTING'));
  await assert.rejects(pinnedBrowserPlan('https://www.seloger.com/annonce/achat/auvergne-rhone-alpes/rhone-69/lyon-69000/26M7SYHC5MVH',['www.seloger.com','seloger.com'],async()=>address),code('UNSAFE_URL'));
  await assert.rejects(pinnedBrowserPlan(figaro,['immobilier.lefigaro.fr','lh3.googleusercontent.com'],async()=>address),code('UNSAFE_URL'));
});
test('navigateur natif : DNS tous les alias, IP épinglées, autres noms refusés',async()=>{
  const resolved:string[]=[];
  const plan=await pinnedBrowserPlan(url,hosts,async host=>{resolved.push(host);return address;});
  assert.deepEqual(resolved,hosts);
  assert.equal(plan.resolverRules,'MAP www.human-immobilier.fr 93.184.216.34, MAP human-immobilier.fr 93.184.216.34, MAP * ~NOTFOUND');
  for(const value of ['https://human-immobilier.fr.attacker.example/x','https://127.0.0.1/x','https://other.example/x'])
    await assert.rejects(pinnedBrowserPlan(value,hosts,async()=>address),code('UNSAFE_URL'));
  await assert.rejects(pinnedBrowserPlan(url,[...hosts,'other.example'],async()=>address),code('UNSAFE_URL'));
  await assert.rejects(pinnedBrowserPlan('https://www.human-immobilier.fr/tulle',hosts,async()=>address),code('NOT_A_LISTING'));
});

test('DNS privé/mixte/absent : aucun navigateur n’est lancé',async()=>{
  for(const values of [[],[{address:'127.0.0.1',family:4}],[...address,{address:'10.0.0.1',family:4}]]){
    let opened=0;
    await assert.rejects(nativeBrowserPage(url,hosts,AbortSignal.timeout(1000),2000,{resolve:async()=>values,open:async()=>{opened++;throw new Error('UNEXPECTED_BROWSER');}}),code('UNSAFE_URL'));
    assert.equal(opened,0);
  }
});

test('flux CDP : UTF-8/base64, plafond réel sans Content-Length, fermeture en erreur',async()=>{
  for(const mode of ['success','overflow','abort']){
    const abort=new AbortController(),chunks=[Buffer.from('été '),Buffer.from('à Lyon')];let closed=0,index=0;
    const session={send:async(method:string)=>{
      if(method==='IO.close'){closed++;return{};}
      if(mode==='abort')abort.abort();
      const chunk=chunks[index++];return{data:chunk.toString('base64'),base64Encoded:true,eof:index===chunks.length};
    }};
    if(mode==='success')assert.equal(new TextDecoder().decode(await readBrowserStream(session,'stream',100,abort.signal)),'été à Lyon');
    else if(mode==='overflow')await assert.rejects(readBrowserStream(session,'stream',3,abort.signal),code('SOURCE_UNAVAILABLE'));
    else await assert.rejects(readBrowserStream(session,'stream',100,abort.signal));
    assert.equal(closed,1);
  }
});

function fake(mode:string){
  const events=new EventEmitter(),calls:Array<{method:string;params:Record<string,unknown>}>=[];
  let closed=0,lookups=0;
  const event=(value:string,extra:Record<string,unknown>={})=>({requestId:'doc',frameId:'main',resourceType:'Document',request:{url:value,method:'GET',headers:{'User-Agent':'HeadlessChrome/fixture',Cookie:'never-forward',Authorization:'never-forward'}},...extra});
  const session={on:(name:string,listener:(event:Paused)=>void)=>{events.on(name,listener);},send:async(method:string,params:Record<string,unknown>={})=>{
    calls.push({method,params});
    if(method==='Page.getFrameTree')return{frameTree:{frame:{id:'main'}}};
    if(method==='Page.navigate')queueMicrotask(()=>events.emit('Fetch.requestPaused',event(String(params.url))));
    if(method==='Fetch.continueRequest')queueMicrotask(()=>events.emit('Fetch.requestPaused',event(url,{responseStatusCode:mode==='403'?403:mode==='foreign-redirect'||mode==='rebind'?302:200,responseHeaders:[{name:'content-type',value:'text/html'},...(mode==='foreign-redirect'?[{name:'location',value:'https://other.example/secret'}]:mode==='rebind'?[{name:'location',value:url}]:[])]})));
    if(method==='Fetch.takeResponseBodyAsStream')return{stream:'stream'};
    if(method==='IO.read')return{data:Buffer.from('<html>fixture</html>').toString('base64'),base64Encoded:true,eof:true};
    return{};
  }};
  const ports:BrowserPorts={resolve:async()=>{lookups++;return mode==='rebind'&&lookups>2?[{address:'127.0.0.1',family:4}]:address;},open:async()=>({session,close:async()=>{closed++;}})};
  return{ports,calls,closed:()=>closed,lookups:()=>lookups};
}

test('document intercepté avant rendu : aucune authentification, flux fermé et navigateur fermé',async()=>{
  const f=fake('success'),result=await nativeBrowserPage(url,hosts,AbortSignal.timeout(1000),2000,f.ports);
  assert.equal(result.browserUsed,true);assert.equal(result.mime,'text/html');assert.equal(result.bytes.length,20);assert.equal(f.closed(),1);
  const continued=f.calls.find(c=>c.method==='Fetch.continueRequest')!;
  assert.deepEqual(continued.params.headers,[{name:'User-Agent',value:'HeadlessChrome/fixture'}]);
  assert.ok(f.calls.some(c=>c.method==='IO.close'));assert.ok(f.calls.some(c=>c.method==='Fetch.failRequest'));
  assert.equal(f.calls.filter(c=>c.method==='Page.navigate').length,1);
});

test('refus 403, redirection étrangère et rebinding : arrêt avant un nouveau document',async()=>{
  for(const mode of ['403','foreign-redirect','rebind']){
    const f=fake(mode);
    await assert.rejects(nativeBrowserPage(url,hosts,AbortSignal.timeout(1000),2000,f.ports),code(mode==='403'?'SOURCE_BLOCKED':'UNSAFE_URL'));
    assert.equal(f.closed(),1);assert.equal(f.calls.filter(c=>c.method==='Page.navigate').length,1);
    assert.equal(f.calls.filter(c=>c.method==='Fetch.takeResponseBodyAsStream').length,0);
  }
});

test('launch tardif après annulation : fermé sans navigation',async()=>{
  const f=fake('success'),abort=new AbortController();let deliver:(value:Awaited<ReturnType<BrowserPorts['open']>>)=>void=()=>{};
  const opening=new Promise<Awaited<ReturnType<BrowserPorts['open']>>>(resolve=>{deliver=resolve;});
  const run=nativeBrowserPage(url,hosts,abort.signal,2000,{...f.ports,open:()=>opening});
  await new Promise(resolve=>setTimeout(resolve,5));abort.abort();deliver(await f.ports.open(await pinnedBrowserPlan(url,hosts,async()=>address)));
  await assert.rejects(run,code('IMPORT_TIMEOUT'));assert.equal(f.closed(),1);assert.equal(f.calls.length,0);
});

test('un document déjà récupéré par navigateur ne déclenche jamais une seconde acquisition',async()=>{
  let fallback=0;
  await assert.rejects(importListing(url,{agencyId:'human-browser-test',importId:'human-browser-test'}, {
    transport:{load:async()=>({url,bytes:new TextEncoder().encode('<html><title>Structure inconnue</title></html>'),mime:'text/html',sourceBytes:59,browserUsed:true})},
    browserHtml:async()=>{fallback++;return await readFile(new URL('../fixtures/imports/human.html',import.meta.url),'utf8');},store:async()=>{}
  }),code('NOT_A_LISTING'));
  assert.equal(fallback,0);
});
