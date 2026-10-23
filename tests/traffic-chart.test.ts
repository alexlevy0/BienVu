import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AdminTraffic } from '../packages/contracts/src/admin';
import { trafficChartSummary, trafficDayChange } from '../apps/web/lib/traffic-chart';
const data: AdminTraffic = {
  at: '2026-10-17T13:00:00Z',
  days: 7,
  enabled: true,
  firstDay: '2026-10-13',
  total: 598,
  countries: [],
  pages: [],
  daily: [0, 0, 0, 20, 0, 20, 558].map((views, i) => ({ day: `2026-10-${11 + i}`, views, pages: [], countries: [] })),
};
test('la moyenne exclut les jours non conservés et le jour encore en cours, mais garde les zéros mesurés', () => {
  const result = trafficChartSummary(data);
  assert.equal(result.completedDays, 4);
  assert.equal(result.average, 10);
  assert.equal(result.peak?.day, '2026-10-17');
  assert.equal(result.peak?.views, 558);
  assert.equal(result.measured('2026-10-12'), false);
  assert.equal(result.measured('2026-10-13'), true);
  assert.equal(trafficChartSummary({ ...data, firstDay: null }).average, null);
  assert.equal(trafficChartSummary({ ...data, firstDay: null }).peak, null);
});
test('on ne compare pas un total provisoire avec la veille complète ni avec des données absentes', () => {
  assert.equal(trafficDayChange(data, 6), null);
  assert.equal(trafficDayChange(data, 2), null);
  assert.deepEqual(trafficDayChange(data, 4), { difference: -20, percent: -100 });
  assert.deepEqual(trafficDayChange(data, 5), { difference: 20, percent: null });
});
