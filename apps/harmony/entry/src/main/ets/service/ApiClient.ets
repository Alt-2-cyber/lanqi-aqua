import { rcp } from '@kit.RemoteCommunicationKit';
import { ApiErrorBody, AuthResult, Command, CommandResult, Snapshot } from '../model/Models';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number = 0) {
    super(message);
    this.status = status;
  }
}

interface LoginBody { username: string; password: string; }
interface CommandBody { action: string; idempotencyKey: string; }
interface StatusBody { status: string; }
interface FeedBody { pondId: string; amountKg: number; scheduledAt: string; }

export class ApiClient {
  baseUrl: string = 'http://127.0.0.1:4300';
  token: string = '';

  private async request(path: string, method: rcp.HttpMethod, body: string = ''): Promise<string> {
    let session: rcp.Session | undefined;
    const headers: rcp.RequestHeaders = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (this.token.length > 0) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    try {
      session = rcp.createSession({
        requestConfiguration: {
          transfer: { autoRedirect: false, timeout: { connectMs: 8000, transferMs: 10000 } }
        }
      });
      const request = new rcp.Request(`${this.baseUrl}${path}`, method, headers,
        body.length > 0 ? body : undefined);
      const response = await session.fetch(request);
      const payload = response.toString() || '';
      if (response.statusCode < 200 || response.statusCode >= 300) {
        let message = `服务返回 ${response.statusCode}`;
        try {
          const detail = JSON.parse(payload) as ApiErrorBody;
          if (detail.error) { message = detail.error; }
        } catch (_parseError) {
          // Preserve the HTTP error when an intermediary returns non-JSON data.
        }
        throw new ApiError(message, response.statusCode);
      }
      return payload;
    } catch (error) {
      if (error instanceof ApiError) { throw error; }
      throw new ApiError('暂时无法连接服务，请检查后端地址与网络后重试');
    } finally {
      if (session) {
        try { session.close(); } catch (_closeError) { /* Response was already consumed. */ }
      }
    }
  }

  async demoLogin(): Promise<AuthResult> {
    const result = JSON.parse(await this.request('/api/auth/demo', 'POST', '{}')) as AuthResult;
    this.token = result.token;
    return result;
  }

  async login(username: string, password: string): Promise<AuthResult> {
    const body: LoginBody = { username: username, password: password };
    const result = JSON.parse(await this.request('/api/auth/login', 'POST', JSON.stringify(body))) as AuthResult;
    this.token = result.token;
    return result;
  }

  async snapshot(): Promise<Snapshot> {
    return JSON.parse(await this.request('/api/snapshot', 'GET')) as Snapshot;
  }

  async command(deviceId: string, action: string, key: string): Promise<Command> {
    const body: CommandBody = { action: action, idempotencyKey: key };
    const result = JSON.parse(await this.request(`/api/devices/${encodeURIComponent(deviceId)}/commands`,
      'POST', JSON.stringify(body))) as CommandResult;
    return result.command;
  }

  async updateAlert(id: string, status: string): Promise<void> {
    const body: StatusBody = { status: status };
    await this.request(`/api/alerts/${encodeURIComponent(id)}`, 'PATCH', JSON.stringify(body));
  }

  async createFeed(pondId: string, amountKg: number, scheduledAt: string): Promise<void> {
    const body: FeedBody = { pondId: pondId, amountKg: amountKg, scheduledAt: scheduledAt };
    await this.request('/api/feed-tasks', 'POST', JSON.stringify(body));
  }

  async updateFeed(id: string, status: string): Promise<void> {
    const body: StatusBody = { status: status };
    await this.request(`/api/feed-tasks/${encodeURIComponent(id)}`, 'PATCH', JSON.stringify(body));
  }

  async logout(): Promise<void> {
    try {
      await this.request('/api/auth/logout', 'POST', '{}');
    } finally {
      this.token = '';
    }
  }
}
