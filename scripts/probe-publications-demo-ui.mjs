// Real calendar and media, controlled account context; no social publication.
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const out=resolve('evidence/local/publications-demo');await mkdir(out,{recursive:true});
const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('tsx'))('esbuild');
const bundle=await esbuild.build({stdin:{contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{SocialCalendar}from'./components/social-calendar';import{AccountFixtureProvider}from'./components/account';
function App(){const [signed,setSigned]=useState(false);return <><nav className="fixture-navigation"><button onClick={()=>setSigned(false)}>Visiteur</button><button onClick={()=>setSigned(true)}>Compte de recette</button></nav><AccountFixtureProvider value={{me:signed?{agency:{id:'fixture'},role:'owner'}:null,loading:false,error:'',refresh(){}}}><SocialCalendar/></AccountFixtureProvider></>};createRoot(document.getElementById('root')).render(<App/>);`,loader:'tsx',resolveDir:resolve('apps/web')},bundle:true,platform:'browser',format:'iife',jsx:'automatic',minify:true,write:false,
  loader:{'.css':'empty'},define:{'process.env':'{}','process.env.NODE_ENV':'"production"'},plugins:[{name:'controlled-account-context',setup(build){
    build.onResolve({filter:/(?:^|\/)account$/},()=>({path:'account',namespace:'calendar-fixture'}));
    build.onLoad({filter:/.*/,namespace:'calendar-fixture'},()=>({contents:"import React,{createContext,useContext}from'react';const context=createContext(null);export const AccountFixtureProvider=context.Provider;export function useAccount(){return useContext(context)}",loader:'jsx',resolveDir:resolve('apps/web')}));
    build.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'link-fixture'}));
    build.onLoad({filter:/.*/,namespace:'link-fixture'},()=>({contents:"import React from'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}",loader:'jsx',resolveDir:resolve('apps/web')}));
  }}]});
const css=(await Promise.all(['apps/web/app/landing.css','apps/web/components/social.css','apps/web/app/dialog-backdrop.css'].map(p=>readFile(p,'utf8')))).join('\n');
const assetRoot=resolve('apps/web/public');
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].contents);return;}
 if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css+'body{margin:0;background:#fbfaf7;font-family:Arial,sans-serif}*{box-sizing:border-box}.fixture-navigation{display:flex;gap:15px;padding:14px 20px}.home-studio main{padding:20px}');return;}
 if(url.pathname==='/api/social/publications'){
  const month=new Date(url.searchParams.get('from')),at=new Date(month.getFullYear(),month.getMonth(),10,12).toISOString();
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({configured:true,alerts:0,nextCursor:null,publications:[{id:'fixture-post',jobId:'fixture-video',title:'Publication privée de recette',caption:'Légende de recette.',scheduledAt:at,createdAt:at,expiresAt:at,timezone:'Europe/Paris',aspectRatio:'9:16',durationSeconds:20,videoUrl:'/videos/studio-home/paris.mp4',targets:[{id:'fixture-target',connectionId:'fixture-connection',platform:'instagram',name:'Agence de recette',status:'scheduled',errorCode:null,permalink:null,publishedAt:null}]}]}));return;
 }
 if(url.pathname==='/api/generations/fixture-video/source-photo'){res.setHeader('Content-Type','image/webp');res.end(await readFile(assetRoot+'/images/studio-home/paris-320.webp'));return;}
 if(url.pathname.startsWith('/images/')||url.pathname.startsWith('/videos/')){
  const file=resolve(assetRoot,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(assetRoot+'/')){res.statusCode=404;res.end();return;}
  let bytes;try{bytes=await readFile(file);}catch{res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',extname(file)==='.mp4'?'video/mp4':'image/webp');res.setHeader('Cache-Control','public, max-age=3600');
  const range=/bytes=(\d+)-(\d*)/.exec(req.headers.range??''),start=Number(range?.[1]??0),end=range?.[2]?Math.min(Number(range[2]),bytes.length-1):bytes.length-1;
  res.statusCode=range?206:200;res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Length',end-start+1);if(range)res.setHeader('Content-Range',`bytes ${start}-${end}/${bytes.length}`);res.end(bytes.subarray(start,end+1));return;
 }
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div class="home-studio"><main><div id="root"></div></main></div><script src="/bundle.js"></script>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const live=process.env.BIENVU_PUBLICATIONS_URL,base=live??'http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'/Users/alexlevy0/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell'}),reports=[];
try{for(const width of live?[1536,390]:[1536,1100,768,390,320]){
 const context=await browser.newContext({timezoneId:'Europe/Paris',viewport:{width,height:1100},...(width<600?{isMobile:true,hasTouch:true}:{})}),page=await context.newPage(),requests=[],errors=[];
 page.on('request',r=>requests.push({path:new URL(r.url()).pathname,method:r.method()}));page.on('pageerror',e=>errors.push(e.message));
 if(live){await page.route('**/*posthog*',route=>route.abort());await page.route('**/*tawk*',route=>route.abort());}
 await page.goto(live?base+'/publications?post=foreign-private-fixture':base);await page.locator('.social-calendar-cover').first().waitFor();
 if(live){const refuse=page.getByRole('button',{name:'Tout refuser',exact:true});if(await refuse.isVisible())await refuse.click();}
 assert.equal(await page.locator('.social-publication-card').count(),24);assert.equal(await page.locator('.social-calendar-days>button').count(),42);assert.equal(await page.locator('.has-demo-cover').count(),23);
 assert.equal(requests.some(r=>r.path.startsWith('/api/social/')),false);assert.equal(requests.some(r=>r.path.startsWith('/videos/')),false);assert.equal(await page.locator('video').count(),0);
 await page.waitForFunction(()=>[...document.querySelectorAll('.social-calendar-cover')].filter(img=>img.getBoundingClientRect().top<innerHeight).every(img=>img.complete&&img.naturalWidth>0));
 assert.ok(await page.locator('.social-calendar-cover,.social-publication-thumb img').evaluateAll(images=>images.every(img=>new URL(img.currentSrc||img.src).pathname.endsWith('-320.webp'))));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
 await page.screenshot({path:resolve(out,(live?'published-':'local-')+width+'.png'),fullPage:false});
 await page.locator('.social-calendar-grid').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,(live?'published-grid-':'local-grid-')+width+'.png')});
 const month=await page.locator('.social-month-navigation h2').textContent();await page.getByRole('button',{name:'Mois suivant',exact:true}).click();await page.waitForFunction(previous=>document.querySelector('.social-month-navigation h2').textContent!==previous,month);
 await page.getByRole('button',{name:'À venir',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.social-publication-card').length===24);
 await page.getByRole('button',{name:'Publiées',exact:true}).click();await page.getByRole('heading',{name:'Aucune publication dans ce filtre.'}).waitFor();
 await page.getByRole('button',{name:'Toutes',exact:true}).click();await page.getByRole('button',{name:'Aujourd’hui',exact:true}).click();await page.waitForFunction(previous=>document.querySelector('.social-month-navigation h2').textContent===previous,month);
 const double=page.locator('.social-calendar-days>button').filter({has:page.locator('.social-demo-count', {hasText:'2'})});await double.click();await page.waitForFunction(()=>document.querySelectorAll('.social-publication-card').length===2);assert.equal(await double.getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'Afficher tout le mois',exact:true}).click();await page.locator('.social-publication-thumb').first().click();await page.waitForFunction(()=>document.querySelector('.social-video-dialog')?.open&&document.querySelector('video')?.readyState>=2);
 assert.equal(await page.locator('.social-video-dialog video').evaluate(v=>v.playsInline),true);await page.getByRole('button',{name:'Fermer',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('video'));
 assert.ok(await page.locator('.social-preview-notice a').getAttribute('href').then(href=>href.includes('next=%2Fpublications')));
 assert.equal(requests.some(r=>r.path.startsWith('/api/social/')||r.path.startsWith('/api/generations/')),false);
 if(!live){await page.getByRole('button',{name:'Compte de recette',exact:true}).click();await page.getByRole('heading',{name:'Publication privée de recette'}).waitFor();assert.equal(await page.locator('.social-preview-notice').count(),0);assert.equal(await page.locator('.social-calendar-cover').count(),0);assert.equal(await page.locator('.social-publication-card').count(),1);assert.ok(requests.some(r=>r.path==='/api/social/publications'));}
 assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));reports.push({width,publications:24,illustratedDates:23,smallPublicPosters:true,noInitialVideo:true,noGuestSocialRequests:true,filtersAndMonth:true,multiplePostsOnOneDay:true,previewPlayback:true,privateCalendarPreserved:!live,noOverflow:true});await context.close();
 }await writeFile(resolve(out,live?'published-browser.json':'browser.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify({passed:true,live:!!live,reports}));
}finally{await browser.close();server.close();}
