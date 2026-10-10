// Real picker against local media; no generation, login bypass or provider call.
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const out=resolve('evidence/local/avatar-catalog-2026-10-09');await mkdir(out,{recursive:true});
const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('tsx'))('esbuild');
const source=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {AvatarControls,useAvatarCatalog} from './components/avatar-controls';
import {defaultAvatarCustomization} from '@bienvu/contracts';
function App(){const {catalog}=useAvatarCatalog(),[avatar,setAvatar]=useState(defaultAvatarCustomization('look-0'));return <main><h1>Un présentateur pour votre bien</h1><AvatarControls catalog={catalog} avatar={avatar} onChange={setAvatar} authenticated voiceEnabled voice="fr-FR-Chirp3-HD-Aoede" durationSeconds={20}/><output>{avatar.lookId}</output></main>};createRoot(document.getElementById('root')).render(<App/>);`;
const compiled=await esbuild.build({stdin:{contents:source,loader:'tsx',resolveDir:resolve('apps/web')},bundle:true,platform:'browser',format:'iife',jsx:'automatic',write:false,minify:true,loader:{'.css':'empty'},define:{'process.env':'{}','process.env.NODE_ENV':'"production"'}});
const css=await readFile('apps/web/app/avatars.css','utf8'),image=await readFile('evidence/local/avatar-catalog-2026-10-09/Daphne_public_1-before.png');
const video=await readFile('evidence/local/heygen-2026-10-09/pilot.mp4');
const catalog={enabled:true,allowPremium:false,maxSeconds:6,defaultLookId:'look-0',looks:Array.from({length:100},(_,i)=>({id:'look-'+i,name:i===0?'Daphne · recette':'Avatar '+i,
 gender:i%2?'male':'female',type:'studio_avatar',engines:['avatar_iii'],enabled:true,thumbnail:'/portrait/'+i,preview:'/extrait/'+i,transparentVerified:false,ownership:'public',updatedAt:'2026-10-09'}))};
const server=createServer((req,res)=>{
 const url=req.url??'/';
 if(url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(compiled.outputFiles[0].contents);return;}
 if(url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css+'body{margin:0;background:#fbfaf7;font-family:Arial,sans-serif;color:#203024}main{max-width:920px;padding:28px;margin:20px auto}h1{font-family:Georgia,serif;font-size:32px;font-weight:400}.avatar-intro{display:none}.customizer-checkbox{display:flex;gap:10px;align-items:center}*{box-sizing:border-box}@media(max-width:700px){main{padding:18px;margin:0}h1{font-size:27px}}');return;}
 if(url==='/api/avatars'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(catalog));return;}
 if(url.startsWith('/portrait/')){res.setHeader('Content-Type','image/webp');res.end(image);return;}
 if(url.startsWith('/extrait/')){const range=/bytes=(\d+)-(\d*)/.exec(req.headers.range??''),offset=Number(range?.[1]??0),end=range?.[2]?Math.min(Number(range[2]),video.length-1):video.length-1;
  res.statusCode=range?206:200;res.setHeader('Content-Type','video/mp4');res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Length',end-offset+1);
  if(range)res.setHeader('Content-Range',`bytes ${offset}-${end}/${video.length}`);res.end(video.subarray(offset,end+1));return;}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:resolve('apps/renderer/node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell')});
const reports=[];
try {for(const width of [1536,390]){
 const context=await browser.newContext({viewport:{width,height:1000},...(width===390?{isMobile:true,hasTouch:true}:{})}),page=await context.newPage(),requests=[],errors=[];
 page.on('request',r=>requests.push(new URL(r.url()).pathname));page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});await page.locator('.avatar-look').first().waitFor();
 assert.equal(requests.filter(p=>p==='/api/avatars').length,1,'Catalogue fetched once despite parent + controls');
 const initialPortraits=requests.filter(p=>p.startsWith('/portrait/')).length;assert.ok(initialPortraits<12,`Offscreen portraits must stay unloaded (${initialPortraits})`);
 assert.equal(requests.filter(p=>p.startsWith('/extrait/')).length,0,'No eager videos');
 const card=page.locator('.avatar-look').first();
 if(width===1536){await card.hover();await page.waitForTimeout(350);await page.mouse.move(10,10);await page.waitForTimeout(600);
  assert.equal(requests.filter(p=>p.startsWith('/extrait/')).length,0,'Brief hover does not fetch video');
  await card.hover();await card.locator('video').waitFor({timeout:30000});await page.waitForFunction(()=>{const v=document.querySelector('.avatar-look video');return v&&!v.paused&&v.currentTime>0;},{},{timeout:30000});
  assert.equal(await card.locator('video').evaluate(v=>v.muted&&v.playsInline),true);assert.equal(await page.locator('video').count(),1);
  await page.screenshot({path:resolve(out,'hover-1536.png'),fullPage:true});await page.mouse.move(10,10);await page.waitForFunction(()=>!document.querySelector('.avatar-look video'));
 }else {await card.getByRole('button',{name:'Voir un extrait'}).tap();await card.locator('video').waitFor();assert.equal(await card.locator('video').evaluate(v=>v.muted),true);
  await page.screenshot({path:resolve(out,'picker-390.png'),fullPage:true});await card.getByRole('button',{name:'Fermer l’extrait'}).tap();await page.waitForFunction(()=>!document.querySelector('.avatar-look video'));
 }
 await page.getByLabel('Rechercher un avatar').fill('Avatar 99');assert.equal(await page.locator('.avatar-look').count(),1);await page.locator('.avatar-look').getByRole('button').first().click();assert.equal(await page.locator('output').innerText(),'look-99');
 await page.getByLabel('Rechercher un avatar').fill('');await page.getByLabel('Genre du présentateur').selectOption('female');assert.equal(await page.locator('.avatar-look').count(),50);
 await page.getByLabel('Genre du présentateur').selectOption('all');await page.getByRole('button',{name:'Avatars suivants'}).click();await page.waitForTimeout(500);
 assert.ok(await page.locator('.avatar-look-strip').evaluate(e=>e.scrollLeft)>0);assert.ok(requests.filter(p=>p.startsWith('/portrait/')).length>initialPortraits);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);assert.deepEqual(errors,[]);
 await page.screenshot({path:resolve(out,`picker-${width}.png`),fullPage:true});
 reports.push({width,catalogRequests:1,initialPortraits,total:100,inlineMuted:true,delayedHover:width===1536,mobileTap:width===390,stopOnLeave:true,searchAndSelection:true,horizontalScroll:true,noOverflow:true,providerCalls:0});await context.close();
 }await writeFile(resolve(out,'ui-report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
}finally{await browser.close();await new Promise(r=>server.close(r));}
