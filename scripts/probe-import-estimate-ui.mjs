// Real home composer + private fixture endpoints. No portal, Runway, TTS, or trial generation.
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {saleFixture} from '../fixtures/contracts.ts';
const out=resolve('evidence/local/import-estimate-2026-10-10');await mkdir(out,{recursive:true});
const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('tsx'))('esbuild');
const me={role:'owner',user:{id:'estimate-user',name:'Utilisateur de recette',email:'fixture@example.com'},agency:{id:'agency-fixture',name:'Agence de recette',primaryColor:'#214F43',secondaryColor:'#DFE7D5',ownerUserId:'estimate-user',logoAssetId:null,createdAt:'2026-10-09T12:00:00Z',phone:null,email:'fixture@example.com',website:null,updatedAt:'2026-10-09T12:00:00Z',brandVersion:1},rights:{generationEnabled:true,developmentRemaining:100,creditTotal:100,creditReserved:0,creditConsumed:0,trial:'eligible',watermarked:false}};
const source=`import React from 'react';import {createRoot} from 'react-dom/client';import {AccountProvider} from './components/account';import {GenerationStoreProvider} from './components/generation-store';import {HomeCreate} from './components/home-create';createRoot(document.getElementById('root')).render(<AccountProvider><GenerationStoreProvider><main className="home-studio"><div className="home-workspace"><div className="home-content"><section className="home-hero-dashboard"><div className="home-hero-intro"><h1>Vous rentrez le mandat.<br/>BienVu s’occupe du <b>marketing.</b></h1><p>Création, personnalisation et publication. Tout est automatisé.</p></div><HomeCreate onLayoutChange={()=>{}}/></section></div></div></main></GenerationStoreProvider></AccountProvider>);`;
const compiled=await esbuild.build({stdin:{contents:source,loader:'tsx',resolveDir:resolve('apps/web')},bundle:true,external:['/maplibre/maplibre-gl.mjs'],platform:'browser',format:'iife',jsx:'automatic',write:false,minify:true,loader:{'.css':'empty'},define:{'process.env':'{}','process.env.NODE_ENV':'"production"'}});
const css=(await Promise.all(['style','landing','home-composer','manual-listing','customizer','avatars','maps'].map(name=>readFile('apps/web/app/'+name+'.css','utf8').catch(()=>'')))).join('\n').replace(/@import[^;]+;/g,'');
let reads=[],writes=[],failure=false;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');function json(value,status=200){if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));}
 if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(compiled.outputFiles[0].contents);return;}
 if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css; charset=utf-8');res.end(css);return;}
 if(url.pathname.startsWith('/fonts/')){try{res.end(await readFile(resolve('apps/web/public',url.pathname.slice(1))));}catch{res.writeHead(404);res.end();}return;}
 if(url.pathname==='/api/me'){json(req.headers.cookie?.includes('low=1')?{...me,rights:{...me.rights,developmentRemaining:3,creditTotal:3}}:me,req.headers.cookie?.includes('guest=1')?401:200);return;}
 if(url.pathname==='/api/voices'){json({},503);return;}
 if(url.pathname==='/api/avatars'){json({enabled:false,looks:[]});return;}
 if(req.method==='GET'&&(url.pathname==='/api/generations'||url.pathname==='/api/trial/history')){json({jobs:[],nextCursor:null});return;}
 if(url.pathname==='/api/properties'){json({properties:[],nextCursor:null});return;}
 if(url.pathname==='/api/trial'){json({enabled:true,siteKey:null,used:false,job:null});return;}
 if(url.pathname==='/api/imports'&&req.method==='GET'){json({imports:[],nextCursor:null});return;}
 if(req.method==='POST'){
  let raw='';for await(const part of req)raw+=part;const body=raw?JSON.parse(raw):{};writes.push({path:url.pathname,body,key:req.headers['idempotency-key']});
  if(url.pathname==='/api/imports'){
   if(body.estimate)reads.push(body.url);
   await new Promise(r=>setTimeout(r,body.url.includes('slow')?1800:150));
   if(failure){json({error:{code:'SOURCE_UNAVAILABLE',message:'Cette source est momentanément indisponible.'}},503);return;}
   const listing=saleFixture();listing.id=body.url.includes('second')?'second-listing':'listing-fixture';const n=body.url.includes('second')?3:body.url.includes('many')?12:8;
   listing.photos=Array.from({length:n},(_,i)=>({...listing.photos[i%3],id:'photo-'+i,contentHash:(i+1).toString(16).padStart(64,'0'),objectKey:'agencies/agency-fixture/jobs/job-fixture/photos/photo-'+i+'.png',listingId:listing.id,sourceOrder:i}));
   json({id:listing.id,status:'ready',listing,draft:null});return;
  }
  if(url.pathname.endsWith('/customize')){
   const id=url.pathname.split('/')[3];json({id,version:1,status:'needs_input',sourceKind:'url',sourceUrl:'https://www.iadfrance.fr/annonce/fixture',expiresAt:new Date(Date.now()+86400000).toISOString(),data:{fields:{title:'Appartement de recette',propertyType:'apartment',transaction:'sale',locality:'Lyon',description:null,priceCents:30000000,charges:null,area:62,rooms:3},provenance:{},originalText:null,canonicalUrl:null,warnings:[]},photos:Array.from({length:8},(_,i)=>({...saleFixture().photos[i%3],id:'photo-'+i,contentHash:(i+1).toString(16).padStart(64,'0'),objectKey:'agencies/agency-fixture/jobs/job-fixture/photos/photo-'+i+'.png',listingId:id,sourceOrder:i}))});return;
  }
  if(url.pathname==='/api/generations'){json({error:{code:'GENERATION_FAILED'}},503);return;}
  json({error:{code:'FIXTURE_ONLY'}},503);return;
 }
 if(url.pathname.includes('/photos/')){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#dfe7d5"/><rect x="40" y="40" width="220" height="240" fill="#afc4c3"/><path d="M150 40v240M40 160h220" stroke="white" stroke-width="8"/><rect x="80" y="330" width="430" height="80" rx="18" fill="#c4b296"/></svg>');return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html lang="fr"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:resolve('apps/renderer/node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell'),headless:true}),reports=[];
try{
 for(const width of [1536,390]){
  reads=[];writes=[];const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser:',e.message);});await page.goto(base);
  const input=page.locator('#home-listing-url'),cost=page.locator('.home-composer-modern .home-credit-cost'),create=page.locator('.home-composer-modern button[type=submit]');
  await input.waitFor();await page.getByRole('button',{name:'Personnaliser',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.home-customize-button').disabled);
  await input.fill('https://www.iadfrance.fr/annonce/fixture');await page.waitForTimeout(250);assert.match(await cost.innerText(),/Estimation en cours/);assert.equal(await create.isDisabled(),true);assert.equal(reads.length,0);
  await page.waitForFunction(()=>document.querySelector('.home-credit-cost').textContent.includes('9 crédits estimés')).catch(async error=>{console.log({text:await page.locator('.home-create').innerText(),reads,writes});await page.screenshot({path:out+'/failure.png',fullPage:true});throw error;});
  assert.equal(reads.length,1);assert.equal(writes.length,1);assert.equal(writes[0].body.estimate,true);assert.match(await cost.innerText(),/8 photos/);
  assert.equal(await page.locator('select[aria-label="Durée de la vidéo"]').inputValue(),'20');await page.getByRole('button',{name:'Passer à 30 s'}).waitFor();
  await page.screenshot({path:out+'/estimate-'+width+'.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
  await page.getByRole('button',{name:'Passer à 30 s'}).click();assert.equal(await page.locator('select[aria-label="Durée de la vidéo"]').inputValue(),'30');assert.equal(await page.locator('.photo-duration-advice').count(),0);assert.equal(reads.length,1);assert.equal(writes.length,1);assert.match(await cost.innerText(),/9 crédits estimés/);
  await page.getByRole('button',{name:'Personnaliser',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.customizer-photo').length===8);
  await page.locator('.home-manual-settings summary').click();await page.locator('select[aria-label="Durée de la vidéo"]').selectOption('20');await page.locator('.home-manual-settings summary').click();await page.getByRole('button',{name:'Passer à 30 s'}).click();assert.match(await page.locator('.home-manual-settings-summary').innerText(),/Vertical · 30 s/);
  assert.equal(reads.length,1);const imports=writes.filter(w=>w.path==='/api/imports');assert.equal(imports.length,2);assert.equal(imports[0].key,imports[1].key);
  assert.equal(writes.some(w=>w.path==='/api/generations'),false);
  assert.equal(await page.locator('.home-manual-toolbar .home-credit-cost').innerText(),'9 crédits');
  await page.screenshot({path:out+'/personalize-'+width+'.png',fullPage:true});await page.locator('.customizer-photo-animate').first().click();await page.waitForFunction(()=>document.querySelector('.home-manual-toolbar .home-credit-cost').textContent==='8 crédits');assert.deepEqual(errors,[]);reports.push({width,debounce:true,count:8,credits:9,reusedImport:true,zeroGenerationBeforeAction:true,durationAdvice:true,optionalDurationChange:true});await page.close();
 }
 const many=await browser.newPage();await many.goto(base);await many.waitForFunction(()=>!document.querySelector('.home-customize-button').disabled);await many.locator('#home-listing-url').fill('https://www.iadfrance.fr/annonce/many');await many.getByRole('button',{name:'Passer à 40 s'}).click();assert.equal(await many.locator('select[aria-label="Durée de la vidéo"]').inputValue(),'40');assert.match(await many.locator('.home-credit-cost').innerText(),/13 crédits estimés/);assert.equal(await many.locator('.photo-duration-advice').count(),0);await many.close();reports.push({twelvePhotos:true,recommendedDuration:40});
 const page=await browser.newPage();await page.goto(base);await page.waitForFunction(()=>!document.querySelector('.home-customize-button').disabled);reads=[];writes=[];
 await page.locator('#home-listing-url').fill('https://www.iadfrance.fr/annonce/slow');await page.waitForTimeout(950);await page.locator('#home-listing-url').fill('https://www.iadfrance.fr/annonce/second');
 await page.waitForFunction(()=>document.querySelector('.home-credit-cost').textContent.includes('4 crédits estimés'));await page.waitForTimeout(1500);assert.match(await page.locator('.home-credit-cost').innerText(),/4 crédits/);
 await page.locator('.home-composer-modern button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('.home-form-feedback')?.textContent.includes('Votre saisie est conservée'));
 const generation=writes.find(w=>w.path==='/api/generations');assert.deepEqual(generation.body.customization.runwayPhotos,[0,1,2]);assert.deepEqual(generation.body.customization.photoOrder,[0,1,2]);assert.equal(generation.body.listingId,'second-listing');assert.equal(reads.length,2);
 await page.locator('#home-listing-url').fill('Bonjour, ma maison est à Lyon');await page.waitForTimeout(1000);assert.equal(reads.length,2);await page.close();reports.push({staleResponseIgnored:true,creationMatchesEstimate:true,descriptionDoesNotImport:true});
 failure=true;const failed=await browser.newPage();await failed.goto(base);await failed.waitForFunction(()=>!document.querySelector('.home-customize-button').disabled);await failed.locator('#home-listing-url').fill('https://www.iadfrance.fr/annonce/failure');await failed.getByRole('button',{name:'Réessayer l’estimation'}).waitFor();assert.equal(await failed.locator('.home-composer-modern button[type=submit]').isDisabled(),true);failure=false;await failed.getByRole('button',{name:'Réessayer l’estimation'}).click();await failed.waitForFunction(()=>document.querySelector('.home-credit-cost').textContent.includes('9 crédits'));await failed.close();reports.push({sourceFailure:true,retry:true});
 const low=await browser.newPage();await low.context().addCookies([{name:'low',value:'1',url:base}]);await low.goto(base);await low.waitForFunction(()=>!document.querySelector('.home-customize-button').disabled);await low.locator('#home-listing-url').fill('https://www.iadfrance.fr/annonce/fixture');await low.waitForFunction(()=>document.querySelector('.home-credit-cost').textContent.includes('9 crédits'));assert.equal(await low.locator('.home-composer-modern button[type=submit]').isDisabled(),true);await low.getByRole('button',{name:'Personnaliser',exact:true}).click();await low.waitForFunction(()=>document.querySelectorAll('.customizer-photo-animate').length===8);for(const button of await low.locator('.customizer-photo-animate').all())await button.click();await low.waitForFunction(()=>document.querySelector('.home-manual-toolbar .home-credit-cost').textContent==='1 crédit');await low.close();reports.push({insufficientCreditsShown:true,canReduceAnimations:true});
 const guest=await browser.newPage();await guest.context().addCookies([{name:'guest',value:'1',url:base}]);await guest.goto(base);await guest.waitForFunction(()=>!document.querySelector('.home-customize-button').disabled);const before=reads.length;await guest.locator('#home-listing-url').fill('https://www.iadfrance.fr/annonce/fixture');await guest.waitForTimeout(1200);assert.equal(reads.length,before);assert.match(await guest.locator('.home-credit-cost').innerText(),/^1 crédit/);await guest.close();reports.push({guestClassicTrialPreserved:true,noTurnstileBypass:true});
 await writeFile(out+'/browser-report.json',JSON.stringify({at:new Date().toISOString(),fixtures:true,providerCalls:0,reports},null,2));console.log(JSON.stringify({passed:true,reports}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
