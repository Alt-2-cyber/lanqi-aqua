import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Command, Page, Snapshot, User } from '../types';
import { ApiError, downloadObservations, request } from '../lib/api';
import { errorMessage } from '../lib/format';

interface Toast { id: number; message: string; tone: 'success' | 'error' | 'info' }
interface AppState {
  user: User | null; mode: 'demo' | 'live'; ready: boolean; connectionError: string;
  snapshot: Snapshot | null; loading: boolean; refreshing: boolean; snapshotError: string;
  page: Page; navigate: (page: Page) => void; pondId: string; selectPond: (id: string) => void;
  login: (username?: string, password?: string) => Promise<void>; logout: () => Promise<void>;
  refresh: () => Promise<void>; reconnect: () => Promise<void>;
  mutate: <T>(path: string, body: unknown, method?: string) => Promise<T>;
  notify: (message: string, tone?: Toast['tone']) => void;
  toasts: Toast[]; dismissToast: (id: number) => void; exportData: (id?: string) => Promise<void>;
}
const Context = createContext<AppState | null>(null);
const pages = new Set<Page>(['dashboard', 'ponds', 'devices', 'alerts', 'feeding', 'logs', 'settings']);
function currentPage(): Page {
  const page = window.location.hash.replace(/^#\/?/, '').split('?')[0] as Page;
  return pages.has(page) ? page : 'dashboard';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [ready, setReady] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState<Page>(currentPage);
  const [pondId, selectPond] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const fetching = useRef(false);
  const knownCommands = useRef(new Map<string, Command['status']>());
  const toastCounter = useRef(0);
  const dismissToast = useCallback((id: number) => setToasts(previous => previous.filter(item => item.id !== id)), []);
  const notify = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = ++toastCounter.current;
    setToasts(previous => [...previous.slice(-3), { id, message, tone }]);
    setTimeout(() => dismissToast(id), tone === 'error' ? 8000 : 5000);
  }, [dismissToast]);
  const navigate = useCallback((next: Page) => { window.location.hash = `/${next}`; setPage(next); }, []);

  const reconnect = useCallback(async () => {
    setConnectionError('');
    const [health, session] = await Promise.allSettled([
      request<{ mode: 'demo' | 'live' }>('/health'),
      request<{ user: User; mode: 'demo' | 'live' }>('/auth/me'),
    ]);
    if (health.status === 'fulfilled') setMode(health.value.mode);
    else setConnectionError(errorMessage(health.reason));
    if (session.status === 'fulfilled') { setUser(session.value.user); setMode(session.value.mode); }
    else if (!(session.reason instanceof ApiError && session.reason.status === 401)) setConnectionError(errorMessage(session.reason));
    setReady(true);
  }, []);
  useEffect(() => { void reconnect(); }, [reconnect]);
  useEffect(() => {
    const handler = () => setPage(currentPage());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const refresh = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    setRefreshing(true);
    try {
      const data = await request<Snapshot>('/snapshot');
      for (const command of data.commands) {
        const before = knownCommands.current.get(command.id);
        if (before === 'pending' && command.status !== 'pending') {
          const device = data.devices.find(item => item.id === command.deviceId);
          notify(command.status === 'succeeded' ? `${device?.name ?? '设备'}已返回成功回执。`
            : `${device?.name ?? '设备'}${command.status === 'expired' ? '指令已超时' : '执行失败'}${command.error ? `：${command.error}` : '，请检查设备状态。'}`,
          command.status === 'succeeded' ? 'success' : 'error');
        }
        knownCommands.current.set(command.id, command.status);
      }
      setSnapshot(data); setMode(data.mode); setSnapshotError('');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null); setSnapshot(null); notify('登录已过期，请重新登录。', 'info');
      } else setSnapshotError(errorMessage(error));
    } finally { fetching.current = false; setLoading(false); setRefreshing(false); }
  }, [notify]);
  const hasPendingCommands = snapshot?.commands.some(item => item.status === 'pending') ?? false;
  const refreshSeconds = snapshot?.settings.refreshSeconds ?? 5;
  useEffect(() => {
    if (!user) return;
    void refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, hasPendingCommands ? 1200 : refreshSeconds * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [user, refresh, refreshSeconds, hasPendingCommands]);

  const login = useCallback(async (username?: string, password?: string) => {
    const data = await request<{ user: User; mode: 'demo' | 'live' }>(username === undefined ? '/auth/demo' : '/auth/login', username === undefined ? {} : { username, password });
    knownCommands.current.clear(); setLoading(true); setSnapshot(null); setUser(data.user); setMode(data.mode); navigate('dashboard');
  }, [navigate]);
  const logout = useCallback(async () => {
    await request('/auth/logout', {});
    setUser(null); setSnapshot(null); selectPond(''); knownCommands.current.clear(); navigate('dashboard');
  }, [navigate]);
  const mutate = useCallback(async <T,>(path: string, body: unknown, method = 'POST'): Promise<T> => {
    const result = await request<T>(path, body, method);
    await refresh();
    return result;
  }, [refresh]);
  const exportData = useCallback(async (id?: string) => {
    try { await downloadObservations(id ?? pondId); notify('水质观测数据已导出。'); }
    catch (error) { notify(errorMessage(error), 'error'); }
  }, [notify, pondId]);

  return <Context.Provider value={{ user, mode, ready, connectionError, snapshot, loading, refreshing, snapshotError, page, navigate, pondId, selectPond, login, logout, refresh, reconnect, mutate, notify, toasts, dismissToast, exportData }}>{children}</Context.Provider>;
}
export function useApp() { const value = useContext(Context); if (!value) throw new Error('AppProvider is required'); return value; }
