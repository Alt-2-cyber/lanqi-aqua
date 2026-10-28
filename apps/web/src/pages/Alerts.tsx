import { useState } from 'react';
import { Bell, Check, CheckCheck, ChevronRight, Clock3, Filter, ShieldCheck, Waves } from 'lucide-react';
import type { Alert, Snapshot } from '../types';
import { useApp } from '../state/AppContext';
import { dateTime, errorMessage } from '../lib/format';
import { AlertStatus, Badge, Button, Dialog, EmptyState, InlineError, PageHeading } from '../components/ui';

function ResolveAlert({ alert, onClose }: { alert: Alert; onClose: () => void }) {
  const { mutate, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const resolve = async () => {
    setBusy(true); setError('');
    try { await mutate(`/alerts/${encodeURIComponent(alert.id)}`, { status: 'resolved' }, 'PATCH'); notify('告警已标记为解决，处理记录已保存。'); onClose(); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return <Dialog title="确认告警已解决" description="请核实塘口当前状况，确认处置工作已完成。" onClose={() => { if (!busy) onClose(); }}><div className="resolve-alert-copy"><span className="resolve-icon"><ShieldCheck size={26} /></span><strong>{alert.title}</strong><p>{alert.description}</p></div><div className="form-note">此操作会保存人工处理结果和操作人。水质观测仍以设备最新上报数据为准。</div>{error ? <InlineError>{error}</InlineError> : null}<div className="dialog-actions"><Button variant="secondary" onClick={onClose} disabled={busy}>继续处理</Button><Button busy={busy} onClick={() => void resolve()}><CheckCheck size={16} />确认已解决</Button></div></Dialog>;
}

export function Alerts({ data }: { data: Snapshot }) {
  const { pondId, mutate, notify, selectPond, navigate } = useApp();
  const [status, setStatus] = useState('active');
  const [severity, setSeverity] = useState('all');
  const [busy, setBusy] = useState('');
  const [resolve, setResolve] = useState<Alert | null>(null);
  const scope = data.alerts.filter(alert => !pondId || alert.pondId === pondId);
  const alerts = [...scope].filter(alert => (status === 'all' || (status === 'active' ? alert.status !== 'resolved' : alert.status === status)) && (severity === 'all' || severity === alert.severity)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const acknowledge = async (alert: Alert) => {
    setBusy(alert.id);
    try { await mutate(`/alerts/${encodeURIComponent(alert.id)}`, { status: 'acknowledged' }, 'PATCH'); notify('告警已确认，请跟进塘口处置。'); }
    catch (error) { notify(errorMessage(error), 'error'); } finally { setBusy(''); }
  };
  return <div className="page"><PageHeading eyebrow="ALERT CENTER" title="告警中心" description="及时发现，持续跟进，让每一次异常都有妥善的处理。"><div className="process-guide"><span><i>1</i>发现告警</span><ChevronRight size={12} /><span><i>2</i>确认跟进</span><ChevronRight size={12} /><span><i>3</i>标记解决</span></div></PageHeading><div className="alert-summary-grid"><div className="alert-summary-card"><span className="alert-summary-icon amber"><Bell size={23} /></span><div><span>待处理</span><strong>{scope.filter(alert => alert.status === 'open').length}</strong></div><p>及时确认并跟进</p></div><div className="alert-summary-card"><span className="alert-summary-icon blue"><Clock3 size={23} /></span><div><span>处理中</span><strong>{scope.filter(alert => alert.status === 'acknowledged').length}</strong></div><p>塘口处置进行中</p></div><div className="alert-summary-card"><span className="alert-summary-icon green"><CheckCheck size={23} /></span><div><span>已解决</span><strong>{scope.filter(alert => alert.status === 'resolved').length}</strong></div><p>处理过程已留痕</p></div></div><div className="filter-toolbar"><div className="filter-tabs" role="group" aria-label="告警状态">{[{id:'active',label:'待跟进'},{id:'open',label:'待处理'},{id:'acknowledged',label:'处理中'},{id:'resolved',label:'已解决'},{id:'all',label:'全部记录'}].map(item => <button key={item.id} aria-pressed={status === item.id} className={status === item.id ? 'active' : ''} onClick={() => setStatus(item.id)}>{item.label}</button>)}</div><label className="select-filter"><Filter size={14} /><span className="sr-only">告警等级</span><select aria-label="告警等级" value={severity} onChange={event => setSeverity(event.target.value)}><option value="all">全部等级</option><option value="critical">紧急告警</option><option value="warning">关注告警</option></select></label></div><div className="alerts-list">{alerts.map(alert => {
    const pond = data.ponds.find(item => item.id === alert.pondId);
    return <article className={`alert-card alert-${alert.status} alert-${alert.severity}`} key={alert.id}><span className={`alert-symbol ${alert.severity}`}><Bell size={21} /></span><div className="alert-card-content"><div className="alert-title-row"><h2>{alert.title}</h2><Badge tone={alert.severity === 'critical' ? 'critical' : 'warning'} dot={false}>{alert.severity === 'critical' ? '紧急' : '关注'}</Badge><AlertStatus status={alert.status} /></div><p>{alert.description}</p><div className="alert-metadata"><button onClick={() => { selectPond(alert.pondId); navigate('ponds'); }}><Waves size={13} />{pond?.name ?? '塘口'}</button><span>触发时间 {dateTime(alert.createdAt)}</span><span>设备 {data.devices.find(device => device.id === alert.deviceId)?.name ?? alert.deviceId}</span></div>{alert.status !== 'open' ? <div className="alert-timeline"><Check size={12} /><span>{alert.operator ?? '管理员'} 已确认 · {alert.acknowledgedAt ? dateTime(alert.acknowledgedAt) : '时间未记录'}{alert.resolvedAt ? ` ｜ 已解决 · ${dateTime(alert.resolvedAt)}` : ''}</span></div> : null}</div><div className="alert-card-actions">{alert.status === 'open' ? <Button variant="secondary" busy={busy === alert.id} disabled={!!busy && busy !== alert.id} onClick={() => void acknowledge(alert)}>确认告警</Button> : alert.status === 'acknowledged' ? <Button onClick={() => setResolve(alert)}><Check size={14} />标记解决</Button> : <span className="resolved-caption"><ShieldCheck size={16} />处置完成</span>}</div></article>;
  })}</div>{!alerts.length ? <div className="panel"><EmptyState title="当前没有符合条件的告警" description={status === 'active' ? '保持关注水质变化，让塘区稳定运行。' : '调整筛选条件查看其他告警记录。'} /></div> : null}<p className="page-footnote"><ShieldCheck size={13} />告警需先确认再解决。恢复观测值不会自动关闭人工处理流程。{data.mode === 'demo' ? ' 当前告警均来自模拟养殖场。' : ''}</p>{resolve ? <ResolveAlert alert={resolve} onClose={() => setResolve(null)} /> : null}</div>;
}
