// Read-only guest UI: edit a browser-local draft, never submit an import/video.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BIENVU_HOME_URL??'http://localhost:3020',published=new URL(base).hostname==='bienvu.online';
assert.ok(['localhost','127.0.0.1','bienvu.online'].includes(new URL(base).hostname));
const folder=`evidence/local/manual-details/${published?'published':'local'}-ui`;await mkdir(folder,{recursive:true,mode:0o700});
const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url)),{openBrowser}=require('@remotion/renderer');
const browser=await openBrowser('chrome',{logLevel:'error'}),report=[];
try{for(const width of [1536,390,320]){
  const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:width,onBrowserLog:null,onLog:()=>{}}),cdp=page._client(),writes=[],providerRequests=[];
  await page.setViewport({width,height:1024,deviceScaleFactor:1});await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent',({request})=>{const url=new URL(request.url);
    if(url.pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(request.method))writes.push({method:request.method,path:url.pathname});
    if(/(?:googleapis|openai|runwayml)\.com$/.test(url.hostname))providerRequests.push(url.hostname);
  });
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*/api/*',requestStage:'Request'}]});
  cdp.on('Fetch.requestPaused',async({requestId,request})=>{
    await cdp.send(['GET','HEAD','OPTIONS'].includes(request.method)?'Fetch.continueRequest':'Fetch.failRequest',
      {requestId,...(!['GET','HEAD','OPTIONS'].includes(request.method)?{errorReason:'BlockedByClient'}:{})});
  });
  const evaluate=async expression=>{const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});assert.ok(!r.value.exceptionDetails,JSON.stringify(r.value.exceptionDetails));return r.value.result.value;};
  const wait=async expression=>{for(let i=0;i<150;i++){if(await evaluate(`Boolean(${expression})`))return;await new Promise(r=>setTimeout(r,80));}const shot=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(`${folder}/failure-${width}.png`,Buffer.from(shot.value.data,'base64'));await writeFile(`${folder}/failure-${width}.json`,JSON.stringify({expression,text:await evaluate('document.body.innerText')},null,2));throw Error('UI_WAIT:'+expression);};
  const go=async step=>{await evaluate(`document.querySelectorAll('.manual-step-nav button')[${step}].click()`);await wait(`document.querySelectorAll('.manual-step-nav button')[${step}].getAttribute('aria-current')==='step'`);};
  const fill=async(name,value)=>{await evaluate(`(()=>{const e=document.querySelector('#manual-${name}');Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true}));})()`);};
  const checked=async expected=>{await wait(`document.querySelectorAll('.manual-step-nav button')[2].textContent.includes('✓')===${expected}`);};
  await page.goto({url:base,timeout:60000,options:{waitUntil:'load'}});await wait('document.querySelector(".home-mode-pill")&&!document.querySelector(".home-mode-pill").disabled&&document.querySelector(".home-customize-button")&&!document.querySelector(".home-customize-button").disabled');
  await evaluate('document.querySelector(".home-mode-pill").click()');await wait('document.querySelector("#manual-title")');
  await checked(false);
  await evaluate('document.querySelector(".manual-step-nav").scrollIntoView({block:"center"})');
  let shot=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(`${folder}/empty-${width}.png`,Buffer.from(shot.value.data,'base64'),{mode:0o600});
  await evaluate('document.querySelector("input[name=propertyType][value=apartment]").click();document.querySelector("input[name=transaction][value=sale]").click()');
  await evaluate('document.querySelector(".manual-step-actions .home-primary-button").click()');await wait('document.querySelector(".manual-step-header").textContent.includes("2 SUR 5")');
  await fill('title','Appartement de recette');await fill('locality','Lyon');
  await evaluate('document.querySelector(".manual-step-actions .home-primary-button").click()');await wait('document.querySelector(".manual-step-header").textContent.includes("3 SUR 5")');
  assert.ok(await evaluate('document.querySelector("#manual-priceCents").checkVisibility()&&document.querySelector("#manual-description").checkVisibility()'));
  await evaluate('[...document.querySelectorAll(".manual-step-actions button")].find(b=>b.textContent==="Précédent").click()');
  await wait('document.querySelector(".manual-step-header").textContent.includes("2 SUR 5")');
  await evaluate('document.querySelector("#manual-locality").focus()');
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await wait('document.querySelector(".manual-step-header").textContent.includes("3 SUR 5")');
  await evaluate('document.querySelector(".manual-step-actions .home-primary-button").click()');await wait('document.querySelector(".manual-step-header").textContent.includes("4 SUR 5")');
  await checked(false);
  await evaluate('[...document.querySelectorAll(".manual-step-actions button")].find(b=>b.textContent==="Précédent").click()');
  await wait('document.querySelector(".manual-step-header").textContent.includes("3 SUR 5")');
  await evaluate('[...document.querySelectorAll(".manual-step-actions button")].find(b=>b.textContent==="Passer cette étape").click()');
  await wait('document.querySelector(".manual-step-header").textContent.includes("4 SUR 5")');await checked(false);
  // Optional but populated and valid: show the check, then remove it on clearing.
  await go(2);await fill('priceCents','200 000');await go(0);await checked(true);
  await go(2);await fill('priceCents','');await go(0);await checked(false);
  await go(2);await fill('priceCents','0');await go(0);await checked(false);
  await go(2);await fill('priceCents','incorrect');await go(0);await checked(false);
  await go(2);await fill('priceCents','');await fill('description','Un appartement à présenter à Lyon.');await go(0);await checked(true);
  await go(2);await fill('description','   ');await go(0);await checked(false);
  // Rent prices must include their charges choice; any invalid detail removes it.
  await evaluate('document.querySelector("input[name=transaction][value=rent]").click()');await go(2);
  await fill('priceCents','950');await go(0);await checked(false);
  await go(2);await fill('charges','included');await go(0);await checked(true);
  await go(2);await fill('area','-1');await go(0);await checked(false);
  await go(2);await fill('area','65');await go(0);await checked(true);
  await evaluate('document.querySelector(".manual-step-nav").scrollIntoView({block:"center"})');
  shot=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(`${folder}/filled-${width}.png`,Buffer.from(shot.value.data,'base64'),{mode:0o600});
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  assert.deepEqual(writes,[]);assert.deepEqual(providerRequests,[]);
  report.push({width,presentationToDetails:true,previousToPresentation:true,keyboardToDetails:true,detailsToPhotos:true,previousToDetails:true,initialEmpty:false,skippedEmpty:false,validSale:true,cleared:false,invalidPrice:false,descriptionOnly:true,whitespaceOnly:false,rentWithoutCharges:false,rentWithCharges:true,invalidArea:false,validArea:true,overflow:false,apiWrites:0,providerRequests:0});
  // Pages share this disposable browser profile; remove only its local QA draft.
  await evaluate('localStorage.clear();sessionStorage.clear();new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase("bienvu-local-drafts");r.onsuccess=resolve;r.onerror=reject;})');await page.close();
}await writeFile(`${folder}/report.json`,JSON.stringify({at:new Date().toISOString(),published,apiFixtures:false,guestLocalDraft:true,report},null,2),{mode:0o600});console.log(JSON.stringify({passed:true,published,report}));}
finally{await browser.close({silent:true});}
