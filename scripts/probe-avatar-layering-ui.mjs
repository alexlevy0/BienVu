// Actual preview components and styles against loopback fixture APIs only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
const require = createRequire(import.meta.url),
  esbuild = createRequire(require.resolve('tsx'))('esbuild'),
  directory = resolve('evidence/local/avatar-layering-ui');
await mkdir(directory, { recursive: true });
const source = `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {AccountProvider} from './components/account';import {VideoCustomizer} from './components/video-customizer';import {EditorPreview} from './components/editor-preview';
import {defaultVideoCustomization,defaultAvatarCustomization,createEditorDocument} from '@bienvu/contracts';
const look={id:'fixture',name:'Avatar de recette',gender:'female',type:'studio_avatar',engines:['avatar_iii'],enabled:true,thumbnail:'/avatar.png',preview:null,transparentVerified:false,ownership:'public',updatedAt:'2026-10-13'};
const avatar={...defaultAvatarCustomization('fixture'),appearance:'card',moments:'full',width:100,x:50,y:50};
const fields={title:'Un texte toujours visible',locality:'Lyon',propertyType:'apartment',transaction:'sale',area:'65',rooms:'3',priceCents:'385000',description:'Un appartement lumineux avec balcon.'};
const map={position:'start',durationSeconds:4,view:'plan',zoomStart:12,zoomEnd:14.5,location:{latitude:45.75,longitude:4.85,label:'Lyon',precision:'exact',sourceType:'manual'}};
const photos=[0,1,2].map(i=>({id:'photo-'+i,sourceOrder:i,slot:i,state:'ready',preview:'/photo.png'}));
function App(){const [example,setExample]=useState({editor:false,map:false,format:'9:16',retained:false});window.setExample=setExample;const noop=()=>{};
 const settings={...defaultVideoCustomization(),style:'editorial',avatar,narration:['Découvrez cet appartement.','Un salon lumineux.','Un balcon au calme.','Contactez notre agence.'],mapDisabled:!example.map,...(example.map?{map}: {})};
 const doc=createEditorDocument(photos,fields,{aspectRatio:example.format,durationSeconds:20,agencyName:'Agence de recette'});
 return <AccountProvider><main className="home-studio">{example.editor?<div className="editor-preview-panel" style={{height:750,width:700}}><EditorPreview doc={doc} photos={photos} photoUrls={Object.fromEntries(photos.map(p=>[p.id,'/photo.png']))} draftId="fixture" avatar={avatar} avatarLook={look}
   avatars={example.retained?[{id:'clip',lookId:'fixture',engine:'avatar_iii',moment:'full',transparent:false,url:'/avatar.mp4',startFrame:0,durationFrames:600}]:[]} voiceReusable frame={30} playing={false} zoom={50} selected={null}
   primaryColor="#E1E9DA" secondaryColor="#171714" agencyName="Agence de recette" photoMotion={false} transition="cut" onSelect={noop} onSeek={noop} onPlay={noop} onMove={noop} onCheckpoint={noop} {...(example.map?{map}:{})}/></div>:
  <VideoCustomizer key={example.format+'-'+example.map} settings={settings} onChange={noop} fields={fields} photos={photos} aspectRatio={example.format} agencyName="Agence de recette" busy={false} ready saved
    subtitlesEnabled voiceEnabled durationSeconds={20} onSubtitles={noop} onBack={noop} onAdd={noop} onEdit={noop}/>}</main></AccountProvider>};createRoot(document.getElementById('root')).render(<App/>);`;
const compiled = await esbuild.build({
  stdin: { contents: source, loader: 'tsx', resolveDir: resolve('apps/web') },
  bundle: true,
  platform: 'browser',
  format: 'iife',
  jsx: 'automatic',
  write: false,
  loader: { '.css': 'empty' },
  external: ['/maplibre/*'],
  define: { 'process.env': '{}', 'process.env.NODE_ENV': '"production"' },
});
const css = (
    await Promise.all(
      [
        'apps/web/app/customizer.css',
        'apps/web/app/avatars.css',
        'apps/web/components/video-map.css',
        'apps/web/app/editeur/editor.css',
      ].map((file) => readFile(file, 'utf8')),
    )
  ).join('\n'),
  portrait = await readFile('evidence/local/avatar-layering/synthetic-avatar.png'),
  video = await readFile('evidence/local/avatar-layering/synthetic-avatar.mp4'),
  photo = await readFile('apps/web/public/images/studio-home/lyon.webp'),
  mapId = 'a'.repeat(64);
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname,
    json = (value) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(value));
    };
  if (path === '/bundle.js') {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.end(compiled.outputFiles[0].contents);
    return;
  }
  if (path === '/style.css') {
    res.setHeader('Content-Type', 'text/css');
    res.end(
      css +
        'body{margin:0;font-family:Arial,sans-serif;background:#faf9f6}main{padding:20px;max-width:1100px}*{box-sizing:border-box}.customizer-preview{min-width:240px}.customizer-preview-title{margin-bottom:12px}.editor-canvas-area{min-height:600px}',
    );
    return;
  }
  if (path === '/api/avatars') {
    json({
      enabled: true,
      allowPremium: false,
      maxSeconds: 6,
      defaultLookId: 'fixture',
      looks: [
        {
          id: 'fixture',
          name: 'Avatar',
          gender: 'female',
          type: 'studio_avatar',
          engines: ['avatar_iii'],
          enabled: true,
          thumbnail: '/avatar.png',
          preview: null,
          transparentVerified: false,
          ownership: 'public',
          updatedAt: '2026-10-13',
        },
      ],
    });
    return;
  }
  if (path === '/api/video-defaults') {
    json({ enabled: false, position: 'start', durationSeconds: 4, view: 'plan', zoomStart: 12, zoomEnd: 14.5 });
    return;
  }
  if (path === '/api/maps/preview') {
    json({
      id: mapId,
      url: '/api/maps/images/' + mapId,
      width: 2160,
      height: 3840,
      bounds: [4, 45, 5, 46],
      capturedAt: new Date().toISOString(),
    });
    return;
  }
  if (path === '/avatar.png') {
    res.setHeader('Content-Type', 'image/png');
    res.end(portrait);
    return;
  }
  if (path === '/avatar.mp4') {
    res.setHeader('Content-Type', 'video/mp4');
    res.end(video);
    return;
  }
  if (path === '/photo.png' || path.startsWith('/api/maps/images/')) {
    res.setHeader('Content-Type', 'image/webp');
    res.end(photo);
    return;
  }
  if (path.startsWith('/api/')) {
    res.statusCode = 401;
    json({ error: 'FIXTURE' });
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script>',
  );
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({
    headless: true,
    executablePath: resolve(
      'apps/renderer/node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell',
    ),
  }),
  results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } }),
    errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort(),
  );
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
  assert.deepEqual(errors, []);
  await page.waitForFunction(() => typeof window.setExample === 'function');
  for (const format of ['9:16', '16:9'])
    for (const editor of [false, true])
      for (const map of [false, true])
        for (const retained of editor ? [false, true] : [false]) {
          const avatarSelector = retained ? '.editor-canvas>div:has(>video)' : '.avatar-preview-poster';
          await page.evaluate((example) => window.setExample(example), { editor, map, format, retained });
          await page.locator(avatarSelector).waitFor();
          if (map) await page.waitForFunction(() => !document.querySelector('.map-scene-status'));
          const selectors = map
            ? ['.map-scene-card']
            : editor
              ? ['.editor-preview-layer[data-editor-layer="price"]', '.editor-caption-placement']
              : ['.customizer-poster-copy', '.customizer-preview-subtitle'];
          for (const selector of selectors) {
            await page.locator(selector).scrollIntoViewIfNeeded();
            const result = await page.evaluate(
              ({ selector, avatarSelector }) => {
                const text = document.querySelector(selector),
                  avatar = document.querySelector(avatarSelector),
                  a = avatar.getBoundingClientRect(),
                  t = text.getBoundingClientRect();
                text.style.pointerEvents = 'auto';
                avatar.style.pointerEvents = 'auto';
                const left = Math.max(a.left, t.left),
                  right = Math.min(a.right, t.right),
                  top = Math.max(a.top, t.top),
                  bottom = Math.min(a.bottom, t.bottom),
                  nodes = document.elementsFromPoint((left + right) / 2, (top + bottom) / 2),
                  textIndex = nodes.findIndex((n) => n === text || text.contains(n)),
                  avatarIndex = nodes.findIndex((n) => n === avatar || avatar.contains(n));
                text.style.pointerEvents = '';
                avatar.style.pointerEvents = '';
                return {
                  overlap: right > left && bottom > top,
                  textIndex,
                  avatarIndex,
                  above: textIndex >= 0 && avatarIndex > textIndex,
                  point: { x: (left + right) / 2, y: (top + bottom) / 2 },
                  text: t.toJSON(),
                  avatar: a.toJSON(),
                  nodes: nodes.slice(0, 5).map((n) => n.className),
                };
              },
              { selector, avatarSelector },
            );
            assert.ok(result.overlap, `${format} ${editor} ${map} ${selector}: overlap fixture`);
            assert.ok(result.above, JSON.stringify({ format, editor, map, selector, ...result }));
          }
          await page.screenshot({
            path: joinPath(
              `${format.replace(':', '-')}-${editor ? 'editor' : 'customizer'}-${map ? 'map' : 'photo'}-${retained ? 'clip' : 'poster'}.png`,
            ),
            fullPage: true,
          });
          results.push({ format, editor, map, retained, passed: true });
        }
  assert.deepEqual(errors, []);
  await writeFile(
    joinPath('report.json'),
    JSON.stringify({ at: new Date().toISOString(), newProviderCalls: 0, fixtureApis: true, results }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, checks: results.length }));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
function joinPath(file) {
  return resolve(directory, file);
}
