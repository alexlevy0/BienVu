// Real static voice samples; read-only guest UI. Never submit generation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const base=process.env.BIENVU_HOME_URL??'http://localhost:3020',published=new URL(base).hostname==='bienvu.online';
assert.ok(['localhost','127.0.0.1','bienvu.online'].includes(new URL(base).hostname));
const folder=`evidence/local/voice-previews/${published?'published':'local'}-ui`;await mkdir(folder,{recursive:true,mode:0o700});
const manifest=JSON.parse(await readFile('apps/web/public/audio/voice-previews/v1/manifest.json','utf8'));
manifest.samples.push(...JSON.parse(await readFile('apps/web/public/audio/voice-previews/fish-v1/manifest.json','utf8')).samples);
const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url)),{openBrowser}=require('@remotion/renderer');
const browser=await openBrowser('chrome',{logLevel:'error'}),report=[];
try{for(const width of [1536,390,320]){
  const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:width,onBrowserLog:null,onLog:()=>{}}),cdp=page._client(),writes=[],providerRequests=[],sampleRequests=[];let failSample=false;
  await page.setViewport({width,height:1024,deviceScaleFactor:1});await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent',({request})=>{const url=new URL(request.url);
    if(url.pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(request.method))writes.push({method:request.method,path:url.pathname});
    if(/(?:googleapis|openai|runwayml)\.com$/.test(url.hostname)||url.hostname==='api.fish.audio')providerRequests.push(url.hostname);
    if(url.pathname.startsWith('/audio/voice-previews/'))sampleRequests.push(url.pathname);
  });
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*/api/*',requestStage:'Request'},{urlPattern:'*/audio/voice-previews/*',requestStage:'Request'}]});
  cdp.on('Fetch.requestPaused',async event=>{const {requestId,request}=event;
    if(failSample&&new URL(request.url).pathname.startsWith('/audio/voice-previews/')){failSample=false;await cdp.send('Fetch.failRequest',{requestId,errorReason:'ConnectionFailed'});}
    else if(['GET','HEAD','OPTIONS'].includes(request.method))await cdp.send('Fetch.continueRequest',{requestId});
    else await cdp.send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});
  });
  const evaluate=async expression=>{const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});assert.ok(!r.value.exceptionDetails,JSON.stringify(r.value.exceptionDetails));return r.value.result.value;};
  const wait=async expression=>{for(let i=0;i<160;i++){if(await evaluate(`Boolean(${expression})`))return;await new Promise(r=>setTimeout(r,100));}throw Error('UI_WAIT:'+expression);};
  await page.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
  await wait('document.querySelector(".home-customize-button")&&!document.querySelector(".home-customize-button").disabled');
  await evaluate(`(()=>{const input=document.querySelector('#home-listing-url');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'https://www.orpi.com/annonce-vente-fixture/');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await evaluate('document.querySelector(".home-customize-button").click()');await wait('document.querySelector("#customizer-tab-voice")');
  await evaluate('document.querySelector("#customizer-tab-voice").click()');await wait('document.querySelector(".voice-preview-button")&&!document.querySelector(".voice-preview-button").disabled');
  assert.deepEqual(sampleRequests,[],'NO_AUDIO_PRELOAD');
  const played=[];
  for(const sample of manifest.samples){
    await evaluate(`(()=>{const s=document.querySelector('#customizer-selected-voice');s.value=${JSON.stringify(sample.voice)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await wait(`document.querySelector('.customizer-voice-preview audio').getAttribute('src')===${JSON.stringify(sample.src)}`);
    if(played.length)assert.equal(await evaluate('window.__previousVoicePlayer.paused'),true);
    assert.equal(await evaluate('document.querySelector(".voice-preview-button").getAttribute("aria-pressed")'),'false');
    await evaluate('document.querySelector(".voice-preview-button").click()');
    await wait('document.querySelector(".customizer-voice-preview audio").currentTime>.2&&!document.querySelector(".customizer-voice-preview audio").paused');
    const playback=await evaluate('(()=>{const a=document.querySelector(".customizer-voice-preview audio");window.__previousVoicePlayer=a;return {url:a.currentSrc,duration:a.duration,currentTime:a.currentTime};})()');
    assert.ok(Math.abs(playback.duration*1000-sample.durationMs)<200);assert.ok(playback.url.endsWith(sample.src));
    played.push({name:sample.name,duration:playback.duration});
  }
  // Turn off voice while the sample is playing: stop it and dependent captions.
  await evaluate('document.querySelector(\'.customizer-voice-options input[aria-label="Activer la voix off"]\').click()');
  await wait('document.querySelector(".voice-preview-button").disabled&&document.querySelector(".customizer-voice-preview audio").paused');
  await evaluate('document.querySelector(\'.customizer-voice-options input[aria-label="Activer la voix off"]\').click()');
  await wait('!document.querySelector(".voice-preview-button").disabled');
  await evaluate('document.querySelector(".voice-preview-button").click()');await wait('document.querySelector(".customizer-voice-preview audio").currentTime>.2');
  await evaluate('window.__previousVoicePlayer=document.querySelector(".customizer-voice-preview audio");document.querySelector("#customizer-tab-style").click()');
  await wait('!document.querySelector(".customizer-voice-preview audio")');assert.equal(await evaluate('window.__previousVoicePlayer.paused'),true);
  await evaluate('document.querySelector("#customizer-tab-voice").click()');await wait('document.querySelector(".voice-preview-button")');
  // Same sample replays, then explicit Stop returns to idle.
  await evaluate('document.querySelector(".voice-preview-button").click()');await wait('document.querySelector(".customizer-voice-preview audio").currentTime>.2');
  await evaluate('document.querySelector(".voice-preview-button").click()');await wait('document.querySelector(".customizer-voice-preview audio").paused');
  assert.equal(await evaluate('document.querySelector(".voice-preview-button").getAttribute("aria-pressed")'),'false');
  let ended=false,transportFailureAndRetry=false;
  if(width===1536){
    await evaluate('document.querySelector(".voice-preview-button").click()');await wait('document.querySelector(".customizer-voice-preview audio").currentTime>.2');
    await evaluate('(()=>{const a=document.querySelector(".customizer-voice-preview audio");a.currentTime=a.duration-.3;})()');
    await wait('document.querySelector(".customizer-voice-preview audio").ended&&document.querySelector(".voice-preview-button").getAttribute("aria-pressed")==="false"');ended=true;
    if(!published){
      failSample=true;await evaluate('(()=>{const a=document.querySelector(".customizer-voice-preview audio");window.__sampleSource=a.getAttribute("src");a.src=window.__sampleSource+"?transport-test";a.load();})()');
      await evaluate('document.querySelector(".voice-preview-button").click()');await wait('document.querySelector(".voice-preview-error")');
      assert.equal(await evaluate('document.querySelector(".voice-preview-button").getAttribute("aria-pressed")'),'false');
      await evaluate('(()=>{const a=document.querySelector(".customizer-voice-preview audio");a.src=window.__sampleSource;a.load();})()');
      await evaluate('document.querySelector(".voice-preview-button").click()');await wait('document.querySelector(".customizer-voice-preview audio").currentTime>.2&&!document.querySelector(".voice-preview-error")');
      await evaluate('document.querySelector(".voice-preview-button").click()');transportFailureAndRetry=true;
    }
  }
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  await evaluate('document.querySelector(".customizer-voice-choice").scrollIntoView({block:"start"})');
  const screenshot=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(`${folder}/voice-${width}.png`,Buffer.from(screenshot.value.data,'base64'),{mode:0o600});
  assert.deepEqual(writes,[]);assert.deepEqual(providerRequests,[]);
  report.push({width,played,noPreload:true,stopsOnVoiceChange:true,stopsOnVoiceDisabled:true,stopsOnTabChange:true,replayAndStop:true,ended,transportFailureAndRetry,overflow:false,apiWrites:0,providerRequests:0});await page.close();
}await writeFile(`${folder}/report.json`,JSON.stringify({at:new Date().toISOString(),published,uiFixture:false,realRecordedAssets:true,humanListening:'not_validated',report},null,2),{mode:0o600});console.log(JSON.stringify({passed:true,published,report}));}
finally{await browser.close({silent:true});}
