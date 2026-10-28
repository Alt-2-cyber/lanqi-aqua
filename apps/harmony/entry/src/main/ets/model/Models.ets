export interface User {
  id: string;
  name: string;
  role: string;
}

export interface HistoryPoint {
  time: string;
  temperature: number;
  oxygen: number;
  ph: number;
}

export interface Pond {
  id: string;
  name: string;
  areaMu: number;
  species: string;
  batch: string;
  location: string;
  status: string;
  availableMetrics?: string[];
  waterTemperature: number;
  dissolvedOxygen: number;
  ph: number;
  turbidity: number;
  waterLevel: number;
  updatedAt: string;
  history: HistoryPoint[];
}

export interface Device {
  id: string;
  name: string;
  pondId: string;
  type: string;
  state: string;
  online: boolean;
  auto: boolean;
  updatedAt: string;
}

export interface Alert {
  id: string;
  pondId: string;
  deviceId: string;
  metric: string;
  severity: string;
  status: string;
  title: string;
  description: string;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  operator: string | null;
}

export interface Command {
  id: string;
  deviceId: string;
  action: string;
  status: string;
  createdAt: string;
  finishedAt: string | null;
  operator: string;
  error: string | null;
  idempotencyKey: string;
}

export interface FeedTask {
  id: string;
  pondId: string;
  amountKg: number;
  scheduledAt: string;
  createdAt: string;
  status: string;
  operator: string;
}

export interface AuditEvent {
  id: string;
  type: string;
  title: string;
  detail: string;
  createdAt: string;
  operator: string;
  source: string;
}

export interface Settings {
  siteName: string;
  operator: string;
  refreshSeconds: number;
}

export interface Site {
  name: string;
  location: string;
}

export interface Snapshot {
  mode: string;
  generatedAt: string;
  site: Site;
  ponds: Pond[];
  devices: Device[];
  alerts: Alert[];
  commands: Command[];
  feedTasks: FeedTask[];
  events: AuditEvent[];
  settings: Settings;
}

export interface AuthResult {
  user: User;
  token: string;
  mode: string;
}

export interface CommandResult { command: Command; }
export interface ApiErrorBody { error: string; }

export function emptySnapshot(): Snapshot {
  return {
    mode: '', generatedAt: '', site: { name: '澜启渔新', location: '' },
    ponds: [], devices: [], alerts: [], commands: [], feedTasks: [], events: [],
    settings: { siteName: '', operator: '', refreshSeconds: 10 }
  };
}

export function emptyPond(): Pond {
  return {
    id: '', name: '尚未添加塘口', areaMu: 0, species: '', batch: '', location: '',
    status: 'offline', waterTemperature: 0, dissolvedOxygen: 0, ph: 0,
    turbidity: 0, waterLevel: 0, updatedAt: '', history: []
  };
}
