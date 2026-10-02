import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BIENVU_HOME_URL??'http://localhost:3020',published=new URL(base).hostname==='bienvu.online';
assert.ok(['localhost','127.0.0.1','bienvu.online'].includes(new URL(base).hostname));
const folder=`evidence/local/video-format/${published?'published':'local'}-ui`;await mkdir(folder,{recursive:true,mode:0o700});
const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url)),{openBrowser}=require('@remotion/renderer');
const browser=await openBrowser('chrome',{logLevel:'error'}),report=[];
try{for(const width of [1536,390,320]){
  const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:width,onBrowserLog:null,onLog:()=>{}}),cdp=page._client(),writes=[];
  await page.setViewport({width,height:1024,deviceScaleFactor:1});
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*/api/*',requestStage:'Request'}]});
  const fulfill=(requestId,value,status=200)=>cdp.send('Fetch.fulfillRequest',{requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(value)).toString('base64')});
  cdp.on('Fetch.requestPaused',async({requestId,request})=>{
    const path=new URL(request.url).pathname;
    if(!['GET','HEAD','OPTIONS'].includes(request.method)){
      writes.push({path,input:request.postData?JSON.parse(request.postData):null});
      if(!published&&path==='/api/trial'){
        const at=new Date().toISOString();await fulfill(requestId,{id:'format-ui-fixture',status:'rendering',stage:'rendering',attempt:1,errorCode:null,
          createdAt:at,updatedAt:at,expiresAt:new Date(Date.now()+86400000).toISOString(),progressPercent:42,sourceKind:'url',ownership:'anonymous',masterAccess:'locked',retention:'available',
          title:'Appartement de recette',locality:'Lyon',videoUrl:null,downloadUrl:null,syntheticVoice:true,retryAllowed:false,aspectRatio:writes.at(-1).input.aspectRatio});
      }else await cdp.send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});
    }else if(!published&&path==='/api/trial')await fulfill(requestId,{enabled:true,siteKey:'test-only-sitekey',used:false,job:null});
    else await cdp.send('Fetch.continueRequest',{requestId});
  });
  const evaluate=async expression=>{const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});assert.ok(!r.value.exceptionDetails,JSON.stringify(r.value.exceptionDetails));return r.value.result.value;};
  const wait=async expression=>{for(let i=0;i<160;i++){if(await evaluate(`Boolean(${expression})`))return;await new Promise(r=>setTimeout(r,100));}throw Error('UI_WAIT:'+expression);};
  await page.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
  await wait('document.querySelector(".home-format-pill")&&!document.querySelector(".home-format-pill").disabled');
  assert.equal(await evaluate('document.querySelector(".home-format-pill").textContent'),'Vertical 9:16');
  await evaluate('document.querySelector(".home-format-pill").click()');
  await wait('document.querySelector(".home-format-pill").textContent==="Horizontal 16:9"');
  assert.equal(await evaluate('document.querySelector(".home-format-pill").getAttribute("aria-pressed")'),'true');
  await page.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
  await wait('document.querySelector(".home-format-pill")?.textContent==="Horizontal 16:9"&&!document.querySelector(".home-format-pill").disabled');
  await evaluate(`(()=>{const input=document.querySelector('#home-listing-url');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'https://www.orpi.com/annonce-vente-fixture/');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await evaluate('document.querySelector(".home-customize-button").click()');
  await wait('document.querySelector(".customizer-preview.is-horizontal")');
  assert.equal(await evaluate('document.querySelector(".customizer-preview-title span").textContent'),'16:9');
  const ratio=await evaluate('(()=>{const r=document.querySelector(".customizer-poster").getBoundingClientRect();return r.width/r.height;})()');
  assert.ok(Math.abs(ratio-16/9)<.01);
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  const capture=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(`${folder}/horizontal-${width}.png`,Buffer.from(capture.value.data,'base64'),{mode:0o600});
  await evaluate('document.querySelector(".home-format-pill").click()');await wait('!document.querySelector(".customizer-preview.is-horizontal")');
  assert.equal(await evaluate('document.querySelector(".customizer-preview-title span").textContent'),'9:16');
  if(!published&&width===1536){
    await evaluate('document.querySelector(".customizer-topline button").click()');
    await wait('!document.querySelector(".customizer-preview")');
    await evaluate('window.turnstile={render:(container,options)=>{setTimeout(()=>options.callback("fixture-token-only"),150);return "format-fixture";},remove:()=>{}};document.querySelector(".home-format-pill").click()');
    await evaluate('document.querySelector(".home-composer-actions .home-primary-button").click()');
    await wait('document.querySelector(".home-conversation-media.is-horizontal")');
    assert.equal(writes.length,1);assert.equal(writes[0].path,'/api/trial');assert.equal(writes[0].input.aspectRatio,'16:9');
    assert.equal(await evaluate('document.querySelector(".home-format-pill").disabled'),true);
    assert.equal(await evaluate('document.querySelector(".home-conversation-poster small").textContent'),'Horizontal 16:9 · Voix française');
  }else assert.deepEqual(writes,[]);
  report.push({width,default:'9:16',toggle:true,persistentInTab:true,previewRatio:ratio,overflow:false,trialSubmission:!published&&width===1536?'intercepted fixture':'not submitted'});await page.close();
}await writeFile(`${folder}/report.json`,JSON.stringify({at:new Date().toISOString(),published,providerCalls:0,report},null,2),{mode:0o600});console.log(JSON.stringify({passed:true,published,report}));}
finally{await browser.close({silent:true});}
