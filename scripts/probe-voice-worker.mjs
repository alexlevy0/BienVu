import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'evidence/local/sprint-05/worker-build');
await mkdir(output, {recursive: true});
const build = await promisify(execFile)(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
  'deploy', 'fixtures/voice-worker.ts', '--dry-run', '--outdir', output, '--name', 'bienvu-voice-fixture',
  '--compatibility-date', '2026-09-28'], {cwd: root, env: {...process.env, WRANGLER_SEND_METRICS: 'false'}, timeout: 60_000});
await writeFile(path.join(output, 'build.log'), build.stdout + build.stderr);
const mf = new Miniflare(convertV4MiniflareOptions({modules: true, scriptPath: path.join(output, 'voice-worker.js'),
  compatibilityDate: '2026-09-28', outboundService: () => {throw new Error('NO_EXTERNAL_NETWORK_IN_FIXTURE');}}));
try {
  const response = await mf.dispatchFetch('https://voice-fixture.invalid/');
  assert.equal(response.status, 200); const report = await response.json();
  assert.equal(report.providerMock, true); assert.equal(report.authCalls, 1); assert.equal(report.synthesisCalls, 1);
  assert.equal(report.sizeBytes, 48044); assert.match(report.sha256, /^[a-f0-9]{64}$/); assert.equal(report.actualBilledMicros, null);
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({runtime: 'local-workerd', ...report}));
} finally {await mf.dispose();}
