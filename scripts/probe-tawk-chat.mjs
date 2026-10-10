// Real Next.js layout and navigation, with a local widget fixture.
// No chat message, account write or analytics event is sent to a provider.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';

const base=process.env.PROBE_URL??'http://localhost:8787';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw new Error('LOCAL_TARGET_REQUIRED');
const output='evidence/local/tawk-2026-10-10';await mkdir(output,{recursive:true});
const widget='https://embed.tawk.to/6aca2b0398b9c934c10c477e/1k4irg1cl';
const fixture=`(()=>{
 const api=window.Tawk_API,frame=document.createElement('iframe');
 frame.id='fixture-tawk-widget';frame.title='Chat BienVu (fixture)';
 frame.style.cssText='position:fixed;right:16px;bottom:16px;width:56px;height:56px;border:0;border-radius:50%;z-index:'+api.customStyle.zIndex;
 frame.srcdoc='<html><body style="margin:0"><button aria-label="Ouvrir le chat" style="background:#203d2d;color:white;border:0;border-radius:50%;width:56px;height:56px;font-size:25px">☏</button></body></html>';
 frame.hidden=true;document.body.appendChild(frame);
 window.fixtureTawkCalls=[];
 api.start=()=>{window.fixtureTawkCalls.push('start');frame.hidden=false};
 api.showWidget=()=>{frame.hidden=false};api.hideWidget=()=>{frame.hidden=true};
 api.shutdown=()=>{window.fixtureTawkCalls.push('shutdown')};
 api.onStatusChange('online');api.onLoad();
})();`;
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{
 for(const width of [1536,390]){
  const context=await browser.newContext({viewport:{width,height:1000}}),errors=[];
  let loads=0;
  await context.route(widget,route=>{loads++;return route.fulfill({contentType:'text/javascript',body:fixture,headers:{'Access-Control-Allow-Origin':'*'}});});
  await context.route('**/api/analytics/config',route=>route.fulfill({json:{enabled:false}}));
  await context.route('**/api/me',route=>route.fulfill({status:401,json:{error:{code:'UNAUTHENTICATED'}}}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('#fixture-tawk-widget').waitFor({state:'visible',timeout:30000});
  assert.equal(await page.locator('#bienvu-tawk-chat').count(),1);
  assert.equal(loads,1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.screenshot({path:`${output}/home-${width}-fixture.png`});
  await page.evaluate(()=>{window.fixtureDocument=true;const a=document.createElement('a');a.href='/confidentialite';a.innerText='Test navigation';a.id='fixture-link';document.body.appendChild(a);});
  // Use an existing Next Link to preserve the document and test script deduplication.
  await page.locator('a[href="/confidentialite"]').first().click();
  await page.waitForURL('**/confidentialite');await page.locator('#fixture-tawk-widget').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>window.fixtureDocument),true,'App Router keeps the document');assert.equal(loads,1);
  // Navigating to a credential-bearing login URL must stop the widget.
  await page.evaluate(()=>history.pushState(null,'','/connexion?token=fixture-secret'));
  await page.waitForURL('**/connexion?token=fixture-secret');
  await page.locator('#fixture-tawk-widget').waitFor({state:'hidden'});
  assert.equal(loads,1);assert.deepEqual(errors,[]);
  results.push({width,scriptLoads:loads,navigation:true,privateUrlStopsChat:true,errors});await context.close();
 }
 const context=await browser.newContext();let loads=0;
 await context.route(widget,route=>{loads++;return route.fulfill({contentType:'text/javascript',body:fixture,headers:{'Access-Control-Allow-Origin':'*'}});});
 await context.route('**/api/analytics/config',route=>route.fulfill({json:{enabled:false}}));
 await context.route('**/api/me',route=>route.fulfill({status:401,json:{error:{code:'UNAUTHENTICATED'}}}));
 const page=await context.newPage();await page.goto(base+'/connexion?token=fixture-secret',{waitUntil:'networkidle'});assert.equal(loads,0);await context.close();
 await writeFile(output+'/browser-fixture.json',JSON.stringify({results,privateInitialLoads:loads,realProvider:false},null,2));
 console.log(JSON.stringify({results,privateInitialLoads:loads}));
}finally{await browser.close();}
