// Production offers components with local fixtures: no real purchase or generation.
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const out=resolve('evidence/local/topups-direct-checkout-2026-10-10');await mkdir(out,{recursive:true});
const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('tsx'))('esbuild');
const fixture={role:'owner',user:{id:'offers-user',name:'Utilisateur de recette',email:'fixture@example.com'},agency:{id:'offers-agency',name:'Agence de recette',primaryColor:'#214F43',secondaryColor:'#DFE7D5',ownerUserId:'offers-user',logoAssetId:null,createdAt:'2026-10-09T12:00:00Z',phone:null,email:'fixture@example.com',website:null,updatedAt:'2026-10-09T12:00:00Z',brandVersion:1},rights:{generationEnabled:true,developmentRemaining:100,creditTotal:103,creditReserved:0,creditConsumed:3,trial:'eligible',watermarked:false}};
const source=`import React from 'react';import {createRoot} from 'react-dom/client';import {AccountProvider} from './components/account';import {Offers} from './components/offers';
createRoot(document.getElementById('root')).render(<AccountProvider><main className="home-studio"><aside className="home-sidebar"><a className="home-brand-link" href="/">bienvu</a><p>Créer une vidéo</p><p>Mes biens</p><p>Explorer</p><p>Mon agence</p><p>Éditeur</p><p>Publications</p></aside><div className="home-workspace"><header className="home-topbar">Le studio marketing IA de votre agence immobilière.</header><div className="home-content"><Offers availability={{enabled:true,mode:'test'}}/></div></div></main></AccountProvider>);`;
const compiled=await esbuild.build({stdin:{contents:source,loader:'tsx',resolveDir:resolve('apps/web')},bundle:true,platform:'browser',format:'iife',jsx:'automatic',write:false,minify:true,loader:{'.css':'empty'},define:{'process.env':'{}','process.env.NODE_ENV':'"production"'}});
const css=(await Promise.all(['apps/web/app/style.css','apps/web/app/landing.css','apps/web/app/avatars.css','apps/web/app/abonnement/offers.css'].map(p=>readFile(p,'utf8')))).join('\n');
const photo=await readFile('evidence/local/avatar-catalog-2026-10-09/Daphne_public_1-before.png'),video=await readFile('evidence/local/heygen-2026-10-09/pilot.mp4');
const catalog={enabled:true,allowPremium:false,maxSeconds:6,defaultLookId:'look-fixture',looks:[{id:'look-fixture',name:'Daphne',gender:'female',type:'studio_avatar',engines:['avatar_iii'],enabled:true,thumbnail:'/portrait.png',preview:'/demo.mp4',transparentVerified:false,ownership:'public',updatedAt:'2026-10-09'}]};
const balance={available:100,total:103,reserved:0,consumed:3,kind:'subscription',renewalAt:'2026-11-09',rolloverAvailable:12},writes=[];
const entry={id:'job-fixture',title:'Villa de recette',at:'2026-10-09T12:00:00Z',status:'ready',reserved:0,used:1,refunded:0,animations:0,gift:false};
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 function json(value,status=200){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));}
 if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;const payment=req.headers['x-fixture-payment'];writes.push({path:url.pathname,body:JSON.parse(body),key:req.headers['idempotency-key'],payment});await new Promise(r=>setTimeout(r,350));if(payment==='expired-once'&&writes.filter(w=>w.payment===payment).length===1)json({fields:{checkout:'expired'}},409);else if(payment==='confirmed'||payment==='busy')json({fields:{checkout:payment}},409);else if(payment==='success'||payment==='expired-once')json({url:url.pathname.endsWith('/portal')?'https://billing.stripe.com/p/session/fixture':'https://checkout.stripe.com/c/pay/fixture'});else json({error:'FIXTURE_ONLY'},503);return;}
 if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(compiled.outputFiles[0].contents);return;}
 if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
 if(url.pathname==='/portrait.png'){res.setHeader('Content-Type','image/png');res.end(photo);return;}
 if(url.pathname==='/demo.mp4'){res.setHeader('Content-Type','video/mp4');res.end(video);return;}
 if(url.pathname.startsWith('/fonts/')){try{res.end(await readFile(resolve('apps/web/public',url.pathname.slice(1))));}catch{res.writeHead(404);res.end();}return;}
 if(url.pathname==='/api/me'){if(req.headers['x-fixture-role']==='guest')json({},401);else json({...fixture,role:req.headers['x-fixture-role']??'owner'});return;}
 if(url.pathname==='/api/avatars'){json(catalog);return;}
 if(url.pathname==='/api/voices'){json({},503);return;}
 if(url.pathname==='/api/billing'){json({enabled:true,mode:'test',topupValidDays:0,subscription:req.headers['x-fixture-subscription']?{plan:'agence',status:'active',cancelAtPeriodEnd:0,periodEnd:'2026-11-10',mode:'test'}:null});return;}
 if(url.pathname==='/api/billing/topups'){json({purchases:[]});return;}
 if(url.pathname==='/api/credits'){json({balance,entries:[{...entry,id:url.searchParams.has('cursor')?'job-next':entry.id}],nextCursor:url.searchParams.has('cursor')?null:'fixture-next'});return;}
 res.setHeader('Content-Type','text/html');res.end('<html lang="fr"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??resolve('apps/renderer/node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell'),headless:true}),reports=[];
try{
 for(const width of [1536,900,390,320]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.offers-wallet').waitFor();await page.getByRole('button',{name:'Choisir Solo'}).waitFor();
  assert.match(await page.locator('.offers-calculated-cost>strong').innerText(),/8 crédits = 8 €/);
  assert.deepEqual(await page.locator('.offers-equivalent strong').allTextContents(),['6 vidéos','12 vidéos','25 vidéos']);
  assert.match(await page.locator('.offers-network').innerText(),/62 vidéos/);
  await page.screenshot({path:out+'/offers-'+width+'.png',fullPage:true});
  const overflow=await page.evaluate(()=>[...document.querySelectorAll('.offers-page *')].map(e=>({tag:e.tagName,class:e.className,right:e.getBoundingClientRect().right})).filter(e=>e.right>innerWidth+2));if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))console.log({width,overflow:overflow.filter(e=>!['TABLE','THEAD','TBODY','TR','TH','TD'].includes(e.tag)).slice(0,35)});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'overflow '+width);
  await page.getByRole('switch').uncheck();assert.match(await page.locator('.offers-calculated-cost>strong').innerText(),/7 crédits = 7 €/);
  await page.getByRole('slider').fill('0');assert.match(await page.locator('.offers-calculated-cost>strong').innerText(),/1 crédit = 1 €/);
  await page.getByRole('switch').check();await page.getByText('Autres apparitions du présentateur',{exact:true}).click();await page.locator('.offers-avatar-options select').first().selectOption('full');
  await page.getByRole('slider').fill('12');await page.locator('.offers-avatar-options select').nth(1).selectOption('40');assert.match(await page.locator('.offers-calculated-cost>strong').innerText(),/17 crédits = 17 €/);
  await page.getByRole('radio',{name:/50 crédits/}).check();assert.equal(await page.locator('.offers-topup-pay').isDisabled(),false);
  assert.match(await page.locator('.offers-topup-pay').innerText(),/Acheter 50 crédits/);await page.getByRole('button',{name:/Essayer avec 20 crédits/}).click();
  assert.equal(await page.locator('.offers-topup-summary input[type=checkbox]').count(),0);assert.equal(await page.locator('.offers-topup-terms a').count(),2);assert.equal(await page.getByRole('radio',{name:/20 crédits/}).isChecked(),true);
  if(width===1536)await page.evaluate(()=>{sessionStorage.setItem('bienvu:checkout:test:offers-agency:agence','invalid-json');sessionStorage.setItem('bienvu:topup:test:offers-agency:pack20v2','invalid-json');});
  if(width===900)await page.evaluate(()=>{const get=Storage.prototype.getItem,set=Storage.prototype.setItem;Storage.prototype.getItem=function(key){if(this===sessionStorage)throw Error('Storage unavailable');return get.call(this,key);};Storage.prototype.setItem=function(key,value){if(this===sessionStorage)throw Error('Storage unavailable');return set.call(this,key,value);};});
  const beforeTopup=writes.length;await page.locator('.offers-topup-summary').screenshot({path:out+'/topup-'+width+'.png'});
  await page.evaluate(()=>{const button=document.querySelector('.offers-topup-pay');button.click();button.click();});
  await page.locator('.offers-topup-pay[aria-busy=true]').waitFor();assert.equal(await page.getByRole('radio',{name:/50 crédits/}).isDisabled(),true);
  await page.locator('.offers-topup-error').waitFor();assert.equal(writes.length,beforeTopup+1,'Une seule requête de recharge malgré deux clics');assert.deepEqual(writes.at(-1).body,{pack:'pack20v2'});assert.equal(writes.at(-1).path,'/api/billing/topups');
  const topupKey=writes.at(-1).key;assert.ok(topupKey);await page.locator('.offers-topup-pay').click();await page.locator('.offers-topup-error').waitFor();assert.equal(writes.length,beforeTopup+2);assert.equal(writes.at(-1).key,topupKey,'Reprise de recharge avec la même clé même sans stockage');
  const before=writes.length;await page.locator('.offers-card-agence button').scrollIntoViewIfNeeded();const scroll=await page.evaluate(()=>scrollY);
  await page.evaluate(()=>{const button=document.querySelector('.offers-card-agence button');button.click();button.click();});
  await page.getByRole('button',{name:'Ouverture de Stripe…'}).waitFor();assert.equal(await page.locator('.offers-card-solo button').isDisabled(),true);
  await page.locator('.offers-card-agence [role=alert]').waitFor();assert.equal(writes.length,before+1,'Une seule requête malgré deux clics');
  assert.deepEqual(writes.at(-1).body,{plan:'agence'});assert.equal(writes.at(-1).path,'/api/billing/checkout');assert.ok(writes.at(-1).key);
  assert.equal(await page.locator('.offers-checkout-confirm').count(),0);assert.ok(Math.abs(await page.evaluate(()=>scrollY)-scroll)<=1,'Aucun défilement vers une validation');
  const key=writes.at(-1).key;await page.getByRole('button',{name:'Choisir Agence'}).click();await page.locator('.offers-card-agence [role=alert]').waitFor();
  assert.equal(writes.length,before+2);assert.equal(writes.at(-1).key,key,'Reprise avec la même clé de paiement');
  assert.equal(await page.locator('.offers-purchase-terms a').count(),2);
  await page.getByRole('link',{name:/Voir l’historique/}).click();assert.equal(await page.locator('#credit-history').evaluate(e=>e.open),true);
  await page.getByRole('button',{name:/Voir la suite/}).click();await page.waitForFunction(()=>document.querySelectorAll('#credit-history tbody tr').length===2);assert.equal(await page.locator('#credit-history tbody tr').count(),2);
  await page.getByRole('button',{name:'Voir la démonstration du présentateur'}).click();await page.locator('.offers-demo video').waitFor();
  assert.equal(await page.locator('.offers-demo video').evaluate(e=>e.muted),true);await page.getByRole('button',{name:'Arrêter la démonstration du présentateur'}).click();assert.equal(await page.locator('.offers-demo video').count(),0);
  assert.deepEqual(errors,[]);reports.push({width,noOverflow:true,defaultCost:8,maxCost:17,newPrices:true,directCheckout:true,directTopup:true,topupNoCheckbox:true,doubleClickBlocked:true,retrySameKey:true,storageFailure:width===900,malformedStorage:width===1536,noConfirmationScroll:true,discovery:true,history:true,inlineMutedDemo:true});await page.close();
 }
 const member=await browser.newPage({extraHTTPHeaders:{'x-fixture-role':'editor'}});await member.goto('http://127.0.0.1:'+server.address().port);await member.locator('.offers-wallet').waitFor();assert.equal(await member.getByRole('button',{name:'Choisir Solo'}).isDisabled(),true);assert.equal(await member.locator('.offers-topup-pay').isDisabled(),true);await member.close();
 const beforeGuest=writes.length,guest=await browser.newPage({extraHTTPHeaders:{'x-fixture-role':'guest'}});await guest.goto('http://127.0.0.1:'+server.address().port);await guest.getByRole('button',{name:'Choisir Agence'}).click();await guest.waitForURL('**/connexion?next=/abonnement');assert.equal(writes.length,beforeGuest);await guest.close();
 const guestTopup=await browser.newPage({extraHTTPHeaders:{'x-fixture-role':'guest'}});await guestTopup.goto('http://127.0.0.1:'+server.address().port);await guestTopup.locator('.offers-topup-pay:not(:disabled)').waitFor();await guestTopup.locator('.offers-topup-pay').click();await guestTopup.waitForURL('**/connexion?next=/abonnement');assert.equal(writes.length,beforeGuest);await guestTopup.close();
 for(const credits of [20,50,100]){
  const page=await browser.newPage({extraHTTPHeaders:{'x-fixture-payment':'success'}});await page.route('https://checkout.stripe.com/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Stripe Checkout simulé</h1>'}));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.offers-wallet').waitFor();await page.getByRole('radio',{name:new RegExp('^'+credits+' crédits')}).check();await page.locator('.offers-topup-pay').click();await page.waitForURL('https://checkout.stripe.com/**');assert.equal(writes.at(-1).path,'/api/billing/topups');assert.deepEqual(writes.at(-1).body,{pack:'pack'+credits+'v2'});await page.close();
 }
 for(const plan of ['Solo','Agence','Équipe','Réseau']){
  const page=await browser.newPage({extraHTTPHeaders:{'x-fixture-payment':'success'}});await page.route('https://checkout.stripe.com/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Stripe Checkout simulé</h1>'}));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.getByRole('button',{name:'Choisir '+plan}).click();await page.waitForURL('https://checkout.stripe.com/**');assert.deepEqual(writes.at(-1).body,{plan:plan==='Équipe'?'equipe':plan==='Réseau'?'reseau':plan.toLowerCase()});await page.close();
 }
 const subscribed=await browser.newPage({extraHTTPHeaders:{'x-fixture-payment':'success','x-fixture-subscription':'active'}});await subscribed.route('https://billing.stripe.com/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Portail Stripe simulé</h1>'}));await subscribed.goto('http://127.0.0.1:'+server.address().port);await subscribed.getByRole('button',{name:'Gérer mon offre',exact:true}).click();await subscribed.waitForURL('https://billing.stripe.com/**');assert.equal(writes.at(-1).path,'/api/billing/portal');assert.deepEqual(writes.at(-1).body,{});await subscribed.close();
 const expired=await browser.newPage({extraHTTPHeaders:{'x-fixture-payment':'expired-once'}});await expired.route('https://checkout.stripe.com/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Stripe Checkout simulé</h1>'}));await expired.goto('http://127.0.0.1:'+server.address().port);const beforeExpired=writes.length;await expired.getByRole('button',{name:'Choisir Agence'}).click();await expired.waitForURL('https://checkout.stripe.com/**');const recovered=writes.slice(beforeExpired);assert.equal(recovered.length,2);assert.notEqual(recovered[0].key,recovered[1].key);assert.deepEqual(recovered[0].body,recovered[1].body);await expired.close();
 for(const reason of ['confirmed','busy']){const page=await browser.newPage({extraHTTPHeaders:{'x-fixture-payment':reason}});await page.goto('http://127.0.0.1:'+server.address().port);const before=writes.length;await page.getByRole('button',{name:'Choisir Agence'}).click();await page.locator('.offers-card-agence [role=alert]').waitFor();assert.equal(writes.length,before+1);assert.match(await page.locator('.offers-card-agence [role=alert]').innerText(),reason==='confirmed'?/confirmé votre paiement/:/cours de préparation/);await page.close();}
 await writeFile(out+'/ui-report.json',JSON.stringify({reports,editorCannotBuy:true,guestLogin:true,guestTopupLogin:true,threeTopupsRedirect:true,fourPlansRedirect:true,existingSubscriptionPortal:true,expiredKeyRecovered:true,pendingPaymentNoNewIntent:true,fixtureRequests:writes,purchases:0,providerCalls:0},null,2));console.log(JSON.stringify(reports));
}finally{await browser.close();await new Promise(r=>server.close(r));}
