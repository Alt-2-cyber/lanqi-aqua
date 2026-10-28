import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowDownToLine, ChevronRight, Droplets, FlaskConical, MapPin, Plus, Search, Thermometer, Waves, Wind } from 'lucide-react';
import type { Pond, Snapshot } from '../types';
import { useApp } from '../state/AppContext';
import { dateTime, errorMessage, hasMetric, metricReading } from '../lib/format';
import { Badge, Button, Dialog, EmptyState, InlineError, PageHeading, PondStatus, SectionHeading, TextLink } from '../components/ui';
import { TrendChart } from '../components/TrendChart';

function AddPond({ onClose }: { onClose: () => void }) {
  const { mutate, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('');
    const values = new FormData(event.currentTarget);
    try { await mutate('/ponds', { name: String(values.get('name')).trim(), areaMu: Number(values.get('areaMu')), species: String(values.get('species')).trim(), location: String(values.get('location')).trim() }); notify('塘口已添加，接入观测设备后即可显示水质。'); onClose(); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return <Dialog title="添加塘口" description="建立塘口档案，统一管理水质、设备和养殖记录。" onClose={onClose}><form onSubmit={event => void submit(event)} className="dialog-form"><label className="field">塘口名称<input name="name" required maxLength={60} placeholder="如：青波五号塘" autoFocus /></label><div className="form-grid"><label className="field">养殖面积 <span>亩</span><input name="areaMu" required type="number" min="0.1" max="10000" step="0.1" placeholder="如：12.5" /></label><label className="field">养殖品种<input name="species" required maxLength={60} placeholder="如：草鱼 / 鲢鱼" /></label></div><label className="field">塘口位置<input name="location" required maxLength={120} placeholder="如：养殖基地东区" /></label><div className="form-note"><Droplets size={16} />新增塘口初始显示为离线。收到有效设备观测后会更新状态与读数。</div>{error ? <InlineError>{error}</InlineError> : null}<div className="dialog-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>取消</Button><Button type="submit" busy={busy}><Plus size={16} />添加塘口</Button></div></form></Dialog>;
}

export function Ponds({ data }: { data: Snapshot }) {
  const { pondId, selectPond, navigate, exportData, mutate, notify } = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [scenarioBusy, setScenarioBusy] = useState(false);
  const ponds = useMemo(() => data.ponds.filter(pond => (!pondId || pond.id === pondId) && (filter === 'all' || pond.status === filter) && `${pond.name} ${pond.species} ${pond.location}`.includes(query)), [data.ponds, pondId, filter, query]);
  const detail: Pond | undefined = pondId ? data.ponds.find(pond => pond.id === pondId) : undefined;
  const scenario = async (type: 'low-oxygen' | 'recover') => {
    if (!detail) return; setScenarioBusy(true);
    try { await mutate('/demo/scenarios', { pondId: detail.id, scenario: type }); notify(type === 'low-oxygen' ? '已生成模拟低氧观测，请前往告警中心跟进。' : '模拟读数已恢复，告警仍需按流程处理。'); }
    catch (error) { notify(errorMessage(error), 'error'); } finally { setScenarioBusy(false); }
  };
  return <div className="page"><PageHeading eyebrow="POND MANAGEMENT" title="塘口管理" description="为每一口塘建立清晰档案，关注生长，也关注水的变化。"><Button variant="secondary" onClick={() => void exportData()}><ArrowDownToLine size={16} />导出水质</Button><Button onClick={() => setShowAdd(true)}><Plus size={17} />添加塘口</Button></PageHeading>
    <div className="filter-toolbar"><div className="filter-tabs" role="group" aria-label="塘口状态">{[{id:'all',label:'全部塘口'},{id:'normal',label:data.mode === 'live' ? '观测在线' : '正常'},{id:'warning',label:'需关注'},{id:'offline',label:'离线'}].filter(item => data.mode === 'demo' || item.id !== 'warning').map(item => <button key={item.id} aria-pressed={filter === item.id} className={filter === item.id ? 'active' : ''} onClick={() => setFilter(item.id)}>{item.label}<span>{data.ponds.filter(pond => (!pondId || pond.id === pondId) && (item.id === 'all' || pond.status === item.id)).length}</span></button>)}</div><label className="search-field"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索塘口、品种或位置" aria-label="搜索塘口" /></label>{pondId ? <button className="text-link clear-pond" onClick={() => selectPond('')}>查看全部塘口</button> : null}</div>
    <div className="pond-cards-grid">{ponds.map((pond, index) => <article className={`pond-card ${pond.status === 'warning' ? 'pond-warning' : ''}`} key={pond.id}><div className={`pond-card-art pond-art-${index % 4}`}><svg viewBox="0 0 400 90" aria-hidden="true"><path d="M-20 60Q60 5 160 39T420 25V100H-20Z" fill="currentColor" opacity=".1" /><path d="M-10 86Q90 19 196 59T420 40" fill="none" stroke="currentColor" opacity=".13" /><path d="M-10 66Q90-1 196 39T420 20" fill="none" stroke="currentColor" opacity=".08" /><path d="M308 24q13-12 26 0l11-8v21l-11-8q-13 12-26 0l6-3Z" fill="currentColor" opacity=".25" /></svg><span className="pond-card-id">POND {String(data.ponds.indexOf(pond) + 1).padStart(2, '0')}</span><PondStatus status={pond.status} live={data.mode === 'live'} partial={!!pond.availableMetrics?.length} /></div><div className="pond-card-body"><div className="pond-card-heading"><div><h2><button onClick={() => selectPond(pond.id)}>{pond.name}</button></h2><p>{pond.species}<span>·</span>{pond.areaMu} 亩</p></div><span className="pond-card-symbol"><Waves size={22} strokeWidth={1.4} /></span></div><div className="pond-card-metrics"><div><span><Thermometer size={13} />水温</span><strong>{metricReading(pond, 'temperature')}<small>°C</small></strong></div><div><span><Droplets size={13} />溶解氧</span><strong className={data.mode === 'demo' && hasMetric(pond, 'oxygen') && pond.dissolvedOxygen < 4.5 ? 'warning-text' : ''}>{metricReading(pond, 'oxygen')}<small>mg/L</small></strong></div><div><span><FlaskConical size={13} />pH 值</span><strong>{metricReading(pond, 'ph', 2)}</strong></div></div><div className="pond-card-bottom"><span><MapPin size={12} />{pond.location}</span><button className="text-link" onClick={() => selectPond(pond.id)}>塘口详情<ChevronRight size={13} /></button></div></div></article>)}</div>
    {!ponds.length ? <div className="panel"><EmptyState title={query || filter !== 'all' ? '没有符合条件的塘口' : '从第一口塘开始'} description={query || filter !== 'all' ? '调整筛选条件，查找您需要的塘口。' : '添加塘口档案，开始管理您的养殖场。'}>{query || filter !== 'all' ? <Button variant="secondary" onClick={() => { setQuery(''); setFilter('all'); }}>清除筛选</Button> : <Button onClick={() => setShowAdd(true)}><Plus size={16} />添加塘口</Button>}</EmptyState></div> : null}
    {detail ? <section className="panel pond-detail-panel"><SectionHeading title={`${detail.name} · 塘口详情`} subtitle={`${detail.batch || '待建立养殖批次'} · 最后观测 ${dateTime(detail.updatedAt)}`}><TextLink onClick={() => selectPond('')}>收起详情</TextLink></SectionHeading><div className="pond-detail-layout"><div className="pond-detail-readings"><div className="detail-metric"><span>浊度</span><strong>{metricReading(detail, 'turbidity')}<small>NTU</small></strong></div><div className="detail-metric"><span>水位</span><strong>{metricReading(detail, 'waterLevel', 2)}<small>m</small></strong></div><div className="detail-metric"><span>设备状态</span><strong>{data.devices.filter(device => device.pondId === detail.id && device.online).length}<small>/ {data.devices.filter(device => device.pondId === detail.id).length} 台在线</small></strong></div><Button variant="secondary" onClick={() => navigate('devices')}><Wind size={16} />管理塘口设备</Button><Button variant="ghost" onClick={() => { selectPond(detail.id); navigate('feeding'); }}>查看投喂计划<ChevronRight size={14} /></Button></div><div className="detail-trend"><TrendChart ponds={[detail]} compact demo={data.mode === 'demo'} /></div></div>{data.mode === 'demo' ? <div className="demo-scenario-bar"><div><Badge tone="neutral">演示场景</Badge><span>模拟水质变化，体验告警处理流程。</span></div><div><Button variant="secondary" busy={scenarioBusy} onClick={() => void scenario('low-oxygen')}>模拟低氧</Button><Button variant="secondary" disabled={scenarioBusy} onClick={() => void scenario('recover')}>恢复读数</Button></div></div> : null}</section> : null}
    {showAdd ? <AddPond onClose={() => setShowAdd(false)} /> : null}
  </div>;
}
