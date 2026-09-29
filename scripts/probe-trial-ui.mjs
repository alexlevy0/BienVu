// UI-only fixtures on loopback. Security/ledger tests use real D1 separately.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createServer} from 'node:http';
import path from 'node:path';
const base=process.env.BIENVU_TRIAL_UI_URL??'http://localhost:8790';if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('LOCAL_ONLY');
const directory=path.resolve('evidence/local/trial-ui');await mkdir(directory,{recursive:true});
const mediaRoot=path.resolve('evidence/local/anonymous-video');
const media=createServer(async(req,res)=>{const file=({'/preview.mp4':'preview.mp4','/video.mp4':'video.mp4','/poster.png':'preview-0.png'})[req.url];if(!file){res.writeHead(404);res.end();return;}const size=(await stat(path.join(mediaRoot,file))).size;res.writeHead(200,{'Content-Type':file.endsWith('png')?'image/png':'video/mp4','Content-Length':size,'Access-Control-Allow-Origin':'*'});createReadStream(path.join(mediaRoot,file)).pipe(res);});
await new Promise(resolve=>media.listen(0,'127.0.0.1',resolve));const mediaBase=`http://127.0.0.1:${media.address().port}`;
const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url)),{openBrowser}=require('@remotion/renderer');const browser=await openBrowser('chrome',{logLevel:'error'});
const at=new Date().toISOString(),expires=new Date(Date.now()+86400_000).toISOString();
const job={id:'ui-anonymous-fixture',title:'Appartement de recette à Lyon',status:'rendering',stage:'rendering',attempt:1,errorCode:null,createdAt:at,updatedAt:at,expiresAt:expires,videoUrl:null,downloadUrl:null,durationSeconds:20.16,syntheticVoice:true,retryAllowed:false,ownership:'anonymous',masterAccess:'locked',retention:'available'};
const account={user:{id:'fixture-owner',name:'Alex Recette',email:'fixture@example.com'},agency:{id:'fixture-agency',ownerUserId:'fixture-owner',name:'Mon agence',logoAssetId:null,primaryColor:'#E1E8D9',secondaryColor:'#171714',phone:null,email:'fixture@example.com',website:null,createdAt:at,updatedAt:at,brandVersion:0},rights:{generationEnabled:true,developmentRemaining:2,renewalAt:expires,creditKind:'free',importRetryAt:null,trial:'eligible',watermarked:true}};
const injection=`(()=>{
  const key='bienvu-trial-ui-fixture';const read=()=>JSON.parse(localStorage.getItem(key)||'{"starts":0}');const save=s=>localStorage.setItem(key,JSON.stringify(s));const native=window.fetch.bind(window);
  const fresh=${JSON.stringify(job)},account=${JSON.stringify(account)},media=${JSON.stringify(mediaBase)};
  const view=s=>s.job?{...s.job,videoUrl:s.job.status==='ready'?media+(s.owned?'/video.mp4':'/preview.mp4'):null,downloadUrl:s.owned?media+'/video.mp4':null,ownership:s.owned?'owned':'anonymous',masterAccess:s.owned?'unlocked':'locked'}:null;
  window.turnstile={render:(node,options)=>{window.__trialChallengeReady=false;node.textContent='Vérification simulée — recette locale';setTimeout(()=>{options.callback('fixture-token');requestAnimationFrame(()=>requestAnimationFrame(()=>{window.__trialChallengeReady=true;}));},0);return 'fixture-widget';},remove:()=>{window.__trialChallengeReady=false;},reset:()=>{window.__trialChallengeReady=false;}};
  window.fetch=async(input,options={})=>{const p=new URL(typeof input==='string'?input:input.url,location.href).pathname,s=read(),json=(body,status=200)=>Promise.resolve(new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}));
    if(p==='/api/me')return s.signed?json(account):json({},401);
    if(p==='/api/auth/status')return json({google:true,emailDelivery:true});
    if(p==='/api/auth/sign-in/email'){s.signed=true;save(s);return json({ok:true});}
    if(p==='/api/trial'&&options.method==='POST'){if(s.forceError)return json({error:{code:'TRIAL_LIMIT',message:'La limite des essais est atteinte. Réessayez plus tard ou connectez-vous.'}},429);if(!s.job){s.job=fresh;s.starts++;save(s);}return json(view(s));}
    if(p==='/api/trial'){window.__trialRead=true;return json({enabled:true,siteKey:'fixture-site-key',used:s.job?.status==='ready',hasIntent:!!s.intent,job:view(s)});}
    if(p.endsWith('/login')){s.intent=true;save(s);return json({url:'/connexion?trial=1'});}
    if(p==='/api/trial/claim'){if(!s.job)return json({error:{code:'NOT_FOUND'}},404);s.owned=true;save(s);return json(view(s));}
    if(p==='/api/generations/shares')return json({shares:[]});
    if(p==='/api/generations')return json({jobs:s.owned?[view(s)]:[],nextCursor:null});
    if(p==='/api/generations/ui-anonymous-fixture')return json(view(s));
    if(p==='/api/explorer')return json({videos:[],nextCursor:null});
    return native(input,options);
  };
})();`;
const reports=[];
try {
 for(const width of [1536,390]){
  const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:width,onBrowserLog:null,onLog:()=>{}}),cdp=page._client();
  await page.setViewport({width,height:width===1536?1024:844,deviceScaleFactor:1});await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:injection});
  const evaluate=async expression=>{const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});assert.ok(!r.value.exceptionDetails,JSON.stringify(r.value.exceptionDetails));return r.value.result.value;};
  const wait=async expression=>{let last;for(let i=0;i<300;i++){try{if(await evaluate(`!!(${expression})`))return;}catch(error){last=error;}await new Promise(r=>setTimeout(r,100));}console.log(await evaluate('document.body.innerText'));throw Error(`WAIT: ${expression}; ${last??''}`);};
  const play=async()=>{await wait("document.querySelector('video.generated-video')?.readyState>=2");await evaluate("(async()=>{const v=document.querySelector('video.generated-video');v.muted=true;await v.play();})()");await wait("document.querySelector('video.generated-video').currentTime>.2");await evaluate("document.querySelector('video.generated-video').pause()");};
  const go=async url=>{await page.goto({url,timeout:60000,options:{waitUntil:'load'}});};
  const shot=async name=>{console.log(`UI ${width}: ${name}`);await evaluate('document.fonts.ready');const r=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(directory,`${name}-${width}.png`),Buffer.from(r.value.data,'base64'));};
  await go(base);await evaluate("localStorage.removeItem('bienvu-trial-ui-fixture')");await go(base);
  await wait("document.querySelector('#home-create-note')?.textContent.includes('Connectez-vous pour télécharger')&&window.__trialRead&&!document.querySelector('.home-primary-button').disabled");await new Promise(r=>setTimeout(r,300));
  await evaluate("document.querySelector('#home-listing-url').focus()");await cdp.send('Input.insertText',{text:'https://www.century21.fr/trouver_logement/detail/123456/'});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await wait("document.querySelector('.trial-challenge')?.textContent.includes('simulée')&&window.__trialChallengeReady&&!document.querySelector('.home-primary-button').disabled");await evaluate("document.querySelector('.home-composer').requestSubmit()");
  await wait("document.querySelector('.trial-result h3')?.textContent.includes('Préparation')");await shot('progress');
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('bienvu-trial-ui-fixture')).starts"),1);
  await evaluate("(()=>{const s=JSON.parse(localStorage.getItem('bienvu-trial-ui-fixture'));s.job.status='ready';localStorage.setItem('bienvu-trial-ui-fixture',JSON.stringify(s));})()");await go(base);
  await wait("document.querySelector('.trial-result video')?.readyState>=1");await play();await evaluate("document.querySelector('.trial-result').scrollIntoView()");await shot('preview');
  assert.equal(await evaluate("document.querySelector('.trial-result a[download]')"),null);
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  await evaluate("[...document.querySelectorAll('.trial-result button')].find(b=>b.textContent.includes('Télécharger sans')).click()");
  await wait("location.pathname==='/connexion'&&document.querySelector('.auth-form')");await shot('login');
  // Cancellation returns to the same preview; no new generation.
  await go(base+'/connexion?error=oauth&trial=1');await wait("document.querySelector('.auth-box')");await evaluate("[...document.querySelectorAll('.auth-box a')].find(a=>a.textContent.includes('Revenir à ma vidéo')).click()");await wait("location.pathname==='/'&&document.querySelector('.trial-result video')");
  await go(base+'/connexion?trial=1');await wait("document.querySelector('#auth-email')");
  await evaluate(`(()=>{for(const [id,v]of [['auth-email','fixture@example.com'],['auth-password','fixture-password-123']]){const n=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,v);n.dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('.auth-form').requestSubmit();})()`);
  // Navigation destroys the execution context: wait from Node between checks.
  let connected=false;for(let i=0;i<300;i++){try{connected=await evaluate("location.pathname==='/historique/ui-anonymous-fixture'&&!!document.querySelector('a[download]')");if(connected)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(connected);
  await play();await evaluate("document.querySelector('a[download]').scrollIntoView({block:'center'})");await shot('claimed');assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('bienvu-trial-ui-fixture')).starts"),1);
  await evaluate("localStorage.setItem('bienvu-trial-ui-fixture',JSON.stringify({signed:true,starts:0}))");await go(base+'/essai/recuperer');await wait("document.body.textContent.includes('navigateur dans lequel')");await shot('other-browser');
  await evaluate("localStorage.setItem('bienvu-trial-ui-fixture',JSON.stringify({starts:0,forceError:true}))");await go(base);
  await wait("window.__trialRead&&!document.querySelector('.home-primary-button').disabled");await new Promise(r=>setTimeout(r,300));await evaluate(`(()=>{const n=document.querySelector('#home-listing-url');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,'https://www.century21.fr/trouver_logement/detail/123456/');n.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.home-composer').requestSubmit();})()`);await wait("document.querySelector('.trial-challenge')&&window.__trialChallengeReady&&!document.querySelector('.home-primary-button').disabled");await evaluate("document.querySelector('.home-composer').requestSubmit()");await wait("document.querySelector('.home-form-feedback')?.textContent.includes('limite des essais')");await shot('limit');
  reports.push({width,fixtureApis:true,fixtureTurnstile:true,realMediaPlayback:true,keyboardSubmit:true,noHorizontalOverflow:true,refreshSameJob:true,authCancelPreservesPreview:true,emailReturn:true,missingProofMessage:true,limitMessage:true,paidCalls:0});
 }
 await writeFile(path.join(directory,'browser-report.json'),JSON.stringify({at:new Date().toISOString(),base,physicalDevice:false,reports},null,2));console.log(JSON.stringify({passed:true,reports}));
}finally{await browser.close({silent:true});await new Promise(resolve=>media.close(resolve));}
