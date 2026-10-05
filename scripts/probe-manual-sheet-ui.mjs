// Loopback UI fixtures: no account, import, generation or provider is created.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const base=process.env.BIENVU_HOME_URL??'http://localhost:8790';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'LOCAL_FIXTURES_ONLY');
const folder='evidence/local/manual-sheet-20261005';await mkdir(folder,{recursive:true});
const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url)),{openBrowser}=require('@remotion/renderer');
const poster=(await readFile('apps/web/public/images/studio-home/paris.webp')).toString('base64');
function fixture(auth){return `(()=>{
 const native=window.fetch.bind(window),at=new Date().toISOString(),signed=${auth}||sessionStorage.getItem('sheet-auth')==='1';
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 const fields={title:null,propertyType:null,transaction:null,locality:null,description:null,priceCents:null,charges:null,area:null,rooms:null};
 const fresh=()=>({starts:0,uploads:[],generations:[],patches:[],completes:0,deletes:[],unexpected:[],draft:{id:'manual-sheet-fixture',version:1,status:'needs_input',sourceKind:'manual',sourceUrl:null,expiresAt:null,
   data:{fields:{...fields},originalText:null,canonicalUrl:null,warnings:[],provenance:{}},photos:[]}});
 const state=JSON.parse(sessionStorage.getItem('sheet-fixture')||JSON.stringify(fresh()));
 const save=()=>sessionStorage.setItem('sheet-fixture',JSON.stringify(state));window.__sheet=state;window.__sheet.signed=signed;
 const job=()=>({id:'manual-sheet-video',status:'queued',stage:'importing',attempt:1,errorCode:null,createdAt:at,updatedAt:at,expiresAt:null,
   title:state.draft.data.fields.title,locality:state.draft.data.fields.locality,sourceKind:'manual',videoUrl:null,downloadUrl:null,syntheticVoice:true,retryAllowed:false,ownership:'owned',masterAccess:'unlocked',retention:'available'});
 window.fetch=async(input,options={})=>{const p=new URL(typeof input==='string'?input:input.url,location.href).pathname,method=options.method??'GET';
   if(p==='/api/properties')return json({properties:[],total:0,nextCursor:null});
  if(p==='/api/me'){window.__sheetMeCalls=(window.__sheetMeCalls??0)+1;return signed?json({user:{id:'sheet-user',name:'Recette',email:'fixture@example.invalid'},agency:{id:'sheet-agency',ownerUserId:'sheet-user',name:'Agence de recette',logoAssetId:null,primaryColor:'#E1E8D9',secondaryColor:'#171714',phone:null,email:'fixture@example.invalid',website:null,city:null,brandVersion:0,createdAt:at,updatedAt:at},rights:{generationEnabled:true,developmentRemaining:20,importRetryAt:null,trial:'eligible',watermarked:false}}):json({},401);}
  if(p==='/api/trial')return json({enabled:false,siteKey:'',used:false,job:null});
  if(p==='/api/trial/history')return json({jobs:[],nextCursor:null});
  if(p==='/api/auth/status')return json({google:false,emailDelivery:false});
  if(p==='/api/generations'&&method==='POST'){state.generations.push(JSON.parse(options.body));save();return json(job(),202);}
  if(p==='/api/generations/manual-sheet-video')return json(job());
  if(p==='/api/generations'||p==='/api/generations/shares'||p==='/api/explorer')return json({jobs:[],shares:[],videos:[],nextCursor:null});
  if(p==='/api/imports'&&method==='GET')return json({imports:[]});
  if(signed&&p==='/api/imports/draft'&&method==='POST'){state.starts++;save();return json(state.draft,201);}
  if(signed&&p==='/api/imports/manual-sheet-fixture/draft'){
    if(method==='PATCH'){const body=JSON.parse(options.body);assertVersion(body.version);state.patches.push(body);Object.assign(state.draft.data.fields,body.changes);
      if(body.videoCustomization)state.draft.data.videoCustomization=body.videoCustomization;state.draft.version++;save();}
    return json(state.draft);
  }
  if(signed&&p.startsWith('/api/imports/manual-sheet-fixture/uploads/')){
    const slot=Number(p.split('/').at(-1));
    if(method==='DELETE'){state.deletes.push(slot);state.draft.photos=state.draft.photos.filter(p=>p.sourceOrder!==slot);save();return json({ok:true});}
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await options.body.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
    const photo={id:'00000000-0000-4000-8000-'+String(slot+1).padStart(12,'0'),agencyId:'sheet-agency',listingId:state.draft.id,sourceUrl:null,sourceOrder:slot,objectKey:'agencies/sheet-agency/imports/manual-sheet-fixture/'+slot+'.webp',contentHash:hash,width:960,height:640,mime:'image/webp',sizeBytes:options.body.size};
    state.uploads.push({slot,name:options.body.name});state.draft.photos.push(photo);save();return json({photo});
  }
  if(signed&&p==='/api/imports/manual-sheet-fixture/complete'){state.completes++;save();return json({id:state.draft.id,status:'ready',sourceKind:'manual',listing:null});}
  if(p.startsWith('/api/')){if(!['GET','HEAD'].includes(method)){state.unexpected.push({p,method});save();throw Error('UNEXPECTED_WRITE');}return json({},404);}
  return native(input,options);
 };
 function assertVersion(version){if(version!==state.draft.version)throw Error('DRAFT_VERSION_MISMATCH');}
 window.__sheetUpload=async names=>{const transfer=new DataTransfer();for(const name of names){const blob=await(await fetch('/images/studio-home/'+name+'.webp')).blob();transfer.items.add(new File([blob],name+'.webp',{type:'image/webp'}));}
   const input=document.querySelector('#manual-photos');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));};
 })()`;}
const browser=await openBrowser('chrome',{logLevel:'error'}),report=[];
try{for(const auth of [true,false])for(const width of [1536,390]){
 console.log(JSON.stringify({auth,width,stage:'start'}));
 const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:width,onBrowserLog:null,onLog:()=>{}}),cdp=page._client(),apiWrites=[],providers=[];
 await page.setViewport({width,height:width===1536?1024:900,deviceScaleFactor:1});
 await cdp.send('Network.enable');cdp.on('Network.requestWillBeSent',({request})=>{const url=new URL(request.url);if(url.pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(request.method))apiWrites.push(url.pathname);if(/(?:openai|runwayml|fish\.audio)\.com$/.test(url.hostname))providers.push(url.hostname);});
 await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:fixture(auth)});
 await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*/api/imports/manual-sheet-fixture/photos/*',requestStage:'Request'}]});
 cdp.on('Fetch.requestPaused',event=>{void cdp.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'image/webp'}],body:poster});});
 const evaluate=async expression=>{const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});assert.ok(!r.value.exceptionDetails,JSON.stringify(r.value.exceptionDetails));return r.value.result.value;};
 const wait=async expression=>{for(let i=0;i<200;i++){if(await evaluate(`Boolean(${expression})`))return;await new Promise(r=>setTimeout(r,100));}
   const shot=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(`${folder}/failure.png`,Buffer.from(shot.value.data,'base64'));await writeFile(`${folder}/failure.json`,JSON.stringify({auth,width,expression,text:await evaluate('document.body.innerText'),fixture:await evaluate('window.__sheet')},null,2));throw Error('WAIT '+expression);};
 const fill=async(name,value)=>evaluate(`(()=>{const e=document.querySelector('#manual-${name}');Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true}));})()`);
 const shot=async name=>{await evaluate('document.fonts.ready');const s=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(`${folder}/${auth?'auth':'guest'}-${width}-${name}.png`,Buffer.from(s.value.data,'base64'));};
 await page.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
 await evaluate("localStorage.clear();sessionStorage.clear();new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('bienvu-local-drafts');r.onsuccess=resolve;r.onerror=reject;})");
 await page.goto({url:base,timeout:60000,options:{waitUntil:'load'}});await wait("window.__sheetMeCalls>0&&document.querySelector('.home-mode-pill')&&!document.querySelector('.home-mode-pill').disabled");
 await evaluate("document.querySelector('.home-mode-pill').click()");await wait("document.querySelector('.manual-sheet-card')&&!document.querySelector('.manual-sheet-card').disabled");
 assert.equal(await evaluate("document.querySelector('.manual-step-nav')"),null);
 assert.equal(await evaluate("document.querySelector('#manual-area').checkVisibility()&&document.querySelector('#manual-locality').checkVisibility()&&document.querySelector('#manual-priceCents').checkVisibility()"),true);
 assert.equal(await evaluate("document.querySelector('.manual-sheet-details').open"),false);
 await fill('locality','Lyon 6e');await fill('area','65');await fill('rooms','3');await fill('priceCents','0');await evaluate("document.querySelector('#manual-priceCents').focus();document.querySelector('#manual-priceCents').blur()");
 await wait("document.querySelector('#manual-priceCents-error')?.textContent.includes('valide')");
 await fill('priceCents','385 000');await wait("document.querySelector('.manual-sheet-poster-copy strong')?.textContent.replace(/\\s/g,'')==='385000€'");
 await evaluate("window.__sheetUpload(['paris','sud','lyon'])");await wait("document.querySelectorAll('.manual-sheet-photo').length===3&&!document.querySelector('.home-manual-toolbar .home-primary-button').disabled");
 await shot('fiche');
 if(width<760){await evaluate("document.querySelector('.manual-sheet-gallery').scrollIntoView({block:'start'})");await shot('photos');await evaluate("document.querySelector('.manual-sheet-preview').scrollIntoView({block:'start'})");await shot('apercu');}
 await evaluate("window.__sheetUpload(['paris'])");await wait("document.querySelector('#manual-photo-feedback')?.textContent.includes('déjà ajoutée')");assert.equal(await evaluate("document.querySelectorAll('.manual-sheet-photo').length"),3);
 await evaluate("window.__sheetUpload(['bordeaux'])");await wait("document.querySelectorAll('.manual-sheet-photo').length===4&&!document.querySelector('.home-manual-toolbar .home-primary-button').disabled");
 await evaluate("window.__drag=new DataTransfer();document.querySelectorAll('.manual-sheet-photo')[2].dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:window.__drag}))");await wait("document.querySelector('.manual-sheet-photo.is-dragging')");
 await evaluate("document.querySelectorAll('.manual-sheet-photo')[0].dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:window.__drag}));document.querySelectorAll('.manual-sheet-photo')[0].dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:window.__drag}))");
 await wait("!document.querySelector('.manual-sheet-photo.is-dragging')");
 await evaluate("document.querySelector('button[aria-label=\"Retirer la photo 4\"]').click()");await wait("document.querySelectorAll('.manual-sheet-photo').length===3&&!document.querySelector('.home-manual-toolbar .home-primary-button').disabled");
 const draggedCover=await evaluate("document.querySelector('.manual-sheet-poster>img').src");
 await evaluate("document.querySelector('button[aria-label=\"Reculer la photo 1\"]').click()");
 await wait(`document.querySelector('.manual-sheet-poster>img').src!==${JSON.stringify(draggedCover)}`);
 await evaluate("document.querySelector('button[aria-label=\"Avancer la photo 2\"]').focus()");
 await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await wait(`document.querySelector('.manual-sheet-poster>img').src===${JSON.stringify(draggedCover)}`);
 await evaluate("document.querySelector('.manual-sheet-details').open=true");await fill('description','Un appartement lumineux avec de beaux volumes et trois pièces.');
 await evaluate("document.querySelector('input[name=transaction][value=rent]').click()");await fill('priceCents','950');await wait("document.querySelector('#manual-charges')");
 assert.equal(await evaluate("document.querySelector('.home-manual-toolbar .home-primary-button').disabled"),true);
 await fill('charges','included');await wait("!document.querySelector('.home-manual-toolbar .home-primary-button').disabled");
 await evaluate("document.querySelector('input[name=transaction][value=sale]').click()");await fill('priceCents','385 000');
 await evaluate("document.querySelector('.manual-sheet-details').open=false;document.querySelector('.home-manual-settings details').open=true");
 await evaluate("(()=>{const e=document.querySelector('[aria-label=\"Format de la vidéo\"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'16:9');e.dispatchEvent(new Event('change',{bubbles:true}));})()");
 await wait("document.querySelector('.manual-sheet-preview.is-horizontal')");
 assert.equal(await evaluate("(()=>{const b=document.querySelector('.manual-sheet-poster').getBoundingClientRect();return Math.abs(b.width/b.height-16/9)<.02;})()"),true);
 await evaluate("(()=>{const e=document.querySelector('[aria-label=\"Durée de la vidéo\"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'40');e.dispatchEvent(new Event('change',{bubbles:true}));})()");
 await wait("document.querySelector('.home-manual-settings-summary').textContent.includes('40 s')");
 await evaluate("document.querySelector('.home-manual-personalize').click()");await wait("document.querySelector('.video-customizer')");
 if(auth){await evaluate("document.querySelector('.customizer-photo-animate').click()");await wait("document.querySelector('.home-manual-toolbar .home-credit-cost').textContent.includes('2 crédits')");}
 else assert.equal(await evaluate("document.querySelector('.customizer-photo-animate').disabled"),true);
 await evaluate("document.querySelector('.customizer-topline button').click()");await wait("document.querySelector('#manual-locality').checkVisibility()");
 const before=await evaluate("({fields:{city:document.querySelector('#manual-locality').value,price:document.querySelector('#manual-priceCents').value,description:document.querySelector('#manual-description').value},cover:document.querySelector('.manual-sheet-poster>img').src,starts:window.__sheet.starts,uploads:window.__sheet.uploads.length})");
 assert.equal(before.fields.city,'Lyon 6e');assert.equal(before.fields.price,'385 000');assert.equal(before.uploads,auth?4:0);assert.equal(before.starts,auth?1:0);
 assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+2'),false);
 await evaluate("document.querySelector('.manual-import-link').click()");await wait("document.querySelector('.home-mode-pill')");await evaluate("document.querySelector('.home-mode-pill').click()");await wait("document.querySelectorAll('.manual-sheet-photo').length===3&&!document.querySelector('.home-manual-toolbar .home-primary-button').disabled");
 assert.equal(await evaluate("document.querySelector('#manual-locality').value"),'Lyon 6e');assert.equal(await evaluate("document.querySelector('#manual-description').value"),before.fields.description);
 if(!auth){assert.equal(await evaluate('window.__sheet.starts'),0);await evaluate("document.querySelector('.home-manual-toolbar .home-primary-button').click()");await wait("location.pathname==='/connexion'");
   assert.equal(await evaluate('window.__sheet.unexpected.length'),0);await evaluate("sessionStorage.setItem('sheet-auth','1');location.assign('/')");await wait("window.__sheet.signed&&document.querySelectorAll('.manual-sheet-photo').length===3&&!document.querySelector('.home-manual-toolbar .home-primary-button').disabled");}
 await evaluate("document.querySelector('.home-manual-toolbar .home-primary-button').click()");await wait('window.__sheet.generations.length===1');
 const end=await evaluate('window.__sheet');assert.equal(end.draft.data.fields.title,'Appartement à vendre — Lyon 6e');assert.equal(end.draft.data.fields.priceCents,38500000);assert.equal(end.draft.data.fields.charges,null);
 assert.deepEqual(end.draft.data.videoCustomization.photoOrder,[2,0,1]);assert.equal(end.generations[0].durationSeconds,40);assert.equal(end.generations[0].aspectRatio,'16:9');assert.equal(end.starts,1);assert.equal(end.completes,1);
 assert.equal(end.uploads.length,auth?4:3);assert.deepEqual(end.unexpected,[]);assert.deepEqual(apiWrites,[]);assert.deepEqual(providers,[]);
 report.push({auth,width,onePage:true,livePreview:true,photoOrder:[2,0,1],duplicateRejected:true,rentCharges:true,settings:true,restored:true,guestHandoff:!auth,apiWrites:0,providerRequests:0});
 console.log(JSON.stringify({auth,width,stage:'passed'}));
 await evaluate("localStorage.clear();sessionStorage.clear();new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('bienvu-local-drafts');r.onsuccess=resolve;r.onerror=reject;})");await page.close();
 }await writeFile(`${folder}/ui-report.json`,JSON.stringify({base,at:new Date().toISOString(),passed:true,report},null,2));console.log(JSON.stringify({passed:true,report}));
}finally{await browser.close({silent:true});}
