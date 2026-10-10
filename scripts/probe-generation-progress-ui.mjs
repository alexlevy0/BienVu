// Render the production progress components against local checkpoints. No generation or provider call.
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const out=resolve('evidence/local/generation-progress-2026-10-09');await mkdir(out,{recursive:true});
const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('tsx'))('esbuild');
const source=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {ConversationGeneration} from './components/conversation-generation';
import {GenerationProgress} from './components/generation-progress';
import {GenerationView} from '@bienvu/contracts';
const base={id:'fixture-progress',status:'voicing',stage:'voicing',attempt:1,errorCode:null,createdAt:'2026-10-09T20:00:00Z',updatedAt:'2026-10-09T20:00:00Z',expiresAt:null,title:'Bien de recette',sourceKind:'manual',syntheticVoice:true,retryAllowed:false,videoUrl:null,downloadUrl:null,narrationReady:true,avatar:{requested:1,ready:0,failed:0,active:1,creditsUsed:0}};
const scenarios={map:{...base,status:'importing',stage:'importing',narrationReady:false,avatar:undefined,preparation:{map:'working'}},avatar:{...base,preparation:{map:'ready',avatar:'working',animations:'pending'}},animations:{...base,avatar:{...base.avatar,ready:1,active:0},preparation:{map:'ready',avatar:'ready',animations:'working'}},rendering:{...base,status:'rendering',stage:'rendering',progressPercent:42,avatar:{...base.avatar,ready:1,active:0},preparation:{map:'ready',avatar:'ready',animations:'ready'}},simple:{...base,narrationReady:false,avatar:undefined,preparation:{}},skipped:{...base,avatar:{...base.avatar,failed:1,active:0},preparation:{map:'skipped',avatar:'skipped'}}};
function App(){const [name,setName]=useState('avatar'),job=GenerationView.parse(scenarios[name]);return <main className="home-studio"><label>Scénario<select aria-label="Scénario" value={name} onChange={e=>setName(e.target.value)}>{Object.keys(scenarios).map(n=><option value={n}>{n}</option>)}</select></label><ConversationGeneration job={job} request={{kind:'manual',text:''}} sending={false} anonymous={false} onRefresh={async()=>{}}/><GenerationProgress job={job}/></main>};createRoot(document.getElementById('root')).render(<App/>);`;
const compiled=await esbuild.build({stdin:{contents:source,loader:'tsx',resolveDir:resolve('apps/web')},bundle:true,platform:'browser',format:'iife',jsx:'automatic',write:false,minify:true,loader:{'.css':'empty'},define:{'process.env':'{}','process.env.NODE_ENV':'"production"'}});
const css=(await Promise.all(['apps/web/app/style.css','apps/web/app/landing.css'].map(p=>readFile(p,'utf8')))).join('\n');
const photo=await readFile('fixtures/generated/room-1.png');
const server=createServer(async(req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(compiled.outputFiles[0].contents);return;}
  if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
  if(req.url.startsWith('/api/generations/')){res.setHeader('Content-Type','image/png');res.end(photo);return;}
  if(req.url.startsWith('/fonts/')){try{res.end(await readFile(resolve('apps/web/public',req.url.slice(1))));}catch{res.writeHead(404);res.end();}return;}
  res.setHeader('Content-Type','text/html');res.end('<html lang="fr"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><style>main{max-width:1100px;margin:auto;padding:30px 22px}.generation-progress{margin-top:35px}label{display:flex;gap:14px;align-items:center;margin-bottom:25px}</style><div id="root"></div><script src="/bundle.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:resolve('apps/renderer/node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell'),headless:true}),reports=[];
try{
  for(const width of [1536,390]){
    const page=await browser.newPage({viewport:{width,height:width===390?844:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
    await page.goto('http://127.0.0.1:'+server.address().port);await page.getByLabel('Scénario').waitFor({timeout:30000}).catch(async()=>{
      await page.screenshot({path:out+'/debug.png'});throw Error(errors.join('\n')||'UI_CONTENT_MISSING '+(await page.locator('body').innerText()).slice(0,800));});
    for(const [scenario,current] of Object.entries({map:'Génération de la carte',avatar:'Génération de l’avatar',animations:'Animation des photos',rendering:'Assemblage de la vidéo',simple:'Création de la voix off',skipped:'Assemblage de la vidéo'})){
      await page.getByLabel('Scénario').selectOption(scenario);
      assert.match(await page.locator('.home-conversation-steps [aria-current=step]').innerText(),new RegExp(current));
      assert.match(await page.locator('.generation-steps [aria-current=step]').innerText(),new RegExp(current));
      if(scenario==='avatar'){
        assert.match(await page.locator('.home-conversation-steps .step-done').allTextContents().then(n=>n.join(' ')),/Voix off prête/);
        assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuetext'),current);
      }
      if(scenario==='rendering')assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'),'42');
      else assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'),null);
      if(scenario==='simple')assert.equal(await page.locator('.home-conversation-steps li').count(),4);
      if(scenario==='skipped')assert.equal(await page.locator('.home-conversation-steps .step-skipped').count(),2);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
      if(['avatar','map'].includes(scenario))await page.screenshot({path:out+'/'+scenario+'-'+width+'.png',fullPage:true});
    }
    assert.deepEqual(errors,[]);reports.push({width,scenarios:6,voiceCheckedDuringAvatar:true,optionalSteps:true,skippedNotCompleted:true,noOverflow:true,providerCalls:0});await page.close();
  }
  await writeFile(out+'/ui-report.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
}finally{await browser.close();await new Promise(r=>server.close(r));}
