import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowDownToLine, Check, Database, Leaf, LockKeyhole, Radio, Save, Settings2, ShieldCheck, UserRound } from 'lucide-react';
import type { Settings as SiteSettings, Snapshot } from '../types';
import { useApp } from '../state/AppContext';
import { errorMessage, time } from '../lib/format';
import { Badge, Button, InlineError, PageHeading, SectionHeading } from '../components/ui';

export function Settings({ data }: { data: Snapshot }) {
  const { mutate, notify, user, mode, exportData } = useApp();
  const [siteName, setSiteName] = useState(data.settings.siteName);
  const [operator, setOperator] = useState(data.settings.operator);
  const [refreshSeconds, setRefreshSeconds] = useState(data.settings.refreshSeconds);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!dirty) { setSiteName(data.settings.siteName); setOperator(data.settings.operator); setRefreshSeconds(data.settings.refreshSeconds); } }, [data.settings.siteName, data.settings.operator, data.settings.refreshSeconds, dirty]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await mutate<{ settings: SiteSettings }>('/settings', { siteName: siteName.trim(), operator: operator.trim(), refreshSeconds }, 'PATCH'); setDirty(false); notify('系统设置已保存。'); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return <div className="page"><PageHeading eyebrow="SYSTEM SETTINGS" title="系统设置" description="让工作台贴合您的养殖场，保持数据清晰、管理有序。" /><div className="settings-layout"><div className="settings-main"><section className="panel settings-panel"><SectionHeading title="养殖场设置" subtitle="基础信息与数据刷新偏好" /><form className="settings-form" onSubmit={event => void submit(event)}><label className="field">养殖场名称<input required maxLength={80} value={siteName} onChange={event => { setSiteName(event.target.value); setDirty(true); }} /><small>显示在侧栏与工作台的养殖场名称。</small></label><label className="field">值班记录人<input required maxLength={60} value={operator} onChange={event => { setOperator(event.target.value); setDirty(true); }} /><small>设置当前养殖场的值班记录人，操作日志仍保留登录账号。</small></label><label className="field">数据刷新间隔<div className="input-with-unit"><input required min={3} max={60} type="number" value={refreshSeconds} onChange={event => { setRefreshSeconds(Number(event.target.value)); setDirty(true); }} /><span>秒</span></div><small>支持 3–60 秒。等待设备回执时会加快检查频率。</small></label>{error ? <InlineError>{error}</InlineError> : null}<div className="settings-form-footer"><span>{dirty ? '有尚未保存的更改' : <><Check size={13} /> 所有设置已保存</>}</span><Button type="submit" disabled={!dirty} busy={busy}><Save size={15} />保存设置</Button></div></form></section><section className="panel settings-export"><span className="export-icon"><Database size={25} strokeWidth={1.5} /></span><div><h2>水质数据归档</h2><p>导出全部塘口的观测记录，以 CSV 格式留存或进一步分析。</p></div><Button variant="secondary" onClick={() => void exportData('')}><ArrowDownToLine size={15} />导出全部数据</Button></section></div><aside className="settings-aside"><section className="panel account-panel"><SectionHeading title="当前账户" /><div className="account-identity"><span><UserRound size={29} strokeWidth={1.5} /></span><strong>{user?.name}</strong><Badge tone="good">养殖场管理员</Badge></div><div className="account-information"><span><LockKeyhole size={14} />登录保护<strong>安全会话</strong></span><span><ShieldCheck size={14} />会话状态<strong className="good-text">已登录</strong></span><span><Radio size={14} />运行模式<strong>{mode === 'demo' ? '演示养殖场' : '现场养殖场'}</strong></span></div></section><section className="settings-about"><span className="about-symbol"><Leaf size={22} /></span><strong>澜启渔新 · LANQI AQUA</strong><p>以数据连接塘口，以记录守护生长。</p><span><Settings2 size={12} />工作台 v1.0.0</span><small>数据更新于 {time(data.generatedAt, true)}</small>{mode === 'demo' ? <div className="demo-about-note">当前内容为演示模拟数据。设备运行、回执与告警用于体验养殖管理流程。</div> : null}</section></aside></div></div>;
}
