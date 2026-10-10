// Real React section and browser media, isolated HTTP fixture. No product writes
// or provider calls. BIENVU_HOME_URL switches to read-only deployed-page checks.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve,basename} from 'node:path';
import {chromium} from 'playwright-core';
const root=resolve('apps/web'),output=resolve('evidence/local/home-avatars'),require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('tsx/package.json'))('esbuild');
await mkdir(output,{recursive:true,mode:0o700});
const build=await esbuild.build({stdin:{contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{HomeAvatarShowcase}from'./components/home-avatar-showcase';import{HomepageMediaProvider}from'./components/homepage-media';import{AdminHomepage}from'./components/admin-homepage';
const asset={id:'00000000-0000-4000-8000-000000000001',kind:'video',title:'Vidéo choisie par l’agence',agency:'Agence de recette',locality:'Bordeaux',mime:'video/mp4',sha256:'a'.repeat(64),sizeBytes:1000,durationMs:28000,width:600,height:800,url:'/videos/studio-home/paris.mp4',posterUrl:'/images/studio-home/bordeaux.webp',createdAt:new Date().toISOString()};
function Fixture(){const[paused,setPaused]=useState(false);window.fixturePause=setPaused;return location.pathname==='/admin'?<AdminHomepage/>:<HomepageMediaProvider config={{version:0,slots:location.search==='?custom=1'?{'avatars.circle.video':asset}:{}}}><div className="home-studio"><div className="home-workspace"><main className="home-content"><HomeAvatarShowcase paused={paused}/><section className="home-life"><h2>Vos photos <em>prennent vie.</em></h2></section><div style={{height:1200}}/></main></div></div></HomepageMediaProvider>};createRoot(document.getElementById('root')).render(<Fixture/>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'esm',jsx:'automatic',minify:true,define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'local-next',setup(b){b.onResolve({filter:/^next\/link$/},args=>({path:args.path,namespace:'local-next'}));b.onLoad({filter:/.*/,namespace:'local-next'},()=>({contents:"import React from'react';export default function Link({href,children,...p}){return <a href={href} {...p}>{children}</a>}",loader:'jsx',resolveDir:root}));}}]});
const requests=[];
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;requests.push(path);
 if(path==='/api/admin/homepage'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({revision:0,publishedVersion:0,publishedAt:null,updatedAt:new Date().toISOString(),draft:{},published:{},assets:{},history:[]}));return;}
 if(path==='/fixture.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(build.outputFiles[0].contents);return;}
 if(path.startsWith('/images/')||path.startsWith('/videos/')||path.startsWith('/fonts/')||path.startsWith('/app/')){
  const file=resolve(root,path.startsWith('/app/')?path.slice(1):'public'+path);assert.ok(file.startsWith(root+'/'));
  try{const bytes=await readFile(file),mime=path.endsWith('.css')?'text/css':path.endsWith('.mp4')?'video/mp4':path.endsWith('.vtt')?'text/vtt':path.endsWith('.woff2')?'font/woff2':'image/webp';res.writeHead(200,{'Content-Type':mime,'Content-Length':bytes.length});res.end(bytes);}catch{res.writeHead(404);res.end();}return;
 }
 res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html lang="fr"><head>'+['style','landing','home-avatars','home-showcase','admin/homepage'].map(file=>`<link rel="stylesheet" href="/app/${file}.css">`).join('')+'</head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=process.env.BIENVU_HOME_URL??'http://127.0.0.1:'+server.address().port,live=Boolean(process.env.BIENVU_HOME_URL);
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Users/alexlevy0/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell',headless:true}),reports=[];
try{
 for(const width of [1536,1280,1024,900,768,390,320]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],loaded=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/avatar-(circle|integrated)\.mp4/.test(request.url()))loaded.push(request.url());});
  if(live){await context.addInitScript(()=>localStorage.setItem('bienvu:privacy:v2',JSON.stringify({version:2,at:Date.now(),analytics:false,replay:false})));await context.route('**/api/metrics/web-vitals',route=>route.fulfill({status:204}));await context.route(/https:\/\/[^/]*tawk\.to\//,route=>route.fulfill({contentType:'text/javascript',body:''}));}
  await page.goto(base);await page.locator('#home-avatars-title').waitFor();await page.locator('.home-avatars').scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);
  await page.locator('.home-avatar-poster img').first().waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('.home-avatar-poster img')].every(image=>image.complete&&image.naturalWidth>0));
  assert.equal(loaded.length,0,'No avatar video download before click');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow');
  assert.equal(await page.evaluate(()=>Boolean(document.querySelector('.home-avatars').compareDocumentPosition(document.querySelector('.home-life'))&Node.DOCUMENT_POSITION_FOLLOWING)),true,'Section precedes photos');
  const boxes=await page.locator('.home-avatar-frame').evaluateAll(elements=>elements.map(element=>{const r=element.getBoundingClientRect();return{x:r.x,width:r.width,right:r.right,height:r.height};}));
  assert.ok(boxes.every(box=>box.x>=0&&box.right<=width&&box.width>=110));
  await page.locator('.home-avatars').screenshot({path:resolve(output,`${live?'published':'local'}-${width}.png`)});
  if(width===1536||width===390){
   assert.equal(await page.getByRole('link',{name:'Voir les avatars en action'}).getAttribute('href'),'/avatar');
   await page.getByRole('button',{name:'Lire la démonstration : Une présence discrète',exact:true}).click();
   const first=page.locator('.home-avatar-preview-circle video'),second=page.locator('.home-avatar-preview-integrated video');
   await page.waitForFunction(()=>{const v=document.querySelector('.home-avatar-preview-circle video');return !v.paused&&v.currentTime>.1});
   assert.equal(await first.evaluate(v=>v.controls),true);assert.equal(await page.locator('dialog[open]').count(),0);
   const media=await first.evaluate(v=>({width:v.videoWidth,height:v.videoHeight,duration:v.duration,audio:v.webkitAudioDecodedByteCount}));assert.equal(media.width,540);assert.equal(media.height,960);assert.ok(media.audio>0,'Voiced clip really plays');
   await page.getByRole('button',{name:'Lire la démonstration : Une présence intégrée',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.home-avatar-preview-integrated video').paused&&document.querySelector('.home-avatar-preview-circle video').paused);assert.equal(await first.evaluate(v=>v.paused),true);
   if(!live){await page.evaluate(()=>window.fixturePause(true));await page.waitForFunction(()=>document.querySelector('.home-avatar-preview-integrated video').paused);await page.evaluate(()=>window.fixturePause(false));}
   await first.evaluate(v=>v.play());await page.waitForFunction(()=>!document.querySelector('.home-avatar-preview-circle video').paused&&document.querySelector('.home-avatar-preview-integrated video').paused);assert.equal(await second.evaluate(v=>v.paused),true,'Native controls replay a started clip');
   await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await page.waitForFunction(()=>document.querySelector('.home-avatar-preview-circle video').paused);
  }
  assert.deepEqual(errors,[]);reports.push({width,inlinePlayback:width===1536||width===390,noOverflow:true,initialVideoRequests:0});await context.close();
 }
 if(!live){
  const page=await browser.newPage();await page.goto(base+'/?custom=1');await page.locator('#home-avatars-title').waitFor();assert.equal(await page.locator('.home-avatar-preview-circle .home-avatar-property').count(),0);assert.ok((await page.locator('.home-avatar-preview-circle video').getAttribute('src')).includes('paris.mp4'));assert.ok((await page.locator('.home-avatar-preview-circle img').getAttribute('src')).includes('bordeaux'));
  await page.goto(base+'/admin');await page.getByRole('heading',{name:'Vos annonces prennent la parole',exact:true}).waitFor();assert.equal(await page.locator('[data-home-slot^="avatars."]').count(),4);await page.close();
 }
 await writeFile(resolve(output,live?'published-browser.json':'browser.json'),JSON.stringify({live,reports},null,2),{mode:0o600});console.log(JSON.stringify({live,passed:true,widths:reports.length,inlinePlayback:true,initialVideoRequests:0}));
}finally{await browser.close();server.close();}
