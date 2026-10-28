import type { Pond } from '../types';
import { hasMetric } from './format.ts';

export type TrendMetric = 'oxygen' | 'temperature' | 'ph';
export interface TrendPoint { time: string; value: number; count: number }
const minuteMs = 60_000;
const freshnessMs = 5 * minuteMs;

export function buildTrendSeries(ponds: Pond[], metric: TrendMetric, rangeHours: number): TrendPoint[] {
  const buckets = new Map<number, { time: number; samples: Map<string, { time: number; value: number }> }>();
  for (const pond of ponds) {
    if (pond.status === 'offline' || !hasMetric(pond, metric)) continue;
    for (const point of pond.history) {
      const timestamp = Date.parse(point.time);
      const value = point[metric];
      if (!Number.isFinite(timestamp) || !Number.isFinite(value)) continue;
      const minute = Math.floor(timestamp / minuteMs);
      const bucket = buckets.get(minute) ?? { time: timestamp, samples: new Map() };
      const previous = bucket.samples.get(pond.id);
      if (!previous || timestamp >= previous.time) bucket.samples.set(pond.id, { time: timestamp, value });
      bucket.time = Math.max(bucket.time, timestamp);
      buckets.set(minute, bucket);
    }
  }
  const ordered = [...buckets.values()].sort((a, b) => a.time - b.time);
  const latest = ordered.at(-1)?.time;
  if (latest === undefined) return [];
  const start = latest - rangeHours * 3_600_000;
  const lastByPond = new Map<string, { time: number; value: number }>();
  const series: TrendPoint[] = [];
  for (const bucket of ordered) {
    if (bucket.time < start - freshnessMs) continue;
    for (const [id, sample] of bucket.samples) lastByPond.set(id, sample);
    // Carry a pond's newest value only while fresh. Each pond contributes once,
    // regardless of its sampling frequency or the other ponds' millisecond offsets.
    for (const [id, sample] of lastByPond) {
      if (bucket.time - sample.time > freshnessMs) lastByPond.delete(id);
    }
    if (bucket.time < start || !lastByPond.size) continue;
    const sum = [...lastByPond.values()].reduce((total, sample) => total + sample.value, 0);
    series.push({ time: new Date(bucket.time).toISOString(), value: sum / lastByPond.size, count: lastByPond.size });
  }
  return series;
}
