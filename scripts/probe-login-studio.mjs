import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';

const base = process.env.BIENVU_LOGIN_URL ?? 'http://localhost:8787';
const fixtures = process.argv.includes('--fixtures');
if (fixtures && !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('FIXTURES_LOCAL_ONLY');
const directory = fixtures ? 'evidence/local/login-studio' : 'evidence/remote/login-studio';
await mkdir(directory, {recursive: true});
const require = createRequire(new URL('../apps/renderer/package.json', import.meta.url));
const {openBrowser} = require('@remotion/renderer');
const browser = await openBrowser('chrome', {logLevel: 'error'});
const fixtureScript = `(()=>{const native=window.fetch.bind(window);window.fetch=(input,options)=>{const path=new URL(typeof input==='string'?input:input.url,location.href).pathname;if(path==='/api/me')return Promise.resolve(new Response('{}',{status:401,headers:{'Content-Type':'application/json'}}));if(path==='/api/auth/status')return Promise.resolve(new Response(JSON.stringify({google:true,emailDelivery:true}),{status:200,headers:{'Content-Type':'application/json'}}));return native(input,options);};})();`;
const reports = [];

try {
  for (const width of [1536, 390, 320]) {
    const page = await browser.newPage({context: () => null, logLevel: 'error', indent: false, pageIndex: width, onBrowserLog: null, onLog: () => {}});
    const cdp = page._client();
    await page.setViewport({width, height: width === 1536 ? 1024 : 900, deviceScaleFactor: 1});
    if (fixtures) await cdp.send('Page.addScriptToEvaluateOnNewDocument', {source: fixtureScript});
    const evaluate = async expression => {
      const response = await cdp.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true, userGesture: true});
      assert.ok(!response.value.exceptionDetails, JSON.stringify(response.value.exceptionDetails));
      return response.value.result.value;
    };
    const wait = async expression => evaluate(`(async()=>{for(let i=0;i<150;i++){if(${expression})return true;await new Promise(r=>setTimeout(r,100));}throw Error('WAIT_FAILED: '+${JSON.stringify(expression)});})()`);
    const shot = async name => {
      await evaluate('document.fonts.ready');
      await evaluate('(async()=>{await Promise.all([...document.images].map(image=>image.decode()));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));})()');
      const response = await cdp.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
      await writeFile(`${directory}/${name}.png`, Buffer.from(response.value.data, 'base64'));
    };
    await page.goto({url: `${base}/connexion`, timeout: 60000, options: {waitUntil: 'load'}});
    await wait("document.querySelector('.auth-box .google-button:not([disabled])')&&document.querySelector('.login-studio-demo-cover img')?.naturalWidth>0");
    const layout = await evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth,logo:document.querySelector('.login-studio-header .home-wordmark')?.textContent,poster:document.querySelector('.login-studio-demo-cover img')?.naturalWidth,title:document.querySelector('h1')?.textContent,auth:document.querySelector('.auth-box h2')?.textContent,showcase:document.querySelector('.login-studio-showcase').getBoundingClientRect().toJSON()})`);
    assert.equal(layout.overflow, false);
    assert.equal(layout.logo, 'bienvu');
    assert.equal(layout.auth, 'Heureux de vous retrouver.');
    assert.ok(layout.poster > 0);
    await shot(`login-${width}`);

    if (width === 1536) {
      await evaluate("(()=>{const button=document.querySelector('.login-studio-demo-cover');button.focus();button.click();})()");
      await wait("document.querySelector('.login-studio-dialog video')?.readyState>=2");
      const playback = await evaluate(`(async()=>{const video=document.querySelector('.login-studio-dialog video');await video.play();await new Promise(resolve=>setTimeout(resolve,350));return {duration:video.duration,width:video.videoWidth,height:video.videoHeight,time:video.currentTime};})()`);
      assert.equal(Math.round(playback.duration), 28);
      assert.ok(playback.time > 0);
      await shot('login-video');
      await evaluate("document.querySelector('.login-studio-dialog-close').click()");
      await wait("!document.querySelector('.login-studio-dialog')");
      assert.equal(await evaluate("document.activeElement?.classList.contains('login-studio-demo-cover')"), true);
      await evaluate("[...document.querySelectorAll('.auth-actions button')].find(button=>button.textContent.includes('Créer un compte')).click()");
      await wait("document.querySelector('.auth-box h2')?.textContent==='Créons votre compte.'");
      await shot('login-signup');
      await evaluate("[...document.querySelectorAll('.auth-actions button')].find(button=>button.textContent.includes('Revenir')).click()");
      await evaluate("document.querySelector('.auth-forgot').click()");
      await wait("document.querySelector('.auth-box h2')?.textContent==='Mot de passe oublié ?'");
      await shot('login-forgot');
      reports.push({width, fixtures, ...layout, playback, signupVisible: true, forgotVisible: true, providerCalls: 0});
    } else if (width === 390) {
      await evaluate("document.querySelector('.login-studio-showcase').scrollIntoView()");
      await shot('login-mobile-demo');
      await evaluate("(()=>{const button=document.querySelector('.login-studio-demo-cover');button.focus();button.click();})()");
      await wait("document.querySelector('.login-studio-dialog video')?.readyState>=2");
      const playback = await evaluate("(async()=>{const video=document.querySelector('.login-studio-dialog video');await video.play();await new Promise(resolve=>setTimeout(resolve,250));return {duration:video.duration,time:video.currentTime};})()");
      assert.equal(Math.round(playback.duration), 28);
      assert.ok(playback.time > 0);
      await shot('login-mobile-video');
      await evaluate("document.querySelector('.login-studio-dialog-close').click()");
      reports.push({width, fixtures, ...layout, playback});
    } else reports.push({width, fixtures, ...layout});
  }
  await writeFile(`${directory}/browser-report.json`, JSON.stringify({at: new Date().toISOString(), base, fixtures, physicalDevice: false, reports}, null, 2));
  console.log(JSON.stringify({passed: true, base, fixtures, widths: [1536, 390, 320], videoPlayed: true, authModes: ['signin', 'signup', 'forgot']}));
} finally {await browser.close({silent: true});}
