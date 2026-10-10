// Real offers/admin components; local HTTP payment fixtures, no provider purchase.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const root=new URL('../',import.meta.url),output=new URL('../evidence/local/promotions/',import.meta.url);
await mkdir(output,{recursive:true,mode:0o700});
const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('tsx/package.json'))('esbuild');
const build=await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{Offers}from'./components/offers';import{AdminPromotions}from'./components/admin-promotions';createRoot(document.getElementById('root')).render(location.pathname.startsWith('/admin')?<main className="admin-shell"><h1>Super admin · Codes bonus</h1><AdminPromotions/></main>:<div className="home-studio"><Offers availability={{enabled:true,mode:'test'}}/></div>);`,resolveDir:new URL('../apps/web/',import.meta.url).pathname,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},plugins:[{name:'local-only-account-and-navigation',setup(b){
 b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'local'}));b.onLoad({filter:/.*/,namespace:'local'},()=>({contents:`import React from 'react';export default function Link({href,children,prefetch,...props}){return <a href={href} {...props}>{children}</a>}`,loader:'jsx',resolveDir:new URL('../apps/web/',import.meta.url).pathname}));
 b.onLoad({filter:/\/components\/account\.tsx$/},()=>({contents:`export function useAccount(){return {me:window.__me,loading:false,refreshRights:async()=>{}}}`,loader:'js'}));
 }}]});
const css=(await Promise.all(['apps/web/app/style.css','apps/web/app/landing.css','apps/web/app/abonnement/offers.css','apps/web/app/admin/admin.css','apps/web/app/admin/promotions.css'].map(p=>readFile(new URL(p,root),'utf8')))).join('\n');
const settings={code:'BIENVU20',name:'Campagne de lancement',active:true,startsAt:null,endsAt:null,maxRedemptions:100,plans:['solo','agence','equipe','reseau']},id=crypto.randomUUID();let code={...settings,id,version:1,reserved:2,redeemed:3,granted:30};
const actions=[],payments=[];let validations=0;
const preview={code:'BIENVU20',percent:20,endsAt:null,plans:[['solo',50,10],['agence',100,20],['equipe',200,40],['reseau',500,100]].map(([plan,base,bonus])=>({plan,base,bonus,total:base+bonus}))};
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost'),json=(b,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(b));};
 if(url.pathname==='/bundle.js'){res.writeHead(200,{'content-type':'application/javascript'});return res.end(build.outputFiles[0].contents);}
 if(url.pathname==='/style.css'){res.writeHead(200,{'content-type':'text/css'});return res.end(css);}
 if(url.pathname.startsWith('/api/')){
  let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):null;
  if(url.pathname==='/api/billing/promotion'){validations++;await new Promise(r=>setTimeout(r,120));return body.code==='BIENVU20'?json(preview):json({fields:{promotion:'invalid'}},422);}
  if(url.pathname==='/api/billing/checkout'){payments.push(body);return json({url:'https://checkout.stripe.com/c/pay/promotion-fixture'});}
  if(url.pathname==='/api/billing')return json({enabled:true,mode:'test',subscription:null,topupValidDays:0});
  if(url.pathname==='/api/credits')return json({balance:{available:60,reserved:0,consumed:0,total:60,renewalAt:null,kind:'paid',bonusAvailable:10},entries:[],bonuses:[{id:'fixture-bonus',code:'BIENVU20',credits:10,at:new Date().toISOString(),expiresAt:new Date(Date.now()+86400_000*30).toISOString(),used:0,reserved:0,reversed:0,disputed:false}],nextCursor:null});
  if(url.pathname==='/api/admin/promotions'){
   if(body){actions.push(body);if(body.action==='save'){code={...code,...body.settings,version:code.version+1};return json({id});}return json({checked:2,released:1});}
   const target=url.searchParams.has('id'),mode=url.searchParams.get('mode')??'test';
   return json({mode,billingMode:'test',codes:[code],totals:{redeemed:3,granted:30,reserved:2,reversed:0},nextCursor:null,history:target?[{id:'intent-fixture',agency:'Agence Lyon',code:'BIENVU20',plan:'solo',bonus:10,state:'redeemed',at:new Date().toISOString(),paidAt:new Date().toISOString(),invoiceId:'in_fixture',grossCents:5000,refundedCents:0,disputed:0,reversed:0,reserved:0,consumed:2,expiresAt:new Date(Date.now()+86400_000*30).toISOString(),sessionId:'cs_fixture'}]:[],audit:target?[{id:'audit-fixture',actor:'admin@example.com',reason:'Création de la campagne',at:new Date().toISOString()}]:[]});
  }
  return json({},404);
 }
 const logged=url.searchParams.get('logged')==='1',me=logged?{user:{id:'user-fixture'},agency:{id:'agency-fixture'},role:'owner',rights:{developmentRemaining:60,creditReserved:0,creditConsumed:0,creditPurchased:0}}:null;
 res.writeHead(200,{'content-type':'text/html'});res.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>*{box-sizing:border-box}body{margin:0;background:#faf9f5;font:16px Arial,sans-serif}.admin-shell{margin:24px}#root{min-width:0}@media(min-width:1100px){#root{margin-left:240px}}</style><div id="root"></div><script>window.__me=${JSON.stringify(me)}</script><script src="/bundle.js"></script></html>`);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.BIENVU_CHROME_PATH??'/Users/alexlevy0/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell',headless:true}),results=[];
try{
 for(const width of [1536,390,320]){
  const context=await browser.newContext({viewport:{width,height:width<500?844:1050}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/abonnement');await page.waitForTimeout(500);if(!await page.locator('.offers-promotion-toggle').count()){await page.screenshot({path:new URL('ui-failure.png',output).pathname});console.log(JSON.stringify({errors,body:await page.locator('body').innerText()}));}await page.getByRole('button',{name:'J’ai un code bonus'}).click();
  await page.getByLabel('Code bonus',{exact:true}).fill('erreur');await page.getByRole('button',{name:'Appliquer',exact:true}).click();await page.getByRole('alert').filter({hasText:'inconnu'}).waitFor();
  await page.getByLabel('Code bonus',{exact:true}).fill('bienvu20');await page.getByRole('button',{name:'Appliquer',exact:true}).click();await page.getByRole('status').filter({hasText:'Code BIENVU20 appliqué'}).waitFor();
  assert.equal(await page.locator('.offers-bonus').count(),4);assert.match(await page.locator('.offers-card-solo .offers-bonus').innerText(),/60 crédits/);assert.match(await page.locator('.offers-card-agence .offers-bonus').innerText(),/120 crédits/);
  await page.locator('.offers-promotion').scrollIntoViewIfNeeded();await page.screenshot({path:new URL(`offers-${width}.png`,output).pathname});
  assert.equal(await page.locator('.offers-promotion').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&el.scrollWidth<=el.clientWidth+1}),true,'Promotion overflow');
  await page.getByRole('button',{name:'Choisir Agence',exact:true}).click();await page.waitForURL('**/connexion?next=/abonnement');
  await page.goto(base+'/abonnement?logged=1');await page.getByRole('status').filter({hasText:'Code BIENVU20 appliqué'}).waitFor();assert.equal(await page.locator('.offers-bonus').count(),4,'Code restored after login');
  await page.route('https://checkout.stripe.com/**',route=>route.fulfill({status:200,body:'Local Stripe navigation fixture'}));await page.getByRole('button',{name:'Choisir Agence',exact:true}).click();await page.waitForURL('https://checkout.stripe.com/**');assert.deepEqual(payments.at(-1),{plan:'agence',promotionCode:'BIENVU20'});
  await page.goto(base+'/admin');await page.getByRole('button',{name:'Créer un code',exact:true}).waitFor();
  await page.getByRole('button',{name:'Modifier',exact:true}).click();await page.getByLabel('Nom de la campagne').fill('Campagne de lancement modifiée');await page.getByLabel('Motif de la modification').fill('Mise à jour de la campagne');await page.getByRole('button',{name:'Enregistrer la campagne',exact:true}).click();await page.getByRole('status').filter({hasText:'Campagne enregistrée'}).waitFor();
  assert.equal(actions.at(-1).settings.name,'Campagne de lancement modifiée');await page.locator('.promo-admin-history').waitFor();await page.getByText('in_fixture',{exact:false}).first().waitFor();
  await page.screenshot({path:new URL(`admin-${width}.png`,output).pathname,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Admin overflow');
  await page.getByRole('button',{name:'Vérifier les paiements expirés'}).click();await page.getByRole('status').filter({hasText:'réservation(s) expirée(s) libérée(s)'}).waitFor();
  assert.deepEqual(errors,[]);results.push({width,bonusTotals:[60,120,240,600],preservedAfterLogin:true,checkoutCode:true,adminSave:true,overflow:false});await context.close();
 }
 await writeFile(new URL('ui-proof.json',output),JSON.stringify({results,validations,payments:payments.length},null,2),{mode:0o600});console.log(JSON.stringify({results,validations,payments:payments.length}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
