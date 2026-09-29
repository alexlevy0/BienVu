import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';

const base = process.env.BIENVU_HOME_URL ?? 'http://localhost:8787';
const fixtures = process.argv.includes('--fixtures');
if (fixtures && !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('FIXTURES_LOCAL_ONLY');
const directory = fixtures ? 'evidence/local/manual-guest' : 'evidence/remote/manual-guest';
await mkdir(directory, {recursive: true});
const require = createRequire(new URL('../apps/renderer/package.json', import.meta.url));
const {openBrowser} = require('@remotion/renderer');
const browser = await openBrowser('chrome', {logLevel: 'error'});
const at = '2026-09-29T10:00:00.000Z';
const account = {user: {id: 'user-manual-guest-fixture', name: 'Alex Recette', email: 'recette@example.com'},
  agency: {id: 'agency-manual-guest-fixture', ownerUserId: 'user-manual-guest-fixture', name: 'Agence de recette', logoAssetId: null,
    primaryColor: '#214F43', secondaryColor: '#F3EFE6', phone: null, email: 'recette@example.com', website: null, city: null,
    createdAt: at, updatedAt: at, brandVersion: 0},
  rights: {generationEnabled: false, developmentRemaining: 0, importRetryAt: null, trial: 'eligible', watermarked: true}};
const fixtureScript = `(()=>{const native=window.fetch.bind(window);window.__guestImports=[];window.__guestUploads=[];window.fetch=(input,options={})=>{const path=new URL(typeof input==='string'?input:input.url,location.href).pathname;const json=(value,status=200)=>Promise.resolve(new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}}));const signed=sessionStorage.getItem('manual-guest-auth-fixture')==='1';if(path==='/api/me')return signed?json(${JSON.stringify(account)}):json({},401);if(path==='/api/auth/status')return json({google:true,emailDelivery:true});if(path==='/api/auth/sign-in/email'){sessionStorage.setItem('manual-guest-auth-fixture','1');return json({ok:true});}if(path==='/api/generations')return json({jobs:[]});if(path.startsWith('/api/imports')){if(!signed){window.__guestImports.push(path);throw Error('ANONYMOUS_IMPORT_BLOCKED');}if(path==='/api/imports/manual'){window.__guestImports.push(JSON.parse(options.body));return json({id:'manual-guest-fixture',status:'importing'});}if(path.includes('/uploads/')){window.__guestUploads.push({path,size:options.body.size,type:options.body.type});return json({id:'manual-guest-fixture',status:'importing'});}if(path.endsWith('/complete'))return json({id:'manual-guest-fixture',status:'ready'});}return native(input,options);};})();`;
const remoteGuard = `(()=>{const native=window.fetch.bind(window);window.__guestImports=[];window.fetch=(input,options={})=>{const path=new URL(typeof input==='string'?input:input.url,location.href).pathname;if(path.startsWith('/api/imports')&&options.method&&options.method!=='GET'){window.__guestImports.push(path);throw Error('ANONYMOUS_IMPORT_BLOCKED');}return native(input,options);};})();`;
const reports = [];

try {
  for (const width of process.env.BIENVU_PROBE_WIDTH ? [Number(process.env.BIENVU_PROBE_WIDTH)] : [1536, 390]) {
    const page = await browser.newPage({context: () => null, logLevel: 'error', indent: false, pageIndex: width, onBrowserLog: null, onLog: () => {}});
    const cdp = page._client();
    await page.setViewport({width, height: width === 1536 ? 1024 : 900, deviceScaleFactor: 1});
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {source: fixtures ? fixtureScript : remoteGuard});
    const evaluate = async expression => {
      const response = await cdp.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true, userGesture: true});
      assert.ok(!response.value.exceptionDetails, JSON.stringify(response.value.exceptionDetails));
      return response.value.result.value;
    };
    const wait = async expression => evaluate(`(async()=>{for(let i=0;i<180;i++){if(${expression})return true;await new Promise(r=>setTimeout(r,100));}throw Error('WAIT_FAILED: '+${JSON.stringify(expression)});})()`);
    const shot = async name => {
      await evaluate('document.fonts.ready');
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const response = await cdp.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
      await writeFile(`${directory}/${name}.png`, Buffer.from(response.value.data, 'base64'));
    };
    await page.goto({url: base, timeout: 60000, options: {waitUntil: 'load'}});
    await wait("document.querySelector('.home-manual-toggle')&&document.querySelector('.home-guest-account')&&document.querySelector('.home-recents-empty')?.textContent.includes('Connectez-vous')");
    await new Promise(resolve => setTimeout(resolve, 1500));
    assert.equal(await evaluate("document.body.textContent.includes('Sans carte bancaire · Essai avec filigrane à l’ouverture')"), false);
    const centered = await evaluate(`(()=>{const button=document.querySelector('.home-manual-toggle').getBoundingClientRect(),hero=document.querySelector('.home-hero').getBoundingClientRect();return Math.abs(button.x+button.width/2-(hero.x+hero.width/2))<2})()`);
    assert.equal(centered, true);
    await shot(`guest-home-${width}`);
    assert.equal(await evaluate("document.querySelector('.home-manual-toggle').getAttribute('aria-expanded')"), 'false');
    await evaluate("document.querySelector('.home-manual-toggle').click()");
    await wait("document.querySelector('#home-manual-panel .manual-listing-form')&&!document.querySelector('#home-manual-panel').hidden");
    await evaluate(`(async()=>{const set=(name,value)=>{const node=document.querySelector('[name='+name+']');if(node instanceof HTMLTextAreaElement)Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(node,value);else node.value=value;node.dispatchEvent(new Event(node instanceof HTMLSelectElement?'change':'input',{bubbles:true}));};set('title','Appartement lumineux de recette');set('propertyType','apartment');set('transaction','rent');await new Promise(r=>setTimeout(r,50));set('locality','Lyon 6e');set('priceCents','1200');set('charges','included');set('area','65');set('rooms','3');const files=new DataTransfer();for(const color of ['#a17c5b','#5a8b76','#567391']){const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,640,360);ctx.fillStyle='#ffffff';ctx.font='40px sans-serif';ctx.fillText(color,80,180);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));files.items.add(new File([blob],color.slice(1)+'.png',{type:'image/png'}));}const input=document.querySelector('#manual-photos');input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await wait("document.querySelectorAll('.manual-photos li').length===3");
    await evaluate("document.querySelector('#manual-description').focus()");
    await cdp.send('Input.insertText', {text: 'Un salon traversant et une terrasse calme pour cette annonce de recette.'});
    const before = await evaluate(`({title:document.querySelector('#manual-title').value,description:document.querySelector('#manual-description').value,photos:document.querySelectorAll('.manual-photos li').length,guestNote:document.querySelector('.home-guest-manual-note')?.textContent,overflow:document.documentElement.scrollWidth>innerWidth,imports:window.__guestImports.length})`);
    assert.equal(before.title, 'Appartement lumineux de recette'); assert.equal(before.photos, 3);
    assert.match(before.guestNote, /sans compte/); assert.equal(before.overflow, false); assert.equal(before.imports, 0);
    await evaluate("document.querySelector('#home-manual-panel').scrollIntoView()"); await shot(`guest-form-${width}`);
    await evaluate("document.querySelector('.manual-listing-form button[type=submit]').scrollIntoView()"); await shot(`guest-action-${width}`);
    await evaluate("document.querySelector('.manual-listing-form').requestSubmit()");
    let handoff;
    for (let i = 0; i < 150; i++) {
      try {handoff = await evaluate(`({path:location.pathname,search:location.search,session:sessionStorage.getItem('bienvu:listing-draft'),local:localStorage.getItem('bienvu:manual-draft'),imports:window.__guestImports.length})`); if (handoff.path === '/connexion') break;} catch { /* Navigation remplace le contexte JavaScript. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(handoff?.path, '/connexion'); assert.equal(handoff.search, '?mode=signup');
    assert.equal(JSON.parse(handoff.session).kind, 'manual'); assert.equal(JSON.parse(handoff.local).kind, 'manual');
    assert.equal(handoff.imports, 0);
    await wait("document.querySelector('.auth-box h2')?.textContent==='Créons votre compte.'");
    await shot(`guest-handoff-${width}`);

    if (fixtures && width === 1536) {
      await evaluate("[...document.querySelectorAll('.auth-actions button')].find(button=>button.textContent.includes('Revenir')).click()");
      await wait("document.querySelector('.auth-box h2')?.textContent==='Heureux de vous retrouver.'");
      await evaluate(`(()=>{for(const [id,value] of [['auth-email','recette@example.com'],['auth-password','mot-de-passe-fixture']]){const node=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('.auth-form').requestSubmit();})()`);
      for (let i = 0; i < 150; i++) {
        try {if (await evaluate("location.pathname==='/'&&document.querySelectorAll('.manual-photos li').length===3")) break;} catch { /* Navigation. */ }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const restored = await evaluate(`({path:location.pathname,title:document.querySelector('#manual-title')?.value,transaction:document.querySelector('#manual-transaction')?.value,charges:document.querySelector('#manual-charges')?.value,description:document.querySelector('#manual-description')?.value,photos:document.querySelectorAll('.manual-photos li').length,imports:window.__guestImports.length})`);
      assert.equal(restored.path, '/'); assert.equal(restored.title, before.title); assert.equal(restored.transaction, 'rent');
      assert.equal(restored.charges, 'included'); assert.match(restored.description, /salon traversant/, JSON.stringify({before, restored}));
      assert.equal(restored.photos, 3); assert.equal(restored.imports, 0);
      await evaluate("document.querySelector('#home-manual-panel').scrollIntoView()"); await shot('restored-after-signin');
      await evaluate("document.querySelector('.manual-listing-form').requestSubmit()");
      await wait("window.__guestUploads.length===3&&document.querySelector('.home-form-feedback')?.textContent.includes('enregistrée')");
      const saved = await evaluate(`({imports:window.__guestImports,uploads:window.__guestUploads,session:sessionStorage.getItem('bienvu:listing-draft'),local:localStorage.getItem('bienvu:manual-draft')})`);
      assert.equal(saved.imports.length, 1); assert.equal(saved.imports[0].title, before.title);
      assert.equal(saved.imports[0].photos.length, 3); assert.equal(saved.uploads.length, 3);
      assert.ok(saved.uploads.every(upload => upload.size > 0 && upload.type === 'image/png'));
      assert.equal(saved.session, null); assert.equal(saved.local, null);
      reports.push({width, fixtures, before, handoff: {path: handoff.path, search: handoff.search}, restored, importAfterAuth: true, uploads: 3, providerCalls: 0});
    } else reports.push({width, fixtures, before, handoff: {path: handoff.path, search: handoff.search}, providerCalls: 0});
    if (!fixtures) await evaluate("sessionStorage.removeItem('bienvu:listing-draft');localStorage.removeItem('bienvu:manual-draft');indexedDB.deleteDatabase('bienvu-local-drafts');");
  }
  await writeFile(`${directory}/browser-report.json`, JSON.stringify({at: new Date().toISOString(), base, fixtures, physicalDevice: false, reports}, null, 2));
  console.log(JSON.stringify({passed: true, base, fixtures, widths: reports.map(report => report.width), anonymousImportPosts: 0, fixtureResumeAndUpload: fixtures}));
} finally {await browser.close({silent: true});}
