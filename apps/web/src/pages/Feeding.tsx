import { useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarClock, Check, CheckCheck, Fish, Plus, Scale, Utensils, X } from 'lucide-react';
import type { FeedTask, Snapshot } from '../types';
import { useApp } from '../state/AppContext';
import { dateTime, errorMessage, fixed, localDateTime } from '../lib/format';
import { Badge, Button, Dialog, EmptyState, InlineError, PageHeading, SectionHeading } from '../components/ui';

function CreateFeed({ data, onClose }: { data: Snapshot; onClose: () => void }) {
  const { pondId, mutate, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('');
    const values = new FormData(event.currentTarget);
    try { await mutate('/feed-tasks', { pondId: String(values.get('pondId')), amountKg: Number(values.get('amountKg')), scheduledAt: new Date(String(values.get('scheduledAt'))).toISOString() }); notify('投喂计划已创建。'); onClose(); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return <Dialog title="新建投喂计划" description="安排塘口投喂，执行后由现场人员记录完成。" onClose={() => { if (!busy) onClose(); }}><form className="dialog-form" onSubmit={event => void submit(event)}><label className="field">投喂塘口<select name="pondId" defaultValue={pondId || data.ponds[0]?.id} required autoFocus>{data.ponds.map(pond => <option key={pond.id} value={pond.id}>{pond.name} · {pond.species}</option>)}</select></label><div className="form-grid"><label className="field">计划投喂量 <span>kg</span><input name="amountKg" type="number" min="0.1" max="500" step="0.1" required placeholder="如：25" /></label><label className="field">投喂时间<input type="datetime-local" name="scheduledAt" defaultValue={localDateTime(new Date(Date.now() + 30 * 60000))} min={localDateTime(new Date())} required /></label></div><div className="form-note"><Scale size={17} /><span>计划仅用于投喂安排。完成记录由人员确认，不代表设备已自动投喂或饲料重量经过称量验证。</span></div>{error ? <InlineError>{error}</InlineError> : null}<div className="dialog-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>取消</Button><Button type="submit" busy={busy}><Plus size={16} />创建计划</Button></div></form></Dialog>;
}

function FinishFeed({ task, status, pondName, onClose }: { task: FeedTask; status: 'completed' | 'cancelled'; pondName: string; onClose: () => void }) {
  const { mutate, notify } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const completing = status === 'completed';
  const submit = async () => {
    setBusy(true); setError('');
    try { await mutate(`/feed-tasks/${encodeURIComponent(task.id)}`, { status }, 'PATCH'); notify(completing ? '人工投喂完成记录已保存。' : '投喂计划已取消。'); onClose(); }
    catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  };
  return <Dialog title={completing ? '记录投喂完成' : '取消投喂计划'} description={completing ? '请确认现场投喂工作已经完成。' : '取消后，此计划将不再列入待执行任务。'} onClose={() => { if (!busy) onClose(); }}><div className="feed-confirm"><span className="feed-confirm-icon"><Fish size={26} /></span><strong>{pondName}</strong><span>{task.amountKg} kg · {dateTime(task.scheduledAt)}</span></div><div className="form-note">{completing ? '这是一条人工完成记录，不代表实际称量结果。保存后不可修改。' : '已取消的任务会保留在历史记录中，取消后不可恢复。'}</div>{error ? <InlineError>{error}</InlineError> : null}<div className="dialog-actions"><Button variant="secondary" disabled={busy} onClick={onClose}>返回</Button><Button variant={completing ? 'primary' : 'danger'} busy={busy} onClick={() => void submit()}>{completing ? <Check size={15} /> : <X size={15} />}{completing ? '确认记录完成' : '确认取消计划'}</Button></div></Dialog>;
}

export function Feeding({ data }: { data: Snapshot }) {
  const { pondId } = useApp();
  const [filter, setFilter] = useState('scheduled');
  const [create, setCreate] = useState(false);
  const [finish, setFinish] = useState<{ task: FeedTask; status: 'completed' | 'cancelled' } | null>(null);
  const scope = data.feedTasks.filter(task => !pondId || task.pondId === pondId);
  const tasks = [...scope].filter(task => filter === 'all' || task.status === filter).sort((a, b) => filter === 'scheduled' ? Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt) : Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt));
  const today = new Date().toLocaleDateString('sv-SE');
  const todayTasks = scope.filter(task => new Date(task.scheduledAt).toLocaleDateString('sv-SE') === today);
  return <div className="page"><PageHeading eyebrow="FEEDING PLAN" title="投喂计划" description="按塘安排，按时投喂，把每一份养殖投入记录清楚。"><Button onClick={() => setCreate(true)} disabled={!data.ponds.length}><Plus size={17} />新建投喂计划</Button></PageHeading><div className="summary-strip feeding-summary"><div><span className="summary-strip-icon"><CalendarClock size={21} /></span><span>待执行计划<strong>{scope.filter(task => task.status === 'scheduled').length}<small>项</small></strong></span></div><div><span className="summary-strip-icon sage"><Scale size={20} /></span><span>今日计划投喂<strong>{fixed(todayTasks.filter(task => task.status !== 'cancelled').reduce((sum, task) => sum + task.amountKg, 0), 0)}<small>kg</small></strong></span></div><div><span className="summary-strip-icon"><CheckCheck size={21} /></span><span>今日已记录完成<strong>{fixed(todayTasks.filter(task => task.status === 'completed').reduce((sum, task) => sum + task.amountKg, 0), 0)}<small>kg</small></strong></span></div></div><section className="panel feeding-panel"><SectionHeading title="投喂任务" subtitle="计划有序，执行留痕。" /><div className="inset-filter"><div className="filter-tabs" role="group" aria-label="投喂计划状态">{[{id:'scheduled',label:'待执行'},{id:'completed',label:'已完成'},{id:'cancelled',label:'已取消'},{id:'all',label:'全部计划'}].map(item => <button key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={filter === item.id ? 'active' : ''}>{item.label}<span>{scope.filter(task => item.id === 'all' || task.status === item.id).length}</span></button>)}</div></div><div className="table-scroll"><table className="data-table feeding-table"><thead><tr><th>塘口</th><th>计划投喂量</th><th>计划时间</th><th>状态</th><th>记录人</th><th className="align-right">操作</th></tr></thead><tbody>{tasks.map(task => <tr key={task.id}><td><span className="table-identity"><span className="table-icon"><Fish size={18} /></span><span><strong>{data.ponds.find(pond => pond.id === task.pondId)?.name ?? '塘口'}</strong><small>{task.id.slice(-10)}</small></span></span></td><td><strong className="numeric feed-amount">{fixed(task.amountKg, task.amountKg % 1 ? 1 : 0)}</strong><span className="unit-inline">kg</span></td><td><span className="numeric">{dateTime(task.scheduledAt)}</span>{task.status === 'scheduled' && Date.parse(task.scheduledAt) < Date.now() ? <small className="table-subline warning-text">已到计划时间</small> : null}</td><td><Badge tone={task.status === 'completed' ? 'good' : task.status === 'scheduled' ? 'info' : 'neutral'}>{task.status === 'completed' ? '已完成' : task.status === 'scheduled' ? '待执行' : '已取消'}</Badge></td><td>{task.operator}</td><td className="align-right">{task.status === 'scheduled' ? <div className="table-actions"><Button variant="secondary" className="button-small" onClick={() => setFinish({ task, status: 'completed' })}><Check size={13} />记录完成</Button><button className="text-button muted" onClick={() => setFinish({ task, status: 'cancelled' })}>取消</button></div> : <span className="muted">{task.status === 'completed' ? '人工记录' : '已结束'}</span>}</td></tr>)}</tbody></table></div>{!tasks.length ? <EmptyState title={filter === 'scheduled' ? '暂无待执行投喂' : '暂无相关投喂记录'} description={filter === 'scheduled' ? '创建下一次投喂安排，让日常养殖更有序。' : '切换筛选可查看其他状态的计划。'}>{filter === 'scheduled' ? <Button onClick={() => setCreate(true)} disabled={!data.ponds.length}><Plus size={15} />新建投喂计划</Button> : null}</EmptyState> : null}<div className="panel-bottom-note"><Utensils size={13} />完成数据为人工记录，实际投喂量请以现场称量为准。</div></section>{create ? <CreateFeed data={data} onClose={() => setCreate(false)} /> : null}{finish ? <FinishFeed {...finish} pondName={data.ponds.find(pond => pond.id === finish.task.pondId)?.name ?? '塘口'} onClose={() => setFinish(null)} /> : null}</div>;
}
