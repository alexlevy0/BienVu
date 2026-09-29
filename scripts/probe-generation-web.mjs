import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
const dir='evidence/remote/sprint-07',s=JSON.parse(await readFile(`${dir}/state.json`,'utf8')),users=JSON.parse(await readFile('.secrets/generation-users.json','utf8'));
const action=process.argv[2],kind=process.argv[3]??'url',jobId=s[kind+'Job'];
const request=(path,index=0,init={})=>fetch(s.webUrl+path,{...init,headers:{...(index===null?{}:{Cookie:users[index].cookie}),Origin:s.webUrl,...init.headers}});
if(action==='manual'){
  assert.ok(!s.manualJob,'ALREADY_SUBMITTED');
  const response=await request('/api/generations',0,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'s07-manual-from-web-api'},body:JSON.stringify({listingId:s.manualListingId})});
  const data=await response.json();assert.equal(response.status,202,JSON.stringify(data));s.manualJob=data.id;await writeFile(`${dir}/state.json`,JSON.stringify(s,null,2),{mode:0o600});console.log(JSON.stringify({jobId:data.id,status:data.status,via:'authenticated-web-api'}));
}else if(action==='verify'){
  const result=await request(`/api/generations/${jobId}`);assert.equal(result.status,200);const job=await result.json();assert.equal(job.status,'ready');
  assert.equal((await request(`/api/generations/${jobId}`,1)).status,404);assert.equal((await request(`/api/generations/${jobId}`,null)).status,401);
  assert.equal((await request(`/api/generations/${jobId}/video`,1)).status,404);assert.equal((await request(`/api/generations/${jobId}/video`,null)).status,401);
  const other=await (await request('/api/generations',1)).json();assert.equal(other.jobs.length,0);
  const me=await (await request('/api/me')).json();assert.equal(me.agency.id,s.agencyId);
  const response=await request(job.videoUrl);assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());
  const sha256=createHash('sha256').update(bytes).digest('hex');await writeFile(`${dir}/${kind}-video.mp4`,bytes,{mode:0o600});
  const head=await request(job.videoUrl,0,{method:'HEAD'});assert.equal(head.status,200);assert.equal(Number(head.headers.get('Content-Length')),bytes.length);
  const range=await request(job.videoUrl,0,{headers:{Range:'bytes=32-127'}});assert.equal(range.status,206);assert.deepEqual(Buffer.from(await range.arrayBuffer()),bytes.subarray(32,128));
  assert.equal((await request(job.videoUrl,0,{headers:{Range:`bytes=${bytes.length+10}-`}})).status,416);
  const download=await request(job.downloadUrl);assert.equal(download.status,200);assert.equal(createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex'),sha256);
  const bad=await request('/api/generations',0,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({listingId:s.manualListingId,agencyId:s.otherAgencyId})});assert.equal(bad.status,422);
  const csrf=await request('/api/generations',0,{method:'POST',headers:{Origin:'https://foreign.example','Content-Type':'application/json'},body:'{}'});assert.equal(csrf.status,403);
  await writeFile(`${dir}/${kind}-web-verification.json`,JSON.stringify({at:new Date().toISOString(),job,sizeBytes:bytes.length,sha256,historyIsolation:true,statusIsolation:true,videoIsolation:true,anonymous:401,crossAgency:404,range:206,invalidRange:416,csrf:403,unknownFields:422,downloadSameArtifact:true,remaining:me.rights.developmentRemaining},null,2),{mode:0o600});
  console.log(JSON.stringify({kind,sizeBytes:bytes.length,sha256,apiIsolation:true,range:206,downloadSameArtifact:true,remaining:me.rights.developmentRemaining}));
}else if(action==='form'){
  const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url)),{openBrowser}=require('@remotion/renderer');
  const browser=await openBrowser('chrome',{logLevel:'error'});try{
    const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}}),cdp=page._client();
    await page.setViewport({width:1440,height:1100,deviceScaleFactor:1});
    const split=users[0].cookie.indexOf('=');await cdp.send('Network.setCookie',{name:users[0].cookie.slice(0,split),value:users[0].cookie.slice(split+1),url:s.webUrl,secure:true,httpOnly:true});
    await page.goto({url:s.webUrl+'/generer',timeout:30000,options:{waitUntil:'load'}});
    const result=await cdp.send('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{for(let i=0;i<100&&!document.querySelector('.manual-toggle');i++)await new Promise(r=>setTimeout(r,100));document.querySelector('.manual-toggle').click();for(let i=0;i<100&&document.querySelector('.manual-toggle').getAttribute('aria-expanded')!=='true';i++)await new Promise(r=>setTimeout(r,100));document.querySelector('#manual-listing-panel').scrollIntoView({block:'start'});await new Promise(requestAnimationFrame);return {expanded:document.querySelector('.manual-toggle').getAttribute('aria-expanded'),description:Boolean(document.querySelector('textarea')),buttons:[...document.querySelectorAll('button[type=submit]')].map(b=>b.textContent),overflow:document.documentElement.scrollWidth>innerWidth};})()`});
    assert.equal(result.value.result.value.expanded,'true');assert.equal(result.value.result.value.description,true);assert.equal(result.value.result.value.overflow,false);
    for(const width of[1440,390]){await page.setViewport({width,height:1000,deviceScaleFactor:1});const layout=await cdp.send('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{await new Promise(requestAnimationFrame);document.querySelector('#manual-listing-panel').scrollIntoView({block:'start'});await new Promise(requestAnimationFrame);return {overflow:document.documentElement.scrollWidth>innerWidth};})()`});assert.equal(layout.value.result.value.overflow,false);const shot=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(`${dir}/form-${width}.png`,Buffer.from(shot.value.data,'base64'),{mode:0o600});}
    await writeFile(`${dir}/form.json`,JSON.stringify(result.value.result.value,null,2),{mode:0o600});console.log(JSON.stringify(result.value.result.value));
  }finally{await browser.close({silent:true});}
}else if(action==='browser'){
  const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url)),{openBrowser}=require('@remotion/renderer'),reports=[];
  for(const mobile of[false,true]){
    const browser=await openBrowser('chrome',{logLevel:'error'});try{
      const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}}),cdp=page._client();
      await page.setViewport({width:mobile?390:1440,height:mobile?844:1080,deviceScaleFactor:1});
      await cdp.send('Emulation.setDeviceMetricsOverride',{width:mobile?390:1440,height:mobile?844:1080,deviceScaleFactor:1,mobile});
      const split=users[0].cookie.indexOf('=');await cdp.send('Network.setCookie',{name:users[0].cookie.slice(0,split),value:users[0].cookie.slice(split+1),url:s.webUrl,secure:true,httpOnly:true});
      await page.goto({url:s.webUrl+'/historique',timeout:30_000,options:{waitUntil:'load'}});
      const playback=await cdp.send('Runtime.evaluate',{userGesture:true,awaitPromise:true,returnByValue:true,expression:`(async()=>{
        let video;for(let i=0;i<100;i++){video=[...document.querySelectorAll('video')].find(v=>v.src.includes(${JSON.stringify(jobId)}));if(video)break;await new Promise(r=>setTimeout(r,100));}
        if(!video)throw Error('VIDEO_NOT_VISIBLE');video.scrollIntoView({block:'center'});video.muted=false;video.volume=1;
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('PLAYBACK_TIMEOUT')),50000);video.addEventListener('ended',()=>{clearTimeout(timer);resolve();},{once:true});video.addEventListener('error',()=>reject(Error('VIDEO_ERROR')),{once:true});video.play().catch(reject);});
        const q=video.getVideoPlaybackQuality();return {ended:video.ended,duration:video.duration,width:video.videoWidth,height:video.videoHeight,frames:q.totalVideoFrames,dropped:q.droppedVideoFrames,audioBytes:video.webkitAudioDecodedByteCount,overflow:document.documentElement.scrollWidth>innerWidth};})()`});
      assert.ok(!playback.value.exceptionDetails,JSON.stringify(playback.value.exceptionDetails));const result=playback.value.result.value;
      assert.equal(result.ended,true);assert.equal(result.width,1080);assert.ok(result.audioBytes>0);assert.equal(result.overflow,false);
      const shot=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(`${dir}/${kind}-${mobile?'mobile':'desktop'}.png`,Buffer.from(shot.value.data,'base64'),{mode:0o600});
      reports.push({mobileEmulation:mobile,physicalDevice:false,...result});console.log(JSON.stringify({kind,mobile,result}));
    }finally{await browser.close({silent:true});}
  }
  await writeFile(`${dir}/${kind}-playback.json`,JSON.stringify({at:new Date().toISOString(),humanListening:false,reports},null,2),{mode:0o600});
}else throw new Error('ACTION_INVALID');
