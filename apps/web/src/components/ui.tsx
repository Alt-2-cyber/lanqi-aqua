import { useEffect, useId, useRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Check, ChevronRight, CircleAlert, Droplets, LoaderCircle, X } from 'lucide-react';
import type { Alert, Command, Pond } from '../types';

export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className={`brand ${compact ? 'brand-compact' : ''}`}><span className="brand-symbol" aria-hidden="true"><svg viewBox="0 0 44 44"><path d="M8 16c5-6 12-6 17 0l10-6v24l-10-6c-5 6-12 6-17 0 6 0 10-2 13-6-3-4-7-6-13-6Z" fill="currentColor"/><circle cx="27" cy="21" r="1.5" fill="var(--primary)"/></svg></span><span className="brand-words"><strong>澜启渔新</strong><small>LANQI AQUA</small></span></span>;
}
export function Button({ variant = 'primary', busy = false, className = '', children, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; busy?: boolean }) {
  return <button {...props} disabled={disabled || busy} className={`button button-${variant} ${className}`} aria-busy={busy || undefined}>{busy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : null}{children}</button>;
}
export function Badge({ children, tone = 'neutral', dot = true }: { children: ReactNode; tone?: 'good' | 'warning' | 'critical' | 'neutral' | 'info'; dot?: boolean }) {
  return <span className={`badge badge-${tone}`}>{dot ? <i aria-hidden="true" /> : null}{children}</span>;
}
export function PondStatus({ status, live = false, partial = false }: { status: Pond['status']; live?: boolean; partial?: boolean }) {
  const label = live ? status === 'offline' ? partial ? '观测待齐' : '离线' : '观测在线' : status === 'normal' ? '水质正常' : status === 'warning' ? '需要关注' : '离线';
  return <Badge tone={status === 'normal' ? 'good' : status === 'warning' && !live ? 'warning' : 'neutral'}>{label}</Badge>;
}
export function AlertStatus({ status }: { status: Alert['status'] }) {
  return <Badge tone={status === 'open' ? 'warning' : status === 'acknowledged' ? 'info' : 'good'}>{status === 'open' ? '待处理' : status === 'acknowledged' ? '处理中' : '已解决'}</Badge>;
}
export function CommandStatus({ status }: { status: Command['status'] }) {
  return <Badge tone={status === 'succeeded' ? 'good' : status === 'pending' ? 'info' : 'critical'}>{status === 'pending' ? '等待回执' : status === 'succeeded' ? '执行成功' : status === 'expired' ? '指令超时' : '执行失败'}</Badge>;
}
export function PageHeading({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description: string; children?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}<h1>{title}</h1><p>{description}</p></div><div className="heading-actions">{children}</div></div>;
}
export function SectionHeading({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return <div className="section-heading"><div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>{children}</div>;
}
export function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button className="text-link" onClick={onClick}>{children}<ChevronRight size={14} aria-hidden="true" /></button>;
}
export function EmptyState({ title = '暂无数据', description = '新的记录会显示在这里。', children }: { title?: string; description?: string; children?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Droplets size={26} strokeWidth={1.5} aria-hidden="true" /></span><h3>{title}</h3><p>{description}</p>{children}</div>;
}
export function Dialog({ title, description, onClose, children, wide = false }: { title: string; description?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = previous; };
  }, []);
  return <dialog ref={ref} className={`dialog ${wide ? 'dialog-wide' : ''}`} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === ref.current) { const bounds = ref.current.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose(); } }}><div className="dialog-header"><div><h2 id={titleId}>{title}</h2>{description ? <p id={descriptionId}>{description}</p> : null}</div><button className="icon-button" type="button" onClick={onClose} aria-label="关闭弹窗"><X size={20} /></button></div>{children}</dialog>;
}
export function InlineError({ children }: { children: ReactNode }) { return <div className="inline-error" role="alert"><CircleAlert size={16} aria-hidden="true" />{children}</div>; }
export function LoadingScreen() { return <div className="startup-screen"><Brand /><LoaderCircle className="spin" size={24} aria-label="正在加载" /><p>正在连接养殖场工作台…</p></div>; }
export function PageSkeleton() { return <div className="page-skeleton" aria-label="正在读取养殖场数据" role="status"><div className="skeleton skeleton-title" /><div className="stats-grid">{[0, 1, 2, 3].map(item => <div className="skeleton skeleton-stat" key={item} />)}</div><div className="skeleton skeleton-panel" /><span className="sr-only">正在加载数据</span></div>; }
export function Toasts({ items, dismiss }: { items: { id: number; message: string; tone: string }[]; dismiss: (id: number) => void }) {
  return <div className="toast-region" aria-live="polite" aria-atomic="false">{items.map(item => <div key={item.id} className={`toast toast-${item.tone}`} role={item.tone === 'error' ? 'alert' : 'status'}>{item.tone === 'error' ? <CircleAlert size={19} /> : <Check size={19} />}<span>{item.message}</span><button onClick={() => dismiss(item.id)} aria-label="关闭提示"><X size={16} /></button></div>)}</div>;
}
