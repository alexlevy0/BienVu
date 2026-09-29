import {mkdir, open, readFile, rename, rm, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {VoiceFailure} from '../packages/contracts/src/voice';
import {measureVoiceWav} from '../apps/renderer/src/voice-audio';

type Entry = {key: string; month: string; characters: number; state: 'pending' | 'done' | 'failed';
  reservationCents: number; at: string; errorCode?: string};
export const VOICE_PROBE_LIMITS = {monthlyCalls: 3, monthlyCharacters: 3000, reservationCents: 5, stopCents: 2500} as const;
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function readJson(file: string): Promise<unknown> {
  if ((await stat(file)).size > 128_000) throw new VoiceFailure('VOICE_PROBE_REVIEW_REQUIRED');
  try {return JSON.parse(await readFile(file, 'utf8'));}
  catch {throw new VoiceFailure('VOICE_PROBE_REVIEW_REQUIRED');}
}
async function saveJson(file: string, value: unknown) {
  const temporary = `${file}.tmp`;
  const handle = await open(temporary, 'w', 0o600);
  try {await handle.writeFile(JSON.stringify(value, null, 2)); await handle.sync();} finally {await handle.close();}
  await rename(temporary, file);
}

// Sonde opérateur locale, pas un substitut au futur journal D1 des jobs.
// Un appel incertain reste consommé. Un crash exige une inspection, pas un retry caché.
export async function runVoiceProbe(options: {directory: string; key: string; characters: number;
  baselineCents: number; budgetMonth: string; now?: number;
  produce: () => Promise<{bytes: Uint8Array; report: Record<string, unknown>}>;
}) {
  const at = new Date(options.now ?? Date.now()).toISOString(), month = at.slice(0, 7);
  if (!/^[a-f0-9]{64}$/.test(options.key) || !Number.isInteger(options.characters) || options.characters < 1 || options.characters > 1000)
    throw new VoiceFailure('VOICE_CONFIG_INVALID');
  await mkdir(options.directory, {recursive: true, mode: 0o700});
  const lock = path.join(options.directory, '.lock');
  try {await mkdir(lock, {mode: 0o700});} catch {throw new VoiceFailure('VOICE_PROBE_REVIEW_REQUIRED');}
  try {
    const ledgerFile = path.join(options.directory, 'ledger.json');
    let entries: Entry[] = [];
    try {
      const parsed = await readJson(ledgerFile);
      if (!Array.isArray(parsed) || parsed.length > 1000 || parsed.some(item => !item || typeof item !== 'object'
        || !/^[a-f0-9]{64}$/.test(item.key) || !/^\d{4}-\d{2}$/.test(item.month)
        || !['pending', 'done', 'failed'].includes(item.state) || item.reservationCents !== VOICE_PROBE_LIMITS.reservationCents
        || !Number.isInteger(item.characters) || item.characters < 1 || item.characters > 1000))
        throw new VoiceFailure('VOICE_PROBE_REVIEW_REQUIRED');
      entries = parsed;
      if (new Set(entries.map(item => item.key)).size !== entries.length) throw new VoiceFailure('VOICE_PROBE_REVIEW_REQUIRED');
    } catch (error) {if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;}
    const audioFile = path.join(options.directory, `${options.key}.wav`), reportFile = path.join(options.directory, `${options.key}.json`);
    const previous = entries.find(item => item.key === options.key);
    if (previous) {
      if (previous.state !== 'done') throw new VoiceFailure('VOICE_PROBE_REVIEW_REQUIRED');
      const report = await readJson(reportFile) as Record<string, unknown>;
      if ((await stat(audioFile)).size > 7 * 1024 * 1024) throw new VoiceFailure('VOICE_PROBE_REVIEW_REQUIRED');
      const bytes = await readFile(audioFile);
      if (!report || report.sha256 !== sha(bytes) || report.cacheKey !== options.key) throw new VoiceFailure('VOICE_PROBE_REVIEW_REQUIRED');
      measureVoiceWav(bytes);
      return {cached: true, audioFile, reportFile, report};
    }
    const used = entries.filter(item => item.month === month);
    if (options.budgetMonth !== month || !Number.isInteger(options.baselineCents) || options.baselineCents < 0)
      throw new VoiceFailure('VOICE_PROBE_REVIEW_REQUIRED');
    if (used.length >= VOICE_PROBE_LIMITS.monthlyCalls || used.reduce((sum, item) => sum + item.characters, 0) + options.characters > VOICE_PROBE_LIMITS.monthlyCharacters
      || options.baselineCents + (used.length + 1) * VOICE_PROBE_LIMITS.reservationCents > VOICE_PROBE_LIMITS.stopCents)
      throw new VoiceFailure('VOICE_PROBE_LIMIT');
    const entry: Entry = {key: options.key, month, characters: options.characters, state: 'pending',
      reservationCents: VOICE_PROBE_LIMITS.reservationCents, at};
    entries.push(entry); await saveJson(ledgerFile, entries);
    try {
      const result = await options.produce();
      const measurement = measureVoiceWav(result.bytes);
      const report = {...result.report, cacheKey: options.key, sha256: sha(result.bytes), measurement, at,
        provisionEur: VOICE_PROBE_LIMITS.reservationCents / 100, actualBilledEur: null,
        humanListening: result.report.providerMock === true ? 'not_applicable_mock' : 'pending'};
      await writeFile(`${audioFile}.tmp`, result.bytes, {mode: 0o600, flag: 'wx'});
      await rename(`${audioFile}.tmp`, audioFile); await saveJson(reportFile, report);
      entry.state = 'done'; await saveJson(ledgerFile, entries);
      return {cached: false, audioFile, reportFile, report};
    } catch (error) {
      entry.state = 'failed'; entry.errorCode = error instanceof VoiceFailure ? error.code : 'VOICE_UNAVAILABLE';
      await saveJson(ledgerFile, entries); throw error;
    }
  } finally {await rm(lock, {recursive: true});}
}
