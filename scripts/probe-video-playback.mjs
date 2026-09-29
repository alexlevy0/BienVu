// Lecture réelle dans un Chromium éphémère. Le mode mobile est une émulation,
// pas une validation Safari/iOS ni un appareil physique.
import {createRequire} from 'node:module';
import {mkdir,writeFile,stat} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../apps/renderer/package.json',import.meta.url));
const {openBrowser}=require('@remotion/renderer');
const docker=process.argv.includes('--docker'),local=process.argv.includes('--local')||docker,file=docker?'/docker.mp4':local?'/paid.mp4':'/cloudflare.mp4';
await stat(docker?'evidence/local/sprint-06/container/video.mp4':local?'evidence/local/sprint-06/job-video-paid/video.mp4':'evidence/remote/sprint-06/video-cloudflare.mp4');
const folder=`evidence/${local?'local':'remote'}/sprint-06/${docker?'container/':''}playback`;await mkdir(folder,{recursive:true,mode:0o700});
const results=[];
for(const mode of ['desktop','mobile-emulated']) {
  const mobile=mode==='mobile-emulated';
  const browser=await openBrowser('chrome',{logLevel:'error',chromiumOptions:mobile?{userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36'}:{}});
  try {
    const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}});
    await page.setViewport({width:mobile?390:1440,height:mobile?844:1000,deviceScaleFactor:1});
    await page._client().send('Emulation.setDeviceMetricsOverride',{width:mobile?390:1440,height:mobile?844:1000,deviceScaleFactor:1,mobile});
    await page.goto({url:'http://127.0.0.1:8795/',timeout:30_000,options:{waitUntil:'load'}});
    const {value}=await page._client().send('Runtime.evaluate',{userGesture:true,awaitPromise:true,returnByValue:true,expression:`(async()=>{
      const v=document.querySelector('video');v.src=${JSON.stringify(file)};v.load();v.muted=false;v.volume=1;
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('PLAYBACK_TIMEOUT')),45000);
        v.addEventListener('ended',()=>{clearTimeout(timer);resolve();},{once:true});v.addEventListener('error',()=>{clearTimeout(timer);reject(Error('VIDEO_DECODE_FAILED'));},{once:true});
        v.play().catch(reject);});
      const q=v.getVideoPlaybackQuality();return {ended:v.ended,currentTime:v.currentTime,duration:v.duration,width:v.videoWidth,height:v.videoHeight,
        muted:v.muted,volume:v.volume,error:v.error?.code??null,totalVideoFrames:q.totalVideoFrames,droppedVideoFrames:q.droppedVideoFrames,
        audioDecodedBytes:v.webkitAudioDecodedByteCount??null,viewport:{width:innerWidth,height:innerHeight},userAgent:navigator.userAgent,
        horizontalOverflow:document.documentElement.scrollWidth>innerWidth};})()`});
    assert.ok(!value.exceptionDetails,JSON.stringify(value.exceptionDetails));const result=value.result.value;
    assert.equal(result.ended,true);assert.equal(result.width,1080);assert.equal(result.height,1920);assert.equal(result.muted,false);
    assert.equal(result.error,null);assert.ok(result.duration>=20&&result.duration<=35.2);assert.ok(result.totalVideoFrames>=590);
    assert.equal(result.horizontalOverflow,false);
    const screenshot=await page._client().send('Page.captureScreenshot',{format:'png'});
    await writeFile(`${folder}/${mode}.png`,Buffer.from(screenshot.value.data,'base64'),{mode:0o600});
    results.push({mode,physicalDevice:false,...result});console.log(JSON.stringify({mode,ended:result.ended,frames:result.totalVideoFrames,audioDecodedBytes:result.audioDecodedBytes}));
  }finally{await browser.close({silent:true});}
}
await writeFile(`${folder}/report.json`,JSON.stringify({at:new Date().toISOString(),file,source:docker?'docker-linux-local':local?'native-local':'downloaded-from-private-r2-and-sha256-verified',
  humanListening:false,results},null,2)+'\n',{mode:0o600});
