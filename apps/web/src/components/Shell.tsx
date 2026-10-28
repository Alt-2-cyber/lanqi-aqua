import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Bell, BookOpen, ChevronDown, ChevronRight, ClipboardList, Droplets, LayoutDashboard, Leaf, LogOut, MapPin, Menu, Radio, Settings2, ShieldCheck, SlidersHorizontal, Waves, X } from 'lucide-react';
import type { Page } from '../types';
import { useApp } from '../state/AppContext';
import { errorMessage, time } from '../lib/format';
import { Brand } from './ui';

const navigation = [
  { id: 'dashboard', label: '总览', icon: LayoutDashboard },
  { id: 'ponds', label: '塘口管理', icon: Waves },
  { id: 'devices', label: '设备控制', icon: SlidersHorizontal },
  { id: 'alerts', label: '告警中心', icon: Bell },
  { id: 'feeding', label: '投喂计划', icon: ClipboardList },
  { id: 'logs', label: '操作日志', icon: BookOpen },
] as const;
const labels: Record<Page, string> = { dashboard: '总览', ponds: '塘口管理', devices: '设备控制', alerts: '告警中心', feeding: '投喂计划', logs: '操作日志', settings: '系统设置' };

export function Shell({ children }: { children: ReactNode }) {
  const { page, navigate, user, mode, snapshot, pondId, selectPond, logout, notify } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const pendingAlerts = snapshot?.alerts.filter(item => item.status === 'open').length ?? 0;
  const go = (next: Page) => { navigate(next); setMobileOpen(false); };
  useEffect(() => { setMobileOpen(false); }, [page]);
  useEffect(() => {
    const breakpoint = window.matchMedia('(max-width: 800px)');
    const closeDrawer = () => setMobileOpen(false);
    breakpoint.addEventListener('change', closeDrawer);
    return () => breakpoint.removeEventListener('change', closeDrawer);
  }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const controls = () => [...(sidebarRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], select, input, [tabindex="0"]') ?? [])].filter(item => item.offsetParent !== null);
    controls()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
      if (event.key === 'Tab') {
        const items = controls();
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [mobileOpen]);
  const exit = async () => {
    setLoggingOut(true);
    try { await logout(); } catch (error) { notify(errorMessage(error), 'error'); }
    finally { setLoggingOut(false); }
  };
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">跳转到主要内容</a>
    {mobileOpen ? <button className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="关闭导航" /> : null}
    <aside ref={sidebarRef} className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><button onClick={() => go('dashboard')} aria-label="澜启渔新首页"><Brand /></button><button className="icon-button mobile-only" onClick={() => setMobileOpen(false)} aria-label="关闭导航"><X size={20} /></button></div>
      <div className="workspace-label">养殖工作空间 <span>WORKSPACE</span></div>
      <nav className="main-nav" aria-label="主导航">{navigation.map(item => <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`} aria-current={page === item.id ? 'page' : undefined} onClick={() => go(item.id)}><item.icon size={19} strokeWidth={1.7} aria-hidden="true" /><span>{item.label}</span>{item.id === 'alerts' && pendingAlerts ? <span className="nav-count">{pendingAlerts}</span> : null}</button>)}</nav>
      <div className="sidebar-bottom"><div className="site-card"><span className="site-card-icon"><Leaf size={19} strokeWidth={1.5} /></span><div><strong>{snapshot?.site.name ?? '智慧养殖基地'}</strong><span><MapPin size={11} aria-hidden="true" />{snapshot?.site.location ?? '正在连接基地'}</span></div></div><button className={`nav-item settings-nav ${page === 'settings' ? 'active' : ''}`} onClick={() => go('settings')} aria-current={page === 'settings' ? 'page' : undefined}><Settings2 size={19} strokeWidth={1.7} /><span>系统设置</span></button><div className="sidebar-user"><button className="user-identity" onClick={() => go('settings')} aria-label="查看当前账户与设置"><span className="avatar">{user?.name.slice(0, 1) ?? '管'}</span><span><strong>{user?.name ?? '管理员'}</strong><small>养殖场管理员</small></span></button><button className="icon-button" title="退出登录" aria-label="退出登录" onClick={() => void exit()} disabled={loggingOut}><LogOut size={17} /></button></div></div>
    </aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-only" onClick={() => setMobileOpen(true)} aria-label="打开导航" aria-expanded={mobileOpen}><Menu size={22} /></button><span className="breadcrumb-home"><Droplets size={15} /> 工作台</span><ChevronRight size={13} aria-hidden="true" /><strong>{labels[page]}</strong></div><div className="topbar-actions"><span className={`mode-indicator ${mode === 'demo' ? 'demo' : ''}`}><Radio size={12} aria-hidden="true" />{mode === 'demo' ? '演示模式' : '现场模式'}</span><span className="topbar-divider" /><button className="notification-button icon-button" onClick={() => go('alerts')} aria-label={`告警中心，${pendingAlerts}条待处理`}><Bell size={19} />{pendingAlerts > 0 ? <i /> : null}</button><button className="topbar-avatar" aria-label="系统设置" onClick={() => go('settings')}>{user?.name.slice(0, 1) ?? '管'}</button></div></header>
      <div className="context-bar"><div className="site-context"><span className="live-dot" /><strong>{snapshot?.site.name ?? '养殖场工作台'}</strong><span className="context-location">{snapshot?.site.location}</span></div><label className="pond-select"><Waves size={15} aria-hidden="true" /><span className="sr-only">当前塘口</span><select value={pondId} onChange={event => selectPond(event.target.value)} aria-label="当前塘口"><option value="">全部塘口</option>{snapshot?.ponds.map(pond => <option key={pond.id} value={pond.id}>{pond.name}</option>)}</select><ChevronDown size={13} aria-hidden="true" /></label></div>
      <main id="main-content" className="main-content" tabIndex={-1}>{children}</main>
      <footer className="app-footer"><span>澜启渔新 <i>·</i> 让养殖管理井然有序</span><span><ShieldCheck size={12} />{mode === 'demo' ? '模拟数据' : '现场观测'}{snapshot ? ` · 更新于 ${time(snapshot.generatedAt, true)}` : ''}</span></footer>
    </div>
  </div>;
}
