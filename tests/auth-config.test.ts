import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

test('la préparation staging désactive le bypass même si la configuration locale l’active', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'bienvu-auth-config-'));
  t.after(() => rm(folder, {recursive: true, force: true}));
  for (const name of ['apps/web/wrangler.jsonc', 'apps/pipeline/wrangler.jsonc', 'apps/pipeline/wrangler.render.jsonc']) {
    const config = JSON.parse(await readFile(new URL(`../${name}`, import.meta.url), 'utf8'));
    config.vars.AUTH_EMAIL_VERIFICATION_BYPASS = 'true';
    config.vars.IMPORT_MODE = 'local';
    await mkdir(join(folder, name, '..'), {recursive: true});
    await writeFile(join(folder, name), JSON.stringify(config));
  }
  await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../scripts/prepare-staging.mjs', import.meta.url))], {
    cwd: folder, env: {...process.env, BIENVU_D1_ID: '00000000-0000-4000-8000-000000000001',
      BIENVU_WEB_ORIGIN: 'https://staging.example.com', BIENVU_WORKERS_PLAN: 'free', BIENVU_AUTH_EMAIL_FROM: '',
      BIENVU_AUTH_EMAIL_TO: '', BIENVU_STAGING_TARGET: 'all'},
  });
  const config = JSON.parse(await readFile(join(folder, 'apps/web/wrangler.staging.jsonc'), 'utf8'));
  assert.equal(config.vars.PROBE_MODE, 'remote');
  assert.equal(config.vars.AUTH_EMAIL_VERIFICATION_BYPASS, 'false');
  assert.equal(config.vars.AUTH_EMAIL_MODE, 'disabled');
  assert.equal(config.vars.IMPORT_MODE, 'disabled');
});

test('une recette mail prépare seulement le web et restreint le destinataire sans toucher au renderer', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'bienvu-email-staging-'));
  t.after(() => rm(folder, {recursive: true, force: true}));
  await mkdir(join(folder, 'apps/web'), {recursive: true});
  await mkdir(join(folder, 'apps/pipeline'), {recursive: true});
  await writeFile(join(folder, 'apps/web/wrangler.jsonc'), await readFile(new URL('../apps/web/wrangler.jsonc', import.meta.url)));
  const renderer = join(folder, 'apps/pipeline/wrangler.staging.render.jsonc');
  await writeFile(renderer, 'renderer en pause : configuration à préserver');
  const env = {...process.env, BIENVU_D1_ID: '00000000-0000-4000-8000-000000000001',
    BIENVU_WEB_ORIGIN: 'https://staging.example.com', BIENVU_WORKERS_PLAN: 'paid',
    BIENVU_AUTH_EMAIL_FROM: 'connexion@bienvu.online', BIENVU_AUTH_EMAIL_TO: 'tester@example.com', BIENVU_STAGING_TARGET: 'web'};
  const run = (overrides = {}) => promisify(execFile)(process.execPath,
    [fileURLToPath(new URL('../scripts/prepare-staging.mjs', import.meta.url))], {cwd: folder, env: {...env, ...overrides}});
  await run();
  const config = JSON.parse(await readFile(join(folder, 'apps/web/wrangler.staging.jsonc'), 'utf8'));
  assert.equal(config.vars.AUTH_EMAIL_MODE, 'cloudflare');
  assert.equal(config.vars.AUTH_EMAIL_VERIFICATION_BYPASS, 'false');
  assert.equal(config.vars.IMPORT_MODE, 'disabled');
  assert.equal(config.vars.GENERATIONS_ENABLED, 'false');
  assert.deepEqual(config.send_email, [{name: 'AUTH_EMAIL', allowed_sender_addresses: ['connexion@bienvu.online'],
    allowed_destination_addresses: ['tester@example.com']}]);
  assert.equal(await readFile(renderer, 'utf8'), 'renderer en pause : configuration à préserver');
  await assert.rejects(run({BIENVU_WORKERS_PLAN: 'free'}));
  await assert.rejects(run({BIENVU_AUTH_EMAIL_TO: 'invalid'}));
  await assert.rejects(run({BIENVU_AUTH_EMAIL_FROM: ''}));
});
