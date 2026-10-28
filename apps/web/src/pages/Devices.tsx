import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Activity, ArrowRight, Check, Clock3, Cog, Copy, Plus, Power, Radio, Search, ShieldCheck, SlidersHorizontal, Waves, Wind } from 'lucide-react';
import type { Command, Device, Snapshot } from '../types';
import { useApp } from '../state/AppContext';
import { dateTime, deviceNames, errorMessage } from '../lib/format';
import { createIdempotencyKey } from '../lib/idempotency';
import { Badge, Button, CommandStatus, Dialog, EmptyState, InlineError, PageHeading, SectionHeading } from '../components/ui';

const icons = { aerator: Wind, pump: Waves, feeder: Cog, sensor: Activity };

function AddDevice({ data, onClose }: { data: Snapshot; onClose: () => void }) {
  const { pondId, mutate, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('');
    const values = new FormData(event.currentTarget);
    try { await mutate('/devices', { name: String(values.get('name')).trim(), pondId: String(values.get('pondId')), type: String(values.get('type')) }); notify('设备已登记。可复制设备编号供现场接入配置，连接后将显示在线状态。'); onClose(); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return <Dialog title="登记设备" description="关联塘口与设备类型，建立养殖场的设备档案。" onClose={() => { if (!busy) onClose(); }}><form className="dialog-form" onSubmit={event => void submit(event)}><label className="field">设备名称<input name="name" required maxLength={60} placeholder="如：五号塘增氧机" autoFocus /></label><label className="field">所属塘口<select name="pondId" required defaultValue={pondId || data.ponds[0]?.id}>{data.ponds.map(pond => <option key={pond.id} value={pond.id}>{pond.name}</option>)}</select></label><label className="field">设备类型<select name="type" defaultValue="aerator">{Object.entries(deviceNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="form-note"><Radio size={16} /><span>登记后设备初始为离线。请将设备编号交给现场接入人员，完成连接后再进行控制。</span></div>{error ? <InlineError>{error}</InlineError> : null}<div className="dialog-actions"><Button variant="secondary" type="button" disabled={busy} onClick={onClose}>取消</Button><Button type="submit" busy={busy}><Plus size={15} />登记设备</Button></div></form></Dialog>;
}

function ConfirmCommand({ device, pondName, onClose, onAccepted }: { device: Device; pondName: string; onClose: () => void; onAccepted: (command: Command) => void }) {
  const { mutate, notify, mode } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const action = device.state === 'on' ? 'off' : 'on';
  const verb = action === 'on' ? '开启' : '关闭';
  const [key] = useState(createIdempotencyKey);
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const result = await mutate<{ command: Command }>(`/devices/${encodeURIComponent(device.id)}/commands`, { action, idempotencyKey: key });
      onAccepted(result.command); notify('指令已发送，正在等待设备回执。', 'info'); onClose();
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return <Dialog title={`确认${verb}设备`} description="指令发送后，请以设备返回的回执为准。" onClose={() => { if (!busy) onClose(); }}><div className="command-confirm-device"><span className={`device-type-icon ${device.type}`}><Power size={25} /></span><div><strong>{device.name}</strong><span>{pondName} · {deviceNames[device.type]}</span></div><Badge tone={device.online ? 'good' : 'neutral'}>{device.online ? '在线' : '离线'}</Badge></div><div className="command-preview"><span>当前状态<strong>{device.state === 'on' ? '运行中' : device.state === 'off' ? '已关闭' : '离线'}</strong></span><ArrowRight size={18} /><span>请求操作<strong>{verb}</strong></span></div><div className="form-note"><ShieldCheck size={17} /><span>{mode === 'demo' ? '当前为模拟设备。演示回执返回后，工作台才会更新设备状态。' : '指令由现场网关接收。收到合法设备回执后，工作台才会更新设备状态。'}</span></div>{error ? <InlineError>{error}</InlineError> : null}<div className="dialog-actions"><Button variant="secondary" onClick={onClose} disabled={busy}>取消</Button><Button variant={action === 'off' ? 'danger' : 'primary'} busy={busy} onClick={() => void submit()}><Power size={16} />确认{verb}</Button></div></Dialog>;
}

export function Devices({ data }: { data: Snapshot }) {
  const { pondId, navigate, selectPond, mode, notify } = useApp();
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState<Device | null>(null);
  const [accepted, setAccepted] = useState<Command[]>([]);
  const [adding, setAdding] = useState(false);
  const copyId = async (id: string) => {
    try { await navigator.clipboard.writeText(id); notify('设备编号已复制。'); }
    catch { notify(`设备编号：${id}`, 'info'); }
  };
  const commands = useMemo(() => {
    const combined = new Map(accepted.map(command => [command.id, command]));
    for (const command of data.commands) combined.set(command.id, command);
    return [...combined.values()].filter(command => !pondId || data.devices.some(device => device.id === command.deviceId && device.pondId === pondId)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [accepted, data.commands, data.devices, pondId]);
  const scope = data.devices.filter(device => !pondId || device.pondId === pondId);
  const devices = scope.filter(device => (type === 'all' || device.type === type) && `${device.name} ${data.ponds.find(pond => pond.id === device.pondId)?.name ?? ''}`.includes(query));
  return <div className="page"><PageHeading eyebrow="DEVICE CONTROL" title="设备控制" description="连接塘口设备，让每一条操作指令都有回应。"><Button onClick={() => setAdding(true)} disabled={!data.ponds.length}><Plus size={16} />登记设备</Button></PageHeading><p className="device-mode-caption"><Radio size={13} />{mode === 'demo' ? '模拟设备 · 回执由演示设备返回' : '现场设备 · 状态以设备回执为准'}</p>
    <div className="summary-strip"><div><span className="summary-strip-icon"><SlidersHorizontal size={19} /></span><span>全部设备<strong>{scope.length}<small>台</small></strong></span></div><div><span className="tiny-dot good-text" /><span>在线<strong>{scope.filter(device => device.online).length}<small>台</small></strong></span></div><div><span className="tiny-dot good-text" /><span>运行中<strong>{scope.filter(device => device.state === 'on').length}<small>台</small></strong></span></div><div><span className="tiny-dot warning-text" /><span>等待回执<strong>{commands.filter(command => command.status === 'pending').length}<small>条</small></strong></span></div></div>
    <div className="filter-toolbar"><div className="filter-tabs" role="group" aria-label="设备类型">{[{id:'all',label:'全部设备'},{id:'aerator',label:'增氧机'},{id:'pump',label:'水泵'},{id:'feeder',label:'投饵机'},{id:'sensor',label:'传感器'}].map(item => <button key={item.id} onClick={() => setType(item.id)} aria-pressed={type === item.id} className={type === item.id ? 'active' : ''}>{item.label}</button>)}</div><label className="search-field"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索设备或塘口" aria-label="搜索设备" /></label></div>
    <div className="device-cards-grid">{devices.map(device => {
      const pending = commands.find(command => command.deviceId === device.id && command.status === 'pending');
      const latest = commands.find(command => command.deviceId === device.id);
      const Icon = icons[device.type];
      const pond = data.ponds.find(item => item.id === device.pondId);
      return <article className={`device-card ${!device.online ? 'device-offline' : ''}`} key={device.id}><div className="device-card-top"><span className={`device-type-icon ${device.type}`}><Icon size={24} strokeWidth={1.5} /></span><Badge tone={device.online ? 'good' : 'neutral'}>{device.online ? '在线' : '离线'}</Badge></div><h2>{device.name}</h2><p className="device-location"><Waves size={13} />{pond?.name ?? '未关联塘口'}<span>·</span>{deviceNames[device.type]}</p><div className="device-state-line"><span>当前状态</span><strong className={device.state === 'on' ? 'good-text' : ''}>{device.type === 'sensor' && device.online ? '观测中' : device.state === 'on' ? '运行中' : device.state === 'off' ? '已关闭' : '离线'}</strong></div><div className="device-state-line"><span>控制方式</span><span>{device.type === 'sensor' ? '持续观测' : device.auto ? '自动控制' : '手动控制'}</span></div><div className="device-identifier"><span>编号 <code>{device.id}</code></span><button className="icon-button" aria-label={`复制${device.name}的设备编号`} onClick={() => void copyId(device.id)}><Copy size={12} /></button></div><div className="device-card-control">{device.type === 'sensor' ? <Button variant="secondary" onClick={() => { selectPond(device.pondId); navigate('ponds'); }}>查看水质观测<ArrowRight size={15} /></Button> : <Button variant={device.state === 'on' ? 'secondary' : 'primary'} disabled={!device.online || !!pending} busy={!!pending} onClick={() => setConfirm(device)}>{!pending ? <Power size={15} /> : null}{pending ? '等待设备回执' : !device.online ? '设备已离线' : device.state === 'on' ? '关闭设备' : '开启设备'}</Button>}</div><div className="device-card-receipt">{pending ? <><Clock3 size={12} /><span>已发送{pending.action === 'on' ? '开启' : '关闭'}指令，当前状态保持至回执返回</span></> : latest ? <><span className={latest.status === 'succeeded' ? 'good-text' : 'warning-text'}>{latest.status === 'succeeded' ? <Check size={12} /> : <Clock3 size={12} />}</span><span>最近指令{latest.status === 'succeeded' ? '执行成功' : latest.status === 'expired' ? '已超时' : '执行失败'} · {dateTime(latest.finishedAt ?? latest.createdAt)}</span></> : <><Clock3 size={12} /><span>状态更新 {dateTime(device.updatedAt)}</span></>}</div></article>;
    })}</div>{!devices.length ? <div className="panel"><EmptyState title={query || type !== 'all' ? '没有符合条件的设备' : '当前塘口暂无设备'} description={query || type !== 'all' ? '调整搜索或设备类型后重试。' : '在养殖场接入设备后，这里会显示观测和控制状态。'} /></div> : null}
    <section className="panel command-history"><SectionHeading title="指令与回执" subtitle="操作被记录，执行结果由设备确认。" /><div className="table-scroll"><table className="data-table"><thead><tr><th>设备</th><th>请求操作</th><th>发送时间</th><th>执行结果</th><th>回执时间</th><th>操作人</th></tr></thead><tbody>{commands.slice(0, 20).map(command => <tr key={command.id}><td><strong>{data.devices.find(device => device.id === command.deviceId)?.name ?? command.deviceId}</strong><small className="table-subline">{command.id.slice(-10)}</small></td><td>{command.action === 'on' ? '开启设备' : '关闭设备'}</td><td className="numeric table-date">{dateTime(command.createdAt)}</td><td><CommandStatus status={command.status} />{command.error ? <small className="command-error">{command.error}</small> : null}</td><td className="numeric table-date">{command.finishedAt ? dateTime(command.finishedAt) : '等待设备'}</td><td>{command.operator}</td></tr>)}</tbody></table></div>{!commands.length ? <EmptyState title="暂无控制指令" description="您发出的第一条指令与设备回执会记录在这里。" /> : null}</section>
    {confirm ? <ConfirmCommand device={data.devices.find(device => device.id === confirm.id) ?? confirm} pondName={data.ponds.find(pond => pond.id === confirm.pondId)?.name ?? '塘口'} onClose={() => setConfirm(null)} onAccepted={command => setAccepted(previous => [command, ...previous])} /> : null}
    {adding ? <AddDevice data={data} onClose={() => setAdding(false)} /> : null}
  </div>;
}
