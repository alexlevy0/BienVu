import {spawnSync} from 'node:child_process';
// Opérateur local uniquement ; la variante distante reste une action explicite.
const sql = "INSERT INTO generation_control(id,enabled,updated_at) VALUES('generations',0,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(id) DO UPDATE SET enabled=0,updated_at=excluded.updated_at; SELECT enabled FROM generation_control WHERE id='generations';";
const result = spawnSync('pnpm', ['--filter', '@bienvu/web', 'exec', 'wrangler', 'd1', 'execute', 'DB', '--local', '--command', sql], {stdio: 'inherit'});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
