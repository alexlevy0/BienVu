import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';

const base = process.env.BIENVU_HOME_URL ?? 'http://localhost:8787';
if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw Error('GUEST_STUDIO_PROBE_LOCAL_ONLY');
const directory = 'evidence/local/guest-studio';
await mkdir(directory, {recursive:true});
const require = createRequire(new URL('../apps/renderer/package.json', import.meta.url));
const {openBrowser} = require('@remotion/renderer');
const browser = await openBrowser('chrome', {logLevel:'error'}), report = [];

function fixtures() {
  const native = window.fetch.bind(window), at = new Date().toISOString();
  const agency = {id:'guest-studio-agency', ownerUserId:'guest-studio-user', name:'Agence de recette', city:'Lyon',
    phone:null, email:'recette@example.com', website:null, primaryColor:'#214F43', secondaryColor:'#F3EFE6', logoAssetId:null, createdAt:at, updatedAt:at, brandVersion:1};
  const profile = () => ({user:{id:'guest-studio-user',name:'Compte de recette',email:'recette@example.com'},
    agency:JSON.parse(sessionStorage.getItem('guest-studio-profile') ?? JSON.stringify(agency)),
    role:'owner', rights:{generationEnabled:true,developmentRemaining:3,trial:'eligible',watermarked:false}});
  const authenticated = () => sessionStorage.getItem('guest-studio-auth') === '1';
  const log = item => {const rows = JSON.parse(sessionStorage.getItem('guest-studio-requests') ?? '[]'); rows.push(item); sessionStorage.setItem('guest-studio-requests', JSON.stringify(rows));};
  const json = (data,status=200) => new Response(JSON.stringify(data), {status,headers:{'Content-Type':'application/json'}});
  const denied = () => json({error:{code:'UNAUTHORIZED',message:'Connexion requise.'}},401);
  window.fetch = async (input, options={}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href), path = url.pathname, method = options.method ?? 'GET';
    if (!path.startsWith('/api/')) return native(input,options);
    log({path,method,query:url.search});
    if (path === '/api/me') return authenticated() ? json(profile()) : denied();
    if (path === '/api/trial/history') return json({jobs:[],nextCursor:null,creditsRemaining:1});
    if (path === '/api/trial') return json({hasIntent:false});
    if (path === '/api/auth/status') return json({google:false,email:true,emailDelivery:true});
    if (path === '/api/auth/sign-in/email') {sessionStorage.setItem('guest-studio-auth','1'); return json({ok:true});}
    if (path === '/api/auth/sign-out') {sessionStorage.removeItem('guest-studio-auth'); return json({ok:true});}
    if (!authenticated()) return denied();
    if (path === '/api/generations') return json({jobs:[],nextCursor:null});
    if (path === '/api/imports') return json({imports:[],nextCursor:null});
    if (path === '/api/social/connections') return json({connections:[],configured:true});
    if (path === '/api/agency' && method === 'PUT') {
      const body = JSON.parse(options.body), current = profile().agency;
      const next = {...current,...body,brandVersion:current.brandVersion+1};
      sessionStorage.setItem('guest-studio-profile',JSON.stringify(next));
      log({savedFields:body}); return json({agency:next});
    }
    if (path === '/api/agency/logo' && method === 'POST') {
      const next = {...profile().agency,logoAssetId:'guest-studio-logo'};
      sessionStorage.setItem('guest-studio-profile',JSON.stringify(next));
      log({logoBytes:options.body.size,logoType:options.headers['Content-Type']}); return json({agency:next},201);
    }
    if (path === '/api/agency/logo/guest-studio-logo') return native('/images/studio-home/paris.webp');
    if (path === '/api/social/publications' && method === 'GET') {
      const start = new Date(url.searchParams.get('from')), when = new Date(start.getFullYear(),start.getMonth(),10,12).toISOString();
      return json({publications:[{id:'private-post-fixture',jobId:'private-video-fixture',title:'Publication privée de recette',caption:'Une légende privée de recette.',
        scheduledAt:when,timezone:'Europe/Paris',createdAt:at,expiresAt:when,aspectRatio:'9:16',durationSeconds:28,videoUrl:'/videos/studio-home/paris.mp4',
        targets:[{id:'private-target-fixture',connectionId:null,platform:'instagram',name:'Agence de recette',status:'published',errorCode:null,permalink:null,publishedAt:at}]}],
        nextCursor:null,alerts:0,configured:true});
    }
    if (path === '/api/generations/private-video-fixture/source-photo') return native('/images/studio-home/paris.webp');
    log({unexpected:path,method}); throw Error('UNEXPECTED_GUEST_STUDIO_API:'+path);
  };
  window.__guestStudioFixture = true;
}

try {
  for (const width of [1536,390,320]) {
    const page = await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:width,onBrowserLog:null,onLog:()=>{}}), cdp = page._client();
    await page.setViewport({width,height:1000,deviceScaleFactor:1});
    await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:'('+fixtures.toString()+')()'});
    const evaluate = async expression => {
      const value = await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
      assert.ok(!value.value.exceptionDetails,JSON.stringify(value.value.exceptionDetails)); return value.value.result.value;
    };
    const wait = async expression => {
      for (let i=0;i<120;i++) {
        try {if (await evaluate(`Boolean(${expression})`)) return;}
        catch (error) {if (!/Inspected target navigated|Execution context was destroyed|Cannot find context/.test(String(error))) throw error;}
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      throw Error('WAIT_FAILED:'+expression);
    };
    const change = (id,value) => evaluate(`(()=>{const input=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const requests = () => evaluate("JSON.parse(sessionStorage.getItem('guest-studio-requests')??'[]')");
    const signIn = async () => {
      await wait("document.querySelector('.auth-form')&&document.querySelector('#auth-email')");
      await change('auth-email','recette@example.com'); await change('auth-password','Fixture passphrase 123!');
      await evaluate("document.querySelector('.auth-form').requestSubmit()");
    };
    await page.goto({url:base+'/agence',timeout:60000,options:{waitUntil:'load'}});
    await wait("document.querySelector('.agency-studio-guest-note')&&document.querySelector('#agency-name')");
    await evaluate('document.fonts.ready');
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
    assert.match(await evaluate("document.querySelector('.agency-studio-actions button').textContent"),/Se connecter/);
    const agencyShot = await cdp.send('Page.captureScreenshot',{format:'png'});
    await writeFile(`${directory}/agency-${width}.png`,Buffer.from(agencyShot.value.data,'base64'));

    if (width === 1536) {
      await change('agency-name','Atelier de recette'); await change('agency-city','Bordeaux'); await change('agency-email','bonjour@atelier.example'); await change('agency-primaryColor','#224466');
      await evaluate("(async()=>{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;canvas.getContext('2d').fillRect(0,0,64,64);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const transfer=new DataTransfer();transfer.items.add(new File([blob],'logo-recette.png',{type:'image/png'}));const input=document.querySelector('.agency-studio-upload input');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()");
      await wait("document.querySelector('.agency-studio-logo img')?.src.startsWith('blob:')");
      assert.equal((await requests()).filter(row=>row.path==='/api/agency'||row.path==='/api/agency/logo').length,0);
      await evaluate("document.querySelector('.agency-studio-form').requestSubmit()");
      await wait("location.pathname==='/connexion'&&new URLSearchParams(location.search).get('next')==='/agence'&&document.querySelector('.auth-form')");
      assert.equal((await requests()).filter(row=>row.path==='/api/agency'||row.path==='/api/agency/logo').length,0);
      await signIn();
      await wait("location.pathname==='/agence'&&document.querySelector('#agency-name')?.value==='Atelier de recette'&&document.querySelector('.home-account')");
      assert.equal(await evaluate("document.querySelector('#agency-city').value"),'Bordeaux');
      assert.equal(await evaluate("document.querySelector('#agency-primaryColor').value"),'#224466');
      await wait("document.querySelector('.agency-studio-logo img')?.src.startsWith('blob:')");
      await evaluate("document.querySelector('.agency-studio-form').requestSubmit()");
      await wait("document.querySelector('.agency-studio-feedback')?.textContent.includes('Votre identité est enregistrée')");
      const rows = await requests();
      assert.equal(rows.filter(row=>row.path==='/api/agency'&&row.method==='PUT').length,1);
      assert.equal(rows.filter(row=>row.path==='/api/agency/logo'&&row.method==='POST').length,1);
      assert.equal(rows.find(row=>row.savedFields)?.savedFields.city,'Bordeaux');
      assert.ok(rows.find(row=>row.logoBytes)?.logoBytes>0);
      assert.equal(rows.find(row=>row.logoType)?.logoType,'image/png');
      assert.equal(await evaluate("new Promise((resolve,reject)=>{const request=indexedDB.open('bienvu-agency-draft',1);request.onsuccess=()=>{const db=request.result,read=db.transaction('drafts').objectStore('drafts').get('guest');read.onsuccess=()=>{resolve(Boolean(read.result));db.close();};read.onerror=()=>reject(read.error);};request.onerror=()=>reject(request.error);})"),false);
      report.push({guestLogoStaysLocal:true,loginRestoresFieldsAndLogo:true,authenticatedSaveWritesOnce:true,draftClearedAfterSave:true});
      await evaluate("sessionStorage.removeItem('guest-studio-auth');sessionStorage.removeItem('guest-studio-requests')");
    }

    await page.goto({url:base+'/publications?post=foreign-private-fixture',timeout:60000,options:{waitUntil:'load'}});
    await wait("document.querySelector('.social-preview-notice')&&document.querySelectorAll('.social-calendar-days>button').length===42&&document.querySelectorAll('.social-publication-card').length===3");
    await evaluate('document.fonts.ready');
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
    assert.equal((await requests()).filter(row=>row.path?.startsWith('/api/social/')).length,0);
    const socialShot = await cdp.send('Page.captureScreenshot',{format:'png'});
    await writeFile(`${directory}/calendar-${width}.png`,Buffer.from(socialShot.value.data,'base64'));
    const currentMonth = await evaluate("document.querySelector('.social-month-navigation h2').textContent");
    await evaluate("document.querySelector('[aria-label=\"Mois suivant\"]').click()");
    await wait(`document.querySelector('.social-month-navigation h2').textContent!==${JSON.stringify(currentMonth)}`);
    await evaluate("[...document.querySelectorAll('.social-filters button')].find(b=>b.textContent==='À venir').click()");
    await wait("document.querySelectorAll('.social-publication-card').length===3");
    await evaluate("document.querySelector('.social-month-navigation .social-text-button').click();document.querySelector('.social-filters button').click()");
    await wait(`document.querySelector('.social-month-navigation h2').textContent===${JSON.stringify(currentMonth)}`);
    await evaluate("[...document.querySelectorAll('.social-calendar-days>button')].find(b=>b.querySelector('small')).click()");
    await wait("document.querySelectorAll('.social-publication-card').length===1&&document.querySelector('.social-day-filter')");
    await evaluate("document.querySelector('.social-day-filter button').click();document.querySelector('.social-publication-thumb').click()");
    await wait("document.querySelector('.social-video-dialog')?.open&&document.querySelector('.social-video-dialog video')?.readyState>=2");
    await evaluate("document.querySelector('.social-dialog-close').click()");
    await wait("!document.querySelector('.social-video-dialog')");
    assert.equal((await requests()).filter(row=>row.path?.startsWith('/api/social/')).length,0);
    report.push({width,guestAgencyFormVisible:true,guestCalendarVisible:true,monthAndDayFiltersWork:true,publicVideoPreviewWorks:true,privateSocialRequestsWhileGuest:0});
    if (width === 1536) {
      await evaluate("document.querySelector('.social-preview-notice a').click()");
      await wait("location.pathname==='/connexion'&&new URLSearchParams(location.search).get('next')==='/publications'");
      await signIn();
      await wait("location.pathname==='/publications'&&document.querySelector('.home-account')&&document.querySelector('.social-publication-card h3')?.textContent==='Publication privée de recette'");
      assert.equal(await evaluate("Boolean(document.querySelector('.social-preview-notice'))"),false);
      assert.ok((await requests()).some(row=>row.path==='/api/social/publications'));
      report.push({calendarLoginReturnsToCalendar:true,authenticatedCalendarReplacesDemo:true});
    }
    assert.equal((await requests()).filter(row=>row.unexpected).length,0);
    await page.close();
  }
  await writeFile(`${directory}/report.json`,JSON.stringify({at:new Date().toISOString(),base,fixtures:true,providerCalls:0,realAgencyWrites:0,realPublications:0,report},null,2));
  console.log(JSON.stringify({passed:true,report}));
} finally {await browser.close({silent:true});}
