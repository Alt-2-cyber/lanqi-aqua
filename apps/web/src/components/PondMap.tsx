import type { Pond } from '../types';
import { metricReading } from '../lib/format';

const shapes = [
  { path: 'M91 75Q95 59 115 59L271 57Q292 57 296 78L286 161Q284 181 265 181L93 181Q74 181 78 163Z', x: 185, y: 111 },
  { path: 'M325 60Q334 49 354 55L509 88Q527 93 522 111L505 171Q502 185 482 181L325 177Q309 176 312 158Z', x: 417, y: 117 },
  { path: 'M84 212Q86 198 104 198L261 199Q283 198 281 219L276 296Q274 314 252 314L111 306Q88 304 86 287Z', x: 183, y: 249 },
  { path: 'M322 199L480 204Q499 205 493 224L473 294Q469 310 450 307L320 298Q302 296 305 278L308 216Q309 200 322 199Z', x: 397, y: 253 },
];

export function PondMap({ ponds, selectedId = '', onSelect, decorative = false, demo = false }: { ponds: Pond[]; selectedId?: string; onSelect?: (id: string) => void; decorative?: boolean; demo?: boolean }) {
  return <div className={`pond-map ${decorative ? 'pond-map-decorative' : ''}`}><svg viewBox="0 0 600 365" role="group" aria-label="养殖场塘区分布，选择塘口查看详情">
    <defs><pattern id="map-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".65" fill="#c3d6ca" opacity=".6" /></pattern><linearGradient id="water-fill" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#73b9a9" /><stop offset="1" stopColor="#419585" /></linearGradient><linearGradient id="water-warning" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#a0bd9c" /><stop offset="1" stopColor="#73a889" /></linearGradient><pattern id="water-lines" width="22" height="16" patternUnits="userSpaceOnUse"><path d="M2 8q4-3 8 0t8 0" fill="none" stroke="#fff" opacity=".09" /></pattern></defs>
    <rect width="600" height="365" fill="#f3f7f1" /><rect width="600" height="365" fill="url(#map-grid)" /><path d="M-20 33Q108-11 234 10T627 39M-10 345Q99 321 207 339T612 340M44-5Q14 89 30 190T42 376M558-4Q549 86 568 181T546 378" fill="none" stroke="#dde7dc" strokeWidth="1.5" /><path d="M-20 23Q108-21 234 0T627 29M-10 356Q99 332 207 350T612 351M34-5Q4 89 20 190T32 376M569-4Q560 86 579 181T557 378" fill="none" stroke="#e2eade" strokeWidth="1" /><path d="M40 191L531 193M299 33L289 330" fill="none" stroke="#e1e9dc" strokeWidth="12" strokeLinecap="round" /><path d="M40 191L531 193M299 33L289 330" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="5 6" />
    {[{x:58,y:54},{x:56,y:286},{x:537,y:241},{x:517,y:50},{x:246,y:330},{x:544,y:137},{x:334,y:328},{x:47,y:126}].map((tree, index) => <g key={index} opacity=".8"><circle cx={tree.x} cy={tree.y} r="8" fill="#d6e4cd" /><circle cx={tree.x - 3} cy={tree.y - 3} r="6" fill="#c2d8bb" /></g>)}
    {shapes.map((shape, index) => {
      const pond = ponds[index];
      if (!pond) return null;
      const warning = demo && pond.status === 'warning';
      const offline = pond.status === 'offline';
      const stateLabel = offline ? !demo && pond.availableMetrics?.length ? '观测待齐' : '离线' : warning ? '需关注' : demo ? '正常' : '观测在线';
      const oxygen = metricReading(pond, 'oxygen');
      const label = `${pond.name}，${stateLabel}，溶解氧${oxygen === '—' ? '暂无有效观测' : `${oxygen}毫克每升`}，查看详情`;
      return <g key={pond.id} className={`map-pond ${selectedId === pond.id ? 'selected' : ''}`} tabIndex={decorative ? undefined : 0} role={decorative ? undefined : 'button'} aria-label={decorative ? undefined : label} aria-pressed={decorative ? undefined : selectedId === pond.id} onClick={() => onSelect?.(pond.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect?.(pond.id); } }}>
        <path d={shape.path} fill="none" stroke={selectedId === pond.id ? '#1b7968' : '#dfebe1'} strokeWidth={selectedId === pond.id ? 9 : 7} /><path d={shape.path} fill={offline ? '#c6d5cf' : warning ? 'url(#water-warning)' : 'url(#water-fill)'} /><path d={shape.path} fill="url(#water-lines)" /><g className="map-pond-copy"><text x={shape.x} y={shape.y - 4} textAnchor="middle" fill="#fff" fontSize="15" fontWeight="600">{pond.name}</text><text x={shape.x} y={shape.y + 19} textAnchor="middle" fill="#f5fffa" opacity=".88" fontSize="10">{pond.areaMu} 亩 · {pond.species}</text></g><rect x={shape.x - 32} y={shape.y + 30} width="64" height="21" rx="10.5" fill="#fff" opacity=".94" /><circle cx={shape.x - 20} cy={shape.y + 40.5} r="2.6" fill={offline ? '#8c9b95' : warning ? '#c28b3f' : '#2c8b73'} /><text x={shape.x + 4} y={shape.y + 44} textAnchor="middle" fill={offline ? '#748179' : warning ? '#a06c25' : '#28705e'} fontSize="9.5" fontWeight="500">{stateLabel}</text>
      </g>;
    })}
    <g transform="translate(548 25)" aria-hidden="true"><text x="0" y="0" textAnchor="middle" fill="#83948a" fontSize="9">N</text><path d="M0 7l-5 13 5-3 5 3Z" fill="#8da496" /></g><g transform="translate(29 333)" aria-hidden="true"><line x1="0" x2="64" y1="0" y2="0" stroke="#9bb09f" /><line x1="0" x2="0" y1="-3" y2="3" stroke="#9bb09f" /><line x1="64" x2="64" y1="-3" y2="3" stroke="#9bb09f" /><text x="32" y="15" textAnchor="middle" fontSize="8" fill="#90a295">塘区示意 · 非比例</text></g><text x="570" y="348" textAnchor="end" fill="#9baa9f" fontSize="8" letterSpacing="2">LANQI AQUA</text>
  </svg></div>;
}
