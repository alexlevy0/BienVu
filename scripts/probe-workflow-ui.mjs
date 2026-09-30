// Fixture browser probe only. No API provider or paid render is contacted.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const base=process.env.BIENVU_WORKFLOW_URL??'http://localhost:8790';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('LOCAL_FIXTURE_ONLY');
const output=path.resolve('evidence/local/workflow-ui');await mkdir(output,{recursive:true});
const runSeed=Date.now().toString(36);
const fixturePoster=(await readFile(path.resolve('apps/web/public/images/studio-home/paris.webp'))).toString('base64');
async function stubPrivateImages(cdp){
  cdp.on('Fetch.requestPaused',event=>{void cdp.send('Fetch.fulfillRequest',{requestId:event.requestId,
    responseCode:200,responseHeaders:[{name:'Content-Type',value:'image/webp'},{name:'Cache-Control',value:'no-store'}],body:fixturePoster});});
  await cdp.send('Fetch.enable',{patterns:[
    {urlPattern:'*source-photo*',requestStage:'Request'},
    {urlPattern:'*/api/generations/*/poster',requestStage:'Request'},
    {urlPattern:'*/api/imports/*/photos/*',requestStage:'Request'},
  ]});
}
const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url));
const {openBrowser}=require('@remotion/renderer');const browser=await openBrowser('chrome',{logLevel:'error'});
const at=new Date().toISOString(),expires=new Date(Date.now()+7*86400_000).toISOString();
const account={user:{id:'ui-user',name:'Alex Recette',email:'fixture@example.com'},
  agency:{id:'ui-agency',ownerUserId:'ui-user',name:'Agence de recette',logoAssetId:null,primaryColor:'#E1E8D9',
    secondaryColor:'#171714',phone:null,email:'fixture@example.com',website:null,createdAt:at,updatedAt:at,brandVersion:0},
  rights:{generationEnabled:true,developmentRemaining:2,renewalAt:expires,creditKind:'free',importRetryAt:null,trial:'eligible',watermarked:true}};
const sample='Appartement à vendre à Lyon 6, 65 m², 3 pièces, 280 000 €, avec terrasse.';
const fields={title:'Appartement 3 pièces à Lyon 6e',propertyType:'apartment',transaction:'sale',locality:'Lyon 6e',
  description:sample,priceCents:28000000,charges:null,area:65,rooms:3};
const priceInput='Je voudrais vendre un appartement a Lyon a 200k€';
const priceDescription='Découvrez cet appartement à vendre à Lyon, au prix de 200 000 €.';
const priceFields={...fields,title:'Appartement à Lyon',locality:'Lyon',description:priceDescription,priceCents:20_000_000,area:null,rooms:null};
const partialFields={...fields,title:'Appartement de recette',locality:'Lyon 6e',description:null};
const code=(mode,run)=>`(()=>{const native=window.fetch.bind(window),at=${JSON.stringify(at)},expires=${JSON.stringify(expires)},
  account=${JSON.stringify(account)},sample=${JSON.stringify(mode.endsWith('-price')?priceInput:sample)},fields=${JSON.stringify(mode.endsWith('-price')?priceFields:fields)},partialFields=${JSON.stringify(partialFields)},
  mode=${JSON.stringify(mode)},run=${JSON.stringify(run)};
  const key='bienvu:workflow-ui-'+run,empty=()=>({jobs:mode==='quota-refund'?{'quota-ready':{status:'ready'},'quota-active':{status:'rendering'}}:mode==='draft-actions'?{'fixture-existing':{status:'ready'}}:{},
    imports:mode==='draft-actions'?['ui-delete-'+run,'ui-preserve-'+run].map(id=>({id,sourceKind:'manual',status:'needs_input',draft:draft(id,partialFields)})):[],
    posts:0,reports:[],reportAttempts:0,uploads:0,descriptionCalls:0,deleteAttempts:0,deletes:[]});
  const load=()=>JSON.parse(sessionStorage.getItem(key)||JSON.stringify(empty())),save=s=>sessionStorage.setItem(key,JSON.stringify(s));
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  const draft=(id,data,photos=[],version=1)=>({id,version,status:'needs_input',sourceKind:id.includes('url')?'url':'manual',
    sourceUrl:id.includes('url')?'https://fixtures.bienvu.example/vente':null,expiresAt:expires,
    data:{fields:data,originalText:data.description,canonicalUrl:null,warnings:[],provenance:{}},photos});
  const listing=id=>({id,sourceKind:'manual',sourceUrl:null,status:'ready',errorCode:null,createdAt:at,expiresAt:expires,listing:null});
  const job=(id,s)=>({id,status:s.status,stage:['ready','failed'].includes(s.status)?'rendering':s.status==='queued'?'importing':s.status,
    attempt:1,errorCode:null,createdAt:id==='fixture-existing'?new Date(Date.parse(at)-86400000).toISOString():at,updatedAt:new Date().toISOString(),expiresAt:expires,
    title:'Appartement 3 pièces à Lyon',locality:'Lyon',sourceKind:'manual',
    videoUrl:s.status==='ready'?'/videos/studio-home/paris.mp4':null,
    downloadUrl:s.status==='ready'?'/videos/studio-home/paris.mp4':null,syntheticVoice:true,retryAllowed:false,
    ownership:'owned',masterAccess:'unlocked',retention:'available'});
  window.__workflow={load,setReady(){const s=load();for(const j of Object.values(s.jobs))j.status='ready';save(s);},
    setFailed(){const s=load();for(const j of Object.values(s.jobs))if(j.status!=='ready')j.status='failed';save(s);}};
  window.turnstile={render:(element,options)=>{element.textContent='Vérification locale';setTimeout(()=>options.callback('fixture-token'),40);return 'fixture';},remove:()=>{},reset:()=>{}};
  window.fetch=async(input,options={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href),p=url.pathname,s=load(),method=options.method??'GET';
    if(p==='/api/me')return mode.startsWith('guest')?json({},401):json({...account,rights:{...account.rights,
      developmentRemaining:Math.max(0,2-Object.values(s.jobs).filter(job=>job.status!=='failed').length)}});
    if(p==='/api/trial'&&method==='GET'){s.trialReady=true;save(s);return json({enabled:true,siteKey:'fixture-site',used:false,job:null});}
    if(p==='/api/trial/describe'&&method==='POST'){s.descriptionCalls++;save(s);
      if(mode==='guest-failure')return json({extraction:'unavailable',data:null});
      return json({extraction:'ready',data:{fields,
      originalText:sample,canonicalUrl:null,warnings:[],provenance:{propertyType:{source:'ai',evidence:'Appartement',confirm:false},
        transaction:{source:'ai',evidence:'à vendre',confirm:false},locality:{source:'ai',evidence:'Lyon 6',confirm:false},
        priceCents:{source:'ai',evidence:'280 000 €',confirm:false},area:{source:'ai',evidence:'65 m²',confirm:false},
        rooms:{source:'ai',evidence:'3 pièces',confirm:false},title:{source:'ai',evidence:null,confirm:false},
        description:{source:'user',evidence:null,confirm:false}}}});}
    if(p==='/api/imports'&&method==='GET')return json({imports:s.imports.map(i=>({id:i.id,sourceKind:i.sourceKind,
      status:i.status,title:i.draft?.data.fields.title??null,locality:i.draft?.data.fields.locality??null,
      previewPhotoId:i.draft?.photos[0]?.id??null,createdAt:at,expiresAt:expires,sourceUrl:i.sourceUrl??null,errorCode:null,transaction:'sale'}))});
    if(p==='/api/imports'&&method==='POST'){const importId='ui-url-partial-'+run;
      const savedPhotos=mode==='missing-locality'?[0,1,2].map(index=>({
      id:'ui-photo-'+index,agencyId:'ui-agency',listingId:importId,sourceUrl:null,sourceOrder:index,
      objectKey:'agencies/ui-agency/imports/'+importId+'/ui-photo-'+index+'.jpg',
      contentHash:(index+1).toString(16).padStart(64,'0'),width:960,height:640,mime:'image/jpeg',sizeBytes:1500})):[];
      const value={id:importId,sourceKind:'url',sourceUrl:'https://fixtures.bienvu.example/vente',
      status:'needs_input',errorCode:null,createdAt:at,expiresAt:expires,listing:null,
      draft:draft(importId,mode==='missing-locality'?{...fields,locality:null}:partialFields,savedPhotos)};
      if(!s.imports.some(i=>i.id===value.id))s.imports.push(value);save(s);return json(value,202);}
    if(p==='/api/imports/describe'&&method==='POST'){s.descriptionCalls++;
      if(mode==='late-description')await new Promise(resolve=>setTimeout(resolve,1000));
      const value=draft('ui-description-'+run,fields);
      value.data.originalText=sample;
      value.data.provenance={propertyType:{source:'ai',evidence:'Appartement',confirm:false},transaction:{source:'ai',evidence:'à vendre',confirm:false},
        locality:{source:'ai',evidence:'Lyon 6',confirm:false},priceCents:{source:'ai',evidence:'280 000 €',confirm:false},
        area:{source:'ai',evidence:'65 m²',confirm:false},rooms:{source:'ai',evidence:'3 pièces',confirm:false},
        title:{source:'ai',evidence:null,confirm:false},description:{source:'user',evidence:null,confirm:false}};
      if(!s.imports.some(i=>i.id===value.id))s.imports.push({id:value.id,sourceKind:'manual',sourceUrl:null,status:'needs_input',draft:value});
      save(s);return json({draft:value,extraction:'ready'});}
    if(p==='/api/imports/draft'&&method==='POST'){const value=draft('ui-manual',run.includes('-motion-')?
      Object.fromEntries(Object.keys(partialFields).map(key=>[key,null])):partialFields);s.imports.push({id:value.id,sourceKind:'manual',sourceUrl:null,status:'needs_input',draft:value});save(s);return json(value,201);}
    const match=p.match(/^\\/api\\/imports\\/(ui-[^/]+)(?:\\/(.*))?$/);if(match){const entry=s.imports.find(i=>i.id===match[1]);if(!entry)return json({error:{code:'NOT_FOUND'}},404);
      if(match[2]==='draft'&&method==='DELETE'){s.deleteAttempts++;save(s);await new Promise(resolve=>setTimeout(resolve,150));
        if(s.deleteAttempts===1)return json({error:{code:'SERVICE_UNAVAILABLE'}},503);
        s.imports=s.imports.filter(i=>i.id!==entry.id);s.deletes.push(entry.id);save(s);return json({ok:true});}
      if(!match[2]&&method==='GET')return json(entry);
      if(match[2]==='draft'&&method==='GET')return json(entry.draft);
      if(match[2]==='draft'&&method==='PATCH'){const body=JSON.parse(options.body),next={...entry.draft,version:entry.draft.version+1,
        data:{...entry.draft.data,fields:{...entry.draft.data.fields,...body.changes}}};entry.draft=next;save(s);return json(next);}
      if(match[2]?.startsWith('uploads/')&&method==='PUT'){const index=Number(match[2].split('/')[1]),id=options.headers['X-Upload-ID'];
        const photo={id,agencyId:'ui-agency',listingId:entry.id,sourceUrl:null,sourceOrder:index,
          objectKey:'agencies/ui-agency/imports/'+entry.id+'/'+id+'.jpg',contentHash:(index+1).toString(16).padStart(64,'0'),
          width:960,height:640,mime:'image/jpeg',sizeBytes:1500};entry.draft.photos.push(photo);s.uploads++;save(s);return json({photo});}
      if(match[2]?.startsWith('uploads/')&&method==='DELETE'){const id=options.headers['X-Upload-ID'];entry.draft.photos=entry.draft.photos.filter(p=>p.id!==id);save(s);return json({ok:true});}
      if(match[2]==='complete'&&method==='POST'){entry.status='ready';save(s);return json(listing(entry.id));}
    }
    if(p==='/api/generations'&&method==='GET')return json({jobs:Object.entries(s.jobs).map(([id,v])=>job(id,v)),nextCursor:null});
    if(p==='/api/generations'&&method==='POST'){const body=JSON.parse(options.body),id='ui-job-'+body.listingId;
      if(!s.jobs[id])s.jobs[id]={status:'queued'};s.posts++;save(s);return json(job(id,s.jobs[id]),202);}
    if(p==='/api/generations/shares')return json({shares:[]});
    if(p.startsWith('/api/generations/')&&method==='GET'){const id=p.split('/')[3];return s.jobs[id]?json(job(id,s.jobs[id])):json({error:{code:'NOT_FOUND'}},404);}
    if(p.match(/^\\/api\\/generations\\/[^/]+\\/report$/)&&method==='POST'){
      s.reportAttempts++;if(s.reportAttempts===1){save(s);return json({error:{code:'SERVICE_UNAVAILABLE'}},503);}
      s.reports.push(JSON.parse(options.body));save(s);return json({id:'ui-report',createdAt:at},201);}
    if(p==='/api/explorer')return json({videos:[],nextCursor:null});
    if(p.startsWith('/api/'))return json({error:{code:'NOT_FOUND'}},404);
    return native(input,options);};})();`;
const report=[];
const priceOnly=process.argv.includes('--price-only');
const actionsOnly=process.argv.includes('--draft-actions-only');
try{
  if(!priceOnly&&!actionsOnly){
  for(const width of [1536,390]){
    const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:width,onBrowserLog:null,onLog:()=>{}}),cdp=page._client();
    await page.setViewport({width,height:width===1536?980:844,deviceScaleFactor:1});
    await stubPrivateImages(cdp);
    await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:code('auth',runSeed+'-'+width)});
    const evaluate=async expression=>{const value=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
      assert.ok(!value.value.exceptionDetails,JSON.stringify(value.value.exceptionDetails));return value.value.result.value;};
    const wait=async expression=>{for(let i=0;i<160;i++){if(await evaluate(`Boolean(${expression})`))return;await new Promise(r=>setTimeout(r,100));}
      throw Error(`WAIT ${expression}: ${await evaluate('document.body.innerText.slice(0,1400)')}`);};
    const shot=async name=>{await new Promise(r=>setTimeout(r,400));const picture=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      await writeFile(path.join(output,`${name}-${width}.png`),Buffer.from(picture.value.data,'base64'));};
    const click=async selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const setInput=async(selector,value)=>evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});
      n.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const noOverflow=async()=>assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'),true);
    await page.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
    await wait("document.querySelector('.home-mode-pill')&&document.querySelector('.home-account')");
    await wait("document.querySelector('.home-plan>span')?.textContent==='2 vidéos disponibles'");
    assert.equal(await evaluate("document.querySelector('#home-create-note')?.hidden"),true);
    assert.equal(await evaluate("document.querySelector('.home-composer-dock')?.textContent.includes('Renouvellement le')"),false);
    await shot('quota-home');
    await setInput('#home-listing-url','https://fixtures.bienvu.example/vente');
    await evaluate("document.querySelector('.home-composer').requestSubmit()");
    await wait("document.querySelector('.manual-step-header')?.textContent.includes('4 SUR 5')");
    assert.equal(await evaluate("document.body.innerText.includes('Les informations du bien ont été récupérées')"),true);
    await shot('url-partial');await noOverflow();
    await evaluate(`(async()=>{const transfer=new DataTransfer();for(const name of ['paris','sud','lyon']){
      const blob=await (await fetch('/images/studio-home/'+name+'.webp')).blob();transfer.items.add(new File([blob],name+'.webp',{type:'image/webp'}));}
      const input=document.querySelector('#manual-photos');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await wait("document.querySelectorAll('.manual-photos li').length===3&&document.body.innerText.includes('3 photos sélectionnées')");
    await wait("[...document.querySelectorAll('.manual-photos li')].every(li=>li.textContent.includes('Disponible'))");
    assert.equal(await evaluate('window.__workflow.load().uploads'),3);
    await click('.manual-step-actions .home-primary-button');
    await wait("document.querySelector('.manual-step-header')?.textContent.includes('5 SUR 5')");
    await shot('validation');await noOverflow();
    if(width===390){
      await evaluate("(()=>{const n=document.querySelector('.home-conversation-scroll');n.scrollTop=n.scrollHeight;})()");
      await new Promise(r=>setTimeout(r,150));
      assert.equal(await evaluate("(()=>{const region=document.querySelector('.home-conversation-scroll').getBoundingClientRect(),action=document.querySelector('.manual-step-actions').getBoundingClientRect();return action.top>=region.top&&action.bottom<=region.bottom+2;})()"),true);
      await shot('validation-bottom');
    }
    assert.equal(await evaluate("document.querySelector('.home-composer .home-primary-button').disabled"),false);
    await evaluate("document.querySelector('.home-composer').requestSubmit()");
    await wait("document.querySelector('.home-conversation-job')&&window.__workflow.load().posts===1");
    await wait("document.querySelector('.home-plan>span')?.textContent==='1 vidéo disponible'");
    await shot('generation');
    await click('a[href="/explorer"]');
    await wait("location.pathname==='/explorer'&&document.body.innerText.includes('Les vidéos de la communauté')");
    await evaluate('window.__workflow.setReady()');
    await evaluate("window.dispatchEvent(new Event('focus'))");
    await wait("document.querySelector('.studio-notification')");
    await shot('notification');
    await page.goto({url:base+'/historique',timeout:60000,options:{waitUntil:'load'}});
    await wait("document.querySelector('.video-library-card')");
    assert.equal(await evaluate('window.__workflow.load().posts'),1);
    if(width===1536){
      await click('.problem-report-link');
      await evaluate("(()=>{const n=document.querySelector('.problem-report textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(n,'La photo principale est recadrée.');n.dispatchEvent(new Event('input',{bubbles:true}));})()");
      await evaluate("document.querySelector('.problem-report form').requestSubmit()");
      await wait("document.querySelector('.problem-report [role=alert]')");
      assert.equal(await evaluate("document.querySelector('.problem-report textarea').value"),'La photo principale est recadrée.');
      await evaluate("document.querySelector('.problem-report form').requestSubmit()");
      await wait("document.body.innerText.includes('Signalement reçu.')");
      assert.equal(await evaluate('window.__workflow.load().reports.length'),1);
    }
    if(width===390)await evaluate("document.querySelector('.video-library-actions').scrollIntoView({block:'center'})");
    await shot('result');await noOverflow();
    await page.close();report.push({width,sidebarQuota:true,quotaAfterAdmission:1,composerQuotaRemoved:true,urlPartial:true,earlyUploads:3,generationPosts:1,backgroundReady:true,notification:true,
      reportRetry:width===1536,noOverflow:true});
  }
  const quotaPage=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:995,onBrowserLog:null,onLog:()=>{}}),quotaCdp=quotaPage._client();
  await quotaPage.setViewport({width:1536,height:980,deviceScaleFactor:1});await stubPrivateImages(quotaCdp);
  await quotaCdp.send('Page.addScriptToEvaluateOnNewDocument',{source:code('quota-refund',runSeed+'-quota-refund')});
  const quotaEval=async expression=>{const value=await quotaCdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
    assert.ok(!value.value.exceptionDetails,JSON.stringify(value.value.exceptionDetails));return value.value.result.value;};
  const quotaWait=async expression=>{for(let i=0;i<160;i++){if(await quotaEval('Boolean('+expression+')'))return;await new Promise(r=>setTimeout(r,100));}throw Error('QUOTA WAIT '+expression);};
  await quotaPage.goto({url:base+'/historique',timeout:60000,options:{waitUntil:'load'}});
  await quotaWait("document.querySelector('.home-plan>span')?.textContent==='0 vidéo disponible'&&document.querySelectorAll('.video-library-card').length===2");
  await quotaEval("window.__workflow.setFailed();window.dispatchEvent(new Event('focus'))");
  await quotaWait("document.querySelector('.home-plan>span')?.textContent==='1 vidéo disponible'");
  assert.equal(await quotaEval('window.__workflow.load().posts'),0);
  await quotaPage.close();report.push({quotaExhausted:0,quotaAfterFailure:1,noReload:true,noGeneration:true});
  const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:999,onBrowserLog:null,onLog:()=>{}}),cdp=page._client();
  await page.setViewport({width:1536,height:980,deviceScaleFactor:1});
  await stubPrivateImages(cdp);
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:code('auth',runSeed+'-description')});
  const evaluate=async expression=>{const value=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
    assert.ok(!value.value.exceptionDetails,JSON.stringify(value.value.exceptionDetails));return value.value.result.value;};
  const wait=async expression=>{for(let i=0;i<160;i++){if(await evaluate(`Boolean(${expression})`))return;await new Promise(r=>setTimeout(r,100));}
    throw Error(`WAIT ${expression}: ${await evaluate('document.body.innerText.slice(0,1400)')}`);};
  await page.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
  await wait("document.querySelector('.home-mode-pill')&&document.querySelector('.home-account')");
  await evaluate(`(()=>{const n=document.querySelector('#home-listing-url');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(sample)});n.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.home-composer').requestSubmit();})()`);
  await wait("document.querySelector('.manual-step-header')?.textContent.includes('4 SUR 5')");
  assert.equal(await evaluate("document.body.innerText.includes('Appartement · Vente · Lyon 6e · 65 m²')"),true);
  assert.equal(await evaluate('window.__workflow.load().posts'),0);
  await new Promise(r=>setTimeout(r,400));
  const picture=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(path.join(output,'description-1536.png'),Buffer.from(picture.value.data,'base64'));
  await page.close();report.push({description:true,providerFixtureCalls:1,videoPosts:0,adaptiveStep:4});
  }
  if(!actionsOnly)for(const width of [1536,390])for(const mode of ['auth-price','guest-price']){
    const pricePage=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:994,onBrowserLog:null,onLog:()=>{}}),priceCdp=pricePage._client();
    // These are independent new-entry cases in the isolated fixture browser.
    await priceCdp.send('Storage.clearDataForOrigin',{origin:new URL(base).origin,storageTypes:'all'});
    await pricePage.setViewport({width,height:width===390?844:980,deviceScaleFactor:1});
    await priceCdp.send('Page.addScriptToEvaluateOnNewDocument',{source:code(mode,runSeed+'-'+mode+'-'+width)});
    const priceEval=async expression=>{const value=await priceCdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
      assert.ok(!value.value.exceptionDetails,JSON.stringify(value.value.exceptionDetails));return value.value.result.value;};
    const priceWait=async expression=>{for(let i=0;i<160;i++){if(await priceEval('Boolean('+expression+')'))return;await new Promise(r=>setTimeout(r,100));}throw Error('PRICE WAIT '+expression+': '+await priceEval('document.body.innerText.slice(0,1800)'));};
    await pricePage.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
    await priceWait(`document.querySelector('.home-mode-pill')&&document.querySelector('${mode.startsWith('guest')?'.home-guest-account':'.home-account'}')`);
    if(mode.startsWith('guest')){await priceWait('window.__workflow.load().trialReady');await new Promise(r=>setTimeout(r,300));}
    await priceEval(`(()=>{const n=document.querySelector('#home-listing-url');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(priceInput)});n.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.home-composer').requestSubmit();})()`);
    await priceWait("document.querySelector('.manual-step-header')?.textContent.includes('4 SUR 5')");
    await priceEval("[...document.querySelectorAll('.manual-step-nav button')].find(n=>n.textContent.startsWith('Détails')).click()");
    await priceWait("document.querySelector('.manual-step-header')?.textContent.includes('3 SUR 5')");
    assert.equal(await priceEval("document.querySelector('#manual-priceCents').value"),'200000');
    assert.equal(await priceEval("document.querySelector('#manual-description').value.replace(/\\s/g,' ')"),priceDescription);
    assert.equal(await priceEval("document.querySelector('.home-request-bubble strong').textContent"),priceInput);
    assert.equal(await priceEval("document.querySelector('#manual-area').value"),'');
    assert.equal(await priceEval("document.querySelector('#manual-rooms').value"),'');
    assert.equal(await priceEval('window.__workflow.load().posts'),0);
    await priceWait("Boolean(document.querySelector('.home-content-conversation'))");
    await priceEval("document.fonts.ready");await new Promise(r=>setTimeout(r,500));
    await priceEval("document.querySelector('#manual-priceCents').scrollIntoView({block:'center',behavior:'instant'})");
    assert.equal(await priceEval('document.documentElement.scrollWidth<=innerWidth+2'),true);
    await writeFile(path.join(output,`${mode}-${width}.png`),Buffer.from((await priceCdp.send('Page.captureScreenshot',{format:'png'})).value.data,'base64'));
    if(width===390){await priceEval("document.querySelector('#manual-description').scrollIntoView({block:'center',behavior:'instant'})");
      await writeFile(path.join(output,`${mode}-description-${width}.png`),Buffer.from((await priceCdp.send('Page.captureScreenshot',{format:'png'})).value.data,'base64'));}
    await pricePage.close();report.push({mode,width,priceEuros:200000,rewrittenDescription:true,originalRequestPreserved:true,unknownFieldsEmpty:true,videoPosts:0});
  }
  if(!priceOnly&&!actionsOnly){
  const latePage=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:996,onBrowserLog:null,onLog:()=>{}}),lateCdp=latePage._client();
  await latePage.setViewport({width:1536,height:980,deviceScaleFactor:1});
  await lateCdp.send('Page.addScriptToEvaluateOnNewDocument',{source:code('late-description',runSeed+'-late-description')});
  const lateEval=async expression=>{const value=await lateCdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
    assert.ok(!value.value.exceptionDetails,JSON.stringify(value.value.exceptionDetails));return value.value.result.value;};
  await latePage.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
  for(let i=0;i<160&&!await lateEval("Boolean(document.querySelector('.home-account'))");i++)await new Promise(r=>setTimeout(r,100));
  await lateEval(`(()=>{const n=document.querySelector('#home-listing-url');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(sample)});n.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.home-composer').requestSubmit();})()`);
  for(let i=0;i<160&&!await lateEval("document.body.innerText.includes('Nous préparons les informations de votre bien')");i++)await new Promise(r=>setTimeout(r,100));
  const revised=sample+' Jardin à vérifier.';
  await lateEval(`(()=>{const n=document.querySelector('#home-listing-url');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(revised)});n.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await new Promise(r=>setTimeout(r,1300));
  assert.equal(await lateEval("document.querySelector('#home-listing-url').value"),revised);
  assert.equal(await lateEval("Boolean(document.querySelector('.manual-step-header'))"),false);
  assert.equal(await lateEval('window.__workflow.load().descriptionCalls'),1);
  await latePage.close();report.push({staleExtractionIgnored:true,revisedTextPreserved:true});
  const incompletePage=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:998,onBrowserLog:null,onLog:()=>{}}),incompleteCdp=incompletePage._client();
  await incompletePage.setViewport({width:1536,height:980,deviceScaleFactor:1});
  await stubPrivateImages(incompleteCdp);
  await incompleteCdp.send('Page.addScriptToEvaluateOnNewDocument',{source:code('missing-locality',runSeed+'-missing-locality')});
  const incompleteEval=async expression=>{const value=await incompleteCdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
    assert.ok(!value.value.exceptionDetails,JSON.stringify(value.value.exceptionDetails));return value.value.result.value;};
  const incompleteWait=async expression=>{for(let i=0;i<160;i++){if(await incompleteEval('Boolean('+expression+')'))return;
    await new Promise(r=>setTimeout(r,100));}throw Error('INCOMPLETE WAIT '+expression+': '+await incompleteEval('document.body.innerText.slice(0,1200)'));};
  await incompletePage.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
  await incompleteWait("document.querySelector('.home-account')&&document.querySelector('.home-mode-pill')");
  await incompleteEval("(()=>{const n=document.querySelector('#home-listing-url');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,'https://fixtures.bienvu.example/vente');n.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.home-composer').requestSubmit();})()");
  await incompleteWait("document.querySelector('.manual-step-header')?.textContent.includes('2 SUR 5')");
  assert.equal(await incompleteEval("document.querySelectorAll('.manual-photos li').length"),3);
  assert.equal(await incompleteEval('window.__workflow.load().posts'),0);
  await new Promise(r=>setTimeout(r,400));
  await writeFile(path.join(output,'url-missing-locality-1536.png'),Buffer.from((await incompleteCdp.send('Page.captureScreenshot',{format:'png'})).value.data,'base64'));
  await incompletePage.close();report.push({urlMissingLocality:true,retainedPhotos:3,adaptiveStep:2,videoPosts:0});
  const fallbackPage=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:997,onBrowserLog:null,onLog:()=>{}}),fallbackCdp=fallbackPage._client();
  await fallbackPage.setViewport({width:390,height:844,deviceScaleFactor:1});
  await stubPrivateImages(fallbackCdp);
  await fallbackCdp.send('Page.addScriptToEvaluateOnNewDocument',{source:code('guest-failure',runSeed+'-guest-failure')});
  const fallbackEval=async expression=>{const value=await fallbackCdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
    assert.ok(!value.value.exceptionDetails,JSON.stringify(value.value.exceptionDetails));return value.value.result.value;};
  const fallbackWait=async expression=>{for(let i=0;i<160;i++){if(await fallbackEval('Boolean('+expression+')'))return;
    await new Promise(r=>setTimeout(r,100));}throw Error('FALLBACK WAIT '+expression+': '+await fallbackEval('document.body.innerText.slice(0,1200)'));};
  await fallbackPage.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
  await fallbackWait("document.querySelector('.home-guest-account')&&document.querySelector('.home-mode-pill')");
  await new Promise(r=>setTimeout(r,300));
  await fallbackEval("(()=>{const n=document.querySelector('#home-listing-url');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,"+
    JSON.stringify(sample)+");n.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.home-composer').requestSubmit();})()");
  await fallbackWait("document.querySelector('.manual-step-header')?.textContent.includes('1 SUR 5')");
  assert.equal(await fallbackEval("document.querySelector('#manual-description').value"),sample);
  assert.equal(await fallbackEval('window.__workflow.load().posts'),0);
  assert.equal(await fallbackEval("document.body.innerText.includes('Vous pouvez compléter les informations manuellement.')"),true);
  await fallbackPage.close();report.push({guestProviderFailure:true,textPreserved:true,videoPosts:0});
  const guestPage=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:1000,onBrowserLog:null,onLog:()=>{}}),guestCdp=guestPage._client();
  await guestPage.setViewport({width:390,height:844,deviceScaleFactor:1});
  await stubPrivateImages(guestCdp);
  await guestCdp.send('Page.addScriptToEvaluateOnNewDocument',{source:code('guest',runSeed+'-guest-description')});
  const guestEval=async expression=>{const value=await guestCdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
    assert.ok(!value.value.exceptionDetails,JSON.stringify(value.value.exceptionDetails));return value.value.result.value;};
  const guestWait=async expression=>{for(let i=0;i<160;i++){if(await guestEval('Boolean('+expression+')'))return;
    await new Promise(r=>setTimeout(r,100));}throw Error('GUEST WAIT '+expression+': '+await guestEval('document.body.innerText.slice(0,1200)'));};
  await guestPage.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
  await guestWait("document.querySelector('.home-guest-account')&&document.querySelector('.home-mode-pill')&&document.querySelector('#home-listing-url')");
  await new Promise(r=>setTimeout(r,300));
  await guestEval("(()=>{const n=document.querySelector('#home-listing-url');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,"+
    JSON.stringify(sample)+");n.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.home-composer').requestSubmit();})()");
  await guestWait("document.querySelector('.manual-step-header')?.textContent.includes('4 SUR 5')");
  assert.equal(await guestEval('window.__workflow.load().descriptionCalls'),1);
  assert.equal(await guestEval('window.__workflow.load().posts'),0);
  await new Promise(r=>setTimeout(r,400));
  await writeFile(path.join(output,'guest-description-390.png'),Buffer.from((await guestCdp.send('Page.captureScreenshot',{format:'png'})).value.data,'base64'));
  await guestPage.close();report.push({guestDescription:true,turnstileFixture:true,videoPosts:0,adaptiveStep:4});
  }
  if(actionsOnly){
    for(const width of [1536,390])for(const mode of ['auth','guest']){
      const p=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:910,onBrowserLog:null,onLog:()=>{}}),c=p._client();
      await p.setViewport({width,height:width===390?844:980,deviceScaleFactor:1});
      await c.send('Storage.clearDataForOrigin',{origin:new URL(base).origin,storageTypes:'all'});
      await c.send('Page.addScriptToEvaluateOnNewDocument',{source:code(mode,runSeed+'-motion-'+mode+'-'+width)});
      const e=async expression=>{const r=await c.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});assert.ok(!r.value.exceptionDetails,JSON.stringify(r.value.exceptionDetails));return r.value.result.value;};
      const wait=async expression=>{for(let i=0;i<160;i++){if(await e('Boolean('+expression+')'))return;await new Promise(r=>setTimeout(r,100));}throw Error('MOTION WAIT '+expression);};
      await p.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
      await wait(`document.querySelector('${mode==='guest'?'.home-guest-account':'.home-account'}')&&document.querySelector('.home-mode-pill')`);
      await e('document.fonts.ready');await new Promise(r=>setTimeout(r,150));
      const positions=await e(`(async()=>{const dock=document.querySelector('.home-composer-dock'),positions=[dock.getBoundingClientRect().top],started=performance.now();
        document.querySelector('.home-mode-pill').click();
        await new Promise(resolve=>{function frame(){positions.push(dock.getBoundingClientRect().top);if(performance.now()-started>=750)resolve();else requestAnimationFrame(frame);}requestAnimationFrame(frame);});return positions;})()`);
      assert.ok(positions.at(-1)>positions[0]+20,JSON.stringify({width,mode,positions}));
      assert.ok(positions.every((y,index)=>index===0||y>=positions[index-1]-1),JSON.stringify({width,mode,positions}));
      assert.ok(new Set(positions.map(y=>Math.round(y))).size>4,'Animation must have intermediate positions');
      assert.equal(await e('document.documentElement.scrollWidth<=innerWidth+2'),true);
      await writeFile(path.join(output,`motion-${mode}-${width}.png`),Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).value.data,'base64'));
      await c.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      await e("document.querySelector('.home-mode-pill').click()");await wait("!document.querySelector('.manual-step-header')");
      await e("document.querySelector('.home-mode-pill').click()");await wait("document.querySelector('.manual-step-header')");
      assert.equal(await e("document.querySelector('.home-composer-dock').getAnimations().filter(a=>a.playState==='running').length"),0);
      assert.equal(await e('window.__workflow.load().posts'),0);
      await p.close();report.push({animation:true,mode,width,downwardOnly:true,intermediatePositions:new Set(positions.map(y=>Math.round(y))).size,reducedMotion:true,videoPosts:0});
    }
    for(const width of [1536,390])for(const deleteOpen of [true,false]){
      const run=runSeed+'-delete-'+width+'-'+deleteOpen,id='ui-delete-'+run,preserve='ui-preserve-'+run;
      const p=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:911,onBrowserLog:null,onLog:()=>{}}),c=p._client();
      await p.setViewport({width,height:width===390?844:980,deviceScaleFactor:1});
      await c.send('Storage.clearDataForOrigin',{origin:new URL(base).origin,storageTypes:'all'});
      await stubPrivateImages(c);
      await c.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
      await c.send('Page.addScriptToEvaluateOnNewDocument',{source:code('draft-actions',run)});
      const e=async expression=>{const r=await c.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});assert.ok(!r.value.exceptionDetails,JSON.stringify(r.value.exceptionDetails));return r.value.result.value;};
      const wait=async expression=>{for(let i=0;i<160;i++){if(await e('Boolean('+expression+')'))return;await new Promise(r=>setTimeout(r,100));}throw Error('DELETE WAIT '+JSON.stringify({width,deleteOpen,expression})+': '+await e('JSON.stringify({active:document.activeElement?.tagName,activeClass:document.activeElement?.className,body:document.body.innerText.slice(0,1500)})'));};
      await p.goto({url:base+'/?draft='+(deleteOpen?id:preserve),timeout:60000,options:{waitUntil:'load'}});
      await wait("document.querySelector('.manual-step-header')&&document.querySelectorAll('.home-draft-more').length===2");
      await new Promise(r=>setTimeout(r,750));
      // Reproduce an older browser marker whose timestamp differed from IndexedDB.
      if(deleteOpen)await e("sessionStorage.setItem('bienvu:listing-draft',JSON.stringify({kind:'manual',savedAt:Date.now()}))");
      if(width===390){await e("document.querySelector('.home-mobile-header button').click()");
        await wait("getComputedStyle(document.querySelector('.home-sidebar')).visibility==='visible'");
        await e("(async()=>{const sidebar=document.querySelector('.home-sidebar');await Promise.all(sidebar.getAnimations().map(a=>a.finished.catch(()=>{})));})()");}
      await e("document.querySelector('.home-draft-more').click()");
      await wait("document.querySelector('[role=menuitem]')===document.activeElement");
      await writeFile(path.join(output,`draft-menu-${width}.png`),Buffer.from((await c.send('Page.captureScreenshot',{format:'png'})).value.data,'base64'));
      await e("document.querySelector('[role=menuitem]').click()");
      await wait("document.querySelector('.home-draft-dropdown [role=alert]')");
      assert.equal(await e('document.querySelectorAll(".home-draft-more").length'),2);
      assert.equal(await e('Boolean(document.querySelector(".manual-step-header"))'),true);
      await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
      await wait("!document.querySelector('[role=menuitem]')");
      if(width===390&&await e("document.querySelector('.home-mobile-header button').getAttribute('aria-expanded')==='false'"))await e("document.querySelector('.home-mobile-header button').click()");
      await e("document.querySelector('.home-draft-more').click()");
      await e("document.querySelector('[role=menuitem]').click();document.querySelector('[role=menuitem]').click()");
      await wait("document.querySelectorAll('.home-draft-more').length===1&&Boolean(document.querySelector('.manual-step-header'))==="+!deleteOpen);
      assert.equal(await e('window.__workflow.load().deleteAttempts'),2);
      assert.deepEqual(await e('window.__workflow.load().deletes'),[id]);
      assert.equal(await e('window.__workflow.load().imports[0].id'),preserve);
      assert.equal(await e('window.__workflow.load().jobs["fixture-existing"].status'),'ready');
      assert.equal(await e('new URL(location.href).searchParams.get("draft")'),deleteOpen?null:preserve);
      await new Promise(r=>setTimeout(r,500));
      await p.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
      await wait("document.querySelector('.home-account')&&document.querySelectorAll('.home-draft-more').length===1");
      assert.equal(await e('Boolean(document.querySelector(".manual-step-header"))'),!deleteOpen);
      assert.equal(await e('document.documentElement.scrollWidth<=innerWidth+2'),true);
      assert.equal(await e('window.__workflow.load().posts'),0);
      await p.close();report.push({draftDeletion:true,width,retry:true,duplicateClick:true,deletedDraftWasOpen:deleteOpen,
        openDraftHandled:true,reloadPreserved:true,otherDraftAndVideoPreserved:true,videoPosts:0});
    }
  }
  await writeFile(path.join(output,actionsOnly?'draft-actions-report.json':priceOnly?'price-report.json':'report.json'),JSON.stringify({fixture:true,at:new Date().toISOString(),report},null,2));
  console.log(JSON.stringify({passed:true,report}));
}finally{await browser.close({silent:true});}
