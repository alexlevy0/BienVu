// Isolated UI recipe: real React component, local HTTP fixtures, no provider,
// customer session or production database. API authorization is tested separately.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {defaultPricingSimulation, pricingSimulationSources, creditPacks, creditPlans, PricingSimulationInput} from '../packages/contracts/src/index.ts';
const root = new URL('../', import.meta.url), output = new URL('../evidence/local/pricing/', import.meta.url);
await mkdir(output, {recursive: true});
const require = createRequire(import.meta.url), esbuild = createRequire(require.resolve('tsx/package.json'))('esbuild');
const {openBrowser} = createRequire(new URL('../apps/renderer/package.json', import.meta.url))('@remotion/renderer');
const build = await esbuild.build({stdin: {contents: `import React from 'react';import{createRoot}from'react-dom/client';import{AdminPricingSimulator}from'./components/admin-pricing-simulator';createRoot(document.getElementById('root')).render(<AdminPricingSimulator accountId="pricing-local-fixture"/>);`,
  resolveDir: new URL('../apps/web/', import.meta.url).pathname, loader: 'tsx'}, bundle: true, write: false,
  platform: 'browser', format: 'iife', jsx: 'automatic', minify: true, define: {'process.env.NODE_ENV': '"production"'}});
const css = (await Promise.all(['apps/web/app/admin/admin.css', 'apps/web/app/admin/pricing.css'].map(path => readFile(new URL(path, root), 'utf8')))).join('\n');
const defaults = defaultPricingSimulation(), scenarios = new Map(), actions = [];
const observation = (query = new URLSearchParams()) => ({at: new Date().toISOString(), days: Number(query.get('days') ?? 30), mode: query.get('mode') ?? 'all',
  activity: {jobs: 10, ready: 8, failed: 2, consumedCredits: 20, requestedAnimations: 12, reusedAnimations: 3},
  render: {reports: 8, averageSeconds: 123, averageOutputMB: 12}, unusedPackCredits: 47,
  providers: [
    {provider: 'openai', realCalls: 11, measuredCalls: 10, completeJobs: 7, estimatedTotalUsd: 0.02, estimatedAverageJobUsd: 0.002, reconciledJobs: 1, reconciledAverageJobEur: 0.003, reconciledTotalEur: 0.003},
    {provider: 'cartesia', realCalls: 30, measuredCalls: 0, completeJobs: 0, estimatedTotalUsd: null, estimatedAverageJobUsd: null, reconciledJobs: 0, reconciledAverageJobEur: null, reconciledTotalEur: null},
  ], sales: [{kind: 'topup', transactions: 3, credits: 30, revenueHtEur: 21, feeEur: 1.128, missingFees: 0}],
});
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const json = (value, status = 200) => {res.writeHead(status, {'content-type': 'application/json', 'cache-control': 'no-store'}); res.end(JSON.stringify(value));};
  if (url.pathname === '/api/admin/pricing') {
    if (req.method === 'GET') return json({defaults, scenarios: [...scenarios.values()], observations: observation(url.searchParams), sources: pricingSimulationSources, catalog: {packs: creditPacks, subscriptions: creditPlans}});
    let raw = ''; for await (const chunk of req) raw += chunk;
    const value = JSON.parse(raw); actions.push(value);
    await new Promise(resolve => setTimeout(resolve, 350));
    if (value.action === 'save') {
      const prior = scenarios.get(value.id);
      if (value.id && (!prior || prior.revision !== value.revision)) return json({}, 409);
      const at = new Date().toISOString(), scenario = {id: value.id ?? crypto.randomUUID(), revision: (prior?.revision ?? 0) + 1,
        input: PricingSimulationInput.parse(value.input), createdAt: prior?.createdAt ?? at, updatedAt: at};
      scenarios.set(scenario.id, scenario); return json({scenario});
    }
    if (value.action === 'delete') {scenarios.delete(value.id); return json({deleted: value.id});}
    return json({}, 422);
  }
  if (url.pathname === '/bundle.js') {res.writeHead(200, {'content-type': 'application/javascript'}); return res.end(build.outputFiles[0].contents);}
  if (url.pathname === '/style.css') {res.writeHead(200, {'content-type': 'text/css'}); return res.end(css);}
  res.writeHead(200, {'content-type': 'text/html'});
  res.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>*{box-sizing:border-box}body{margin:0;background:#faf9f5;font:14px Arial,sans-serif}.admin-shell{margin:0 28px;padding-top:10px}@media(min-width:1000px){.admin-shell{margin-left:260px}}@media(max-width:600px){.admin-shell{margin:0 16px}}#root{min-width:0}</style><main class="admin-shell"><h1>Super admin · Simulateur de prix</h1><div id="root"></div></main><script src="/bundle.js"></script></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port, browser = await openBrowser('chrome', {logLevel: 'error'}), results = [];
try {
  for (const width of [1536, 390]) {
    scenarios.clear(); actions.length = 0;
    const page = await browser.newPage({context: () => null, logLevel: 'error', indent: false, pageIndex: width, onBrowserLog: null, onLog: () => {}}), cdp = page._client(), exceptions = [];
    cdp.on('Runtime.exceptionThrown', event => exceptions.push(event));
    await page.setViewport({width, height: width === 390 ? 844 : 1080, deviceScaleFactor: 1});
    const e = async expression => {const result = await cdp.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true, userGesture: true});
      assert.ok(!result.value.exceptionDetails, JSON.stringify(result.value.exceptionDetails)); return result.value.result.value;};
    const wait = async expression => {const start = Date.now(); while (!await e(expression)) {assert.ok(Date.now() - start < 12000, expression); await new Promise(r => setTimeout(r, 40));}};
    const click = label => e(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!button)throw Error('Missing button');button.click();})()`);
    const set = (selector, value, tag = 'HTMLInputElement', event = 'input') => e(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${tag}.prototype,'value').set.call(node,${JSON.stringify(String(value))});node.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`);
    const namedField = async (label, value) => e(`(()=>{const label=[...document.querySelectorAll('.pricing-field')].find(l=>l.querySelector('span')?.textContent===${JSON.stringify(label)});const node=label.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,${JSON.stringify(String(value))});node.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const shot = async (name, selector) => {await e(selector ? `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start'})` : 'scrollTo(0,0)'); const r = await cdp.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
      await writeFile(new URL(`${name}-${width}.png`, output), Buffer.from(r.value.data, 'base64'));};
    await page.goto({url: base, timeout: 30000, options: {waitUntil: 'load'}}); await wait('document.querySelectorAll(".pricing-metrics strong").length===4');
    await e('localStorage.clear()'); await click('Repartir du catalogue actuel');
    const tabs = ['Packs & abonnements', 'Profils d’usage', 'Coûts de production', 'Volume & frais', 'Prévisions & sensibilité', 'Données observées'];
    for (const tab of tabs) {
      await click(tab); await wait(`document.querySelector('.pricing-tabs [aria-pressed=true]')?.textContent===${JSON.stringify(tab)}`);
      assert.equal(await e('document.documentElement.scrollWidth<=innerWidth+1'), true, tab + ' débordement global ' + width);
      await shot(tab === tabs[0] ? 'offers' : tab === tabs[4] ? 'forecast' : tab === tabs[5] ? 'observations' : 'tab-' + tabs.indexOf(tab));
      await shot('content-' + tabs.indexOf(tab), tab === tabs[4] ? '.pricing-chart' : '.pricing-card');
    }
    await click('Profils d’usage'); await set('.pricing-profile input[type=number]', 50); await wait('document.querySelector(".pricing-validation")!==null');
    assert.equal(await e(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Exporter CSV').disabled`), true);
    await click('Usage courant'); await wait('document.querySelector(".pricing-validation")===null');
    await click('Packs & abonnements'); const before = await e("document.querySelector('.pricing-metrics strong').textContent");
    await set('[aria-label="Bonus · Recharge 10"]', 10); await wait(`document.querySelector('.pricing-metrics strong').textContent===${JSON.stringify(before)}`);
    assert.equal(await e('[...document.querySelectorAll(".pricing-edit-table input[type=number]")].length'), 20);
    await namedField('Nom de la simulation', 'Scénario de recette');
    await click('Enregistrer'); await wait('document.querySelector(".pricing-scenario-bar select").disabled');
    await namedField('Nom de la simulation', 'Modification pendant la sauvegarde');
    await wait('!document.querySelector(".pricing-scenario-bar select").disabled');
    assert.equal(await e('document.querySelector(".pricing-scenario-bar input").value'), 'Modification pendant la sauvegarde');
    assert.ok(await e('document.querySelector(".pricing-save-status").textContent.includes("modifications à enregistrer")'));
    await click('Enregistrer'); await wait('document.querySelector(".pricing-save-status").textContent.includes("Version 2")');
    await click('Enregistrer une copie'); await wait('document.querySelector(".pricing-save-status").textContent.includes("Version 1")');
    const id = await e('document.querySelector(".pricing-scenario-bar select").value'); scenarios.get(id).revision++;
    await namedField('Nom de la simulation', 'Conflit de recette'); await click('Enregistrer'); await wait('document.querySelector(".admin-error")!==null');
    assert.ok(await e('document.querySelector(".admin-error").textContent.includes("autre fenêtre")'));
    await click('Enregistrer une copie'); await wait('document.querySelector(".admin-error")===null&&!document.querySelector(".pricing-scenario-bar select").disabled');
    await click('Données observées'); await click('Copier le temps de rendu moyen'); await click('Copier la taille du MP4');
    await click('Copier le taux de réutilisation'); await click('Copier les 47 crédits recharge disponibles');
    const unknown = await e("[...document.querySelectorAll('.admin-table tr')].find(r=>r.textContent.includes('Cartesia')).textContent"); assert.ok(unknown.includes('Inconnue') && unknown.includes('Non rapproché'));
    await e("(()=>{const row=[...document.querySelectorAll('.admin-table tr')].find(r=>r.textContent.includes('OpenAI'));[...row.querySelectorAll('button')].find(b=>b.textContent==='Copier facture').click();})()");
    await click('Coûts de production');
    assert.equal(await e("[...document.querySelectorAll('.pricing-field')].find(l=>l.querySelector('span')?.textContent==='Rédaction EUR / vidéo').querySelector('input').value"), '0.003');
    await click('Profils d’usage'); assert.equal(await e('document.querySelectorAll(".pricing-profile input[type=number]")[4].value'), '123');
    await e(`window.__downloads=[];const original=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download)window.__downloads.push({name:this.download,blob:window.__blob});else original.call(this)};URL.createObjectURL=blob=>{window.__blob=blob;return'blob:fixture'};URL.revokeObjectURL=()=>{};`);
    await click('Exporter JSON'); await click('Exporter CSV');
    const exported = await e('window.__downloads[0].blob.text().then(JSON.parse)');
    assert.equal(exported.scenario.profiles[0].renderSeconds, 123); assert.equal(exported.scenario.production.outputMB, 12);
    assert.equal(exported.scenario.production.animationReusePercent, 25); assert.equal(exported.scenario.market.initialUnusedPackCredits, 47);
    assert.ok((await e('window.__downloads[1].blob.text()')).includes('Hypothèses complètes'));
    await e("(async()=>{const payload=await window.__downloads[0].blob.text(),input=document.querySelector('input[type=file]'),data=new DataTransfer();data.items.add(new File([payload],'simulation.json',{type:'application/json'}));input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await wait('document.querySelector(".admin-notice")?.textContent.includes("Scénario importé")');
    assert.equal(await e('document.querySelector(".pricing-scenario-bar select").value'), '');
    await click('Enregistrer'); await wait('document.querySelector(".pricing-save-status").textContent.includes("sauvegardé")');
    const restoredName = await e('document.querySelector(".pricing-scenario-bar input").value');
    await page.goto({url: base, timeout: 30000, options: {waitUntil: 'load'}}); await wait('document.querySelector(".pricing-scenario-bar input")!==null');
    await wait('document.querySelector(".admin-notice")?.textContent.includes("restauré")');
    assert.equal(await e('document.querySelector(".pricing-scenario-bar input").value'), restoredName);
    assert.equal(exceptions.length, 0); assert.ok(actions.every(a => ['save', 'delete'].includes(a.action)));
    await click('Retirer'); await wait('document.querySelector(".admin-notice")?.textContent.includes("retiré")');
    assert.equal(await e('document.querySelector(".pricing-scenario-bar input").value'), restoredName);
    results.push({width, tabs: 6, boundedInvalidInputs: true, calculations: true, savedRevision: true, saveEditsPreserved: true,
      conflictRecovery: true, actualCostsCopied: true, unknownCostsVisible: true, jsonImportExport: true, csvExport: true,
      draftRestored: true, softDelete: true, noOverflow: true, providerCalls: 0});
    await page.close();
  }
} finally {await browser.close({silent: true}); await new Promise(resolve => server.close(resolve));}
await writeFile(new URL('ui-report.json', output), JSON.stringify({at: new Date().toISOString(), isolatedFixtures: true, results}, null, 2));
console.log(JSON.stringify({passed: true, results}));
