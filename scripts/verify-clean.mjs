import {mkdtemp, mkdir, copyFile, writeFile, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, dirname, join} from 'node:path';
import {spawnSync} from 'node:child_process';

const root = process.cwd();
const target = await mkdtemp(join(tmpdir(), 'bienvu-s01-clean-'));
const evidence = resolve(root, 'evidence/local/sprint-01');
await mkdir(evidence, {recursive: true});
let git = 'git';
try {await access('/opt/homebrew/bin/git'); git = '/opt/homebrew/bin/git';} catch {}
const files = spawnSync(git, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {cwd: root, encoding: 'utf8'});
if (files.status !== 0) throw new Error('Impossible de relever les fichiers du dépôt.');
const report = {at: new Date().toISOString(), source: root, cleanDirectory: target, mode: 'local-offline', steps: []};
let log = '';
try {
  for (const file of new Set(files.stdout.split('\0').filter(Boolean))) {
    if (file.startsWith('.git/') || file.startsWith('evidence/')) continue;
    await mkdir(dirname(resolve(target, file)), {recursive: true});
    await copyFile(resolve(root, file), resolve(target, file));
  }
  const commands = [
    ['install', '--offline', '--frozen-lockfile'], ['setup:local'], ['fixtures'],
    ['--filter', '@bienvu/web', 'typegen'], ['--filter', '@bienvu/pipeline', 'typegen'],
    ['check'], ['db:migrate'], ['db:migrate'], ['build:web'],
  ];
  for (const args of commands) {
    const label = `pnpm ${args.join(' ')}`;
    console.log(`Copie propre : ${label}`);
    const result = spawnSync('pnpm', args, {cwd: target, encoding: 'utf8', maxBuffer: 15 * 1024 * 1024,
      env: {...process.env, CI: 'true', NEXT_TELEMETRY_DISABLED: '1', WRANGLER_SEND_METRICS: 'false'}});
    log += `\n${label}\n${result.stdout ?? ''}${result.stderr ?? ''}`;
    report.steps.push({command: label, exitCode: result.status});
    if (result.status !== 0) throw new Error(`Échec dans la copie propre : ${label}`);
  }
  console.log('Installation, contrôles, migrations et build réussis sans fichiers locaux préexistants.');
} finally {
  await writeFile(resolve(evidence, 'clean-copy.log'), log);
  await writeFile(resolve(evidence, 'clean-copy.json'), JSON.stringify(report, null, 2));
  await rm(target, {recursive: true, force: true});
}
