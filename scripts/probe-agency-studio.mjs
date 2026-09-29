import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';

const base = process.env.BIENVU_HOME_URL ?? 'http://localhost:8787';
const remote = !['localhost', '127.0.0.1'].includes(new URL(base).hostname);
if (remote && !process.argv.includes('--remote-fixtures')) throw Error('REMOTE_FIXTURES_REQUIRE_EXPLICIT_FLAG');
const directory = remote ? 'evidence/remote/agency-studio' : 'evidence/local/agency-studio';
await mkdir(directory, {recursive: true});
const require = createRequire(new URL('../apps/renderer/package.json', import.meta.url));
const {openBrowser} = require('@remotion/renderer');
const browser = await openBrowser('chrome', {logLevel: 'error'});
const now = '2026-09-29T10:00:00.000Z';
const agency = {id: 'agency-studio-fixture', ownerUserId: 'user-studio-fixture', name: 'Atelier Immobilier',
  logoAssetId: null, primaryColor: '#E1E8D9', secondaryColor: '#171714', phone: null,
  email: 'bonjour@atelier.example', website: 'https://atelier.example', city: 'Lyon',
  createdAt: now, updatedAt: now, brandVersion: 1};
const account = {user: {id: 'user-studio-fixture', name: 'Alex Recette', email: 'alex@example.com'},
  agency, rights: {generationEnabled: true, developmentRemaining: 1, importRetryAt: null, trial: 'eligible', watermarked: true}};
const fixtureScript = `(()=>{const native=window.fetch.bind(window);window.__agencySaves=[];let profile=${JSON.stringify(account)};
  window.fetch=async(input,options={})=>{const path=new URL(typeof input==='string'?input:input.url,location.href).pathname;
    const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
    if(path==='/api/me')return json(profile);
    if(path==='/api/generations')return json({jobs:[],nextCursor:null});
    if(path==='/api/agency'&&options.method==='PUT'){const body=JSON.parse(options.body);window.__agencySaves.push(body);
      profile={...profile,agency:{...profile.agency,...body,brandVersion:profile.agency.brandVersion+1}};return json({agency:profile.agency});}
    if(path.startsWith('/api/'))throw Error('UNEXPECTED_AGENCY_FIXTURE_API:'+path);
    return native(input,options);
  };
})();`;
const report = [];
try {
  for (const width of [1536, 390, 320]) {
    const page = await browser.newPage({context: () => null, logLevel: 'error', indent: false,
      pageIndex: width, onBrowserLog: null, onLog: () => {}});
    const cdp = page._client();
    await page.setViewport({width, height: width === 1536 ? 1024 : 900, deviceScaleFactor: 1});
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {source: fixtureScript});
    const evaluate = async expression => {const result = await cdp.send('Runtime.evaluate',
      {expression, returnByValue: true, awaitPromise: true, userGesture: true});
      assert.ok(!result.value.exceptionDetails, JSON.stringify(result.value.exceptionDetails));
      return result.value.result.value;};
    const wait = async expression => evaluate(`(async()=>{for(let i=0;i<120;i++){if(${expression})return true;
      await new Promise(r=>setTimeout(r,100));}throw Error('WAIT_FAILED: '+${JSON.stringify(expression)});})()`);
    await page.goto({url: `${base}/agence`, timeout: 60000, options: {waitUntil: 'load'}});
    await wait("document.querySelector('.agency-studio-preview-card')&&document.querySelector('.home-account')");
    await evaluate("document.fonts.ready");
    await evaluate("(async()=>{await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));})()");
    const layout = await evaluate("({overflow:document.documentElement.scrollWidth>innerWidth,heading:document.querySelector('h1')?.textContent,city:document.querySelector('#agency-city')?.value,active:document.querySelector('.home-nav-active')?.getAttribute('aria-current')})");
    assert.equal(layout.overflow, false); assert.equal(layout.heading, 'Mon agence');
    assert.equal(layout.city, 'Lyon'); assert.equal(layout.active, 'page');
    const shot = await cdp.send('Page.captureScreenshot', {format: 'png'});
    await writeFile(`${directory}/agency-${width}.png`, Buffer.from(shot.value.data, 'base64'));
    if (width === 1536) {
      await evaluate("(()=>{const i=document.querySelector('#agency-city');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'Bordeaux');i.dispatchEvent(new Event('input',{bubbles:true}));})()");
      await wait("document.querySelector('.agency-studio-preview-copy')?.textContent.includes('Bordeaux')");
      await evaluate("document.querySelector('.agency-studio-form').requestSubmit()");
      await wait("document.querySelector('.agency-studio-feedback')?.textContent.includes('enregistrée')");
      const saved = await evaluate('window.__agencySaves');
      assert.equal(saved.length, 1); assert.equal(saved[0].city, 'Bordeaux');
      await evaluate("document.querySelector('.agency-studio-preview-media').click()");
      await wait("document.querySelector('.agency-studio-dialog')?.open&&document.querySelector('.agency-studio-dialog video')?.readyState>=2");
      assert.equal(Math.round(await evaluate("document.querySelector('.agency-studio-dialog video').duration")), 28);
      await evaluate("document.querySelector('.agency-studio-dialog-close').click()");
      await wait("!document.querySelector('.agency-studio-dialog')");
      report.push({fixtureSave: true, cityPersistedInFixtureResponse: true, demoPlaybackSeconds: 28, providerCalls: 0});
    }
    report.push({width, ...layout});
  }
  await writeFile(`${directory}/report.json`, JSON.stringify({at: new Date().toISOString(), base, fixtures: true, remote,
    realAgencyWrite: false, physicalDevice: false, report}, null, 2));
  console.log(JSON.stringify({passed: true, base, widths: [1536, 390, 320], report}));
} finally {await browser.close({silent: true});}
