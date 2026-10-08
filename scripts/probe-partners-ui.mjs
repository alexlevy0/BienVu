// Real page and components; local HTTP fixtures only. No provider, email,
// customer account or production database is used by this UI recipe.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=new URL('../',import.meta.url),output=new URL('../evidence/local/partners-2026-10-08/',import.meta.url);
await mkdir(output,{recursive:true,mode:0o700});
const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('tsx/package.json'))('esbuild');
const {openBrowser}=createRequire(new URL('../apps/renderer/package.json',import.meta.url))('@remotion/renderer');
const build=await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import PartnersPage from './app/partenaires/page';import{AccountProvider}from'./components/account';import{GenerationStoreProvider}from'./components/generation-store';createRoot(document.getElementById('root')).render(<AccountProvider><GenerationStoreProvider><PartnersPage/></GenerationStoreProvider></AccountProvider>);`,
  resolveDir:new URL('../apps/web/',import.meta.url).pathname,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',minify:true,
  loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'local-navigation',setup(build){
    // The standalone fixture keeps real hrefs without Next's router runtime.
    build.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'local-navigation'}));
    build.onLoad({filter:/.*/,namespace:'local-navigation'},()=>({contents:`import React from 'react';export default React.forwardRef(function Link({href,children,prefetch,replace,scroll,...props},ref){return <a href={typeof href==='string'?href:href.pathname} ref={ref} {...props}>{children}</a>});`,loader:'jsx',resolveDir:new URL('../apps/web/',import.meta.url).pathname}));
  }}]});
const css=(await Promise.all(['apps/web/app/style.css','apps/web/app/landing.css','apps/web/app/partenaires/partenaires.css'].map(path=>readFile(new URL(path,root),'utf8')))).join('\n');
const requests=[],receipts=new Map();let failAfterStorage=false;
const publicRoot=new URL('../apps/web/public/',import.meta.url).pathname;
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),json=(body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  if(url.pathname==='/api/partners/applications'){
    if(req.method==='GET')return json({enabled:true,siteKey:'localhost-fixture'});
    let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw),key=req.headers['idempotency-key'];requests.push({key,body});
    await new Promise(r=>setTimeout(r,160));receipts.set(key,body);
    if(failAfterStorage){failAfterStorage=false;return json({error:{code:'INTERNAL_ERROR',message:'La réponse a été interrompue. Réessayez.'}},503);}
    return json({received:true},201);
  }
  if(url.pathname==='/api/me')return json({},401);
  if(url.pathname==='/api/voices')return json({},404);
  if(url.pathname.startsWith('/api/'))return json({jobs:[],drafts:[],creditsRemaining:1});
  if(url.pathname==='/bundle.js'){res.writeHead(200,{'Content-Type':'application/javascript'});return res.end(build.outputFiles[0].contents);}
  if(url.pathname==='/style.css'){res.writeHead(200,{'Content-Type':'text/css'});return res.end(css);}
  if(/^\/(images|fonts|videos)\//.test(url.pathname)){
    const file=resolve(publicRoot,'.'+url.pathname);if(!file.startsWith(publicRoot)){res.writeHead(404);return res.end();}
    try{const mime=file.endsWith('.webp')?'image/webp':file.endsWith('.mp4')?'video/mp4':'font/woff2';const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime});return res.end(bytes);}catch{res.writeHead(404);return res.end();}
  }
  res.writeHead(200,{'Content-Type':'text/html'});res.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script>
    // Explicit localhost-only challenge fixture; production uses Cloudflare.
    window.turnstile={render(container,options){const button=document.createElement('button');button.type='button';button.style.width=options.size==='compact'?'150px':'300px';button.style.minHeight=options.size==='compact'?'140px':'65px';button.textContent='Valider le contrôle de recette';button.onclick=()=>options.callback('localhost-fixture-proof');container.append(button);return'local-check';},remove(){document.querySelector('.turnstile-check')?.replaceChildren();},reset(){}};
    </script><script src="/bundle.js"></script></html>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,browser=await openBrowser('chrome',{logLevel:'error'}),results=[];
try{
  for(const width of [1536,1024,390,320]){
    requests.length=0;receipts.clear();
    const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:width,onBrowserLog:null,onLog:()=>{}}),cdp=page._client(),exceptions=[];
    cdp.on('Runtime.exceptionThrown',event=>exceptions.push(event));
    await page.setViewport({width,height:width<=390?844:1080,deviceScaleFactor:1});
    const e=async expression=>{const response=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});assert.ok(!response.value.exceptionDetails,JSON.stringify(response.value.exceptionDetails));return response.value.result.value;};
    const wait=async expression=>{const start=Date.now();while(!await e(expression)){assert.ok(Date.now()-start<12000,JSON.stringify({expression,exceptions}));await new Promise(r=>setTimeout(r,50));}};
    const click=selector=>e(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const set=(selector,value,tag='HTMLInputElement',event='input')=>e(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${tag}.prototype,'value').set.call(node,${JSON.stringify(String(value))});node.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`);
    const shot=async(name,selector)=>{await e(selector?`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start'})`:'scrollTo(0,0)');await new Promise(r=>setTimeout(r,100));const r=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(new URL(`${name}-${width}.png`,output),Buffer.from(r.value.data,'base64'));};
    await page.goto({url:base,timeout:30000,options:{waitUntil:'load'}});await wait('document.querySelector(".partner-simulator-result output")!==null');await e('document.fonts.ready');
    assert.equal(await e('document.querySelector(".partner-simulator-result output").textContent.replace(/\\s/g,"")'),'150€/mois');
    assert.equal(await e('document.querySelectorAll(".partners-page h1").length'),1);
    assert.equal(await e('document.documentElement.scrollWidth<=innerWidth+1'),true,'Débordement '+width);
    await shot('hero');await shot('simulator','.partner-value');await shot('audiences','.partner-audiences');
    await set('#partner-clients',25);await set('#partner-spend',250);await wait('document.querySelector(".partner-simulator-result output").textContent.includes("937")');
    await set('#partner-clients',1);await set('#partner-spend',19);await wait('document.querySelector(".partner-simulator-result output").textContent.includes("2,85")');
    await set('#partner-clients',99);await e('document.querySelector("#partner-clients").focus();document.querySelector("#partner-spend").focus()');
    await wait('document.querySelector("#partner-clients").value==="50"');
    await set('#partner-clients',10);await set('#partner-spend',100);
    await click('.partner-faq details:nth-of-type(2) summary');assert.equal(await e('document.querySelectorAll(".partner-faq details")[1].open'),true);
    assert.ok(await e('document.querySelectorAll(".partner-faq details")[1].textContent.includes("manuellement")'));
    await click('.partner-hero-actions>a');await wait('document.querySelector(".partner-application").getBoundingClientRect().top<innerHeight');
    await wait('!document.querySelector(".partner-submit").disabled');await shot('application','.partner-application');
    await click('.partner-submit');assert.equal(requests.length,0,'Les champs vides ne sont pas envoyés');
    await set('#partner-name','Alex Martin');await set('#partner-email','alex@fixture.example');await set('#partner-activity','photographer','HTMLSelectElement','change');
    await click('.partner-submit');await wait('document.querySelector(".turnstile-check button")!==null');assert.equal(requests.length,0,'Le premier envoi demande la vérification');
    await click('.turnstile-check button');failAfterStorage=true;await click('.partner-submit');await wait('document.querySelector(".partner-form-error")?.textContent.includes("interrompue")');
    assert.equal(await e('document.querySelector("#partner-name").value'),'Alex Martin');assert.equal(await e('document.querySelector("#partner-email").value'),'alex@fixture.example');
    await click('.partner-submit');await click('.partner-submit');await wait('document.querySelector(".partner-application-success")!==null');
    assert.equal(requests.length,2);assert.equal(requests[0].key,requests[1].key);assert.equal(receipts.size,1);
    assert.equal(await e('document.documentElement.scrollWidth<=innerWidth+1'),true,'Débordement après confirmation '+width);
    await shot('received','.partner-application');assert.equal(exceptions.length,0,JSON.stringify(exceptions));
    results.push({width,noOverflow:true,simulator:true,faq:true,challengeBeforeSubmission:true,fieldsRetainedAfterFailure:true,idempotentRetry:true});await page.close();
  }
}finally{await browser.close({silent:true});await new Promise(resolve=>server.close(resolve));}
await writeFile(new URL('ui-report.json',output),JSON.stringify({at:new Date().toISOString(),isolatedFixtures:true,results},null,2));console.log(JSON.stringify({passed:true,results}));
