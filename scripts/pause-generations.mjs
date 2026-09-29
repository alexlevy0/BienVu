import {spawnSync} from 'node:child_process';
// --remote cible explicitement bienvu.online ; sans option, le simulateur local.
const remote=process.argv.includes('--remote');
const sql = "INSERT INTO generation_control(id,enabled,updated_at) VALUES('generations',0,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(id) DO UPDATE SET enabled=0,updated_at=excluded.updated_at; SELECT enabled FROM generation_control WHERE id='generations';";
const result = spawnSync('pnpm', ['--filter', '@bienvu/web', 'exec', 'wrangler', 'd1', 'execute', 'DB', ...(remote?['--remote','--config','wrangler.staging.jsonc']:['--local']), '--command', sql], {stdio: 'inherit'});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
