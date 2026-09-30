// Local browser fixtures only; no provider, import or generation is contacted.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.BIENVU_PHOTO_DROP_URL??'http://localhost:8790',folder='evidence/local/photo-drop';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('LOCAL_FIXTURES_ONLY');
await mkdir(folder,{recursive:true});
const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url)),{openBrowser}=require('@remotion/renderer');
const browser=await openBrowser('chrome',{logLevel:'error'}),report=[];
function fixture(auth){return `(()=>{
 const native=window.fetch.bind(window),at=new Date().toISOString(),expires=new Date(Date.now()+86400000).toISOString();
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 const empty={title:null,propertyType:null,transaction:null,locality:null,description:null,priceCents:null,charges:null,area:null,rooms:null};
 const draft={id:'drop-fixture',version:1,status:'needs_input',sourceKind:'manual',sourceUrl:null,expiresAt:expires,
   data:{fields:empty,originalText:null,canonicalUrl:null,warnings:[],provenance:{}},photos:[]};
 window.__drop={draft,starts:0,uploads:[],otherWrites:0};
 window.fetch=async(input,options={})=>{const p=new URL(typeof input==='string'?input:input.url,location.href).pathname,method=options.method??'GET';
 if(p==='/api/me')return ${auth}?json({user:{id:'drop-user',name:'Recette',email:'fixture@example.com'},agency:{id:'drop-agency',ownerUserId:'drop-user',name:'Agence de recette',logoAssetId:null,primaryColor:'#E1E8D9',secondaryColor:'#171714',phone:null,email:'fixture@example.com',website:null,city:null,brandVersion:0,createdAt:at,updatedAt:at},rights:{generationEnabled:true,developmentRemaining:0,importRetryAt:null,trial:'eligible',watermarked:true}}):json({},401);
 if(p==='/api/trial'){window.__drop.trialRead=true;return json({enabled:false,siteKey:'',used:false,job:null});}
 if(p==='/api/trial/history')return json({jobs:[],nextCursor:null});
 if(p==='/api/generations'||p==='/api/generations/shares'||p==='/api/imports'||p==='/api/explorer'){
  if(method!=='GET'){window.__drop.otherWrites++;throw Error('NO_GENERATION_IN_FIXTURE');}
  return json({jobs:[],shares:[],imports:[],videos:[],nextCursor:null});}
 if(${auth}&&p==='/api/imports/draft'&&method==='POST'){window.__drop.starts++;return json(draft,201);}
 if(${auth}&&p==='/api/imports/drop-fixture/draft'&&method==='GET')return json(draft);
 if(${auth}&&p.startsWith('/api/imports/drop-fixture/uploads/')&&method==='PUT'){
  const index=Number(p.split('/').at(-1)),id=options.headers['X-Upload-ID'];
  const photo={id,agencyId:'drop-agency',listingId:draft.id,sourceUrl:null,sourceOrder:index,
   objectKey:'agencies/drop-agency/imports/drop-fixture/'+id+'.png',contentHash:(index+1).toString(16).padStart(64,'0'),width:640,height:360,mime:options.body.type,sizeBytes:options.body.size};
  window.__drop.uploads.push({slot:index,name:options.body.name,size:options.body.size});draft.photos.push(photo);return json({photo});}
 if(p.startsWith('/api/')){if(method!=='GET')window.__drop.otherWrites++;return json({},404);}
 return native(input,options);};
 window.__dropFiles=async(names)=>{const transfer=new DataTransfer();for(const name of names){
  const blob=await(await fetch('/images/studio-home/'+name+'.webp')).blob();transfer.items.add(new File([blob],name+'.webp',{type:'image/webp'}));}return transfer;};
 window.__dropEvent=(type,transfer,target=document.querySelector('.home-composer'))=>target.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:transfer}));
 })()`;}
try{
 for(const auth of [false,true])for(const width of [1536,390]){
  const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:width,onBrowserLog:null,onLog:()=>{}}),cdp=page._client();
  await page.setViewport({width,height:width===1536?980:844,deviceScaleFactor:1});
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:fixture(auth)});
  const evaluate=async expression=>{const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});assert.ok(!r.value.exceptionDetails,JSON.stringify(r.value.exceptionDetails));return r.value.result.value;};
  const wait=async expression=>{for(let i=0;i<140;i++){if(await evaluate(`Boolean(${expression})`))return;await new Promise(r=>setTimeout(r,80));}
    await writeFile(`${folder}/failure.json`,JSON.stringify(await evaluate("({text:document.body.innerText,focus:document.activeElement?.id,drop:window.__drop})"),null,2));
    const s=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(`${folder}/failure.png`,Buffer.from(s.value.data,'base64'));
    throw Error('WAIT '+expression);};
  const shot=async name=>{await evaluate('document.fonts.ready');await new Promise(r=>setTimeout(r,250));const s=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(`${folder}/${auth?'auth':'guest'}-${name}-${width}.png`,Buffer.from(s.value.data,'base64'));};
  await page.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
  await evaluate("localStorage.clear();sessionStorage.clear();new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('bienvu-local-drafts');r.onsuccess=resolve;r.onerror=reject;})");
  await page.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
  await wait("document.querySelector('.home-mode-pill')&&!document.querySelector('.home-mode-pill').disabled");
  await wait(auth?"document.querySelector('.home-account')":"window.__drop.trialRead");
  // A text drag leaves the composer unchanged. Nested enter/leave stays stable.
  await evaluate("(()=>{const t=new DataTransfer();t.setData('text/plain','texte');window.__dropEvent('dragenter',t);})()");
  assert.equal(await evaluate("document.querySelector('.home-drop-overlay')!==null"),false);
  await evaluate("(async()=>{window.__transfer=await window.__dropFiles(['paris','sud','lyon']);window.__dropEvent('dragenter',window.__transfer);})()");
  await wait("document.querySelector('.home-drop-overlay')");await shot('hover');
  await evaluate("window.__dropEvent('dragenter',window.__transfer,document.querySelector('#home-listing-url'));window.__dropEvent('dragleave',window.__transfer,document.querySelector('#home-listing-url'))");
  assert.equal(await evaluate("document.querySelector('.home-drop-overlay')!==null"),true);
  await evaluate("window.__dropEvent('drop',window.__transfer)");
  await wait("document.querySelectorAll('.home-composer-attachments li').length===3&&!document.querySelector('.home-photo-status')");
  assert.equal(await evaluate("document.querySelector('.manual-guided-form')!==null"),false);
  assert.deepEqual(await evaluate("({starts:window.__drop.starts,uploads:window.__drop.uploads.length,otherWrites:window.__drop.otherWrites})"),{starts:0,uploads:0,otherWrites:0});
  await evaluate("document.querySelector('.home-composer-attachments button[aria-label=\"Retirer sud.webp\"]').click()");
  await wait("document.querySelectorAll('.home-composer-attachments li').length===2");
  await evaluate("(async()=>window.__dropEvent('drop',await window.__dropFiles(['sud'])))()");
  await wait("document.querySelectorAll('.home-composer-attachments li').length===3&&!document.querySelector('.home-photo-status')");
  await shot('thumbnails');
  // Invalid types, dimensions and count keep the valid selection intact.
  await evaluate("(()=>{const t=new DataTransfer();t.items.add(new File(['texte'],'notice.txt',{type:'text/plain'}));window.__dropEvent('drop',t);})()");
  await wait("document.querySelector('#home-url-error')?.textContent.includes('JPEG')");
  await evaluate("(async()=>{const c=document.createElement('canvas');c.width=20;c.height=20;const b=await new Promise(r=>c.toBlob(r));const t=new DataTransfer();t.items.add(new File([b],'petite.png',{type:'image/png'}));window.__dropEvent('drop',t);})()");
  await wait("document.querySelector('#home-url-error')?.textContent.includes('640')");
  await evaluate("(()=>{const t=new DataTransfer();for(let i=0;i<10;i++)t.items.add(new File(['x'],'count-'+i+'.png',{type:'image/png'}));window.__dropEvent('drop',t);})()");
  await wait("document.querySelector('#home-url-error')?.textContent.includes('12 photos')");
  if(!auth&&width===1536){
    await evaluate("(()=>{const t=new DataTransfer();t.items.add(new File([new Uint8Array(10*1024*1024+1)],'volumineuse.png',{type:'image/png'}));window.__dropEvent('drop',t);})()");
    await wait("document.querySelector('#home-url-error')?.textContent.includes('10 Mo')");
    await evaluate("(()=>{const t=new DataTransfer();const bytes=new Uint8Array(10*1024*1024);for(let i=0;i<5;i++)t.items.add(new File([bytes],'total-'+i+'.png',{type:'image/png'}));window.__dropEvent('drop',t);})()");
    await wait("document.querySelector('#home-url-error')?.textContent.includes('50 Mo')");
  }
  assert.equal(await evaluate("document.querySelectorAll('.home-composer-attachments li').length"),3);
  await evaluate("(()=>{const n=document.querySelector('#home-listing-url');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,'');n.dispatchEvent(new Event('input',{bubbles:true}));n.focus();})()");
  // Real keyboard submit, including an account with zero generation credits.
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await wait("document.querySelectorAll('.manual-photos li').length===3&&!document.querySelector('.home-composer-attachments')");
  if(auth)await wait("window.__drop.uploads.length===3&&[...document.querySelectorAll('.manual-photos li')].every(li=>li.textContent.includes('Disponible'))");
  assert.equal(await evaluate('window.__drop.starts'),auth?1:0);assert.equal(await evaluate('window.__drop.otherWrites'),0);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.manual-photos li>span')].map(i=>i.title)"),['paris.webp','lyon.webp','sud.webp']);
  // Reveal the photo step through the actual guided flow.
  await evaluate("document.querySelector('input[name=propertyType][value=apartment]').click();document.querySelector('input[name=transaction][value=sale]').click()");
  await evaluate("document.querySelector('.manual-step-actions .home-primary-button').click()");
  await wait("document.querySelector('.manual-step-header').textContent.includes('2 SUR 5')");
  await evaluate("(()=>{for(const [id,value]of [['manual-title','Appartement de recette'],['manual-locality','Lyon']]){const n=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,value);n.dispatchEvent(new Event('input',{bubbles:true}));}})()");
  await evaluate("document.querySelector('.manual-step-actions .home-primary-button').click()");
  await wait("document.querySelector('.manual-step-header').textContent.includes('5 SUR 5')");
  await evaluate("[...document.querySelectorAll('.manual-step-nav button')].find(b=>b.textContent.includes('Photos')).click()");
  await wait("document.querySelector('.manual-step-header').textContent.includes('4 SUR 5')");
  if(width===390){await new Promise(r=>setTimeout(r,600));await evaluate("document.querySelector('.manual-photos').scrollIntoView({block:'start'})");}
  await shot('manual-photos');
  const overflow=await evaluate('document.documentElement.scrollWidth>innerWidth+2');assert.equal(overflow,false);
  await evaluate("document.querySelector('.manual-step-actions .text-button').click()");
  await wait("!document.querySelector('.manual-guided-form')");
  await evaluate("document.querySelector('.home-mode-pill').click()");
  await wait("document.querySelectorAll('.manual-photos li').length===3");
  assert.equal(await evaluate('window.__drop.uploads.length'),auth?3:0);
  if(!auth&&width===1536){
    // A full restored draft must not silently discard new staged files.
    await evaluate("(async()=>window.__dropEvent('drop',await window.__dropFiles(Array(9).fill('bordeaux'))))()");
    await wait("document.querySelectorAll('.home-composer-attachments li').length===9&&!document.querySelector('.home-photo-status')");
    await evaluate("document.querySelector('.home-composer').requestSubmit()");
    await wait("document.querySelectorAll('.manual-photos li').length===12&&!document.querySelector('.home-composer-attachments')");
    await evaluate("(async()=>window.__dropEvent('drop',await window.__dropFiles(['sud'])))()");
    await wait("document.querySelectorAll('.home-composer-attachments li').length===1&&!document.querySelector('.home-photo-status')");
    await evaluate("document.querySelector('.home-composer').requestSubmit()");
    await wait("document.querySelector('#home-url-error')?.textContent.includes('12 photos')&&!document.querySelector('.home-mode-pill').disabled");
    assert.equal(await evaluate("document.querySelectorAll('.home-composer-attachments li').length"),1);
    assert.equal(await evaluate("document.querySelectorAll('.manual-photos li').length"),12);
    await evaluate("document.querySelector('.home-composer-attachments button').click()");
  }
  report.push({auth,width,hover:true,nestedDrag:true,thumbnails:true,remove:true,append:true,invalidType:true,invalidDimensions:true,maximum:true,
    fileSizeLimit:!auth&&width===1536,totalBytesLimit:!auth&&width===1536,fullDraftPreservesStaged:!auth&&width===1536,
    enter:true,photoOrder:true,beforeEnterWrites:0,uploads:auth?3:0,restored:true,overflow,providerCalls:0});
  await page.close();
 }
 await writeFile(`${folder}/report.json`,JSON.stringify({passed:true,fixtures:true,report},null,2));console.log(JSON.stringify({passed:true,fixtures:true,report}));
}finally{await browser.close({silent:true});}
