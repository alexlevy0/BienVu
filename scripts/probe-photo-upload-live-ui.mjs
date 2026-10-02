// Real browser against the published site with the isolated account created by
// probe-photo-uploads-cloudflare.mjs --keep. No generated video or provider call.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
const base='https://bienvu.online',folder='evidence/local/photo-upload-fix/live-ui';await mkdir(folder,{recursive:true});
const fixture=JSON.parse(await readFile('evidence/local/photo-upload-fix/remote-fixture.json','utf8'));
const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url)),{openBrowser}=require('@remotion/renderer');
const bytes=(await sharp({create:{width:960,height:640,channels:3,background:'#557c6c'}}).png().toBuffer()).toString('base64');
const browser=await openBrowser('chrome',{logLevel:'error'});
try{
  const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}}),cdp=page._client();
  await page.setViewport({width:1536,height:980,deviceScaleFactor:1});
  const split=fixture.cookie.indexOf('=');await cdp.send('Network.setCookie',{name:fixture.cookie.slice(0,split),value:fixture.cookie.slice(split+1),url:base,secure:true,httpOnly:true,sameSite:'Lax'});
  const evaluate=async expression=>{const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});assert.ok(!r.value.exceptionDetails,JSON.stringify(r.value.exceptionDetails));return r.value.result.value;};
  const shot=async name=>{await evaluate('document.fonts.ready');const s=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(`${folder}/${name}.png`,Buffer.from(s.value.data,'base64'));};
  const wait=async expression=>{for(let i=0;i<180;i++){if(await evaluate(`Boolean(${expression})`))return;await new Promise(r=>setTimeout(r,350));}await shot('failure');throw Error('LIVE_UI_WAIT '+expression);};
  const upload=async selector=>evaluate(`(()=>{const t=new DataTransfer(),data=Uint8Array.from(atob('${bytes}'),c=>c.charCodeAt(0));t.items.add(new File([data],'recette.png',{type:'image/png'}));const n=document.querySelector('${selector}');n.files=t.files;n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await page.goto({url:`${base}/?draft=${fixture.draftId}`,timeout:60000,options:{waitUntil:'load'}});
  await wait("document.querySelector('#manual-photos')&&!document.querySelector('#manual-photos').disabled");
  await evaluate("document.querySelector('.home-customize-button').click()");await wait("document.querySelector('.customizer-add')&&!document.querySelector('.customizer-add').disabled");
  await upload('.video-customizer input[type=file]');
  await wait("document.querySelector('.customizer-photo')&&!document.querySelector('.customizer-photo-state')&&!document.querySelector('.customizer-photo-error')");
  await shot('customizer-uploaded');await evaluate("document.querySelector('.customizer-photo button[aria-label^=Retirer]').click()");await wait("!document.querySelector('.customizer-photo')");
  await evaluate("document.querySelector('.customizer-topline button').click()");await wait("!document.querySelector('.video-customizer')");
  await evaluate("document.querySelector('input[name=propertyType][value=apartment]').click();document.querySelector('input[name=transaction][value=sale]').click();document.querySelector('.manual-step-actions .home-primary-button').click()");
  await wait("document.querySelector('.manual-step-header').textContent.includes('2 SUR 5')");
  await evaluate("(()=>{for(const [id,value]of [['manual-title','Appartement de recette'],['manual-locality','Lyon']]){const n=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,value);n.dispatchEvent(new Event('input',{bubbles:true}));}})()");
  await evaluate("document.querySelector('.manual-step-actions .home-primary-button').click()");await wait("document.querySelector('.manual-step-header').textContent.includes('4 SUR 5')");
  await upload('#manual-photos');await wait("document.querySelector('.manual-photos li')?.textContent.includes('Disponible')");
  await evaluate("document.querySelector('.manual-photos').scrollIntoView({block:'center'})");await shot('manual-uploaded');
  await evaluate("document.querySelector('.manual-photos button[aria-label^=Retirer]').click()");await wait("!document.querySelector('.manual-photos li')");
  const response=await fetch(`${base}/api/imports/${fixture.draftId}/draft`,{headers:{cookie:fixture.cookie}});assert.equal(response.status,200);assert.equal((await response.json()).photos.length,0);
  const report={passed:true,at:new Date().toISOString(),origin:base,identity:'isolated-synthetic-account',transport:'real-Workers-D1-R2',customizerUploadAndRemove:true,manualUploadAndRemove:true,remainingPhotos:0,videoGenerationCalls:0,modelProviderCalls:0};
  await writeFile(`${folder}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close({silent:true});}
