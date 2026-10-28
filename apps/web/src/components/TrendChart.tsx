import { useId, useMemo, useState } from 'react';
import type { HistoryPoint, Pond } from '../types';
import { fixed, time } from '../lib/format';
import { buildTrendSeries } from '../lib/trend';
import { EmptyState } from './ui';

type Metric = 'oxygen' | 'temperature' | 'ph';
const metricInfo = {
  oxygen: { label: '溶解氧', unit: 'mg/L', color: '#24998b', min: 0, max: 10 },
  temperature: { label: '水温', unit: '°C', color: '#d49a56', min: 10, max: 35 },
  ph: { label: 'pH 值', unit: '', color: '#627fab', min: 4, max: 10 },
};

export function TrendChart({ ponds, compact = false, demo = false }: { ponds: Pond[]; compact?: boolean; demo?: boolean }) {
  const [metric, setMetric] = useState<Metric>('oxygen');
  const [range, setRange] = useState(24);
  const [hovered, setHovered] = useState<number | null>(null);
  const gradientId = useId().replace(/:/g, '');
  const info = metricInfo[metric];
  const series = useMemo(() => buildTrendSeries(ponds, metric, range), [ponds, metric, range]);
  const width = 620, height = compact ? 210 : 250;
  const padding = { left: 38, top: 20, right: 17, bottom: 30 };
  const maxObserved = Math.max(info.max, ...series.map(point => point.value));
  const minObserved = Math.min(info.min, ...series.map(point => point.value));
  const max = Math.ceil(maxObserved / 2) * 2;
  const min = Math.floor(minObserved / 2) * 2;
  const firstTime = series.length ? Date.parse(series[0].time) : 0;
  const spanMs = series.length ? Date.parse(series[series.length - 1].time) - firstTime : 0;
  const x = (index: number) => padding.left + (spanMs ? (Date.parse(series[index].time) - firstTime) / spanMs : .5) * (width - padding.left - padding.right);
  const y = (value: number) => padding.top + (max - value) / (max - min || 1) * (height - padding.top - padding.bottom);
  const line = series.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
  const area = series.length ? `${line} L${x(series.length - 1)},${height - padding.bottom} L${padding.left},${height - padding.bottom}Z` : '';
  const hoverPoint = hovered !== null ? series[hovered] : undefined;
  const labelIndices = [...new Set([0, Math.round((series.length - 1) / 4), Math.round((series.length - 1) / 2), Math.round((series.length - 1) * 3 / 4), series.length - 1])].filter(index => index >= 0);

  return <div className="trend-chart"><div className="chart-toolbar"><div className="metric-tabs" role="group" aria-label="趋势指标">{(Object.keys(metricInfo) as Metric[]).map(key => <button key={key} aria-pressed={metric === key} onClick={() => { setMetric(key); setHovered(null); }} className={metric === key ? 'active' : ''}><i style={{ background: metricInfo[key].color }} />{metricInfo[key].label}</button>)}</div><div className="range-tabs" role="group" aria-label="趋势时间范围">{[6, 12, 24].map(hours => <button key={hours} aria-pressed={range === hours} className={range === hours ? 'active' : ''} onClick={() => { setRange(hours); setHovered(null); }}>{hours}h</button>)}</div></div>
      {series.length ? <><div className="chart-current"><strong>{fixed(series[series.length - 1].value, metric === 'ph' ? 2 : 1)}</strong><span>{info.unit}</span><small>{ponds.length > 1 ? `${series[series.length - 1].count} 口有效均值` : '最近观测'}<span className="chart-current-dot" /></small></div><div className="chart-plot" onMouseLeave={() => setHovered(null)}><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${info.label}最近${range}小时趋势，${series.length}个观测点，最近值${fixed(series[series.length - 1].value)}${info.unit}`}><defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={info.color} stopOpacity=".18" /><stop offset="100%" stopColor={info.color} stopOpacity=".005" /></linearGradient></defs>{[0, 1, 2, 3, 4].map(index => { const value = min + (max - min) / 4 * index; return <g key={index}><line x1={padding.left} x2={width - padding.right} y1={y(value)} y2={y(value)} stroke="#e7eeea" strokeDasharray="3 5" /><text x={padding.left - 12} y={y(value) + 4} textAnchor="end" className="chart-axis">{fixed(value, value % 1 ? 1 : 0)}</text></g>; })}<path d={area} fill={`url(#${gradientId})`} />{series.length === 1 ? <circle cx={x(0)} cy={y(series[0].value)} r="4" fill={info.color} /> : null}<path d={line} fill="none" stroke={info.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />{demo && metric === 'oxygen' && min <= 4.5 && max >= 4.5 ? <><line x1={padding.left} x2={width - padding.right} y1={y(4.5)} y2={y(4.5)} stroke="#d9b27a" strokeWidth="1" strokeDasharray="5 5" /><text x={width - padding.right - 3} y={y(4.5) - 8} textAnchor="end" className="chart-threshold">演示关注线 4.5</text></> : null}{labelIndices.map(index => <text key={index} x={x(index)} y={height - 7} textAnchor={index === 0 ? 'start' : index === series.length - 1 ? 'end' : 'middle'} className="chart-axis">{time(series[index].time)}</text>)}{hoverPoint && hovered !== null ? <g><line x1={x(hovered)} x2={x(hovered)} y1={padding.top} y2={height - padding.bottom} stroke={info.color} opacity=".3" /><circle cx={x(hovered)} cy={y(hoverPoint.value)} r="5" fill="white" stroke={info.color} strokeWidth="2" /></g> : null}{series.map((point, index) => <rect key={point.time} x={x(index) - Math.max(5, (width - padding.left - padding.right) / series.length / 2)} y={padding.top} width={Math.max(10, (width - padding.left - padding.right) / series.length)} height={height - padding.top - padding.bottom} fill="transparent" tabIndex={index === series.length - 1 ? 0 : -1} aria-label={`${time(point.time)}，${fixed(point.value)}${info.unit}`} onMouseEnter={() => setHovered(index)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} onKeyDown={event => { if (event.key === 'ArrowLeft') { event.preventDefault(); setHovered(Math.max(0, (hovered ?? series.length - 1) - 1)); } if (event.key === 'ArrowRight') { event.preventDefault(); setHovered(Math.min(series.length - 1, (hovered ?? 0) + 1)); } }} />)}</svg>{hoverPoint ? <div className="chart-tooltip" style={{ left: `${Math.max(16, Math.min(84, x(hovered!) / width * 100))}%` }}><span>{time(hoverPoint.time)}</span><strong>{info.label} {fixed(hoverPoint.value, metric === 'ph' ? 2 : 1)} {info.unit}</strong></div> : null}</div><div className="chart-footnote"><span><i style={{ background: info.color }} />{ponds.length > 1 ? '分钟对齐 · 各塘最新有效值' : '塘口观测值'}</span><span>{series.length} 个观测点 · {range} 小时视图</span></div></> : <EmptyState title="暂无趋势数据" description="收到有效水质观测后，趋势会显示在这里。" />}
    </div>;
}

export function Sparkline({ history, metric = 'oxygen', warning = false }: { history: HistoryPoint[]; metric?: Metric; warning?: boolean }) {
  const values = history.slice(-18).map(point => point[metric]);
  if (values.length < 2) return <span className="sparkline-empty">尚无趋势</span>;
  const min = Math.min(...values) - .4, max = Math.max(...values) + .4;
  const path = values.map((value, index) => `${index ? 'L' : 'M'}${index / (values.length - 1) * 90},${32 - (value - min) / (max - min) * 26}`).join(' ');
  return <svg viewBox="0 0 92 36" className="sparkline" aria-label="最近水质趋势" role="img"><path d={path} fill="none" stroke={warning ? '#c68b45' : '#389b8a'} strokeWidth="2" strokeLinecap="round" /></svg>;
}
