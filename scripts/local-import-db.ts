import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir, readFile, writeFile, unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
const run = promisify(execFile);
export const localFolder = resolve('evidence/local/sprint-03');
// Permet une recette isolée quand la base habituelle contient déjà des annonces.
const testState = process.env.BIENVU_LOCAL_STATE ? resolve(process.env.BIENVU_LOCAL_STATE) : null;
if (testState && !testState.startsWith(`${resolve('evidence/local')}/`)) throw new Error('Le stockage de recette doit rester dans evidence/local.');
const persistenceArgs = testState ? ['--persist-to', testState] : [];
export const sqlQuote = (value: string) => `'${value.replaceAll("'", "''")}'`;
export async function localSql<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  await mkdir(localFolder, {recursive: true});
  const path = resolve(localFolder, `${crypto.randomUUID()}.sql`);
  await writeFile(path, sql, {mode: 0o600});
  try {
    const {stdout} = await run('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'DB', '--local', ...persistenceArgs, '--file', path, '--json'], {cwd: resolve('apps/web'), maxBuffer: 2 * 1024 * 1024});
    return (JSON.parse(stdout) as Array<{results: T[]}>).at(-1)?.results ?? [];
  } catch {throw new Error('Échec D1 local ; détails masqués pour préserver les secrets de session.');}
  finally {await unlink(path);}
}
export async function deleteLocalObject(key: string) {
  if (!/^agencies\/[a-zA-Z0-9_-]+\/imports\/[a-zA-Z0-9_-]+\/[a-f0-9]{64}\.jpg$/.test(key)) throw new Error('INVALID_IMPORT_KEY');
  await run('pnpm', ['exec', 'wrangler', 'r2', 'object', 'delete', `bienvu-probes-local/${key}`, '--local', ...persistenceArgs], {cwd: resolve('apps/web')});
}
export async function importLocalSecret(key: string) {
  const content = await readFile('apps/web/.dev.vars', 'utf8');
  const value = content.split('\n').find(line => line.startsWith(`${key}=`))?.slice(key.length + 1).trim();
  if (!value) throw new Error(`${key} absent ; lancer setup:local.`);
  return value;
}
