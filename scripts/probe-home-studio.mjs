import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BIENVU_HOME_URL??'http://localhost:3000';
const fixtures=process.argv.includes('--fixtures');
if(fixtures&&!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('FIXTURES_LOCAL_ONLY');
const directory=fixtures?'evidence/local/home-studio':'evidence/remote/home-studio';await mkdir(directory,{recursive:true});
const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url));
const {openBrowser}=require('@remotion/renderer');
const browser=await openBrowser('chrome',{logLevel:'error'}),reports=[];
const at='2026-09-29T10:00:00.000Z',expires='2026-10-06T10:00:00.000Z';
const account={user:{id:'user-home-fixture',name:'Alex Recette',email:'recette@example.com'},agency:{id:'agency-home-fixture',ownerUserId:'user-home-fixture',name:'Agence de recette',logoAssetId:null,primaryColor:'#214F43',secondaryColor:'#F3EFE6',phone:null,email:'recette@example.com',website:null,createdAt:at,updatedAt:at,brandVersion:0},rights:{generationEnabled:true,developmentRemaining:1,importRetryAt:null,trial:'eligible',watermarked:true}};
const job={id:'job-home-fixture',status:'queued',stage:'importing',attempt:1,errorCode:null,createdAt:at,updatedAt:at,expiresAt:expires,title:'Appartement à Lyon',videoUrl:null,downloadUrl:null,syntheticVoice:true,retryAllowed:false};
const fixtureScript=`(()=>{const native=window.fetch.bind(window);window.__homePosts=[];window.__homeJob=null;window.__homeFailOnce=true;window.fetch=async(input,options={})=>{const path=new URL(typeof input==='string'?input:input.url,location.href).pathname;const json=(data,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}}));if(path==='/api/me')return json(${JSON.stringify(account)});if(path==='/api/generations'&&options.method==='POST'){window.__homePosts.push({body:options.body,key:options.headers['Idempotency-Key']});await new Promise(r=>setTimeout(r,100));if(window.__homeFailOnce){window.__homeFailOnce=false;throw new TypeError('Réponse interrompue — fixture');}window.__homeJob=${JSON.stringify(job)};return json(window.__homeJob,202);}if(path==='/api/generations')return json({jobs:window.__homeJob?[window.__homeJob]:[${JSON.stringify({...job,status:'ready'})},${JSON.stringify({...job,id:'job-house-fixture',status:'ready',title:'Maison à Bordeaux'})}],nextCursor:null});if(path.startsWith('/api/generations/'))return json(window.__homeJob??${JSON.stringify(job)});if(path.startsWith('/api/'))throw Error('UNEXPECTED_API_FIXTURE');return native(input,options);};})();`;
try{
  for(const width of [1536,390,320]){
    const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:width,onBrowserLog:null,onLog:()=>{}}),cdp=page._client();
    await page.setViewport({width,height:width===1536?1024:900,deviceScaleFactor:1});
    if(fixtures)await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:fixtureScript});
    const evaluate=async expression=>{const result=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});assert.ok(!result.value.exceptionDetails,JSON.stringify(result.value.exceptionDetails));return result.value.result.value;};
    const wait=async expression=>evaluate(`(async()=>{for(let i=0;i<150;i++){if(${expression})return true;await new Promise(r=>setTimeout(r,100));}throw Error('WAIT_FAILED: '+${JSON.stringify(expression)});})()`);
    const click=async selector=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);};
    const shot=async name=>{await evaluate("(async()=>{await Promise.all([...document.images].map(image=>image.decode()));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));})()");const response=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(`${directory}/${name}.png`,Buffer.from(response.value.data,'base64'));};
    await page.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
    await wait("document.querySelector('.home-composer')&&[...document.querySelectorAll('.home-example-cover img')].every(i=>i.complete&&i.naturalWidth>0)");
    await evaluate('document.fonts.ready');
    if(fixtures)await wait("document.querySelector('.home-account')");
    else await wait("document.querySelector('.home-guest-account')&&!document.querySelector('.home-recents-empty')?.textContent.includes('Chargement')");
    const layout=await evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth,cards:document.querySelectorAll('.home-content .home-example').length,title:document.querySelector('h1').textContent,images:[...document.querySelectorAll('.home-content .home-example-cover img')].map(i=>({width:i.naturalWidth,height:i.naturalHeight})),hero:document.querySelector('.home-composer').getBoundingClientRect().toJSON(),gallery:document.querySelector('.home-example-grid').getBoundingClientRect().toJSON()})`);
    assert.equal(layout.overflow,false);assert.equal(layout.cards,4);assert.match(layout.title,/Une annonce/);
    await shot(`home-${width}`);
    if(width===1536){
      await click('.home-topbar button');await wait("document.querySelector('dialog')?.open");
      await shot('help');await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});await wait("!document.querySelector('dialog')");
      await click('.home-explore-link');await wait("document.querySelector('.home-explore-dialog')?.open");
      await evaluate("[...document.querySelectorAll('.home-gallery-filters button')].find(b=>b.textContent==='Maisons').click()");await wait("document.querySelectorAll('.home-explore-dialog .home-example').length===2");
      await shot('explore');await click('.home-dialog-close');await wait("!document.querySelector('dialog')");
      for(let i=0;i<4;i++){
        await evaluate(`document.querySelectorAll('.home-content .home-example-cover')[${i}].click()`);
        await wait("document.querySelector('dialog video')?.readyState>=2");
        const info=await evaluate(`(async()=>{const v=document.querySelector('dialog video');await v.play();await new Promise(r=>setTimeout(r,300));return {duration:v.duration,width:v.videoWidth,height:v.videoHeight,time:v.currentTime,muted:v.muted,audioTracks:v.webkitAudioDecodedByteCount??0};})()`);
        assert.equal(Math.round(info.duration),[28,32,27,30][i]);assert.equal(info.width,600);assert.ok(info.time>0);assert.equal(info.audioTracks,0);
        if(i===0)await shot('video');await click('.home-dialog-close');await wait("!document.querySelector('dialog')");reports.push({demo:i,...info});
      }
      if(fixtures){
        await click('.home-manual-toggle');await wait("document.querySelector('#home-manual-panel textarea')&&!document.querySelector('#home-manual-panel').hidden");
        assert.equal(await evaluate("Boolean(document.querySelector('#home-manual-panel input[type=file]'))"),true);
        await shot('manual');await click('.home-manual-toggle');
        await evaluate("document.querySelector('.home-composer').requestSubmit()");await wait("document.querySelector('#home-url-error')?.textContent.includes('HTTPS')");
        assert.equal(await evaluate('window.__homePosts.length'),0);
        await evaluate("(()=>{const i=document.querySelector('#home-listing-url');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'https://agence.example.com/annonce/fixture');i.dispatchEvent(new Event('input',{bubbles:true}));})()");
        await evaluate("document.querySelector('.home-composer').requestSubmit()");await wait("document.querySelector('#home-url-error')?.textContent.includes('interrompue')");
        await evaluate("document.querySelector('.home-composer').requestSubmit();document.querySelector('.home-composer').requestSubmit()");await wait("document.querySelector('.home-job-progress')");
        const posts=await evaluate('window.__homePosts');assert.equal(posts.length,2);assert.equal(posts[0].key,posts[1].key);assert.equal(posts[0].body,posts[1].body);
        assert.equal(await evaluate("sessionStorage.getItem('bienvu:generation:agency-home-fixture')"),null);
        await shot('progress');reports.push({fixtureGeneration:true,lostResponseSameKey:true,doubleClickDeduplicated:true,requests:2,providerCalls:0});
      }
    }else{
      await click('.home-mobile-header button');await wait("document.querySelector('.home-sidebar-open')?.getBoundingClientRect().left>=0");assert.equal(await evaluate("document.body.style.overflow"),'hidden');await shot(`menu-${width}`);
      await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});await wait("!document.querySelector('.home-sidebar-open')");
      assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"),false);
    }
    reports.push({width,fixtures,...layout});
  }
  if(fixtures){
    const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:4,onBrowserLog:null,onLog:()=>{}}),cdp=page._client();
    await page.setViewport({width:390,height:900,deviceScaleFactor:1});
    await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const native=window.fetch.bind(window);window.fetch=(input,options={})=>{const path=new URL(typeof input==='string'?input:input.url,location.href).pathname;if(path==='/api/me')return Promise.resolve(new Response('{}',{status:401,headers:{'Content-Type':'application/json'}}));if(path.startsWith('/api/'))throw Error('UNEXPECTED_GUEST_API_FIXTURE');return native(input,options);};})();`});
    const evaluate=async expression=>{const result=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});assert.ok(!result.value.exceptionDetails,JSON.stringify(result.value.exceptionDetails));return result.value.result.value;};
    await page.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
    await evaluate("(async()=>{for(let i=0;i<100;i++){if(document.querySelector('.home-composer button[type=submit]')?.disabled===false)return;await new Promise(r=>setTimeout(r,100));}throw Error('GUEST_NOT_READY');})()");
    await evaluate("(()=>{const i=document.querySelector('#home-listing-url');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'https://agence.example.com/annonce/guest');i.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await evaluate("document.querySelector('.home-composer').requestSubmit()");
    let next;
    for(let i=0;i<100;i++){
      try{next=await evaluate("({path:location.pathname,search:location.search,draft:JSON.parse(sessionStorage.getItem('bienvu:listing-draft'))})");if(next?.path==='/connexion')break;}catch{/* Navigation replaces the execution context. */}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.ok(next);
    assert.equal(next.path,'/connexion');assert.equal(next.search,'?mode=signup');assert.equal(next.draft.kind,'url');assert.equal(next.draft.url,'https://agence.example.com/annonce/guest');
    reports.push({guestFixture:true,signupNavigation:true,urlDraftPreserved:true,providerCalls:0});
  }
  await writeFile(`${directory}/browser-report.json`,JSON.stringify({at:new Date().toISOString(),base,fixtures,physicalDevice:false,reports},null,2));console.log(JSON.stringify({passed:true,base,fixtures,widths:[1536,390,320],examples:4,privateGenerationTest:fixtures}));
}finally{await browser.close({silent:true});}
