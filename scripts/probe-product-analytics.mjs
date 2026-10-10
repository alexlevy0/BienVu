// Real SDK and components, with local ingestion by default. The opt-in native
// analytics smoke sends only marked test events, without replay or product writes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {basename,dirname,resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {chromium} from 'playwright-core';
const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('tsx/package.json'))('esbuild');
const live=process.env.POSTHOG_LIVE_SMOKE==='true';
if(live&&process.env.POSTHOG_TEST_SCENARIO!=='web-analytics-native-events')throw Error('Live smoke is limited to the native Web Analytics scenario');
const output=resolve('evidence/local/posthog'),web=resolve('apps/web'),token=live?(await(await fetch('https://bienvu.online/api/analytics/config')).json()).token:'phc_public_fixture_project_key';
await mkdir(output,{recursive:true,mode:0o700});
const files=await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{AccountProvider}from'./components/account';import{ProductAnalytics,CookiePreferencesButton}from'./components/product-analytics';import{ErrorFallback}from'./components/error-fallback';import * as analytics from './lib/product-analytics';
function Broken(){throw new TypeError('REACT_FIXTURE token=SECRET_REACT');}
class FixtureBoundary extends React.Component{state={error:null,fail:false};static getDerivedStateFromError(error){return{error};}render(){return this.state.error?<ErrorFallback error={this.state.error} retry={()=>this.setState({error:null,fail:false})}/>:<><button id="react-error" onClick={()=>this.setState({fail:true})}>Tester une interruption</button>{this.state.fail&&<Broken/>}</>;}}
window.fixtureAnalytics=analytics;window.fixturePosthog=()=>import('posthog-js').then(m=>m.default);createRoot(document.getElementById('root')).render(location.search==='?fixture=fatal'?<ErrorFallback error={new TypeError('ROOT_FIXTURE token=SECRET_ROOT')} global retry={()=>location.assign('/')}/>:<AccountProvider><main><h1 data-analytics-public>BienVu, test local</h1><label>Annonce<input id="private-input" defaultValue="PRIVATE_FORM_VALUE"/></label><p id="private-text">PRIVATE_CUSTOMER_TEXT</p><img src="/api/private/PRIVATE_ASSET"/><video src="/video-preview.mp4" poster="/api/private/PRIVATE_ASSET"/><input type="password" id="secret-password" defaultValue="SECRET_PASSWORD"/><input type="hidden" value="SECRET_HIDDEN"/><a id="private-link" href="/editeur?draft=PRIVATE_DRAFT&amp;access_token=SECRET_ACCESS_TOKEN">Éditeur</a><button id="safe-action" onClick={()=>analytics.trackProductEvent('editor_action',{action:'photo_reordered',email:'PRIVATE_EMAIL'})}>Réordonner</button><button id="automatic-errors" onClick={()=>{setTimeout(()=>{throw new TypeError("BROWSER_FIXTURE token=SECRET_TOKEN")},0);Promise.reject(new Error("REJECTION_FIXTURE password=SECRET_PASSWORD"));}}>Tester les erreurs automatiques</button><FixtureBoundary/><CookiePreferencesButton/></main><ProductAnalytics/></AccountProvider>);`,resolveDir:web,loader:'tsx'},bundle:true,write:false,outdir:resolve(output,'bundle'),format:'esm',splitting:true,jsx:'automatic',minify:true,
  define:{'process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_BIENVU_RELEASE':'"analytics-fixture"'},plugins:[{name:'local-next',setup(build){
    // Local automation is classified as test/bot traffic by PostHog. Override
    // only that documented SDK switch in this fixture, never in production.
    build.onLoad({filter:/[/\\]lib[/\\]product-analytics\.ts$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('capture_pageview:false','loaded:p=>p.register({is_test:true}),opt_out_useragent_filter:true,capture_pageview:false').replace('const snapshots=event.properties.$snapshot_data;', 'const snapshots=event.properties.$snapshot_data;window.fixtureSnapshotShape={keys:Object.keys(event.properties),type:typeof snapshots,isArray:Array.isArray(snapshots),first:snapshots?.[0]};'),loader:'ts',resolveDir:dirname(args.path)}));
    build.onResolve({filter:/^next\/(link|navigation)$/},args=>({path:args.path,namespace:'local-next'}));
    build.onLoad({filter:/.*/,namespace:'local-next'},args=>({contents:args.path==='next/link'?`import React from 'react';export default React.forwardRef(({href,children,...p},ref)=><a href={href} ref={ref} {...p}>{children}</a>);`:
      `import{useSyncExternalStore,useMemo}from'react';const subscribe=f=>{window.addEventListener('fixture-navigation',f);return()=>window.removeEventListener('fixture-navigation',f)};export function usePathname(){return useSyncExternalStore(subscribe,()=>location.pathname,()=>'/')};export function useSearchParams(){const s=useSyncExternalStore(subscribe,()=>location.search,()=> '');return useMemo(()=>new URLSearchParams(s),[s])};`,loader:'jsx',resolveDir:web}));
  }}]});
const bundles=new Map(files.outputFiles.map(file=>[basename(file.path),file.contents]));
const beacons=new Map();
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),json=(body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
  // A real same-origin receiver observes beacons after their frame unloads;
  // Playwright's interception of cross-origin unload requests is unreliable.
  if(url.pathname==='/fixture-beacon'){
    const target=new URL(url.searchParams.get('target')),holder=beacons.get(url.searchParams.get('scenario'));assert.ok(holder&&target.hostname==='eu.i.posthog.com');
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks),payload=decode(bytes),batch=(Array.isArray(payload)?payload:payload?.batch??[payload]).filter(Boolean);holder.requests.push('beacon:'+target.pathname);holder.events.push(...batch);
    if(live){assert.ok(batch.every(event=>event.properties?.is_test===true));const receipt=await fetch(target,{method:'POST',headers:{'Content-Type':req.headers['content-type']??'text/plain'},body:bytes});assert.equal(receipt.status,200);}
    return json({status:1});
  }
  if(url.pathname==='/api/analytics/config')return json({enabled:true,token,host:'https://eu.i.posthog.com'});
  if(url.pathname==='/api/me')return json({},401);
  if(url.pathname==='/api/voices')return json({},503);
  if(url.pathname==='/api/imports')return json({id:'PRIVATE_IMPORT_ID',status:'ready',listing:{title:'PRIVATE_LISTING_TEXT'}},201);
  if(url.pathname==='/api/partners/applications')return json({received:true},201);
  if(url.pathname==='/api/private/PRIVATE_ASSET'){res.writeHead(200,{'Content-Type':'image/png'});return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jOioAAAAASUVORK5CYII=','base64'));}
  if(url.pathname==='/style.css'){res.writeHead(200,{'Content-Type':'text/css'});return res.end(await readFile(resolve(web,'app/privacy-choice.css')));}
  if(bundles.has(basename(url.pathname))){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(bundles.get(basename(url.pathname)));}
  res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html lang="fr"><head><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/stdin.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{channel:'chrome'}),headless:true});
const results=[];
function decode(buffer){
  if(!buffer)return null;
  if(buffer[0]===31&&buffer[1]===139)buffer=gunzipSync(buffer);
  const text=buffer.toString();try{return JSON.parse(text);}catch{}
  const params=new URLSearchParams(text),raw=params.get('data');if(!raw)return {unparsed:true,bytes:buffer.length};
  try{return JSON.parse(raw);}catch{}
  const decoded=Buffer.from(raw,'base64');try{return JSON.parse(decoded.toString());}catch{}
  try{return JSON.parse(gunzipSync(decoded).toString());}catch{return {unparsed:true,bytes:buffer.length};}
}
async function scenario(name,fn,width=1280){
  if(process.env.POSTHOG_TEST_SCENARIO&&!name.includes(process.env.POSTHOG_TEST_SCENARIO))return;
  const context=await browser.newContext({viewport:{width,height:900},userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'}),requests=[],events=[];
  beacons.set(name,{requests,events});
  await context.addInitScript(name=>{const send=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=(target,body)=>send('/fixture-beacon?scenario='+encodeURIComponent(name)+'&target='+encodeURIComponent(target),body);},name);
  await context.route(url=>url.hostname.endsWith('.posthog.com'),async route=>{
    const request=route.request(),url=new URL(request.url());requests.push(url.pathname);
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'*'}});
    if(url.pathname.endsWith('/config.js'))return route.fulfill({status:404,body:''});
    if(request.method()==='POST'&&!/flags/.test(url.pathname)){
      const decoded=decode(request.postDataBuffer());
      if(decoded?.unparsed)throw Error('Unparsed SDK payload '+JSON.stringify(decoded));
      events.push(...(Array.isArray(decoded)?decoded:decoded?.batch??[decoded]).filter(Boolean));
      if(live){assert.ok(events.every(event=>event.properties.is_test===true),'only marked test events may reach PostHog');const receipt=await route.fetch();assert.equal(receipt.status(),200);return route.fulfill({response:receipt});}
      return route.fulfill({json:{status:1},headers:{'Access-Control-Allow-Origin':'*'}});
    }
    if(/\.js$/.test(url.pathname)&&!url.pathname.includes('/array/')){
      let file=basename(url.pathname);if(file==='recorder.js')file='posthog-recorder.js';
      return route.fulfill({contentType:'text/javascript',body:await readFile(resolve(web,'node_modules/posthog-js/dist',file)),headers:{'Access-Control-Allow-Origin':'*'}});
    }
    return route.fulfill({json:{autocapture_opt_out:false,featureFlags:{},supportedCompression:[],sessionRecording:{enabled:true,endpoint:'/s/',sampleRate:'1',consoleLogRecordingEnabled:true,networkPayloadCapture:{recordBody:true,recordHeaders:true},masking:{maskAllInputs:false}},config:{enable_collect_everything:false}},headers:{'Access-Control-Allow-Origin':'*'}});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});await page.locator('.privacy-banner').waitFor().catch(()=>{throw Error(name+': '+JSON.stringify(errors));});
  await fn({page,requests,events,context});assert.deepEqual(errors.filter(e=>!/BROWSER_FIXTURE|REJECTION_FIXTURE/.test(e)),[],name+' JavaScript');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,name+' width');
  results.push({name,requests:requests.length,events:events.map(e=>e.event),passed:true});await context.close();
}
try{
  await scenario('before-consent-and-refusal',async({page,requests,events})=>{
    await page.waitForTimeout(700);assert.equal(requests.length,0);await page.getByRole('button',{name:'Tout refuser',exact:true}).first().click();
    await page.click('#safe-action');await page.waitForTimeout(700);assert.equal(requests.length,0);assert.equal(events.length,0);
    await page.reload();await page.locator('.privacy-settings-link').click();await page.locator('.privacy-dialog[open]').waitFor();assert.equal(await page.locator('.privacy-banner').count(),0);assert.equal(requests.length,0);
    await page.evaluate(()=>window.fixtureAnalytics.captureProductException(Error('REFUSED_FIXTURE')));assert.equal(requests.length,0);
  },390);
  await scenario('analytics-without-replay',async({page,requests,events})=>{
    await page.getByRole('button',{name:'Personnaliser',exact:true}).click();await page.getByRole('checkbox',{name:'Mesure d’audience et actions'}).check();
    await page.getByRole('button',{name:'Enregistrer mes choix'}).click();await page.click('#safe-action');await page.waitForTimeout(7000);
    assert.ok(events.some(e=>e.event==='$pageview'),JSON.stringify({requests,events,stored:await page.evaluate(async()=>{const s=await window.fixturePosthog();return {storage:{...localStorage},optedOut:s.has_opted_out_capturing(),loaded:s.__loaded,ua:navigator.userAgent,redact:window.fixtureAnalytics.redactAnalyticsEvent({event:'$pageview',properties:{}}),capture:s.capture('editor_action',{action:'redo'})}})}));assert.ok(events.some(e=>e.event==='editor_action'));assert.ok(!events.some(e=>e.event==='$snapshot'));
    assert.ok(!requests.some(p=>/recorder/.test(p)),'recorder stays unloaded');assert.ok(!JSON.stringify(events).includes('SECRET_'));
  });
  await scenario('web-analytics-native-events',async({page,events,context})=>{
    await page.getByRole('button',{name:'Personnaliser',exact:true}).click();await page.getByRole('checkbox',{name:'Mesure d’audience et actions'}).check();await page.getByRole('button',{name:'Enregistrer mes choix'}).click();
    await page.waitForFunction(async()=>Boolean((await window.fixturePosthog()).webVitalsAutocapture?._initialized));
    // Actual paint and interaction observers, not manually invented metrics.
    await page.click('#safe-action');
    for(let n=0;n<15&&!events.some(e=>e.event==='$web_vitals');n++)await page.waitForTimeout(1000);
    const vitals=events.filter(e=>e.event==='$web_vitals');assert.ok(vitals.length,'native Web Vitals received');assert.ok(vitals.some(e=>typeof e.properties.$web_vitals_FCP_value==='number'));assert.ok(vitals.some(e=>typeof e.properties.$web_vitals_LCP_value==='number'));
    await page.waitForTimeout(1100);
    await page.evaluate(()=>{window.fixtureAnalytics.suspendProductAnalytics('/blog');history.pushState(null,'','/blog');window.dispatchEvent(new Event('fixture-navigation'));});
    for(let n=0;n<10&&!events.some(e=>e.event==='$pageview'&&e.properties.$pathname==='/blog');n++)await page.waitForTimeout(1000);
    const initial=events.find(e=>e.event==='$pageview'&&e.properties.$pathname==='/'),leave=events.find(e=>e.event==='$pageleave'&&e.properties.$pathname==='/');assert.ok(leave);assert.equal(leave.properties.$prev_pageview_id,initial.uuid);assert.ok(leave.properties.$prev_pageview_duration>=1);assert.equal(leave.properties.$prev_pageview_pathname,'/');assert.equal(events.filter(e=>e.event==='$pageleave'&&e.properties.$pathname==='/').length,1);
    await page.goto(base+'/partenaires');for(let n=0;n<10&&!events.some(e=>e.event==='$pageleave'&&e.properties.$pathname==='/blog');n++)await page.waitForTimeout(1000);assert.equal(events.filter(e=>e.event==='$pageleave'&&e.properties.$pathname==='/blog').length,1,'document unload leaves the previous page once');
    await page.locator('#safe-action').waitFor();await page.waitForTimeout(1200);
    const other=await context.newPage();await other.goto(base+'/excluded-privacy-fixture');await other.evaluate(()=>localStorage.setItem('bienvu:privacy:v2',JSON.stringify({version:2,analytics:false,replay:false,at:Date.now()})));await page.waitForTimeout(4000);await other.close();
    assert.ok(!events.some(e=>e.event==='$pageleave'&&e.properties.$pathname==='/partenaires'),'another tab withdrawing consent never records an exit');
    const count=events.length;await page.goto(base+'/');await page.waitForTimeout(1500);assert.equal(events.length,count,'withdrawal stops performance and exits as well');assert.ok(!events.some(e=>e.event==='$snapshot'));assert.ok(!JSON.stringify(events).includes('SECRET_'));
    await writeFile(resolve(output,live?'web-analytics-live.json':'web-analytics-local.json'),JSON.stringify({at:new Date().toISOString(),live,events},null,2),{mode:0o600});
  });
  await scenario('exceptions-autocapture-without-replay',async({page,events,requests})=>{
    await page.getByRole('button',{name:'Personnaliser',exact:true}).click();await page.getByRole('checkbox',{name:'Mesure d’audience et actions'}).check();await page.getByRole('button',{name:'Enregistrer mes choix'}).click();
    await page.waitForFunction(async()=>Boolean((await window.fixturePosthog()).exceptionObserver?._unwrapOnError));
    await page.click('#automatic-errors');
    await page.waitForTimeout(7000);
    const exceptions=events.filter(e=>e.event==='$exception');assert.equal(exceptions.length,2,JSON.stringify({requests,events:events.map(e=>e.event),sdk:await page.evaluate(async()=>{const p=await window.fixturePosthog();return {optedOut:p.has_opted_out_capturing(),enabled:p.exceptionObserver?.isEnabled,options:p.config.capture_exceptions,storage:{...localStorage},redact:window.fixtureAnalytics.redactAnalyticsEvent({event:'$exception',properties:{$exception_list:[{type:'Test',value:'Fixture'}]}})}})}));assert.ok(exceptions.every(e=>e.properties.$exception_list.length));assert.ok(!JSON.stringify(exceptions).includes('SECRET_'));assert.ok(!events.some(e=>e.event==='$snapshot'));
    const count=exceptions.length;await page.locator('.privacy-settings-link').click();await page.getByRole('button',{name:'Tout refuser',exact:true}).click();await page.evaluate(()=>window.fixtureAnalytics.captureProductException(Error('WITHDRAWN_FIXTURE')));await page.waitForTimeout(2500);assert.equal(events.filter(e=>e.event==='$exception').length,count);
  });
  await scenario('react-boundary-and-recovery',async({page,events})=>{
    await page.getByRole('button',{name:'Tout accepter',exact:true}).first().click();await page.waitForTimeout(1000);await page.click('#react-error');await page.getByRole('heading',{name:'Une interruption momentanée.'}).waitFor();
    await page.waitForTimeout(7000);const exceptions=events.filter(e=>e.event==='$exception'&&JSON.stringify(e).includes('REACT_FIXTURE'));assert.equal(exceptions.length,1);assert.equal(exceptions[0].properties.bv_error_source,'react_boundary');assert.ok(!JSON.stringify(exceptions).includes('SECRET_REACT'));
    await page.screenshot({path:resolve(output,'error-fallback-mobile.png')});await page.getByRole('button',{name:'Réessayer',exact:true}).click();await page.locator('#react-error').waitFor();
  },390);
  await scenario('root-fallback-with-existing-consent',async({page,events})=>{
    await page.getByRole('button',{name:'Tout accepter',exact:true}).first().click();await page.waitForTimeout(1000);await page.goto(base+'/?fixture=fatal');await page.getByRole('heading',{name:'Une interruption momentanée.'}).waitFor();await page.waitForTimeout(7000);
    const exceptions=events.filter(e=>e.event==='$exception'&&JSON.stringify(e).includes('ROOT_FIXTURE'));assert.equal(exceptions.length,1);assert.equal(exceptions[0].properties.bv_error_source,'react_global');assert.ok(!JSON.stringify(exceptions).includes('SECRET_ROOT'));
    await page.screenshot({path:resolve(output,'error-fallback-desktop.png')});
  });
  await scenario('replay-visibility-credentials-navigation-and-withdrawal',async({page,events,requests})=>{
    await page.getByRole('button',{name:'Tout accepter',exact:true}).first().click();
    await page.evaluate(()=>{document.title='PRIVATE_DOCUMENT_TITLE'});await page.fill('#private-input','PRIVATE_CHANGED_INPUT');await page.fill('#secret-password','SECRET_CHANGED_PASSWORD');await page.click('#safe-action');await page.evaluate(()=>console.log('SECRET_CONSOLE_TEXT'));
    await page.evaluate(async()=>{await window.fixtureAnalytics.analyticsFetch('/api/imports',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'SECRET_KEY'},body:JSON.stringify({url:'https://agency.fr/PRIVATE_SOURCE',text:'SECRET_REQUEST_BODY'})});});
    for(let attempt=0;attempt<20&&!events.some(e=>e.event==='$snapshot');attempt++)await page.waitForTimeout(1000);
    assert.ok(events.some(e=>e.event==='$snapshot'),JSON.stringify({requests,events:events.map(e=>({event:e.event,keys:Object.keys(e),propertyKeys:Object.keys(e.properties??{})})),recording:await page.evaluate(async()=>{const s=await window.fixturePosthog();return {started:s.sessionRecordingStarted(),disabled:s.config.disable_session_recording,shape:window.fixtureSnapshotShape,storage:{...localStorage}}})}));
    assert.ok(events.some(e=>e.event==='import_completed'),'import response stays usable');
    const raw=JSON.stringify(events);assert.ok(!raw.includes('SECRET_'),'passwords, hidden values, OAuth credentials, API bodies, console and keys stay protected');assert.ok(raw.includes('privacy-banner'),'CSS retained for usable replays');
    for(const text of ['PRIVATE_CHANGED_INPUT','PRIVATE_CUSTOMER_TEXT','PRIVATE_DOCUMENT_TITLE'])assert.ok(raw.includes(text),text+' visible in replay');
    assert.ok(raw.includes('data:image/jpeg;base64,'),'displayed private photo pixels available in replay');assert.ok(raw.includes('video-preview.mp4'),'video element stays visible');
    await page.screenshot({path:resolve(output,'desktop-choice.png')});
    await page.evaluate(()=>{window.fixtureAnalytics.suspendProductAnalytics();history.pushState(null,'','/admin');window.dispatchEvent(new Event('fixture-navigation'));document.getElementById('private-text').textContent='PRIVATE_ADMIN_TEXT';});
    const count=events.filter(e=>e.event==='editor_action').length;await page.click('#safe-action');await page.waitForTimeout(2800);assert.equal(events.filter(e=>e.event==='editor_action').length,count,'admin action excluded');assert.ok(!JSON.stringify(events).includes('PRIVATE_ADMIN_TEXT'),'no admin DOM transmitted');
    await page.evaluate(()=>{history.pushState(null,'','/editeur?draft=PRIVATE_DRAFT');window.dispatchEvent(new Event('fixture-navigation'));});
    await page.waitForTimeout(3500);assert.ok(events.some(e=>e.event==='$pageview'&&e.properties.$pathname==='/editeur'));
    assert.ok(!JSON.stringify(events).includes('SECRET_'));
    await page.locator('.privacy-settings-link').click();await page.getByRole('button',{name:'Tout refuser',exact:true}).click();
    const after=events.filter(e=>e.event==='editor_action').length;await page.click('#safe-action');await page.waitForTimeout(3200);assert.equal(events.filter(e=>e.event==='editor_action').length,after,'withdrawal stops all new actions');
    const stored=await page.evaluate(()=>JSON.stringify({...localStorage}));assert.ok(!stored.includes('distinct_id'),'identifiers removed after withdrawal');
  },390);
  await scenario('identity-deduplication-and-internal-accounts',async({page,events})=>{
    await page.getByRole('button',{name:'Tout accepter',exact:true}).first().click();await page.waitForTimeout(700);
    const guest=await page.evaluate(async()=>(await window.fixturePosthog()).get_distinct_id());
    await page.evaluate(token=>{const a=window.fixtureAnalytics,c=JSON.parse(localStorage.getItem('bienvu:privacy:v2'));a.configureProductAnalytics({enabled:true,token,host:'https://eu.i.posthog.com'},c,{ready:true,excluded:false,userId:'11111111-1111-4111-8111-111111111111'});a.trackGenerationOutcome({id:'PRIVATE_JOB',status:'ready',sourceKind:'url'});a.trackGenerationOutcome({id:'PRIVATE_JOB',status:'ready',sourceKind:'url'});},token);
    await page.waitForTimeout(5500);
    assert.ok(events.some(e=>e.event==='$identify'&&e.properties.$anon_distinct_id===guest),'login preserves anonymous journey');
    assert.equal(events.filter(e=>e.event==='generation_ready').length,1,'polling does not duplicate a completion');
    await page.evaluate(token=>window.fixtureAnalytics.configureProductAnalytics({enabled:true,token,host:'https://eu.i.posthog.com'},JSON.parse(localStorage.getItem('bienvu:privacy:v2')),{ready:true,excluded:false,userId:'22222222-2222-4222-8222-222222222222'}),token);
    assert.equal(await page.evaluate(async()=>(await window.fixturePosthog()).get_distinct_id()),'user:22222222-2222-4222-8222-222222222222');
    await page.evaluate(token=>{window.fixtureAnalytics.configureProductAnalytics({enabled:true,token,host:'https://eu.i.posthog.com'},JSON.parse(localStorage.getItem('bienvu:privacy:v2')),{ready:true,excluded:false,internal:true,userId:'22222222-2222-4222-8222-222222222222'});window.fixtureAnalytics.trackProductEvent('agency_saved');},token);
    await page.waitForTimeout(5500);assert.ok(events.some(e=>e.event==='agency_saved'&&e.properties.is_internal===true),'internal account visible and marked for dashboard filtering');
    assert.ok(!JSON.stringify(events).includes('PRIVATE_JOB'),'job IDs never reach analytics');
  });
  await writeFile(resolve(output,'report.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
