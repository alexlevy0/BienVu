// Local fixture UI + real local HTTP metadata. No external API or video render.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const base=process.env.BIENVU_WORKFLOW_URL??'http://localhost:8790';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('LOCAL_FIXTURE_ONLY');
const output='evidence/local/recents-seo';await mkdir(output,{recursive:true});
const report=[];
for(const path of ['/','/explorer','/abonnement','/sources','/connexion']){
  const response=await fetch(base+path),html=await response.text();assert.equal(response.status,200);
  assert.ok(!/noindex|nofollow/i.test(response.headers.get('x-robots-tag')??''));
  const robots=html.match(/<meta name="robots" content="([^"]*)"/i)?.[1];assert.ok(robots,`Robots missing: ${path}`);
  if(path==='/connexion')assert.match(robots,/noindex/);else assert.ok(!/noindex|nofollow/i.test(robots),path+': '+robots);
  assert.match(html,/<link rel="icon" href="\/favicon\.ico/);assert.match(html,/<link rel="icon" href="\/icon\.svg/);
  if(path!=='/connexion')assert.match(html,new RegExp('rel="canonical" href="https://bienvu.online'+(path==='/'?'/?':path)+'"'));
  report.push({path,status:response.status,robots});
}
const robotsResponse=await fetch(base+'/robots.txt'),robots=await robotsResponse.text();assert.equal(robotsResponse.status,200);
assert.match(robots,/User-Agent: \*/);assert.match(robots,/Allow: \/\n/);assert.match(robots,/Sitemap: https:\/\/bienvu.online\/sitemap.xml/);
assert.doesNotMatch(robots,/Disallow: \/\s*$/m);
const sitemapResponse=await fetch(base+'/sitemap.xml'),sitemap=await sitemapResponse.text();assert.equal(sitemapResponse.status,200);
assert.ok((sitemap.match(/<loc>/g)??[]).length>=21);assert.doesNotMatch(sitemap,/<loc>[^<]*(?:historique|\/agence|\/essai|draft|token)/);
const iconResponse=await fetch(base+'/icon.svg');assert.equal(iconResponse.status,200);assert.match(await iconResponse.text(),/M14 3H3v11M26 3h11v11M3 26v11h11m12 0h11V26/);
const icoResponse=await fetch(base+'/favicon.ico'),ico=Buffer.from(await icoResponse.arrayBuffer());assert.equal(icoResponse.status,200);assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),4);
report.push({robots:true,sitemap:true,favicon:true});

const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url)),{openBrowser}=require('@remotion/renderer');
const browser=await openBrowser('chrome',{logLevel:'error'}),at=new Date().toISOString(),expires=new Date(Date.now()+86400_000).toISOString();
const account={user:{id:'ui-recents',name:'Alex Recette',email:'fixture@example.com'},agency:{id:'ui-agency',ownerUserId:'ui-recents',
  name:'Agence de recette',logoAssetId:null,primaryColor:'#E1E8D9',secondaryColor:'#171714',phone:null,email:'fixture@example.com',website:null,createdAt:at,updatedAt:at,brandVersion:0},
  rights:{generationEnabled:true,developmentRemaining:2,renewalAt:expires,creditKind:'free',importRetryAt:null,trial:'eligible',watermarked:true}};
const jobs=Array.from({length:45},(_,i)=>({id:'fixture-video-'+i,status:'ready',stage:'rendering',attempt:1,errorCode:null,
  createdAt:new Date(Date.now()-i*60_000).toISOString(),updatedAt:at,expiresAt:expires,title:'Vidéo '+(i+1),locality:'Lyon',
  sourceKind:'manual',videoUrl:'/videos/studio-home/paris.mp4',downloadUrl:'/videos/studio-home/paris.mp4',syntheticVoice:true,retryAllowed:false}));
const drafts=Array.from({length:37},(_,i)=>({id:'fixture-draft-'+i,status:'needs_input',sourceKind:'manual',title:'Brouillon '+(i+1),locality:'Paris',
  previewPhotoId:null,createdAt:new Date(Date.now()-i*60_000-30_000).toISOString()}));
const stub=`(()=>{const original=fetch.bind(window),account=${JSON.stringify(account)},jobs=${JSON.stringify(jobs)},drafts=${JSON.stringify(drafts)};
  window.__recentCalls={jobs:0,imports:0,posts:0};window.fetch=async(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href),path=url.pathname;
    if(options.method&&options.method!=='GET')window.__recentCalls.posts++;
    const json=data=>Promise.resolve(new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}}));
    if(path==='/api/me')return json(account);
    if(path.startsWith('/api/generations/fixture-video-')&&!path.endsWith('/report'))return json(jobs.find(job=>path==='/api/generations/'+job.id));
    if(path==='/api/generations'||path==='/api/imports'){
      const isJob=path==='/api/generations',key=isJob?'jobs':'imports',all=isJob?jobs:drafts,size=isJob?20:30,
        offset=Number(url.searchParams.get('cursor')||0);window.__recentCalls[key]++;
      return json({[key]:all.slice(offset,offset+size),nextCursor:offset+size<all.length?String(offset+size):null});}
    if(path.startsWith('/api/'))return json({videos:[],nextCursor:null});return original(input,options);
  };})();`;
const poster=(await readFile('apps/web/public/images/studio-home/paris.webp')).toString('base64');
try{for(const width of [1536,390]){
  const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:921,onBrowserLog:null,onLog:()=>{}}),cdp=page._client();
  await page.setViewport({width,height:width===390?844:980,deviceScaleFactor:1});
  await cdp.send('Storage.clearDataForOrigin',{origin:new URL(base).origin,storageTypes:'all'});
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:stub});
  cdp.on('Fetch.requestPaused',event=>{void cdp.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,
    responseHeaders:[{name:'Content-Type',value:'image/webp'}],body:poster});});
  await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*source-photo*',requestStage:'Request'}]});
  const e=async expression=>{const result=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
    assert.ok(!result.value.exceptionDetails,JSON.stringify(result.value.exceptionDetails));return result.value.result.value;};
  await page.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
  let ready=false;for(let i=0;i<160;i++){if(await e('document.querySelectorAll(".home-recent-link").length===82')){ready=true;break;}await new Promise(r=>setTimeout(r,100));}
  if(!ready){const shot=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(output+'/failure-'+width+'.png',Buffer.from(shot.value.data,'base64'));}
  assert.ok(ready,'All 45 videos and 37 drafts must appear: '+await e('JSON.stringify({count:document.querySelectorAll(".home-recent-link").length,calls:window.__recentCalls,body:document.body.innerText.slice(0,1200)})'));
  assert.equal(await e('document.querySelectorAll(".home-draft-more").length'),37);
  assert.equal(await e("[...document.querySelectorAll('.home-recent-link')].at(-1).getAttribute('href')"),'/historique/fixture-video-44');
  const calls=await e('window.__recentCalls');assert.equal(calls.jobs,3);assert.equal(calls.imports,2);assert.equal(calls.posts,0);
  if(width===390)await e("document.querySelector('.home-mobile-header button').click()");
  const overflow=await e("(()=>{const list=document.querySelector('.home-recents');return list.scrollHeight>list.clientHeight;})()");assert.equal(overflow,true);
  const bottomVisible=await e("(()=>{const r=document.querySelector('.home-sidebar-bottom').getBoundingClientRect();return r.top>0&&r.bottom<=innerHeight+1;})()");assert.equal(bottomVisible,true);
  assert.equal(await e('document.documentElement.scrollWidth<=innerWidth+2'),true);
  const first=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(output+'/recents-'+width+'.png',Buffer.from(first.value.data,'base64'));
  await e("(()=>{const n=document.querySelector('.home-recents');n.scrollTop=n.scrollHeight;})()");
  await new Promise(r=>setTimeout(r,200));
  assert.equal(await e("(()=>{const r=document.querySelector('.home-recents .home-recent-link:last-child').getBoundingClientRect(),list=document.querySelector('.home-recents').getBoundingClientRect();return r.bottom<=list.bottom+1&&r.top>=list.top;})()"),true);
  const last=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(output+'/recents-bottom-'+width+'.png',Buffer.from(last.value.data,'base64'));
  await e("(()=>{const b=[...document.querySelectorAll('.home-draft-more')].at(-1);b.scrollIntoView({block:'end'});b.click();})()");
  await new Promise(r=>setTimeout(r,100));
  assert.equal(await e("(()=>{const item=document.querySelector('[role=menuitem]'),r=item.getBoundingClientRect(),list=document.querySelector('.home-recents').getBoundingClientRect();return item===document.activeElement&&r.top>=list.top&&r.bottom<=list.bottom+1;})()"),true);
  await e("[...document.querySelectorAll('.home-recent-link')].at(-1).click()");
  let detail=false;for(let i=0;i<160;i++){if(await e("location.pathname==='/historique/fixture-video-44'&&document.querySelector('.generation-progress .section-kicker')?.textContent==='Vidéo 45'")){detail=true;break;}await new Promise(r=>setTimeout(r,100));}
  assert.equal(detail,true,'The oldest video must open directly without paging the history grid');
  assert.equal(await e('window.__recentCalls.posts'),0);
  report.push({width,entries:82,drafts:37,generationPages:calls.jobs,draftPages:calls.imports,scrollable:true,accountVisible:true,draftMenuVisible:true,oldestVideoOpened:true,videoPosts:0});await page.close();
}}finally{await browser.close({silent:true});}
await writeFile(output+'/ui-report.json',JSON.stringify({fixture:true,at:new Date().toISOString(),report},null,2));console.log(JSON.stringify({passed:true,report}));
