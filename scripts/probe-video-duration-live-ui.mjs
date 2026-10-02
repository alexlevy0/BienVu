// Read-only published UI verification. Never click generation or submit a form.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BIENVU_HOME_URL??'https://bienvu.online';
assert.ok(['bienvu.online','localhost','127.0.0.1'].includes(new URL(base).hostname));
const directory='evidence/local/video-duration/live-ui';await mkdir(directory,{recursive:true,mode:0o700});
const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url)),{openBrowser}=require('@remotion/renderer');
const browser=await openBrowser('chrome',{logLevel:'error'}),report=[];
try{for(const width of [1536,390,320]){
  const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:width,onBrowserLog:null,onLog:()=>{}}),cdp=page._client(),writes=[];
  await page.setViewport({width,height:width===1536?1024:900,deviceScaleFactor:1});
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent',({request})=>{if(new URL(request.url).pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(request.method))writes.push({method:request.method,path:new URL(request.url).pathname});});
  const evaluate=async expression=>{const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});assert.ok(!r.value.exceptionDetails,JSON.stringify(r.value.exceptionDetails));return r.value.result.value;};
  const wait=async expression=>{for(let i=0;i<160;i++){if(await evaluate(`Boolean(${expression})`))return;await new Promise(r=>setTimeout(r,100));}throw Error('UI_WAIT:'+expression);};
  await page.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
  await wait('document.querySelector(".home-duration-pill select")&&!document.querySelector(".home-duration-pill select").disabled');
  assert.equal(await evaluate('document.querySelector(".home-duration-pill select").value'),'20');
  assert.equal(await evaluate('document.querySelector(".home-voice-pill").getAttribute("aria-pressed")'),'true');
  await evaluate('document.querySelector(".home-voice-pill").click()');
  await wait('document.querySelector(".home-subtitles-pill").disabled');
  for(const kind of ['voice','subtitles'])assert.equal(await evaluate(`getComputedStyle(document.querySelector('.home-${kind}-pill .home-option-label')).textDecorationLine`),'line-through');
  for(const seconds of [30,40]){
    await evaluate(`(()=>{const select=document.querySelector('.home-duration-pill select');select.value='${seconds}';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await wait(`document.querySelector('.home-duration-pill select').value==='${seconds}'`);
  }
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  const screenshot=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(`${directory}/disabled-${width}.png`,Buffer.from(screenshot.value.data,'base64'),{mode:0o600});
  await page.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
  await wait('document.querySelector(".home-duration-pill select")?.value==="40"&&document.querySelector(".home-voice-pill")?.getAttribute("aria-pressed")==="false"&&!document.querySelector(".home-voice-pill").disabled');
  await evaluate('document.querySelector(".home-voice-pill").click()');
  await wait('!document.querySelector(".home-subtitles-pill").disabled');
  await evaluate('document.querySelector(".home-subtitles-pill").click()');
  for(const kind of ['voice','subtitles'])assert.equal(await evaluate(`getComputedStyle(document.querySelector('.home-${kind}-pill .home-option-label')).textDecorationLine`),'none');
  assert.deepEqual(writes,[]);
  report.push({width,defaultSeconds:20,choices:[20,30,40],disabledLabelsStruck:true,voiceDisablesSubtitles:true,persistentInTab:true,overflow:false,apiWrites:0});
  await page.close();
}await writeFile(`${directory}/report.json`,JSON.stringify({at:new Date().toISOString(),publishedUi:base,fixtures:false,productGenerationTest:false,report},null,2),{mode:0o600});console.log(JSON.stringify({passed:true,report}));}
finally{await browser.close({silent:true});}
