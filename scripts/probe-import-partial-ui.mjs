// Recette navigateur locale sur une fixture Figaro reconstruite. Aucun portail,
// fournisseur IA, upload ou rendu payant n'est appelé.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {extractListingHtml} from '../packages/importers/src/listing.ts';
import {NormalizedListing} from '../packages/contracts/src/index.ts';
import {draftFromListing} from '../packages/db/src/creation-drafts.ts';
const base=process.env.BIENVU_WORKFLOW_URL??'http://localhost:8790';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('LOCAL_FIXTURE_ONLY');
const directory='evidence/local/import-partiel-01-10/ui';await mkdir(directory,{recursive:true});
const source='https://immobilier.lefigaro.fr/annonces/annonce-123456.html',at=new Date().toISOString(),expires=new Date(Date.now()+86400_000).toISOString();
const {photoUrls:_,...extracted}=extractListingHtml(await readFile('fixtures/imports/portals/figaro-partial.html','utf8'),source,{allowPartial:true});
const data=draftFromListing(NormalizedListing.parse({...extracted,id:'figaro-ui',agencyId:'ui-agency',sourceUrl:source,
  sourceHost:new URL(source).hostname,fetchedAt:at,photos:[]}));
const draft={id:'figaro-ui',version:1,status:'needs_input',sourceKind:'url',sourceUrl:source,expiresAt:expires,data,photos:[]};
const account={user:{id:'fixture-owner',name:'Recette',email:'fixture@example.invalid'},agency:{id:'ui-agency',ownerUserId:'fixture-owner',name:'Recette',logoAssetId:null,
  primaryColor:'#E1E8D9',secondaryColor:'#171714',phone:null,email:'fixture@example.invalid',website:null,createdAt:at,updatedAt:at,brandVersion:0},
  rights:{generationEnabled:true,developmentRemaining:3,renewalAt:expires,creditKind:'free',importRetryAt:null,trial:'eligible',watermarked:false}};
const script=`(()=>{const native=fetch.bind(window),draft=${JSON.stringify(draft)},account=${JSON.stringify(account)};
window.__partial={imports:0,writes:0};window.fetch=async(input,options={})=>{const p=new URL(typeof input==='string'?input:input.url,location.href).pathname,method=options.method??'GET';
const json=data=>Response.json(data);if(p==='/api/me')return json(account);
if(p==='/api/imports'&&method==='POST'){window.__partial.imports++;return json({id:draft.id,status:'needs_input',sourceKind:'url',sourceUrl:draft.sourceUrl,draft});}
if(p==='/api/imports')return json({imports:[],nextCursor:null});if(p==='/api/imports/figaro-ui/draft')return json(draft);
if(p==='/api/generations')return json({jobs:[],nextCursor:null});if(p==='/api/trial')return json({enabled:false,siteKey:null,used:false,job:null});
if(p==='/api/explorer')return json({videos:[],nextCursor:null});if(p.startsWith('/api/')){if(method!=='GET')window.__partial.writes++;return json({});}return native(input,options);};})();`;
const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url));
const browser=await require('@remotion/renderer').openBrowser('chrome',{logLevel:'error'});const report=[];
try{for(const width of [1536,390]){
  const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:width,onBrowserLog:null,onLog:()=>{}}),cdp=page._client();
  await page.setViewport({width,height:width===1536?980:844,deviceScaleFactor:1});
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:script});
  const evaluate=async expression=>{const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
    assert.ok(!r.value.exceptionDetails,JSON.stringify(r.value.exceptionDetails));return r.value.result.value;};
  const wait=async expression=>{for(let i=0;i<120;i++){if(await evaluate(`Boolean(${expression})`))return;await new Promise(r=>setTimeout(r,100));}throw Error('WAIT '+expression);};
  await page.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
  await wait("document.querySelector('.home-account')&&document.querySelector('.home-composer button[type=submit]')&&!document.querySelector('.home-composer button[type=submit]').disabled");
  await evaluate(`(()=>{const input=document.querySelector('#home-listing-url');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(source)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await evaluate("document.querySelector('.home-composer').requestSubmit()");
  await wait("document.querySelector('.manual-sheet-card')&&!document.querySelector('.manual-sheet-card').disabled");
  assert.equal(await evaluate("document.querySelector('#manual-locality').checkVisibility()&&document.querySelector('#manual-priceCents').checkVisibility()"),true);
  assert.equal(await evaluate("document.querySelector('.manual-step-nav')"),null);
  await wait("document.querySelector('#manual-description').checkVisibility()");
  const values=await evaluate("Object.fromEntries(['priceCents','area','rooms','description','locality'].map(key=>[key,document.querySelector('#manual-'+key).value]))");
  assert.equal(Number(values.priceCents.replace(/\s/g,'')),280000);assert.equal(values.area,'268');assert.equal(values.rooms,'12');
  assert.equal(values.locality,'Ville de recette');assert.equal(values.description,data.fields.description);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'),true);
  assert.deepEqual(await evaluate('window.__partial'),{imports:1,writes:0});
  await evaluate("document.querySelector('#manual-priceCents').scrollIntoView({block:'center'})");
  await evaluate('document.fonts.ready');let shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(`${directory}/details-${width}.png`,Buffer.from(shot.value.data,'base64'));
  await evaluate("document.querySelector('#manual-description').scrollIntoView({block:'center'})");
  shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(`${directory}/description-${width}.png`,Buffer.from(shot.value.data,'base64'));
  report.push({width,fixture:'reconstructed-figaro',priceEuros:280000,descriptionRetained:true,singleSheet:true,paidCalls:0});
  await evaluate("localStorage.clear();sessionStorage.clear();new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('bienvu-local-drafts');r.onsuccess=resolve;r.onerror=reject;})");await page.close();
}}finally{await browser.close({silent:true});}
await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
