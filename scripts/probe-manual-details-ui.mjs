// Read-only guest UI: edit a browser-local draft, never submit an import/video.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BIENVU_HOME_URL??'http://localhost:8790',published=new URL(base).hostname==='bienvu.online';
assert.ok(['localhost','127.0.0.1','bienvu.online'].includes(new URL(base).hostname));
const folder=`evidence/local/manual-sheet-20261005/${published?'published':'local'}-ui`;await mkdir(folder,{recursive:true,mode:0o700});
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
  const fill=async(name,value)=>{await evaluate(`(()=>{const e=document.querySelector('#manual-${name}');Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true}));})()`);};
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const native=window.fetch.bind(window);window.fetch=async(...args)=>{const response=await native(...args);if(new URL(typeof args[0]==='string'?args[0]:args[0].url,location.href).pathname==='/api/me')window.__manualSheetHydrated=true;return response;};})()`});
  await page.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
  await evaluate('localStorage.clear();sessionStorage.clear();new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase("bienvu-local-drafts");r.onsuccess=resolve;r.onerror=reject;})');
  await page.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
  await wait('window.__manualSheetHydrated&&document.querySelector(".home-mode-pill")&&!document.querySelector(".home-mode-pill").disabled');
  await evaluate('document.querySelector(".home-mode-pill").click()');await wait('document.querySelector(".manual-sheet-card")&&!document.querySelector(".manual-sheet-card").disabled');
  assert.equal(await evaluate('document.querySelector(".manual-step-nav")'),null);
  assert.equal(await evaluate('document.querySelector(".manual-sheet-details").open'),false);
  await evaluate('document.fonts.ready');
  let shot=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(`${folder}/empty-${width}.png`,Buffer.from(shot.value.data,'base64'),{mode:0o600});
  const blur=async name=>{await evaluate(`document.querySelector('#manual-${name}').focus();document.querySelector('#manual-${name}').blur()`);};
  await fill('locality','Lyon 6e');await fill('area','65');await fill('rooms','3');await fill('priceCents','385 000');
  await wait('document.querySelector(".manual-sheet-poster-copy").textContent.includes("Lyon 6e")');
  await fill('priceCents','0');await blur('priceCents');await wait('document.querySelector("#manual-priceCents").getAttribute("aria-invalid")==="true"');
  await fill('priceCents','200 000');await wait('document.querySelector("#manual-priceCents").getAttribute("aria-invalid")==="false"');
  await evaluate('document.querySelector("input[name=transaction][value=rent]").click()');await wait('document.querySelector("#manual-charges")');await fill('priceCents','950');
  await blur('charges');await wait('document.querySelector("#manual-charges").getAttribute("aria-invalid")==="true"');
  await fill('charges','included');await wait('document.querySelector("#manual-charges").getAttribute("aria-invalid")==="false"');
  await fill('rooms','2.5');await blur('rooms');await wait('document.querySelector("#manual-rooms").getAttribute("aria-invalid")==="true"');await fill('rooms','3');
  await evaluate('document.querySelector(".manual-sheet-details summary").click()');await wait('document.querySelector("#manual-description").checkVisibility()');
  await fill('description','Un appartement à présenter à Lyon.');await fill('title','Appartement de recette');
  await evaluate('document.querySelector(".manual-sheet-details summary").click()');await wait('!document.querySelector(".manual-sheet-details").open');
  await evaluate('document.querySelector("#manual-locality").focus()');
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  assert.equal(await evaluate('document.querySelector("#manual-locality").checkVisibility()'),true);
  await evaluate('document.querySelector(".home-manual-settings summary").click()');await wait('document.querySelector(".home-manual-settings details").open');
  shot=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(`${folder}/settings-${width}.png`,Buffer.from(shot.value.data,'base64'),{mode:0o600});
  await evaluate('document.querySelector(".home-manual-settings summary").click()');await wait('!document.querySelector(".home-manual-settings details").open');
  await evaluate('document.querySelector(".manual-sheet-heading").scrollIntoView({block:"start"})');
  shot=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(`${folder}/filled-${width}.png`,Buffer.from(shot.value.data,'base64'),{mode:0o600});
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+2'),false);
  assert.equal(await evaluate('document.querySelector(".home-manual-toolbar .home-primary-button").disabled'),true);
  assert.deepEqual(writes,[]);assert.deepEqual(providerRequests,[]);
  report.push({width,onePage:true,optionalDetails:true,fieldValidation:true,rentCharges:true,settingsToggle:true,keyboard:true,overflow:false,apiWrites:0,providerRequests:0});
  // Pages share this disposable browser profile; remove only its local QA draft.
  await evaluate('localStorage.clear();sessionStorage.clear();new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase("bienvu-local-drafts");r.onsuccess=resolve;r.onerror=reject;})');await page.close();
}await writeFile(`${folder}/report.json`,JSON.stringify({at:new Date().toISOString(),published,apiFixtures:false,guestLocalDraft:true,report},null,2),{mode:0o600});console.log(JSON.stringify({passed:true,published,report}));}
finally{await browser.close({silent:true});}
