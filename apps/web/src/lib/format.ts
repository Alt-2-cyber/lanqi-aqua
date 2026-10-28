export const time = (value: string, seconds = false) => validDate(value)
  ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hour12: false }).format(new Date(value)) : '尚无观测';
export const dateTime = (value: string) => validDate(value)
  ? new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '尚无观测';
export function validDate(value: string) { return Number.isFinite(Date.parse(value)) && Date.parse(value) > 86400000; }
export function localDateTime(value: Date) {
  const offset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}
export const fixed = (value: number, decimals = 1) => Number.isFinite(value) ? value.toFixed(decimals) : '—';
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作未完成，请稍后重试。';
export const deviceNames = { aerator: '增氧机', pump: '水泵', feeder: '投饵机', sensor: '水质传感器' };
import type { Pond } from '../types';

export type MetricKey = 'oxygen' | 'temperature' | 'ph' | 'turbidity' | 'waterLevel';
export function hasMetric(pond: Pond, metric: MetricKey) {
  return pond.availableMetrics ? pond.availableMetrics.includes(metric) : pond.status !== 'offline';
}
export function metricReading(pond: Pond, metric: MetricKey, decimals = 1) {
  const field = { oxygen: 'dissolvedOxygen', temperature: 'waterTemperature', ph: 'ph', turbidity: 'turbidity', waterLevel: 'waterLevel' } as const;
  return hasMetric(pond, metric) ? fixed(pond[field[metric]], decimals) : '—';
}
