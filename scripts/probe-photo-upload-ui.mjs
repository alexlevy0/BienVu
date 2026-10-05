// Browser regression scenarios with fixture APIs only. Complements the separate
// real Cloudflare upload probe; no email, scraper or video generation is called.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
const base=process.env.BIENVU_HOME_URL??'http://localhost:3020',folder='evidence/local/photo-upload-fix/ui';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));await mkdir(folder,{recursive:true});
const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url)),{openBrowser}=require('@remotion/renderer');
const bytes=(await sharp({create:{width:960,height:640,channels:3,background:'#557c6c'}}).png().toBuffer()).toString('base64');
function fixture(scenario){return `(()=>{
  const native=fetch.bind(window),at=new Date().toISOString(),json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  const draft={id:'upload-fixture',version:1,status:'needs_input',sourceKind:'manual',sourceUrl:null,expiresAt:new Date(Date.now()+86400000).toISOString(),
    data:{fields:{title:null,propertyType:null,transaction:null,locality:null,description:null,priceCents:null,charges:null,area:null,rooms:null},provenance:{},originalText:null,canonicalUrl:null,warnings:[]},photos:[]};
  window.__photos={starts:0,puts:0,deletes:0,otherWrites:0,delay:false};
  window.fetch=async(input,options={})=>{const path=new URL(typeof input==='string'?input:input.url,location.href).pathname,method=options.method??'GET',s=window.__photos;
    if(path==='/api/me')return ${scenario==='guest'}?json({},401):json({user:{id:'photos-user',name:'Recette',email:'fixture@example.com'},agency:{id:'photos-agency',ownerUserId:'photos-user',name:'Agence de recette',logoAssetId:null,primaryColor:'#E1E8D9',secondaryColor:'#171714',phone:null,email:'fixture@example.com',website:null,city:null,brandVersion:0,createdAt:at,updatedAt:at},rights:{generationEnabled:true,developmentRemaining:3,trial:'eligible',watermarked:false,importRetryAt:new Date(Date.now()+86400000).toISOString()}});
    if(path==='/api/trial'){s.trialRead=true;return json({enabled:false,siteKey:'',used:false,job:null});}
    if(['/api/imports','/api/generations','/api/generations/shares','/api/explorer','/api/trial/history'].includes(path)&&method==='GET')return json({imports:[],jobs:[],shares:[],videos:[],nextCursor:null});
    if(path==='/api/imports/draft'){s.starts++;return ${scenario==='quota'}?json({error:{code:'IMPORT_LIMIT'}},429):json(draft,201);}
    if(path==='/api/imports/upload-fixture/draft'){
      if(method==='PATCH'){const body=JSON.parse(options.body);draft.version++;if(body.videoCustomization)draft.data.videoCustomization=body.videoCustomization;Object.assign(draft.data.fields,body.changes);}
      return json(draft);}
    if(path.startsWith('/api/imports/upload-fixture/uploads/')){
      const slot=Number(path.split('/').at(-1)),id=options.headers['X-Upload-ID'];
      if(method==='DELETE'){s.deletes++;draft.photos=draft.photos.filter(p=>p.id!==id);return json({ok:true});}
      if(method==='PUT'){s.puts++;const n=s.puts;await new Promise(r=>setTimeout(r,s.delay?700:200));
        if(n===1)return json({error:{code:'INTERNAL_ERROR'}},503);
        const photo={id,agencyId:'photos-agency',listingId:draft.id,sourceUrl:null,sourceOrder:slot,objectKey:'agencies/photos-agency/imports/'+draft.id+'/'+id+'.jpg',contentHash:String(slot+1).padStart(64,'0'),width:960,height:640,mime:'image/jpeg',sizeBytes:5000};
        draft.photos.push(photo);return json({photo});}
    }
    if(path.startsWith('/api/')){if(method!=='GET')s.otherWrites++;return json({},404);}return native(input,options);
  };
  window.__upload=selector=>{const t=new DataTransfer(),data=Uint8Array.from(atob('${bytes}'),c=>c.charCodeAt(0));t.items.add(new File([data],'recette.png',{type:'image/png'}));const n=document.querySelector(selector);n.files=t.files;n.dispatchEvent(new Event('change',{bubbles:true}));};
})()`;}
const browser=await openBrowser('chrome',{logLevel:'error'}),report=[];
try{for(const width of [1536,390])for(const scenario of ['quota','manual','customizer','guest']){
  const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}}),cdp=page._client();
  await page.setViewport({width,height:width===1536?980:844,deviceScaleFactor:1});
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:fixture(scenario)});
  const evaluate=async expression=>{const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});assert.ok(!r.value.exceptionDetails,JSON.stringify(r.value.exceptionDetails));return r.value.result.value;};
  const shot=async name=>{await evaluate('document.fonts.ready');const s=await cdp.send('Page.captureScreenshot',{format:'png'});await writeFile(`${folder}/${scenario}-${width}-${name}.png`,Buffer.from(s.value.data,'base64'));};
  const wait=async expression=>{for(let i=0;i<150;i++){if(await evaluate(`Boolean(${expression})`))return;await new Promise(r=>setTimeout(r,100));}await shot('failure');await writeFile(`${folder}/failure.json`,JSON.stringify(await evaluate('({text:document.body.innerText,requests:window.__photos})'),null,2));throw Error('UI_WAIT '+expression);};
  await page.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
  await evaluate("localStorage.clear();sessionStorage.clear();new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('bienvu-local-drafts');r.onsuccess=resolve;r.onerror=reject;})");
  await page.goto({url:base,timeout:60000,options:{waitUntil:'load'}});
  await wait("document.querySelector('.home-mode-pill')&&!document.querySelector('.home-mode-pill').disabled");
  await wait(scenario==='guest'?"window.__photos.trialRead":"document.querySelector('.home-account')");
  const custom=scenario==='customizer'||scenario==='guest';
  await evaluate(`document.querySelector('${custom?'.home-customize-button':'.home-mode-pill'}').click()`);
  await wait(custom?"document.querySelector('.customizer-add')&&!document.querySelector('.customizer-add').disabled":"document.querySelector('#manual-photos')&&!document.querySelector('#manual-photos').disabled");
  await evaluate(`window.__upload('${custom?'.video-customizer input[type=file]':'#manual-photos'}')`);
  const card=custom?'.customizer-photo':'.manual-sheet-photo';
  await wait(`document.querySelector('${card}')`);
  if(scenario==='guest'){
    assert.equal(await evaluate('window.__photos.puts'),0);
    await evaluate(`document.querySelector('${card} button[aria-label^="Retirer"]').click()`);await wait(`!document.querySelector('${card}')`);
  }else{
    await wait(`document.querySelector('${card} [role=alert]')`);
    if(!custom&&scenario==='manual'){
      await evaluate("document.querySelector('.manual-sheet-details summary').click()");
      await evaluate("(()=>{for(const [id,value]of [['manual-title','Appartement de recette'],['manual-locality','Lyon']]){const n=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,value);n.dispatchEvent(new Event('input',{bubbles:true}));}})()");
      assert.ok(await evaluate("document.querySelector('#manual-description').checkVisibility()"));
    }
    await evaluate(`document.querySelector('${card}').scrollIntoView({block:'center'})`);await shot('error');
    if(scenario==='quota'){
      assert.ok((await evaluate(`document.querySelector('${card} [role=alert]').textContent`)).includes('budget'));
      const before=await evaluate('window.__photos.starts');
      await evaluate(`document.querySelector('${card} button[aria-label^="Retirer"]').click()`);await wait(`!document.querySelector('${card}')`);
      assert.equal(await evaluate('window.__photos.starts'),before,'Retirer ne crée pas de nouveau brouillon');
    }else{
      await evaluate(`(()=>{const b=[...document.querySelectorAll('${card} button')].find(b=>b.textContent==='Réessayer');b.click();b.click();})()`);
      await wait(custom?"!document.querySelector('.customizer-photo-state')":"document.querySelector('.manual-sheet-photo')&&!document.querySelector('.manual-sheet-photo-status')&&!document.querySelector('.manual-sheet-photo.has-error')");
      assert.equal(await evaluate('window.__photos.puts'),2,'Double clic : un seul réessai');await shot('ready');
      await evaluate(`document.querySelector('${card} button[aria-label^="Retirer"]').click()`);await wait(`!document.querySelector('${card}')`);
      // Remove during an upload: the late completion must not restore the card.
      await evaluate(`window.__photos.delay=true;window.__upload('${custom?'.video-customizer input[type=file]':'#manual-photos'}')`);
      await wait('window.__photos.puts===3');
      await evaluate(`document.querySelector('${card} button[aria-label^="Retirer"]').click()`);await wait(`!document.querySelector('${card}')`);
      await new Promise(r=>setTimeout(r,1000));assert.equal(await evaluate(`document.querySelector('${card}')!==null`),false);
    }
  }
  assert.equal(await evaluate('window.__photos.otherWrites'),0);assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+2'),false);
  report.push({scenario,width,passed:true,requests:await evaluate('window.__photos'),providerCalls:0});await page.close();
}await writeFile(`${folder}/report.json`,JSON.stringify({passed:true,fixtures:true,report},null,2));console.log(JSON.stringify({passed:true,fixtures:true,report}));
}finally{await browser.close({silent:true});}
