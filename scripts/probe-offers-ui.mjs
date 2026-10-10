// Production offers components with local fixtures: no real purchase or generation.
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const out=resolve('evidence/local/offers-2026-10-09');await mkdir(out,{recursive:true});
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
 if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;writes.push({path:url.pathname,body:JSON.parse(body)});json({error:'FIXTURE_ONLY'},503);return;}
 if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(compiled.outputFiles[0].contents);return;}
 if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
 if(url.pathname==='/portrait.png'){res.setHeader('Content-Type','image/png');res.end(photo);return;}
 if(url.pathname==='/demo.mp4'){res.setHeader('Content-Type','video/mp4');res.end(video);return;}
 if(url.pathname.startsWith('/fonts/')){try{res.end(await readFile(resolve('apps/web/public',url.pathname.slice(1))));}catch{res.writeHead(404);res.end();}return;}
 if(url.pathname==='/api/me'){json({...fixture,role:req.headers['x-fixture-role']??'owner'});return;}
 if(url.pathname==='/api/avatars'){json(catalog);return;}
 if(url.pathname==='/api/voices'){json({},503);return;}
 if(url.pathname==='/api/billing'){json({enabled:true,mode:'test',topupValidDays:0,subscription:null});return;}
 if(url.pathname==='/api/billing/topups'){json({purchases:[]});return;}
 if(url.pathname==='/api/credits'){json({balance,entries:[{...entry,id:url.searchParams.has('cursor')?'job-next':entry.id}],nextCursor:url.searchParams.has('cursor')?null:'fixture-next'});return;}
 res.setHeader('Content-Type','text/html');res.end('<html lang="fr"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:resolve('apps/renderer/node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell'),headless:true}),reports=[];
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
  await page.getByRole('radio',{name:/50 crédits/}).check();await page.locator('.offers-topup-consent input').check();
  assert.match(await page.locator('.offers-topup-pay').innerText(),/Acheter 50 crédits/);await page.getByRole('button',{name:/Essayer avec 20 crédits/}).click();
  assert.equal(await page.locator('.offers-topup-consent input').isChecked(),false);assert.equal(await page.getByRole('radio',{name:/20 crédits/}).isChecked(),true);
  await page.getByRole('button',{name:'Choisir Solo'}).click();assert.match(await page.locator('.offers-checkout-confirm').innerText(),/50 € HT · 50 crédits/);
  assert.equal(await page.getByRole('button',{name:'Continuer vers Stripe'}).isDisabled(),true);await page.locator('.offers-checkout-confirm input').check();
  assert.equal(await page.getByRole('button',{name:'Continuer vers Stripe'}).isEnabled(),true);await page.getByRole('button',{name:'Annuler',exact:true}).click();
  await page.getByRole('link',{name:/Voir l’historique/}).click();assert.equal(await page.locator('#credit-history').evaluate(e=>e.open),true);
  await page.getByRole('button',{name:/Voir la suite/}).click();await page.waitForFunction(()=>document.querySelectorAll('#credit-history tbody tr').length===2);assert.equal(await page.locator('#credit-history tbody tr').count(),2);
  await page.getByRole('button',{name:'Voir la démonstration du présentateur'}).click();await page.locator('.offers-demo video').waitFor();
  assert.equal(await page.locator('.offers-demo video').evaluate(e=>e.muted),true);await page.getByRole('button',{name:'Arrêter la démonstration du présentateur'}).click();assert.equal(await page.locator('.offers-demo video').count(),0);
  assert.deepEqual(errors,[]);reports.push({width,noOverflow:true,defaultCost:8,maxCost:17,newPrices:true,consent:true,discovery:true,history:true,inlineMutedDemo:true});await page.close();
 }
 const member=await browser.newPage({extraHTTPHeaders:{'x-fixture-role':'editor'}});await member.goto('http://127.0.0.1:'+server.address().port);await member.locator('.offers-wallet').waitFor();assert.equal(await member.getByRole('button',{name:'Choisir Solo'}).isDisabled(),true);await member.locator('.offers-topup-consent input').check();assert.equal(await member.locator('.offers-topup-pay').isDisabled(),true);await member.close();
 assert.deepEqual(writes,[]);await writeFile(out+'/ui-report.json',JSON.stringify({reports,editorCannotBuy:true,purchases:0,providerCalls:0},null,2));console.log(JSON.stringify(reports));
}finally{await browser.close();await new Promise(r=>server.close(r));}
