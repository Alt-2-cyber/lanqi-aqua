import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pond } from '../src/types.ts';
import { buildTrendSeries } from '../src/lib/trend.ts';

function pond(id: string, values: [string, number][], overrides: Partial<Pond> = {}): Pond {
  return {
    id, name: id, areaMu: 1, species: '草鱼', batch: '', location: '', status: 'normal',
    waterTemperature: 25, dissolvedOxygen: values.at(-1)?.[1] ?? 0, ph: 7,
    turbidity: 0, waterLevel: 0, updatedAt: values.at(-1)?.[0] ?? '',
    availableMetrics: ['oxygen', 'temperature', 'ph'],
    history: values.map(([time, oxygen]) => ({ time, oxygen, temperature: 25, ph: 7 })),
    ...overrides,
  };
}

test('asynchronous live observations form a true pond mean', () => {
  const points = buildTrendSeries([
    pond('one', [['2026-10-28T12:00:00.001Z', 5]]),
    pond('two', [['2026-10-28T12:00:00.120Z', 9]]),
  ], 'oxygen', 6);
  assert.equal(points.at(-1)?.value, 7);
  assert.equal(points.at(-1)?.count, 2);
});

test('nearby samples remain aligned across minute boundaries', () => {
  const points = buildTrendSeries([
    pond('one', [['2026-10-28T12:00:59.990Z', 5]]),
    pond('two', [['2026-10-28T12:01:00.010Z', 9]]),
  ], 'oxygen', 6);
  assert.equal(points.at(-1)?.value, 7);
});

test('offline ponds and missing selected metrics do not contribute', () => {
  const points = buildTrendSeries([
    pond('one', [['2026-10-28T12:00:00Z', 5]]),
    pond('offline', [['2026-10-28T12:00:00Z', 9]], { status: 'offline' }),
    pond('missing', [['2026-10-28T12:00:00Z', 20]], { availableMetrics: ['temperature'] }),
  ], 'oxygen', 6);
  assert.equal(points.at(-1)?.value, 5);
  assert.equal(points.at(-1)?.count, 1);
});

test('each pond contributes once per minute using its newest observation', () => {
  const points = buildTrendSeries([
    pond('one', [['2026-10-28T12:00:00Z', 1], ['2026-10-28T12:00:01Z', 3], ['2026-10-28T12:00:02Z', 5]]),
    pond('two', [['2026-10-28T12:00:00.120Z', 9]]),
  ], 'oxygen', 6);
  assert.equal(points.at(-1)?.value, 7);
  assert.equal(points.at(-1)?.count, 2);
});

test('alignment never carries a pond value for more than five minutes', () => {
  const points = buildTrendSeries([
    pond('one', [['2026-10-28T12:00:00Z', 5]]),
    pond('two', [['2026-10-28T12:06:00Z', 9]]),
  ], 'oxygen', 6);
  assert.equal(points.at(-1)?.value, 9);
  assert.equal(points.at(-1)?.count, 1);
});
