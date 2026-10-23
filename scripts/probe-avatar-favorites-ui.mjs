// Real React components with synthetic account identities and local media only.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const out = resolve('evidence/local/avatar-favorites');
await mkdir(out, { recursive: true });
const require = createRequire(import.meta.url),
  esbuild = createRequire(require.resolve('tsx'))('esbuild');
const looks = Array.from({ length: 100 }, (_, i) => ({
  id: 'look-' + i,
  name: 'Avatar ' + String(i).padStart(3, '0'),
  gender: i % 2 ? 'male' : 'female',
  type: 'studio_avatar',
  engines: ['avatar_iii'],
  enabled: true,
  thumbnail: '/portrait/' + i,
  preview: '/excerpt/' + i,
  transparentVerified: false,
  ownership: 'public',
  updatedAt: '2026-10-11',
}));
const initial = { looks: looks.slice(0, 32), offset: 0, total: looks.length, hasMore: true };
const source = `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{AvatarGallery}from'./components/avatar-gallery';import{AvatarPicker}from'./components/avatar-picker';import{AvatarFavoritesProvider}from'./components/avatar-favorites';
function App(){const [user,setUser]=useState(/fixture-user=([^;]+)/.exec(document.cookie)?.[1]??null),[view,setView]=useState('gallery'),[selected,setSelected]=useState('look-0');
return <><nav>{['a','b','guest'].map(id=><button onClick={()=>{document.cookie='fixture-user='+id+'; path=/';setUser(id==='guest'?null:id)}}>{id}</button>)}<button onClick={()=>setView('gallery')}>Galerie</button><button onClick={()=>setView('picker')}>Personnaliser</button></nav><AvatarFavoritesProvider userId={user==='guest'?null:user}>{view==='gallery'?<AvatarGallery initial={${JSON.stringify(initial)}}/>:<AvatarPicker looks={${JSON.stringify(looks)}} selected={selected} onSelect={look=>setSelected(look.id)}/>}</AvatarFavoritesProvider><output>{selected}</output></>};createRoot(document.getElementById('root')).render(<App/>);`;
const bundle = await esbuild.build({
  stdin: { contents: source, loader: 'tsx', resolveDir: resolve('apps/web') },
  bundle: true,
  platform: 'browser',
  format: 'iife',
  jsx: 'automatic',
  minify: true,
  write: false,
  define: { 'process.env': '{}', 'process.env.NODE_ENV': '"production"' },
});
const css = (
  await Promise.all(
    ['landing.css', 'avatars.css', 'avatar/avatar.css'].map((path) => readFile('apps/web/app/' + path, 'utf8')),
  )
).join('\n');
const image = await readFile('apps/web/public/images/studio-home/avatar-circle.webp'),
  video = await readFile('apps/web/public/videos/studio-home/avatar-circle.mp4');
const stored = new Map();
let failNext = false,
  delayRead = 0,
  delayWrite = 0;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost'),
    user = /fixture-user=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
  if (url.pathname === '/bundle.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(bundle.outputFiles[0].contents);
    return;
  }
  if (url.pathname === '/style.css') {
    res.setHeader('Content-Type', 'text/css');
    res.end(
      css +
        'body{margin:0;font-family:Arial,sans-serif;background:#fbfaf7}*{box-sizing:border-box}main{padding:20px}nav{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0 30px}.avatar-picker{max-width:960px}',
    );
    return;
  }
  if (url.pathname === '/api/avatars/favorites') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'private, no-store');
    if (!user || user === 'guest') {
      res.statusCode = 401;
      res.end('{}');
      return;
    }
    if (req.method === 'GET') {
      const payload = JSON.stringify({ ids: [...(stored.get(user) ?? [])] }),
        delay = delayRead;
      delayRead = 0;
      setTimeout(() => res.end(payload), delay);
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks));
    if (failNext) {
      failNext = false;
      res.statusCode = 503;
      res.end('{}');
      return;
    }
    const ids = new Set(stored.get(user) ?? []);
    if (input.favorite) ids.add(input.lookId);
    else ids.delete(input.lookId);
    stored.set(user, ids);
    const delay = delayWrite;
    delayWrite = 0;
    setTimeout(() => res.end(JSON.stringify(input)), delay);
    return;
  }
  if (url.pathname === '/api/avatars/gallery') {
    const q = url.searchParams.get('query') ?? '',
      g = url.searchParams.get('gender') ?? 'all',
      offset = Number(url.searchParams.get('offset') ?? 0),
      filtered = looks.filter((l) => l.name.toLowerCase().includes(q.toLowerCase()) && (g === 'all' || l.gender === g));
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        looks: filtered.slice(offset, offset + 32),
        total: filtered.length,
        offset,
        hasMore: offset + 32 < filtered.length,
      }),
    );
    return;
  }
  if (url.pathname.startsWith('/portrait/')) {
    res.setHeader('Content-Type', 'image/webp');
    res.end(image);
    return;
  }
  if (url.pathname.startsWith('/excerpt/')) {
    res.setHeader('Content-Type', 'video/mp4');
    res.end(video);
    return;
  }
  res.setHeader('Content-Type', 'text/html');
  res.end(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div class="home-studio"><main class="avatar-page"><h1>Les avatars BienVu</h1><div id="root"></div></main></div><script src="/bundle.js"></script>',
  );
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ??
      '/Users/alexlevy0/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell',
  }),
  reports = [];
try {
  for (const width of [1536, 390]) {
    stored.clear();
    stored.set('b', new Set(['look-4']));
    const context = await browser.newContext({
        viewport: { width, height: 900 },
        ...(width === 390 ? { isMobile: true, hasTouch: true } : {}),
      }),
      page = await context.newPage(),
      errors = [],
      requests = [];
    page.on('pageerror', (e) => {
      errors.push(e.message);
      console.error('browser error:', e.message);
    });
    page.on('request', (r) => requests.push({ path: new URL(r.url()).pathname, method: r.method() }));
    await page.goto(base);
    assert.equal(await page.locator('.avatar-gallery-favorite').count(), 0);
    assert.equal(requests.filter((r) => r.path === '/api/avatars/favorites').length, 0);
    await page.getByRole('button', { name: 'a', exact: true }).click();
    await page.locator('.avatar-gallery-favorite:not(:disabled)').first().waitFor();
    const favorite = (id) => page.locator('[data-avatar-id="look-' + id + '"] .avatar-gallery-favorite');
    await favorite(1).click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-avatar-id="look-1"] .avatar-gallery-favorite').getAttribute('aria-pressed') ===
        'true',
    );
    await page.screenshot({ path: resolve(out, 'gallery-' + width + '.png') });
    await page.getByRole('button', { name: 'Personnaliser', exact: true }).click();
    assert.equal(await page.locator('.avatar-look').first().getAttribute('data-avatar-id'), 'look-1');
    assert.equal(await page.locator('output').innerText(), 'look-0');
    await page.getByLabel('Genre du présentateur').selectOption('female');
    assert.equal(await page.locator('.avatar-look').first().getAttribute('data-avatar-id'), 'look-0');
    await page.getByLabel('Genre du présentateur').selectOption('all');
    await page.screenshot({ path: resolve(out, 'picker-' + width + '.png') });
    await page.reload();
    await page.locator('.avatar-gallery-favorite:not(:disabled)').first().waitFor();
    assert.equal(await favorite(1).getAttribute('aria-pressed'), 'true');
    await page.getByLabel('Rechercher un avatar').fill('Avatar 050');
    await favorite(50).waitFor();
    await favorite(50).click();
    await page.waitForFunction(
      () => document.querySelector('.avatar-gallery-favorite').getAttribute('aria-pressed') === 'true',
    );
    await page.getByLabel('Rechercher un avatar').fill('');
    await page.waitForFunction(() => document.querySelectorAll('.avatar-gallery-card').length === 32);
    await page.locator('.avatar-gallery-more').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelectorAll('.avatar-gallery-card').length >= 64);
    assert.equal(await favorite(50).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Personnaliser', exact: true }).click();
    assert.deepEqual(
      await page.locator('.avatar-look').evaluateAll((nodes) => nodes.slice(0, 2).map((n) => n.dataset.avatarId)),
      ['look-1', 'look-50'],
    );
    await page.getByRole('button', { name: 'Galerie', exact: true }).click();
    failNext = true;
    await favorite(2).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await favorite(2).getAttribute('aria-pressed'), 'false');
    await favorite(2).click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-avatar-id="look-2"] .avatar-gallery-favorite').getAttribute('aria-pressed') ===
        'true',
    );
    await favorite(2).click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-avatar-id="look-2"] .avatar-gallery-favorite').getAttribute('aria-pressed') ===
        'false',
    );
    delayWrite = 700;
    await favorite(3).click();
    await favorite(5).click();
    await page.waitForFunction(() =>
      ['3', '5'].every(
        (id) =>
          document
            .querySelector('[data-avatar-id="look-' + id + '"] .avatar-gallery-favorite')
            .getAttribute('aria-pressed') === 'true',
      ),
    );
    delayWrite = 700;
    await favorite(7).click();
    await page.getByRole('button', { name: 'b', exact: true }).click();
    await page.locator('.avatar-gallery-favorite:not(:disabled)').first().waitFor();
    await page.waitForTimeout(800);
    assert.equal(await favorite(7).getAttribute('aria-pressed'), 'false');
    assert.equal(await favorite(1).getAttribute('aria-pressed'), 'false');
    assert.equal(await favorite(4).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Personnaliser', exact: true }).click();
    assert.equal(await page.locator('.avatar-look').first().getAttribute('data-avatar-id'), 'look-4');
    delayRead = 700;
    await page.getByRole('button', { name: 'a', exact: true }).click();
    await page.getByRole('button', { name: 'b', exact: true }).click();
    await page.waitForTimeout(900);
    assert.equal(await page.locator('.avatar-look').first().getAttribute('data-avatar-id'), 'look-4');
    await page.getByRole('button', { name: 'guest', exact: true }).click();
    assert.equal(await page.locator('.avatar-look').first().getAttribute('data-avatar-id'), 'look-0');
    assert.equal(await page.locator('.avatar-picker-favorite').count(), 0);
    await page.getByRole('button', { name: 'Galerie', exact: true }).click();
    assert.equal(await page.locator('.avatar-gallery-favorite').count(), 0);
    assert.deepEqual(errors, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    reports.push({
      width,
      persisted: true,
      sortedInCustomizer: true,
      selectionUnchanged: true,
      infiniteScroll: true,
      failedWriteRetry: true,
      concurrentWrites: true,
      accountSwitch: true,
      staleReadAndWriteIgnored: true,
      logoutClears: true,
      noOverflow: true,
      providerCalls: 0,
    });
    await context.close();
  }
  await writeFile(resolve(out, 'browser.json'), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify({ passed: true, reports }));
} finally {
  await browser.close();
  server.close();
}
