import type { State, Pond, HistoryPoint, Device } from './types.js';

export function createInitialState(mode: 'demo' | 'live'): State {
  const now = Date.now();
  const stamp = (offsetMinutes = 0) => new Date(now + offsetMinutes * 60_000).toISOString();
  const siteName = mode === 'demo' ? '青波水产示范基地' : '我的养殖基地';
  const state: State = { site: { name: siteName, location: mode === 'demo' ? '天津 · 静海' : '未设置' }, ponds: [], devices: [], alerts: [], commands: [], feedTasks: [], events: [], settings: { siteName, operator: '管理员', refreshSeconds: 5 }, scenarioOverrides: {}, availableMetrics: {}, metricTimestamps: {} };
  if (mode === 'live') return state;
  const definitions = [
    ['pond-1', '青波一号塘', 12, '草鱼 / 鲢鱼', '北区 A01', 25.6, 6.82, 7.62],
    ['pond-2', '清溪二号塘', 8.5, '鲤鱼', '北区 A02', 26.1, 3.92, 7.85],
    ['pond-3', '荷风三号塘', 10, '鲫鱼', '南区 B01', 24.8, 7.15, 7.41],
    ['pond-4', '溪南育苗塘', 4.2, '草鱼苗', '南区 B02', 25.2, 6.54, 7.53],
  ] as const;
  definitions.forEach(([id, name, areaMu, species, location, waterTemperature, dissolvedOxygen, ph], index) => {
    const history: HistoryPoint[] = Array.from({ length: 96 }, (_, i) => ({
      time: new Date(now - (95 - i) * 15 * 60_000).toISOString(),
      temperature: +(waterTemperature - 0.9 + Math.sin(i / 11 + index) * 1.2).toFixed(2),
      oxygen: +((index === 1 ? 5.8 : dissolvedOxygen) + Math.cos(i / 14 + index) * 0.55 - (index === 1 && i > 83 ? (i - 83) * 0.15 : 0)).toFixed(2),
      ph: +(ph + Math.sin(i / 19 + index) * 0.16).toFixed(2),
    }));
    const metrics = ['oxygen', 'temperature', 'ph', 'turbidity', 'waterLevel'];
    const pond: Pond = { id, name, areaMu, species, batch: `LQ-${new Date(now).getFullYear()}-${String(index + 1).padStart(3, '0')}`, location, status: index === 1 ? 'warning' : 'normal', waterTemperature, dissolvedOxygen, ph, turbidity: 13.5 + index * 2.4, waterLevel: 1.8 + index * 0.12, updatedAt: stamp(), history, availableMetrics: metrics };
    state.metricTimestamps[id] = Object.fromEntries(metrics.map(m => [m, stamp()]));
    state.ponds.push(pond);
    for (const [type, label, running] of [['sensor', '多参数水质站', 'on'], ['aerator', '智能增氧机', index === 1 ? 'on' : 'off'], ['feeder', '定量投喂机', 'off']] as const) {
      state.devices.push({ id: `${id}-${type}`, pondId: id, name: `${name.replace(/塘$/, '')} · ${label}`, type, state: running, online: true, auto: type !== 'feeder', updatedAt: stamp() } satisfies Device);
    }
  });
  state.devices.push({ id: 'pond-3-pump', name: '荷风三号 · 循环水泵', pondId: 'pond-3', type: 'pump', state: 'offline', online: false, auto: false, updatedAt: stamp(-42) });
  state.scenarioOverrides['pond-2'] = true;
  state.alerts.push(
    { id: 'alert-oxygen', pondId: 'pond-2', deviceId: 'pond-2-sensor', metric: 'oxygen', severity: 'critical', status: 'open', title: '清溪二号塘溶解氧偏低', description: '演示观测 3.92 mg/L，低于演示预警线 4.50 mg/L。请核查探头与现场状况。', createdAt: stamp(-18), acknowledgedAt: null, resolvedAt: null, operator: null },
    { id: 'alert-pump', pondId: 'pond-3', deviceId: 'pond-3-pump', metric: 'connection', severity: 'warning', status: 'open', title: '循环水泵通信中断', description: '设备已离线42分钟，请检查岸边供电和通信连接。', createdAt: stamp(-42), acknowledgedAt: null, resolvedAt: null, operator: null },
    { id: 'alert-reviewed', pondId: 'pond-1', deviceId: 'pond-1-sensor', metric: 'temperature', severity: 'warning', status: 'acknowledged', title: '一号塘水温变化已确认', description: '维护人员已核对探头，继续观察后续趋势。', createdAt: stamp(-130), acknowledgedAt: stamp(-110), resolvedAt: null, operator: '演示管理员' },
  );
  state.feedTasks.push(
    { id: 'feed-morning', pondId: 'pond-1', amountKg: 36, scheduledAt: stamp(-85), createdAt: stamp(-300), status: 'completed', operator: '演示管理员' },
    { id: 'feed-afternoon', pondId: 'pond-3', amountKg: 28, scheduledAt: stamp(55), createdAt: stamp(-60), status: 'scheduled', operator: '演示管理员' },
    { id: 'feed-nursery', pondId: 'pond-4', amountKg: 8, scheduledAt: stamp(95), createdAt: stamp(-30), status: 'scheduled', operator: '演示管理员' },
  );
  state.events.push({ id: 'event-init', type: 'system', title: '演示基地已就绪', detail: '4个示例塘口与13台模拟设备，所有读数和设备回执均为演示数据。', createdAt: stamp(-240), operator: '系统', source: 'demo' }, { id: 'event-feed', type: 'feed', title: '一号塘投喂记录已完成', detail: '人工确认投喂记录36 kg，不代表实物称量验证。', createdAt: stamp(-85), operator: '演示管理员', source: 'demo' });
  return state;
}
