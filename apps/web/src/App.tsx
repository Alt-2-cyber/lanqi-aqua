import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { CircleAlert, RefreshCw } from 'lucide-react';
import { useApp } from './state/AppContext';
import { Shell } from './components/Shell';
import { Button, EmptyState, LoadingScreen, PageSkeleton, Toasts } from './components/ui';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Ponds } from './pages/Ponds';
import { Devices } from './pages/Devices';
import { Alerts } from './pages/Alerts';
import { Feeding } from './pages/Feeding';
import { Logs } from './pages/Logs';
import { Settings } from './pages/Settings';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('工作台页面未能加载', error, info.componentStack); }
  render() {
    if (this.state.error) return <div className="startup-screen"><CircleAlert size={30} /><h1>页面暂时无法显示</h1><p>请刷新页面重新连接养殖场。</p><Button onClick={() => window.location.reload()}>重新加载</Button></div>;
    return this.props.children;
  }
}

function Workspace() {
  const { ready, user, snapshot, loading, refreshing, snapshotError, page, refresh, toasts, dismissToast } = useApp();
  if (!ready) return <LoadingScreen />;
  if (!user) return <><Login /><Toasts items={toasts} dismiss={dismissToast} /></>;
  let content: ReactNode;
  if (!snapshot && loading) content = <PageSkeleton />;
  else if (!snapshot) content = <div className="panel"><EmptyState title="暂时无法读取养殖场数据" description={snapshotError || '请检查连接后重试。'}><Button busy={refreshing} onClick={() => void refresh()}><RefreshCw size={16} />重新加载</Button></EmptyState></div>;
  else {
    switch (page) {
      case 'ponds': content = <Ponds data={snapshot} />; break;
      case 'devices': content = <Devices data={snapshot} />; break;
      case 'alerts': content = <Alerts data={snapshot} />; break;
      case 'feeding': content = <Feeding data={snapshot} />; break;
      case 'logs': content = <Logs data={snapshot} />; break;
      case 'settings': content = <Settings data={snapshot} />; break;
      default: content = <Dashboard data={snapshot} />;
    }
  }
  return <><Shell>{snapshotError && snapshot ? <div className="connection-banner" role="alert"><CircleAlert size={16} /><span>{snapshotError} 当前显示最近一次读取的数据。</span><button onClick={() => void refresh()}>重试</button></div> : null}{content}</Shell><Toasts items={toasts} dismiss={dismissToast} /></>;
}
export function App() { return <ErrorBoundary><Workspace /></ErrorBoundary>; }
