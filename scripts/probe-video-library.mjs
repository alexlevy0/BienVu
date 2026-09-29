import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.BIENVU_HOME_URL??'http://localhost:8787';
const fixtures=process.argv.includes('--fixtures');
if(fixtures&&!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('FIXTURES_LOCAL_ONLY');
const directory=fixtures?'evidence/local/video-library':'evidence/remote/video-library';
await mkdir(directory,{recursive:true});
const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url));
const {openBrowser}=require('@remotion/renderer');
const browser=await openBrowser('chrome',{logLevel:'error'});
const at='2026-09-29T10:00:00.000Z',expires='2026-10-06T10:00:00.000Z';
const account={user:{id:'user-library-fixture',name:'Alex Recette',email:'recette@example.com'},agency:{id:'agency-library-fixture',ownerUserId:'user-library-fixture',name:'Agence de recette',logoAssetId:null,primaryColor:'#214F43',secondaryColor:'#F3EFE6',phone:null,email:'recette@example.com',website:null,createdAt:at,updatedAt:at,brandVersion:0},rights:{generationEnabled:true,developmentRemaining:1,importRetryAt:null,trial:'eligible',watermarked:true}};
const jobs=[
  {id:'job-lyon-fixture',title:'Appartement à Lyon',status:'ready',stage:'rendering',durationSeconds:28,videoUrl:'/videos/studio-home/paris.mp4',downloadUrl:'/videos/studio-home/paris.mp4'},
  {id:'job-bordeaux-fixture',title:'Maison à Bordeaux',status:'ready',stage:'rendering',durationSeconds:32,videoUrl:'/videos/studio-home/bordeaux.mp4',downloadUrl:'/videos/studio-home/bordeaux.mp4'},
  {id:'job-loft-fixture',title:'Loft à Paris',status:'rendering',stage:'rendering',durationSeconds:null,videoUrl:null,downloadUrl:null},
].map((value,index)=>({...value,attempt:1,errorCode:null,createdAt:new Date(Date.parse(at)-index*86400_000).toISOString(),updatedAt:at,expiresAt:expires,syntheticVoice:true,retryAllowed:false}));
const shared={id:'share-bordeaux-fixture',jobId:'job-bordeaux-fixture'};
const publicVideo={id:shared.id,title:jobs[1].title,locality:'Bordeaux',propertyType:'house',agency:'Agence de recette',publishedAt:at,expiresAt:expires,durationSeconds:32,posterUrl:'/images/studio-home/bordeaux.webp',videoUrl:'/videos/studio-home/bordeaux.mp4',pageUrl:`/explorer/${shared.id}`};
const fixtureScript=`(()=>{const native=window.fetch.bind(window);let shares=[${JSON.stringify(shared)}];window.__libraryActions=[];window.__explorerPublished=false;window.fetch=async(input,options={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href),path=url.pathname,method=options.method??'GET';const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});if(path==='/api/me')return json(${JSON.stringify(account)});if(path==='/api/generations/shares')return json({shares});if(path==='/api/generations'&&method==='GET'){const q=(url.searchParams.get('q')??'').toLowerCase(),status=url.searchParams.get('status')??'all';return json({jobs:${JSON.stringify(jobs)}.filter(job=>job.title.toLowerCase().includes(q)&&(status==='all'||(status==='ready'&&job.status==='ready')||(status==='active'&&job.status!=='ready'))),nextCursor:null});}if(path==='/api/generations/job-lyon-fixture/share'&&method==='POST'){window.__libraryActions.push('publish');shares=[...shares,{id:'share-lyon-fixture',jobId:'job-lyon-fixture'}];return json({id:'share-lyon-fixture',pageUrl:'/explorer/share-lyon-fixture'});}if(path==='/api/generations/job-bordeaux-fixture/share'&&method==='DELETE'){window.__libraryActions.push('revoke');shares=shares.filter(x=>x.jobId!=='job-bordeaux-fixture');return json({ok:true});}if(path==='/api/explorer')return json({videos:window.__explorerPublished?[${JSON.stringify(publicVideo)}]:[],nextCursor:null});if(path.startsWith('/api/'))throw Error('UNEXPECTED_API_FIXTURE:'+path);return native(input,options);};})();`;
const report=[];
try {
  for(const width of [1536,390]) {
    const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:width,onBrowserLog:null,onLog:()=>{}}),cdp=page._client();
    await page.setViewport({width,height:width===1536?1024:900,deviceScaleFactor:1});
    if(fixtures)await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:fixtureScript});
    const evaluate=async expression=>{const result=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});assert.ok(!result.value.exceptionDetails,JSON.stringify(result.value.exceptionDetails));return result.value.result.value;};
    const wait=async expression=>evaluate(`(async()=>{for(let i=0;i<120;i++){if(${expression})return true;await new Promise(r=>setTimeout(r,100));}throw Error('WAIT_FAILED: '+${JSON.stringify(expression)});})()`);
    const shot=async name=>{await evaluate("(async()=>{await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));})()");const response=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(`${directory}/${name}.png`,Buffer.from(response.value.data,'base64'));};
    await page.goto({url:`${base}/historique`,timeout:60000,options:{waitUntil:'load'}});
    await wait(fixtures?"document.querySelectorAll('.video-library-card').length===3":"document.querySelector('.video-library-empty')");
    await evaluate('document.fonts.ready');
    if(fixtures) {
      await evaluate("(()=>{const ids=['paris','bordeaux','lyon'];document.querySelectorAll('.video-library-poster>img').forEach((img,i)=>{img.style.display='block';img.src='/images/studio-home/'+ids[i]+'.webp';});})()");
    }
    const layout=await evaluate("({overflow:document.documentElement.scrollWidth>innerWidth,cards:document.querySelectorAll('.video-library-card').length,heading:document.querySelector('h1')?.textContent})");
    assert.equal(layout.overflow,false);assert.equal(layout.heading,'Mes vidéos');
    if(fixtures)assert.equal(layout.cards,3);
    await shot(`history-${width}`);
    if(fixtures&&width===1536){
      await evaluate("document.querySelector('.video-library-tabs button:nth-child(2)').click()");await wait("document.querySelectorAll('.video-library-card').length===2");
      await evaluate("document.querySelector('.video-library-tabs button:nth-child(3)').click()");await wait("document.querySelectorAll('.video-library-card').length===1");
      await evaluate("document.querySelector('.video-library-tabs button:first-child').click()");await wait("document.querySelectorAll('.video-library-card').length===3");
      await evaluate("(()=>{const i=document.querySelector('.video-library-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'Bordeaux');i.dispatchEvent(new Event('input',{bubbles:true}));})()");await wait("document.querySelectorAll('.video-library-card').length===1");
      await evaluate("(()=>{const i=document.querySelector('.video-library-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'');i.dispatchEvent(new Event('input',{bubbles:true}));})()");await wait("document.querySelectorAll('.video-library-card').length===3");
      await evaluate("document.querySelector('#video-job-lyon-fixture .video-library-share-link').click()");await wait("document.querySelector('.video-library-confirm')?.open");
      await evaluate("document.querySelector('.video-library-confirm .video-library-create').click()");await wait("document.querySelector('#video-job-lyon-fixture .video-library-share a')");
      await evaluate("document.querySelector('#video-job-bordeaux-fixture .video-library-share button').click()");await wait("document.querySelector('#video-job-bordeaux-fixture .video-library-share-link')");
      assert.deepEqual(await evaluate('window.__libraryActions'),['publish','revoke']);
      report.push({fixtureActions:['publish','revoke'],providerCalls:0});
    }
    report.push({width,fixtures,...layout});
    await page.goto({url:`${base}/explorer`,timeout:60000,options:{waitUntil:'load'}});
    await wait("document.querySelectorAll('.public-explore-demos .public-explore-card').length===4");
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
    await shot(`explorer-${width}`);
    if(!fixtures&&width===1536) {
      await evaluate("document.querySelector('.public-explore-demos .public-explore-cover').click()");
      await wait("document.querySelector('.public-explore-dialog')?.open&&document.querySelector('.public-explore-dialog video')?.readyState>=2");
      assert.equal(Math.round(await evaluate("document.querySelector('.public-explore-dialog video').duration")),28);
      await evaluate("document.querySelector('.public-explore-dialog-close').click()");
      await wait("!document.querySelector('.public-explore-dialog')");
      report.push({remoteDemoPlayback:true,durationSeconds:28});
    }
    if(fixtures&&width===1536) {
      await evaluate("document.querySelector('.public-explore-filters button:nth-child(2)').click()");await wait("document.querySelectorAll('.public-explore-card').length===2");
      await evaluate("document.querySelector('.public-explore-filters button:nth-child(3)').click()");await wait("document.querySelectorAll('.public-explore-card').length===2");
      await evaluate("document.querySelector('.public-explore-filters button:nth-child(4)').click()");await wait("document.querySelectorAll('.public-explore-card').length===2");
      await evaluate("document.querySelector('.public-explore-filters button:first-child').click()");await wait("document.querySelectorAll('.public-explore-card').length===4");
      await evaluate("(()=>{const i=document.querySelector('.public-explore-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'Lyon');i.dispatchEvent(new Event('input',{bubbles:true}));})()");await wait("document.querySelectorAll('.public-explore-card').length===1");
      await evaluate("(()=>{const i=document.querySelector('.public-explore-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'');i.dispatchEvent(new Event('input',{bubbles:true}));})()");await wait("document.querySelectorAll('.public-explore-card').length===4");
      await evaluate("(()=>{const s=document.querySelector('.public-explore-sort select');s.value='oldest';s.dispatchEvent(new Event('change',{bubbles:true}));})()");await wait("document.querySelector('.public-explore-card .public-explore-cover-title')?.textContent==='Une maison à Bordeaux'");
      await evaluate("document.querySelector('.public-explore-card .public-explore-cover').click()");await wait("document.querySelector('.public-explore-dialog')?.open&&document.querySelector('.public-explore-dialog video')?.readyState>=2");
      assert.equal(Math.round(await evaluate("document.querySelector('.public-explore-dialog video').duration")),30);
      await evaluate("document.querySelector('.public-explore-dialog-close').click()");await wait("!document.querySelector('.public-explore-dialog')");
      await evaluate("window.__explorerPublished=true;document.querySelector('.public-explore-filters button:nth-child(2)').click()");await wait("document.querySelectorAll('.public-explore-card').length===3");
      await evaluate("document.querySelector('.public-explore-filters button:first-child').click()");await wait("document.querySelectorAll('.public-explore-card').length===5");
      assert.equal(await evaluate("document.querySelector('.public-explore-grid .public-explore-cover')?.getAttribute('href')"),'/explorer/share-bordeaux-fixture');
      report.push({explorerFixture:true,demonstrations:4,publicationsSimulated:1,filtersAndSearch:true,providerCalls:0});
    }
  }
  await writeFile(`${directory}/report.json`,JSON.stringify({at:new Date().toISOString(),base,fixtures,physicalDevice:false,report},null,2));
  console.log(JSON.stringify({passed:true,base,fixtures,widths:[1536,390],report}));
} finally {await browser.close({silent:true});}
