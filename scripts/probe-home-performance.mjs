// Real production build in a local browser; provider APIs are fixtures.
// This probe never imports a real listing, bypasses Turnstile or generates media.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {VoiceCatalog,frenchVoices,cartesiaParisianVoices,voiceGender,DEFAULT_VIDEO_VOICE} from '../packages/contracts/src/index.ts';

const base=process.env.PROBE_URL??'http://localhost:8787';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('LOCAL_TARGET_REQUIRED');
const output='evidence/local/home-performance',results=[];await mkdir(output,{recursive:true});
const defaultVoice=cartesiaParisianVoices.find(voice=>voice.id!==DEFAULT_VIDEO_VOICE).id;
const catalog=VoiceCatalog.parse({revision:1,defaultVoice,voices:frenchVoices.map(voice=>({id:voice.id,name:voice.name,gender:voiceGender(voice.id),provider:voice.id.startsWith('cartesia-')?'cartesia':voice.id.startsWith('fish-')?'fish':'google',model:'Fixture',accent:'Français',available:true}))});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const width of [1365,390]){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<760,isMobile:width<760}),errors=[],unexpected=[];
  const counts=new Map();let releaseVoice,voiceResolved=false;
  const heldVoice=new Promise(resolve=>{releaseVoice=resolve;});
  await context.route('https://embed.tawk.to/**',route=>route.abort());
  await context.route('https://eu.i.posthog.com/**',route=>route.abort());
  await context.route('**/api/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;counts.set(path,(counts.get(path)??0)+1);
   if(path==='/api/metrics/web-vitals')return route.fulfill({status:204});
   if(request.method()!=='GET'&&request.method()!=='HEAD'){unexpected.push(path);return route.fulfill({status:500,json:{error:{code:'PROBE_WRITE_REJECTED'}}});}
   if(path==='/api/me')return route.fulfill({status:401,json:{error:{code:'UNAUTHORIZED'}}});
   if(path==='/api/voices'){await heldVoice;voiceResolved=true;return route.fulfill({json:catalog});}
   if(path==='/api/trial/history')return route.fulfill({json:{jobs:[],creditsRemaining:0,nextCursor:null}});
   if(path==='/api/trial')return route.fulfill({json:{enabled:false,siteKey:null,used:false,job:null}});
   if(path==='/api/analytics/config')return route.fulfill({json:{enabled:true,token:'phc_public_home_performance_fixture',host:'https://eu.i.posthog.com',replay:true,errorTracking:true}});
   if(path==='/api/avatars')return route.fulfill({json:{enabled:false,allowPremium:false,maxSeconds:6,defaultLookId:null,looks:[]}});
   if(path==='/api/video-defaults')return route.fulfill({status:503,json:{error:{code:'FIXTURE_DISABLED'}}});
   if(path.startsWith('/api/homepage/media/'))return route.continue();
   unexpected.push(path);return route.fulfill({status:500,json:{error:{code:'PROBE_UNEXPECTED_API'}}});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('.home-composer button[type=submit]')?.disabled===false);
  await page.getByRole('complementary',{name:'Vos choix de confidentialité'}).waitFor({state:'visible'});
  assert.equal(voiceResolved,false,'La création et le consentement sont disponibles avant la réponse du catalogue vocal');
  await page.waitForFunction(()=>document.querySelector('.home-plan')?.textContent.includes('0 crédit d’essai'));
  assert.equal(counts.get('/api/trial/history'),1,'Une seule réponse alimente les essais et les crédits de la sidebar');
  assert.equal(counts.get('/api/avatars')??0,0,'Le catalogue des avatars attend la personnalisation');
  assert.equal(counts.get('/api/video-defaults')??0,0);
  const voiceResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/voices');releaseVoice();await voiceResponse;
  await page.getByRole('button',{name:'Tout refuser',exact:true}).first().click();
  assert.equal(await page.locator('script[src*="embed.tawk.to"]').count(),0,'Le support reste à la demande');
  if(width>760){
   await page.waitForFunction(()=>{const video=document.querySelector('.home-hero-demo>video');return video&&!video.paused&&video.currentTime>0;});
   await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));
   await page.waitForFunction(()=>document.querySelector('.home-hero-demo>video')?.paused===true);
   await page.evaluate(()=>scrollTo(0,0));
  }else assert.equal(await page.locator('.home-hero-demo>video').evaluate(video=>video.paused),true,'Pas de lecture automatique sur mobile');
  await page.screenshot({path:`${output}/home-${width}.png`});
  await page.getByRole('button',{name:'Saisie manuelle',exact:true}).click();
  await page.locator('#manual-guided-form').waitFor({state:'visible'});
  assert.equal(counts.get('/api/avatars')??0,0,'Ouvrir la saisie manuelle ne télécharge pas les outils avatar');
  await page.locator('.home-manual-settings summary').click();
  await page.getByRole('button',{name:'Personnaliser la vidéo',exact:true}).click();
  await page.locator('.video-customizer').waitFor({state:'visible'});
  await page.getByRole('tab',{name:'Voix et texte',exact:true}).click();
  assert.equal(await page.locator('#customizer-selected-voice').inputValue(),defaultVoice,'La personnalisation utilise la voix par défaut reçue, sans course avec l’authentification');
  await page.screenshot({path:`${output}/customizer-${width}.png`});
  await page.locator('.customizer-topline button').first().click();
  await page.locator('#manual-guided-form').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  results.push({width,consentBeforeVoices:true,singleTrialHistory:true,defaultVoicePreserved:true,manualAndCustomizer:true,heroPausedOffscreen:width>760,providerCalls:0,errors});
  await context.close();
 }
 await writeFile(output+'/browser.json',JSON.stringify({results,realProviders:false},null,2));console.log(JSON.stringify({passed:true,results}));
}finally{await browser.close();}
