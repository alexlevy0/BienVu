// Actual admin/mailbox components with local HTTP fixtures. No real email is sent.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {mailHtmlDocument} from '../apps/web/lib/mail-html.ts';
const root=new URL('../',import.meta.url),output=new URL('../evidence/local/admin-mailboxes/',import.meta.url);
await mkdir(output,{recursive:true});
const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('tsx/package.json'))('esbuild');
const build=await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{AdminPanel}from'./components/admin-panel';createRoot(document.getElementById('root')).render(<AdminPanel restricted={location.search.includes('role=greg')}/>);`,resolveDir:new URL('../apps/web/',import.meta.url).pathname,loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',minify:true,loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},plugins:[{name:'local-account',setup(build){
  build.onResolve({filter:/^\.\/account$/},()=>({path:'account',namespace:'fixture'}));
  build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export function useAccount(){const greg=location.search.includes('role=greg');return {me:{isAdmin:greg,isSuperAdmin:!greg,user:{id:'ui-staff'}},loading:false,refreshRights:async()=>{}}}`,loader:'js'}));
}}]});
const css=(await Promise.all(['apps/web/app/style.css','apps/web/app/landing.css','apps/web/app/admin/admin.css','apps/web/app/admin/mailbox.css'].map(path=>readFile(new URL(path,root),'utf8')))).join('\n');
const at=new Date().toISOString(),boxes=['contact@bienvu.online','alex@bienvu.online','greg@bienvu.online'],requests=[];
const thread=(box)=>({id:'thread-'+box.split('@')[0],subject:'Votre annonce à Lyon',peerEmail:'client@example.com',peerName:'Camille Martin',snippet:'Voici votre annonce.',folder:'inbox',unread:0,messageCount:1,attachmentCount:0,lastAt:at,lastDirection:'in'});
let base='';
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),json=body=>{res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  requests.push(url.pathname+url.search);
  if(url.pathname==='/bundle.js'){res.writeHead(200,{'Content-Type':'application/javascript'});return res.end(build.outputFiles[0].contents);}
  if(url.pathname==='/style.css'){res.writeHead(200,{'Content-Type':'text/css'});return res.end(css);}
  if(url.pathname==='/linked'){res.writeHead(200,{'Content-Type':'text/html'});return res.end('<h1>Annonce ouverte</h1>');}
  if(url.pathname.startsWith('/api/admin/mailbox')){
    const box=url.searchParams.get('mailbox')??(req.headers.referer?.includes('role=greg')?boxes[2]:boxes[0]);
    if(url.pathname.endsWith('/html')){
      const raw=`From: client@example.com\r\nTo: ${box}\r\nSubject: Annonce\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n<table style="width:100%"><tr><td style="background-color:#e5ecdf;padding:28px"><h1>Votre annonce est prête</h1><p>Découvrez votre appartement à Lyon.</p><a href="${base}/linked" style="display:inline-block;background-color:#285039;color:white;padding:14px;border-radius:8px">Ouvrir mon annonce</a></td></tr></table><script>parent.hacked=true</script><img src="https://evil.example/pixel">`;
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','X-Frame-Options':'SAMEORIGIN','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'; sandbox allow-popups allow-popups-to-escape-sandbox"});return res.end(await mailHtmlDocument(new TextEncoder().encode(raw).buffer));
    }
    if(url.pathname==='/api/admin/mailbox')return json({address:box,mailboxes:box===boxes[2]?[boxes[2]]:boxes.slice(0,2),enabled:true,items:[thread(box)],nextCursor:null,counts:{inbox:1,unread:0,archived:0,spam:0,sent:0}});
    return json({thread:thread(box),messages:[{id:'message-'+box.split('@')[0],threadId:thread(box).id,direction:'in',fromEmail:'client@example.com',fromName:'Camille Martin',toEmail:box,replyTo:null,subject:'Votre annonce à Lyon',text:'Découvrez votre annonce '+base+'/linked',truncated:false,at,delivery:'received',error:null,attempts:0,attachments:[],hasOriginal:true}],olderCursor:null,readThrough:null,client:null});
  }
  if(url.pathname==='/api/admin')return json({rows:[],total:0,nextCursor:null});
  if(url.pathname.startsWith('/fonts/')){try{const content=await readFile(new URL('apps/web/public'+url.pathname,root));res.writeHead(200);return res.end(content);}catch{res.writeHead(404);return res.end();}}
  res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})}),results=[];
try{
  for(const role of ['greg','alex'])for(const width of [1536,390]){
    const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{if(!route.request().url().startsWith(base)){external.push(route.request().url());return route.abort();}return route.continue();});
    await page.goto(base+'/?role='+role+'&view=mailbox');try{await page.locator('.mailbox-selector select').waitFor({timeout:10000});}catch(cause){console.log(JSON.stringify({role,errors,html:await page.locator('body').innerText(),requests}));throw cause;}
    const labels=await page.locator('.admin-tabs button').allTextContents();if(role==='greg')assert.deepEqual(labels,['Vidéos','Agences','Comptes','Messagerie']);
    assert.equal(await page.locator('.mailbox-selector select').inputValue(),role==='greg'?boxes[2]:boxes[0]);
    if(role==='alex'){await page.locator('.mailbox-selector select').selectOption(boxes[1]);await page.getByText(boxes[1],{exact:true}).last().waitFor();}
    await page.locator('.mailbox-thread').first().click();
    const frame=page.frameLocator('.mailbox-html');await frame.getByRole('link',{name:'Ouvrir mon annonce'}).waitFor();
    assert.equal(await page.evaluate(()=>window.hacked),undefined);assert.equal(external.some(url=>url.includes('evil.example')),false);
    assert.equal(await page.evaluate(()=>{try{document.querySelector('iframe').contentWindow.document;return false;}catch{return true;}}),true,'Le HTML ne partage pas l’origine du panneau');
    const popupPromise=page.waitForEvent('popup');await frame.getByRole('link',{name:'Ouvrir mon annonce'}).click();const popup=await popupPromise;await popup.waitForLoadState();assert.equal(popup.url(),base+'/linked');assert.equal(await popup.evaluate(()=>window.opener),null);await popup.close();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Pas de débordement horizontal');
    await page.screenshot({path:new URL(`${role}-${width}.png`,output).pathname,fullPage:true});
    await page.getByRole('button',{name:'Texte',exact:true}).click();await page.locator('.mailbox-body pre a').waitFor();
    assert.equal(await page.locator('.mailbox-body pre a').getAttribute('target'),'_blank');
    if(role==='alex'){
      await page.getByRole('button',{name:'Nouveau message'}).click();await page.locator('.mailbox-compose textarea').fill('Brouillon conservé pour Alex');
      await page.locator('.mailbox-selector select').selectOption(boxes[0]);await page.getByText(boxes[0],{exact:true}).last().waitFor();
      await page.locator('.mailbox-selector select').selectOption(boxes[1]);await page.getByRole('button',{name:'Nouveau message'}).click();
      assert.equal(await page.locator('.mailbox-compose textarea').inputValue(),'Brouillon conservé pour Alex');
    }
    assert.deepEqual(errors,[]);
    results.push({role,width,tabs:labels.length,links:true,isolatedHtml:true});await page.close();
  }
  await writeFile(new URL('report.json',output),JSON.stringify({results,requests},null,2));console.log(JSON.stringify(results));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
