import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Store, id, record } from './store.js';
import { requestToken, equalSecret } from './auth.js';
import type { AppOptions, User, State, Device, Command } from './types.js';

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const fail = (status: number, message: string): never => { throw new HttpError(status, message); };
const text = z.string().trim().min(1).max(120);
const instant = z.string().datetime({ offset: true });
const emptyTime = '1970-01-01T00:00:00.000Z';
const number = z.number().finite();
const COMMAND_TTL_MS = 30_000;

export function createApp(options: AppOptions) {
  if (options.mode === 'live' && (!options.adminUsername || !options.adminPassword || options.adminPassword.length < 12 || !options.ingestToken || options.ingestToken.length < 16)) throw Error('真实模式须设置ADMIN_USERNAME、至少12字符的ADMIN_PASSWORD与至少16字符的DEVICE_INGEST_TOKEN。');
  const store = new Store(options.dbPath, options.mode);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  const origins = new Set(['http://127.0.0.1:5173', 'http://localhost:5173', ...(options.allowedOrigins ?? [])]);
  app.use('/api', (req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    const origin = req.get('origin');
    if (origin && !origins.has(origin) && origin !== `${req.protocol}://${req.get('host')}`) return res.status(403).json({ error: '此来源不允许访问。' });
    if (origin) res.set({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' });
    if (req.method === 'OPTIONS') return res.set({ 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS' }).sendStatus(204);
    next();
  });
  const users = new WeakMap<Request, User>();
  const requireUser = (req: Request, _res: Response, next: NextFunction) => {
    const user = store.user(requestToken(req));
    if (!user) return next(new HttpError(401, '请先登录，或会话已过期。'));
    users.set(req, user); next();
  };
  const name = (req: Request) => users.get(req)?.name ?? '管理员';
  const cookie = { httpOnly: true, sameSite: 'strict' as const, secure: options.secureCookies ?? false, path: '/api', maxAge: 8 * 3600_000 };
  const loginCounts = new Map<string, { count: number; until: number }>();
  const limitLogin = (req: Request) => {
    const key = req.ip ?? 'local'; const now = Date.now(); const old = loginCounts.get(key);
    if (loginCounts.size > 2000) for (const [k, v] of loginCounts) if (v.until < now) loginCounts.delete(k);
    if (!old || old.until < now) loginCounts.set(key, { count: 1, until: now + 60_000 });
    else if (++old.count > 20) fail(429, '登录尝试过于频繁，请稍后重试。');
  };
  const loggedIn = (user: User, res: Response) => {
    const token = store.session(user); res.cookie('lanqi_session', token, cookie).json({ user, token, mode: options.mode });
  };
  app.get('/api/health', (_req, res) => res.json({ ok: true, mode: options.mode, version: '1.0.0' }));
  app.post('/api/auth/demo', (req, res) => { if (options.mode !== 'demo') fail(404, '真实模式不提供演示登录。'); limitLogin(req); loggedIn({ id: 'demo-admin', name: '演示管理员', role: 'admin' }, res); });
  app.post('/api/auth/login', (req, res) => {
    limitLogin(req);
    const input = z.object({ username: text, password: z.string().min(1).max(256) }).parse(req.body);
    if (!equalSecret(input.username, options.adminUsername) || !equalSecret(input.password, options.adminPassword)) fail(401, '账号或密码不正确。');
    loggedIn({ id: 'site-admin', name: '基地管理员', role: 'admin' }, res);
  });
  app.get('/api/auth/me', requireUser, (req, res) => res.json({ user: users.get(req), mode: options.mode }));
  app.post('/api/auth/logout', (req, res) => { store.logout(requestToken(req)); res.clearCookie('lanqi_session', { path: '/api', httpOnly: true, sameSite: 'strict', secure: cookie.secure }).json({ ok: true }); });

  function sweep(now = Date.now()) {
    store.mutate(state => {
      for (const command of state.commands) {
        if (command.status !== 'pending') continue;
        const age = now - Date.parse(command.createdAt);
        const device = state.devices.find(d => d.id === command.deviceId);
        if (age >= COMMAND_TTL_MS) {
          command.status = 'expired'; command.error = '设备回执超时'; command.finishedAt = new Date(now).toISOString();
          record(state, { type: 'command', title: '设备指令已过期', detail: device?.name ?? command.deviceId, operator: '系统', source: options.mode === 'demo' ? 'demo' : 'device' });
        } else if (options.mode === 'demo' && age >= 1400) {
          command.status = device?.online ? 'succeeded' : 'failed'; command.finishedAt = new Date(now).toISOString();
          if (device?.online) { device.state = command.action; device.updatedAt = command.finishedAt; }
          else command.error = '模拟设备离线';
          record(state, { type: 'command', title: command.status === 'succeeded' ? '模拟设备已返回执行结果' : '模拟指令执行失败', detail: `${device?.name ?? command.deviceId} · ${command.action === 'on' ? '开启' : '关闭'}`, operator: command.operator, source: 'demo' });
        }
      }
      if (options.mode === 'live') {
        for (const device of state.devices) if (device.online && now - Date.parse(device.updatedAt) > 5 * 60_000) { device.online = false; device.state = 'offline'; }
        for (const pond of state.ponds) {
          pond.availableMetrics = Object.entries(state.metricTimestamps[pond.id] ?? {}).filter(([, ts]) => now - Date.parse(ts) <= 5 * 60_000).map(([metric]) => metric);
          pond.status = ['oxygen', 'temperature', 'ph'].every(metric => pond.availableMetrics.includes(metric)) ? 'normal' : 'offline';
        }
      }
    });
  }
  let lastSimulation = 0;
  function tick() {
    sweep();
    if (options.mode !== 'demo' || Date.now() - lastSimulation < 15_000) return;
    lastSimulation = Date.now();
    store.mutate(state => {
      state.ponds.forEach((pond, i) => {
        if (pond.status === 'offline') return;
        const t = Date.now() / 150_000 + i;
        pond.waterTemperature = +(25.2 + i * 0.22 + Math.sin(t) * 0.55).toFixed(2);
        pond.dissolvedOxygen = +(state.scenarioOverrides[pond.id] ? 3.92 + Math.sin(t) * 0.08 : 6.75 + Math.cos(t) * 0.3).toFixed(2);
        pond.status = state.scenarioOverrides[pond.id] ? 'warning' : 'normal';
        pond.updatedAt = new Date().toISOString();
        state.metricTimestamps[pond.id] = Object.fromEntries(['oxygen', 'temperature', 'ph', 'turbidity', 'waterLevel'].map(m => [m, pond.updatedAt]));
        pond.availableMetrics = Object.keys(state.metricTimestamps[pond.id]!);
        for (const device of state.devices) if (device.pondId === pond.id && device.online) device.updatedAt = pond.updatedAt;
        const point = { time: pond.updatedAt, temperature: pond.waterTemperature, oxygen: pond.dissolvedOxygen, ph: pond.ph };
        const last = pond.history.at(-1);
        if (!last || Date.now() - Date.parse(last.time) >= 5 * 60_000) pond.history.push(point);
        else Object.assign(last, point);
        pond.history = pond.history.slice(-288);
      });
    });
  }
  const interval = options.autoTick === false ? undefined : setInterval(tick, 500);
  interval?.unref();
  const pondById = (state: State, pondId: string) => state.ponds.find(p => p.id === pondId) ?? fail(404, '塘口不存在。');
  const deviceById = (state: State, deviceId: string) => state.devices.find(p => p.id === deviceId) ?? fail(404, '设备不存在。');

  app.get('/api/snapshot', requireUser, (_req, res) => {
    sweep();
    const { scenarioOverrides: _override, availableMetrics: _available, metricTimestamps: _times, ...state } = store.read();
    res.json({ ...state, mode: options.mode, generatedAt: new Date().toISOString() });
  });
  app.post('/api/devices/:id/commands', requireUser, (req, res) => {
    const input = z.object({ action: z.enum(['on', 'off']), idempotencyKey: z.string().min(8).max(120) }).parse(req.body);
    const deviceId = String(req.params.id);
    const command = store.mutate(state => {
      const existing = state.commands.find(c => c.idempotencyKey === input.idempotencyKey);
      if (existing) {
        if (existing.deviceId !== deviceId || existing.action !== input.action || existing.operator !== name(req)) fail(409, '该请求编号已用于其他操作。');
        return existing;
      }
      const device = deviceById(state, deviceId);
      if (!device.online || (options.mode === 'live' && Date.now() - Date.parse(device.updatedAt) > 5 * 60_000)) fail(409, '设备已离线，请先恢复连接。');
      if (device.type === 'sensor') fail(400, '监测探头不支持启停控制。');
      if (state.commands.some(c => c.deviceId === deviceId && c.status === 'pending')) fail(409, '该设备已有待回执指令。');
      const command: Command = { id: id('cmd'), deviceId, action: input.action, idempotencyKey: input.idempotencyKey, status: 'pending', createdAt: new Date().toISOString(), finishedAt: null, operator: name(req), error: null };
      state.commands.unshift(command);
      record(state, { type: 'command', title: '设备指令已提交，等待回执', detail: `${device.name} · ${input.action === 'on' ? '开启' : '关闭'}`, operator: name(req), source: 'user' });
      return command;
    });
    res.status(202).json({ command });
  });
  app.patch('/api/alerts/:id', requireUser, (req, res) => {
    const input = z.object({ status: z.enum(['acknowledged', 'resolved']) }).parse(req.body);
    const alert = store.mutate(state => {
      const alert = state.alerts.find(a => a.id === req.params.id) ?? fail(404, '告警不存在。');
      if ((alert.status === 'open' && input.status !== 'acknowledged') || (alert.status === 'acknowledged' && input.status !== 'resolved') || alert.status === 'resolved') fail(409, '请先确认告警，再记录解决结果；已结束告警不可回退。');
      alert.status = input.status; alert.operator = name(req);
      if (input.status === 'acknowledged') alert.acknowledgedAt = new Date().toISOString(); else alert.resolvedAt = new Date().toISOString();
      record(state, { type: 'alert', title: input.status === 'resolved' ? '告警已记录为解决' : '告警已确认', detail: alert.title, operator: name(req), source: 'user' });
      return alert;
    });
    res.json({ alert });
  });
  app.post('/api/feed-tasks', requireUser, (req, res) => {
    const input = z.object({ pondId: text, amountKg: number.positive().max(500), scheduledAt: instant }).parse(req.body);
    if (Date.parse(input.scheduledAt) < Date.now() - 60_000 || Date.parse(input.scheduledAt) > Date.now() + 366 * 86400_000) fail(400, '请选择一年以内的未来投喂时间。');
    const task = store.mutate(state => {
      const pond = pondById(state, input.pondId);
      const task = { ...input, id: id('feed'), createdAt: new Date().toISOString(), status: 'scheduled' as const, operator: name(req) };
      state.feedTasks.unshift(task); record(state, { type: 'feed', title: '新增投喂计划', detail: `${pond.name} · ${input.amountKg} kg`, operator: name(req), source: 'user' }); return task;
    });
    res.status(201).json({ task });
  });
  app.patch('/api/feed-tasks/:id', requireUser, (req, res) => {
    const input = z.object({ status: z.enum(['completed', 'cancelled']) }).parse(req.body);
    const task = store.mutate(state => {
      const task = state.feedTasks.find(t => t.id === req.params.id) ?? fail(404, '投喂任务不存在。');
      if (task.status !== 'scheduled') fail(409, '该投喂任务已结束。');
      task.status = input.status; task.operator = name(req);
      record(state, { type: 'feed', title: input.status === 'completed' ? '人工确认投喂记录完成' : '投喂计划已取消', detail: `${pondById(state, task.pondId).name} · ${task.amountKg} kg`, operator: name(req), source: 'user' }); return task;
    }); res.json({ task });
  });
  app.post('/api/ponds', requireUser, (req, res) => {
    const input = z.object({ name: text, areaMu: number.positive().max(100_000), species: text, location: text }).parse(req.body);
    const pond = store.mutate(state => {
      if (state.ponds.some(p => p.name === input.name)) fail(409, '塘口名称已存在。');
      const pond = { ...input, id: id('pond'), batch: '未关联批次', status: 'offline' as const, waterTemperature: 0, dissolvedOxygen: 0, ph: 0, turbidity: 0, waterLevel: 0, updatedAt: emptyTime, history: [], availableMetrics: [] };
      state.ponds.push(pond); record(state, { type: 'pond', title: '已登记新塘口', detail: input.name, operator: name(req), source: 'user' }); return pond;
    }); res.status(201).json({ pond });
  });
  app.post('/api/devices', requireUser, (req, res) => {
    const input = z.object({ name: text, pondId: text, type: z.enum(['aerator', 'pump', 'feeder', 'sensor']) }).parse(req.body);
    const device = store.mutate(state => {
      pondById(state, input.pondId);
      const device: Device = { ...input, id: id('device'), state: 'offline', online: false, auto: false, updatedAt: emptyTime };
      state.devices.push(device); record(state, { type: 'device', title: '已登记设备，等待网关连接', detail: input.name, operator: name(req), source: 'user' }); return device;
    }); res.status(201).json({ device });
  });
  app.patch('/api/settings', requireUser, (req, res) => {
    const input = z.object({ siteName: text, operator: text, refreshSeconds: z.number().int().min(3).max(60) }).parse(req.body);
    store.mutate(state => { state.settings = input; state.site.name = input.siteName; record(state, { type: 'settings', title: '基地设置已更新', detail: input.siteName, operator: name(req), source: 'user' }); }); res.json({ settings: input });
  });
  app.get('/api/export/observations.csv', requireUser, (req, res) => {
    const state = store.read(); const filter = typeof req.query.pondId === 'string' ? req.query.pondId : undefined;
    if (filter) pondById(state, filter);
    const cell = (value: string | number) => { let s = String(value); if (/^[\s]*[=+\-@]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"', '""')}"`; };
    const rows: (string | number)[][] = [['塘口', '采集时间', '水温(℃)', '溶氧(mg/L)', 'pH', '数据来源']];
    for (const pond of state.ponds) if (!filter || pond.id === filter) for (const p of pond.history) rows.push([pond.name, p.time, p.temperature, p.oxygen, p.ph, options.mode === 'demo' ? 'demo' : 'device']);
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="lanqi-observations.csv"' }).send('\uFEFF' + rows.map(r => r.map(cell).join(',')).join('\r\n'));
  });
  app.post('/api/demo/scenarios', requireUser, (req, res) => {
    if (options.mode !== 'demo') fail(404, '真实模式不可注入演示数据。');
    const input = z.object({ pondId: text, scenario: z.enum(['low-oxygen', 'recover']) }).parse(req.body);
    store.mutate(state => {
      const pond = pondById(state, input.pondId); if (pond.status === 'offline') fail(409, '请使用在线演示塘口。');
      const low = input.scenario === 'low-oxygen'; state.scenarioOverrides[pond.id] = low;
      pond.dissolvedOxygen = low ? 3.92 : 6.8; pond.status = low ? 'warning' : 'normal'; pond.updatedAt = new Date().toISOString();
      if (low && !state.alerts.some(a => a.pondId === pond.id && a.metric === 'oxygen' && a.status !== 'resolved')) state.alerts.unshift({ id: id('alert'), pondId: pond.id, deviceId: state.devices.find(d => d.pondId === pond.id && d.type === 'sensor')?.id ?? '', metric: 'oxygen', severity: 'critical', status: 'open', title: `${pond.name}溶解氧偏低`, description: '模拟低氧场景已触发，请按确认、处理、解决流程操作。', createdAt: pond.updatedAt, acknowledgedAt: null, resolvedAt: null, operator: null });
      record(state, { type: 'scenario', title: low ? '已注入低氧演示场景' : '演示观测已恢复正常', detail: pond.name, operator: name(req), source: 'demo' });
    }); res.json({ ok: true });
  });

  const gateway = (req: Request, _res: Response, next: NextFunction) => {
    if (!equalSecret(req.get('authorization')?.replace(/^Bearer /, ''), options.ingestToken)) return next(new HttpError(401, '设备网关凭据无效。'));
    if (options.mode !== 'live') return next(new HttpError(409, '真实设备须连接真实模式服务。'));
    next();
  };
  app.post('/api/gateway/heartbeat', gateway, (req, res) => {
    const input = z.object({ deviceId: text, state: z.enum(['on', 'off']) }).parse(req.body);
    store.mutate(state => { const device = deviceById(state, input.deviceId); device.online = true; device.state = input.state; device.updatedAt = new Date().toISOString(); }); res.json({ ok: true });
  });
  app.post('/api/gateway/observations', gateway, (req, res) => {
    const input = z.object({ sampleId: text, deviceId: text, pondId: text, metric: z.enum(['oxygen', 'temperature', 'ph', 'turbidity', 'waterLevel']), value: number, unit: text, ts: instant, quality: z.enum(['valid', 'invalid']) }).parse(req.body);
    if (store.sampleSeen(input.sampleId)) return res.json({ ok: true, duplicate: true });
    const state = store.read(); const device = deviceById(state, input.deviceId); const pond = pondById(state, input.pondId);
    if (device.pondId !== pond.id || device.type !== 'sensor') fail(409, '设备身份与塘口或观测类型不匹配。');
    const ts = Date.parse(input.ts);
    if (ts < Date.now() - 5 * 60_000 || ts > Date.now() + 30_000) fail(409, '观测时间过期或超前。');
    const units: Record<string, string[]> = { oxygen: ['mg/L'], temperature: ['℃', '°C'], ph: ['pH'], turbidity: ['NTU'], waterLevel: ['m'] };
    const ranges: Record<string, [number, number]> = { oxygen: [0, 30], temperature: [-5, 60], ph: [0, 14], turbidity: [0, 10_000], waterLevel: [0, 100] };
    const range = ranges[input.metric]!;
    if (!units[input.metric]!.includes(input.unit) || input.value < range[0] || input.value > range[1]) fail(400, '指标单位或取值不符合接入规范。');
    if (input.quality === 'invalid') {
      store.mutate(s => record(s, { type: 'quality', title: '网关上报无效观测', detail: `${device.name} · ${input.metric}`, operator: '设备网关', source: 'device' }));
      store.rememberSample(input.sampleId); return res.status(202).json({ ok: true, accepted: false });
    }
    const previousMetricTime = state.metricTimestamps[pond.id]?.[input.metric];
    if (previousMetricTime && ts <= Date.parse(previousMetricTime)) fail(409, '该指标的观测时间倒序或重复。');
    store.mutate(s => {
      const p = pondById(s, input.pondId); const d = deviceById(s, input.deviceId);
      const fields = { oxygen: 'dissolvedOxygen', temperature: 'waterTemperature', ph: 'ph', turbidity: 'turbidity', waterLevel: 'waterLevel' } as const;
      p[fields[input.metric]] = input.value; p.updatedAt = new Date(Math.max(Date.parse(p.updatedAt), ts)).toISOString(); d.online = true; d.state = 'on'; d.updatedAt = new Date().toISOString();
      s.availableMetrics[p.id] = [...new Set([...(s.availableMetrics[p.id] ?? []), input.metric])];
      s.metricTimestamps[p.id] ??= {}; s.metricTimestamps[p.id]![input.metric] = input.ts;
      p.availableMetrics = Object.entries(s.metricTimestamps[p.id]!).filter(([, time]) => Date.now() - Date.parse(time) <= 5 * 60_000).map(([metric]) => metric);
      if (['oxygen', 'temperature', 'ph'].every(m => p.availableMetrics.includes(m))) {
        p.status = 'normal'; p.history.push({ time: p.updatedAt, temperature: p.waterTemperature, oxygen: p.dissolvedOxygen, ph: p.ph }); p.history = p.history.slice(-288);
      } else p.status = 'offline';
    }); store.rememberSample(input.sampleId); res.status(201).json({ ok: true });
  });
  app.get('/api/gateway/commands', gateway, (req, res) => {
    const deviceId = z.string().min(1).max(120).parse(req.query.deviceId); sweep();
    const state = store.read(); deviceById(state, deviceId);
    res.json({ commands: state.commands.filter(c => c.deviceId === deviceId && c.status === 'pending' && Date.now() - Date.parse(c.createdAt) < COMMAND_TTL_MS) });
  });
  app.post('/api/gateway/receipts', gateway, (req, res) => {
    const input = z.object({ commandId: text, deviceId: text, result: z.enum(['succeeded', 'failed']), actualState: z.enum(['on', 'off']), reason: z.string().max(300).optional() }).parse(req.body);
    sweep();
    const command = store.mutate(state => {
      const c = state.commands.find(c => c.id === input.commandId) ?? fail(404, '指令不存在。');
      if (c.deviceId !== input.deviceId) fail(409, '回执设备与指令不匹配。');
      if (c.status !== 'pending') fail(409, '指令已结束或过期，不再接受回执。');
      if (input.result === 'succeeded' && input.actualState !== c.action) fail(409, '设备实际状态与目标动作不一致。');
      c.status = input.result; c.finishedAt = new Date().toISOString(); c.error = input.result === 'failed' ? input.reason ?? '设备返回失败' : null;
      const d = deviceById(state, c.deviceId); d.state = input.actualState; d.online = true; d.updatedAt = c.finishedAt;
      record(state, { type: 'receipt', title: input.result === 'succeeded' ? '设备执行已确认' : '设备返回执行失败', detail: `${d.name} · ${input.reason ?? input.actualState}`, operator: '设备网关', source: 'device' }); return c;
    }); res.json({ command });
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在。' }));
  const webDist = fileURLToPath(new URL('../../../apps/web/dist/', import.meta.url));
  if (existsSync(webDist)) { app.use(express.static(webDist)); app.get(/.*/, (_req, res) => res.sendFile(`${webDist}/index.html`)); }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) return res.status(400).json({ error: '输入内容不符合要求，请检查字段、数值和时间。' });
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error instanceof SyntaxError) return res.status(400).json({ error: '请求不是有效JSON。' });
    if (error instanceof Error && 'status' in error && error.status === 413) return res.status(413).json({ error: '请求内容过大。' });
    console.error('API internal error:', error instanceof Error ? error.message : 'unknown');
    return res.status(500).json({ error: '服务暂时无法处理请求，请稍后重试。' });
  });
  return { app, store, sweep, close() { if (interval) clearInterval(interval); store.close(); } };
}
