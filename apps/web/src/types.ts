export interface User { id: string; name: string; role: 'admin' }
export interface HistoryPoint { time: string; temperature: number; oxygen: number; ph: number }
export interface Pond {
  id: string; name: string; areaMu: number; species: string; batch: string; location: string;
  status: 'normal' | 'warning' | 'offline'; waterTemperature: number; dissolvedOxygen: number;
  ph: number; turbidity: number; waterLevel: number; updatedAt: string; history: HistoryPoint[];
  availableMetrics?: string[];
}
export interface Device {
  id: string; name: string; pondId: string; type: 'aerator' | 'pump' | 'feeder' | 'sensor';
  state: 'on' | 'off' | 'offline'; online: boolean; auto: boolean; updatedAt: string;
}
export interface Alert {
  id: string; pondId: string; deviceId: string; metric: string;
  severity: 'warning' | 'critical'; status: 'open' | 'acknowledged' | 'resolved';
  title: string; description: string; createdAt: string;
  acknowledgedAt: string | null; resolvedAt: string | null; operator: string | null;
}
export interface Command {
  id: string; deviceId: string; action: 'on' | 'off'; status: 'pending' | 'succeeded' | 'failed' | 'expired';
  createdAt: string; finishedAt: string | null; operator: string; error: string | null; idempotencyKey: string;
}
export interface FeedTask {
  id: string; pondId: string; amountKg: number; scheduledAt: string; createdAt: string;
  status: 'scheduled' | 'completed' | 'cancelled'; operator: string;
}
export interface AuditEvent {
  id: string; type: string; title: string; detail: string; createdAt: string;
  operator: string; source: 'demo' | 'device' | 'user';
}
export interface Settings { siteName: string; operator: string; refreshSeconds: number }
export interface Snapshot {
  mode: 'demo' | 'live'; generatedAt: string; site: { name: string; location: string };
  ponds: Pond[]; devices: Device[]; alerts: Alert[]; commands: Command[];
  feedTasks: FeedTask[]; events: AuditEvent[]; settings: Settings;
}
export type Page = 'dashboard' | 'ponds' | 'devices' | 'alerts' | 'feeding' | 'logs' | 'settings';
