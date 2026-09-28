import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withImportBrowser} from '../apps/pipeline/src/import-browser';
test('cycle navigateur injecté : fermeture sur succès, exception et timeout', async () => {
  for (const mode of ['success', 'error', 'timeout']) {
    let closed = 0; const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20);
    const run = withImportBrowser(async () => ({close: async () => {closed++;}}), async () => {
      if (mode === 'error') throw new Error('FIXTURE_ERROR');
      if (mode === 'timeout') return new Promise<string>(() => {});
      return 'fixture-html';
    }, () => {}, controller.signal);
    try {if (mode === 'success') assert.equal(await run, 'fixture-html'); else await assert.rejects(run);} finally {clearTimeout(timer);}
    assert.equal(closed, 1);
  }
});
test('launch tardif : fermeture attachée à waitUntil, aucun travail commencé', async () => {
  let deliver: (browser: {close(): Promise<void>}) => void = () => {}, closed = 0, started = false;
  const tracked: Promise<unknown>[] = [], abort = new AbortController();
  const run = withImportBrowser(() => new Promise<{close(): Promise<void>}>(resolve => {deliver = resolve;}), async () => {started = true;}, p => tracked.push(p), abort.signal);
  abort.abort(); await assert.rejects(run);
  deliver({close: async () => {closed++;}}); await Promise.all(tracked);
  assert.equal(started, false); assert.equal(closed, 1);
});
