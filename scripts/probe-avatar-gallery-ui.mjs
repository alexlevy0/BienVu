// Real gallery component, browser decoding and public media; no generation.
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const out=resolve('evidence/local/public-avatars');await mkdir(out,{recursive:true});
const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('tsx'))('esbuild');
const looks=Array.from({length:1257},(_,i)=>({id:'look-'+i,name:'Avatar '+String(i).padStart(4,'0'),gender:i%2?'male':'female',type:'studio_avatar',engines:['avatar_iii'],enabled:true,thumbnail:'/portrait/'+i,preview:'/excerpt/'+i,transparentVerified:false,ownership:'public',updatedAt:'2026-10-10'}));
const initial={looks:looks.slice(0,32),offset:0,total:looks.length,hasMore:true};
const bundle=await esbuild.build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{AvatarGallery}from'./components/avatar-gallery';createRoot(document.getElementById('gallery')).render(<AvatarGallery initial={${JSON.stringify(initial)}}/>);`,loader:'tsx',resolveDir:resolve('apps/web')},bundle:true,platform:'browser',format:'iife',jsx:'automatic',minify:true,write:false,define:{'process.env.NODE_ENV':'"production"'}});
const css=(await Promise.all(['landing.css','avatars.css','avatar/avatar.css'].map(path=>readFile('apps/web/app/'+path,'utf8')))).join('\n');
const portrait=await readFile('apps/web/public/images/studio-home/avatar-circle.webp'),video=await readFile('apps/web/public/videos/studio-home/avatar-circle.mp4');
let failNext=false;
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].contents);return;}
 if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
 if(url.pathname==='/api/avatars/gallery'){
  if(failNext){failNext=false;res.statusCode=503;res.end();return;}
  const query=url.searchParams.get('query')??'',gender=url.searchParams.get('gender')??'all',offset=Number(url.searchParams.get('offset')??0),filtered=looks.filter(l=>l.name.toLowerCase().includes(query.toLowerCase())&&(gender==='all'||l.gender===gender));
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({looks:filtered.slice(offset,offset+32),total:filtered.length,offset,hasMore:offset+32<filtered.length}));return;
 }
 if(url.pathname.startsWith('/portrait/')){res.setHeader('Content-Type','image/webp');res.end(portrait);return;}
 if(url.pathname.startsWith('/excerpt/')){const match=/bytes=(\d+)-(\d*)/.exec(req.headers.range??''),start=Number(match?.[1]??0),end=match?.[2]?Math.min(Number(match[2]),video.length-1):video.length-1;
  res.statusCode=match?206:200;res.setHeader('Content-Type','video/mp4');res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Length',end-start+1);if(match)res.setHeader('Content-Range',`bytes ${start}-${end}/${video.length}`);res.end(video.subarray(start,end+1));return;}
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div class="home-studio"><main class="avatar-page"><h1>Les avatars BienVu</h1><div id="gallery"></div><div style="height:1200px"></div></main></div><script src="/bundle.js"></script>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const live=process.env.BIENVU_AVATAR_URL,base=live??'http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'/Users/alexlevy0/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell'}),reports=[];
try{for(const width of live?[1536,390]:[1536,1100,900,768,390,320]){
 const context=await browser.newContext({viewport:{width,height:900},...(width<600?{isMobile:true,hasTouch:true}:{})}),page=await context.newPage(),requests=[],errors=[];
 await page.route(/posthog|tawk\.to/,route=>route.abort());page.on('request',request=>requests.push(request.url()));page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+(live?'/avatar':''),{waitUntil:'domcontentloaded',timeout:60000});
 await page.locator('.avatar-gallery-card').first().waitFor();await page.waitForFunction(()=>{const image=document.querySelector('.avatar-gallery-card img');return image?.complete&&image.naturalWidth>0;});
 await page.waitForTimeout(600);
 if(live){const refuse=page.getByRole('button',{name:'Tout refuser',exact:true});try{await refuse.waitFor({timeout:2000});await refuse.click();}catch{/* Choice may already be stored or delayed. */}}
 assert.equal(await page.locator('.avatar-gallery-card').count(),32);assert.equal(requests.filter(url=>url.includes('kind=preview')||url.includes('/excerpt/')).length,0);
 const initialPortraits=requests.filter(url=>url.includes('kind=thumbnail')||url.includes('/portrait/')).length;assert.ok(initialPortraits>0&&initialPortraits<25,`Visible portraits only: ${initialPortraits}`);
 const card=page.locator('.avatar-gallery-card').first(),second=page.locator('.avatar-gallery-card').nth(1);
 if(width===1536){await card.hover();await page.waitForTimeout(250);await page.mouse.move(0,0);await page.waitForTimeout(850);assert.equal(await page.locator('.avatar-gallery video').count(),0);
  await card.hover();await page.waitForFunction(()=>{const v=document.querySelector('.avatar-gallery video');return v&&!v.paused&&v.currentTime>.1;});
  assert.equal(await card.locator('video').evaluate(v=>v.muted&&v.playsInline),true);await second.hover();await second.locator('video').waitFor();assert.equal(await page.locator('.avatar-gallery video').count(),1);
  await page.mouse.move(0,0);await page.waitForFunction(()=>!document.querySelector('.avatar-gallery video'));
 }
 if(width===390){await card.getByRole('button').tap();await page.waitForFunction(()=>{const v=document.querySelector('.avatar-gallery video');return v&&!v.paused&&v.currentTime>.1;});assert.equal(await card.locator('video').evaluate(v=>v.muted),true);
  await page.screenshot({path:resolve(out,(live?'published-':'local-')+'preview-390.png')});
  await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await page.waitForFunction(()=>!document.querySelector('.avatar-gallery video'));await page.evaluate(()=>scrollTo(0,0));
 }
 if(width===1536||width===390){
  await page.getByLabel('Rechercher un avatar').fill(live?'Bryce':'Avatar 1256');await page.getByLabel('Rechercher un avatar').fill(live?'Bryce ':'Avatar 1256 ');await page.waitForTimeout(600);await page.waitForFunction(()=>document.querySelector('.avatar-gallery-grid').getAttribute('aria-busy')==='false');assert.ok(await page.locator('.avatar-gallery-card').count()>0);
  if(!live)assert.equal(await page.locator('.avatar-gallery-card').count(),1);
  await page.getByLabel('Rechercher un avatar').fill('does-not-exist-at-all');await page.getByRole('heading',{name:'Aucun avatar ne correspond à votre recherche.'}).waitFor();await page.getByRole('button',{name:'Voir tous les avatars'}).click();await page.waitForFunction(()=>document.querySelectorAll('.avatar-gallery-card').length===32);
  await page.getByLabel('Genre du présentateur').selectOption('female');await page.waitForTimeout(600);await page.waitForFunction(()=>document.querySelector('.avatar-gallery-grid').getAttribute('aria-busy')==='false');assert.ok(await page.locator('.avatar-gallery-card-info>span').evaluateAll(nodes=>nodes.every(n=>n.textContent==='Présentatrice')));
  await page.getByRole('button',{name:'Afficher plus d’avatars'}).click();await page.waitForFunction(()=>document.querySelectorAll('.avatar-gallery-card').length===64);
  if(!live){failNext=true;await page.getByLabel('Rechercher un avatar').fill('failure-test');await page.getByRole('alert').waitFor();await page.getByRole('button',{name:'Réessayer',exact:true}).click();await page.getByRole('heading',{name:'Aucun avatar ne correspond à votre recherche.'}).waitFor();}
  await page.getByLabel('Rechercher un avatar').fill('');await page.getByLabel('Genre du présentateur').selectOption('all');await page.waitForTimeout(600);
 }
 await page.waitForFunction(()=>document.querySelector('.avatar-gallery-grid').getAttribute('aria-busy')==='false');
 if(live){const refuse=page.getByRole('button',{name:'Tout refuser',exact:true});if(await refuse.isVisible())await refuse.click();}
 await page.evaluate(()=>scrollTo(0,0));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);assert.deepEqual(errors,[]);await page.screenshot({path:resolve(out,(live?'published-':'local-')+width+'.png')});
 if(live&&width===390){await page.locator('.avatar-gallery-grid').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,'published-grid-390.png')});}
 reports.push({width,initialPortraits,noInitialVideo:true,pagination:width===1536||width===390,delayedHover:width===1536,touchPreview:width===390,noOverflow:true});await context.close();
 }
 if(!live){const context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage();await page.goto(base);await page.locator('.avatar-gallery-card').first().hover();await page.waitForTimeout(1000);assert.equal(await page.locator('video').count(),0);await page.locator('.avatar-gallery-card').first().getByRole('button').click();await page.locator('video').waitFor();await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('video'));await context.close();}
 await writeFile(resolve(out,live?'published-browser.json':'browser.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify({live:!!live,reports,passed:true}));
}finally{await browser.close();server.close();}
