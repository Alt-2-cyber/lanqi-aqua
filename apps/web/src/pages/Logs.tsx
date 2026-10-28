import { useState } from 'react';
import { Activity, Bell, BookOpen, Check, ClipboardList, Radio, Search, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import type { Snapshot } from '../types';
import { useApp } from '../state/AppContext';
import { dateTime } from '../lib/format';
import { Badge, EmptyState, PageHeading, SectionHeading } from '../components/ui';

const sourceLabel = { demo: '模拟事件', device: '设备上报', user: '人工操作' };
function eventIcon(type: string) {
  if (type.includes('command') || type.includes('device')) return SlidersHorizontal;
  if (type.includes('alert')) return Bell;
  if (type.includes('feed')) return ClipboardList;
  if (type.includes('observation')) return Activity;
  if (type.includes('auth') || type.includes('login')) return ShieldCheck;
  return BookOpen;
}

export function Logs({ data }: { data: Snapshot }) {
  const { mode } = useApp();
  const [source, setSource] = useState('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(30);
  const events = [...data.events].filter(event => (source === 'all' || event.source === source) && `${event.title} ${event.detail} ${event.operator}`.includes(query)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return <div className="page"><PageHeading eyebrow="ACTIVITY LOG" title="操作日志" description="从设备回执到人工处置，每一个重要动作都有迹可循。"><span className="page-mode-note"><ShieldCheck size={15} />养殖场活动记录 · {data.events.length} 条</span></PageHeading><section className="panel logs-panel"><SectionHeading title="养殖场动态" subtitle={mode === 'demo' ? '演示养殖场的模拟事件与人工操作记录' : '来自设备与管理人员的操作记录'} /><div className="filter-toolbar inset-toolbar"><div className="filter-tabs" role="group" aria-label="日志来源">{[{id:'all',label:'全部动态'},{id:'user',label:'人工操作'},{id:'device',label:'设备上报'},{id:'demo',label:'模拟事件'}].map(item => <button key={item.id} aria-pressed={source === item.id} className={source === item.id ? 'active' : ''} onClick={() => { setSource(item.id); setLimit(30); }}>{item.label}</button>)}</div><label className="search-field"><Search size={16} /><input value={query} onChange={event => { setQuery(event.target.value); setLimit(30); }} placeholder="搜索操作或记录人" aria-label="搜索操作日志" /></label></div><div className="event-timeline">{events.slice(0, limit).map(event => { const Icon = eventIcon(event.type); return <article className="event-item" key={event.id}><span className={`event-icon event-source-${event.source}`}><Icon size={18} /></span><div className="event-copy"><div><h3>{event.title}</h3><Badge tone={event.source === 'demo' ? 'neutral' : event.source === 'device' ? 'info' : 'good'} dot={false}>{sourceLabel[event.source]}</Badge></div><p>{event.detail}</p><span className="event-operator"><Check size={12} />{event.operator}</span></div><time className="event-time" dateTime={event.createdAt}>{dateTime(event.createdAt)}</time></article>; })}</div>{!events.length ? <EmptyState title="暂无符合条件的操作记录" description="设备上报、塘口操作与任务变化会记录在这里。" /> : null}{events.length > limit ? <div className="load-more"><button className="button button-secondary" onClick={() => setLimit(previous => previous + 30)}>加载更多记录</button><span>已显示 {Math.min(limit, events.length)} / {events.length} 条</span></div> : null}<div className="panel-bottom-note"><Radio size={13} />{mode === 'demo' ? '当前空间为演示养殖场；“人工操作”同样发生在模拟数据上。' : '日志展示来源与记录人，帮助还原养殖管理过程。'}</div></section></div>;
}
