import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { createApp } from '../src/app.js';

async function fixture(mode: 'demo' | 'live' = 'demo', dbPath = ':memory:') {
  const runtime = createApp({ mode, dbPath, adminUsername: 'admin', adminPassword: 'test-only-long-password', ingestToken: 'test-only-gateway-token', autoTick: false });
  const server = createServer(runtime.app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('No server port');
  let token = '';
  const request = async (path: string, method = 'GET', body?: unknown, auth = token, origin?: string) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, {
      method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(origin ? { Origin: origin } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text();
    return { status: response.status, data, headers: response.headers };
  };
  const login = async () => { const r = await request(mode === 'demo' ? '/auth/demo' : '/auth/login', 'POST', mode === 'demo' ? {} : { username: 'admin', password: 'test-only-long-password' }); assert.equal(r.status, 200); token = r.data.token; return r; };
  const close = async () => { await new Promise<void>((resolve) => { (server as Server).close(() => resolve()); server.closeAllConnections(); }); runtime.close(); };
  return { request, login, close, runtime };
}

test('authentication, cookie security, origin restrictions, logout and private data', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request('/snapshot')).status, 401);
    const login = await f.login();
    assert.match(login.headers.get('set-cookie') ?? '', /HttpOnly/);
    assert.match(login.headers.get('set-cookie') ?? '', /SameSite=Strict/);
    assert.equal((await f.request('/auth/me')).data.user.name, '演示管理员');
    assert.equal((await f.request('/settings', 'PATCH', { siteName: 'x', operator: 'x', refreshSeconds: 5 }, undefined, 'https://untrusted.example')).status, 403);
    const state = (await f.request('/snapshot')).data;
    assert.equal(state.mode, 'demo'); assert.equal(state.ponds.length, 4);
    assert.equal((await f.request('/auth/logout', 'POST', {})).status, 200);
    assert.equal((await f.request('/snapshot')).status, 401);
  } finally { await f.close(); }
});

test('command is pending until receipt, idempotent, rejects replay mismatch and offline devices', async () => {
  const f = await fixture();
  try {
    await f.login();
    const initial = (await f.request('/snapshot')).data;
    const device = initial.devices.find((x: { type: string; online: boolean }) => x.type === 'aerator' && x.online);
    const action = device.state === 'on' ? 'off' : 'on';
    const r = await f.request(`/devices/${device.id}/commands`, 'POST', { action, idempotencyKey: 'test-command-001' });
    assert.equal(r.status, 202); assert.equal(r.data.command.status, 'pending');
    assert.equal((await f.request('/snapshot')).data.devices.find((x: { id: string }) => x.id === device.id).state, device.state);
    const repeat = await f.request(`/devices/${device.id}/commands`, 'POST', { action, idempotencyKey: 'test-command-001' });
    assert.equal(repeat.data.command.id, r.data.command.id);
    assert.equal((await f.request(`/devices/${device.id}/commands`, 'POST', { action: action === 'on' ? 'off' : 'on', idempotencyKey: 'test-command-001' })).status, 409);
    f.runtime.sweep(Date.now() + 2000);
    const after = (await f.request('/snapshot')).data;
    assert.equal(after.commands.find((x: { id: string }) => x.id === r.data.command.id).status, 'succeeded');
    assert.equal(after.devices.find((x: { id: string }) => x.id === device.id).state, action);
    const offline = initial.devices.find((x: { type: string; online: boolean }) => !x.online && x.type !== 'sensor');
    assert.equal((await f.request(`/devices/${offline.id}/commands`, 'POST', { action: 'on', idempotencyKey: 'offline-001' })).status, 409);
  } finally { await f.close(); }
});

test('alert transitions require acknowledgement and forbid terminal rollback', async () => {
  const f = await fixture();
  try {
    await f.login();
    const alert = (await f.request('/snapshot')).data.alerts.find((x: { status: string }) => x.status === 'open');
    assert.equal((await f.request(`/alerts/${alert.id}`, 'PATCH', { status: 'resolved' })).status, 409);
    assert.equal((await f.request(`/alerts/${alert.id}`, 'PATCH', { status: 'acknowledged' })).data.alert.status, 'acknowledged');
    assert.equal((await f.request(`/alerts/${alert.id}`, 'PATCH', { status: 'resolved' })).data.alert.status, 'resolved');
    assert.equal((await f.request(`/alerts/${alert.id}`, 'PATCH', { status: 'acknowledged' })).status, 409);
  } finally { await f.close(); }
});

test('feed task validation, cancellation, pond registration and CSV export', async () => {
  const f = await fixture();
  try {
    await f.login();
    const scheduledAt = new Date(Date.now() + 60_000).toISOString();
    assert.equal((await f.request('/feed-tasks', 'POST', { pondId: 'pond-1', amountKg: -1, scheduledAt })).status, 400);
    assert.equal((await f.request('/feed-tasks', 'POST', { pondId: 'missing', amountKg: 10, scheduledAt })).status, 404);
    const task = await f.request('/feed-tasks', 'POST', { pondId: 'pond-1', amountKg: 10, scheduledAt });
    assert.equal(task.status, 201);
    assert.equal((await f.request(`/feed-tasks/${task.data.task.id}`, 'PATCH', { status: 'cancelled' })).data.task.status, 'cancelled');
    assert.equal((await f.request(`/feed-tasks/${task.data.task.id}`, 'PATCH', { status: 'completed' })).status, 409);
    const pond = await f.request('/ponds', 'POST', { name: '=HYPERLINK("https://example.test")', areaMu: 6, species: '草鱼', location: '测试区' });
    assert.equal(pond.status, 201); assert.equal(pond.data.pond.status, 'offline');
    assert.equal((await f.request('/export/observations.csv?pondId=pond-1')).status, 200);
    const csv = (await f.request('/export/observations.csv')).data as string;
    assert.ok(csv.includes('青波一号塘')); assert.ok(csv.includes('demo')); assert.ok(!csv.includes('\n=HYPERLINK'));
  } finally { await f.close(); }
});

test('settings survive process restart and sessions are persisted safely', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lanqi-api-'));
  const path = join(dir, 'state.sqlite');
  try {
    const one = await fixture('demo', path); await one.login();
    assert.equal((await one.request('/settings', 'PATCH', { siteName: '测试基地', operator: '维护者', refreshSeconds: 8 })).status, 200);
    await one.close();
    const two = await fixture('demo', path);
    try { await two.login(); assert.equal((await two.request('/snapshot')).data.settings.siteName, '测试基地'); } finally { await two.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('live gateway validates independent auth, rejects stale/duplicate observations and waits for real receipts', async () => {
  const f = await fixture('live');
  try {
    assert.equal((await f.request('/auth/demo', 'POST', {})).status, 404);
    assert.equal((await f.request('/auth/login', 'POST', { username: 'admin', password: 'incorrect' })).status, 401);
    await f.login();
    assert.equal((await f.request('/snapshot')).data.ponds.length, 0);
    const pond = (await f.request('/ponds', 'POST', { name: '现场塘口', areaMu: 3, species: '草鱼', location: '现场' })).data.pond;
    const sensor = (await f.request('/devices', 'POST', { name: '溶氧探头', pondId: pond.id, type: 'sensor' })).data.device;
    const aerator = (await f.request('/devices', 'POST', { name: '增氧机', pondId: pond.id, type: 'aerator' })).data.device;
    const sample = { sampleId: 'sample-001', deviceId: sensor.id, pondId: pond.id, metric: 'oxygen', value: 6.7, unit: 'mg/L', ts: new Date().toISOString(), quality: 'valid' };
    assert.equal((await f.request('/gateway/observations', 'POST', sample)).status, 401);
    const gw = 'test-only-gateway-token';
    assert.equal((await f.request('/gateway/observations', 'POST', sample, gw)).status, 201);
    assert.equal((await f.request('/gateway/observations', 'POST', sample, gw)).status, 200);
    assert.equal((await f.request('/gateway/observations', 'POST', { ...sample, sampleId: 'stale', value: 1, ts: new Date(Date.now() - 7200_000).toISOString() }, gw)).status, 409);
    assert.equal((await f.request('/gateway/observations', 'POST', { ...sample, sampleId: 'invalid', quality: 'invalid', value: 1 }, gw)).status, 202);
    assert.equal((await f.request('/snapshot')).data.ponds[0].dissolvedOxygen, 6.7);
    assert.equal((await f.request(`/gateway/commands?deviceId=${aerator.id}`, 'GET', undefined, gw)).status, 200);
    assert.equal((await f.request('/gateway/heartbeat', 'POST', { deviceId: aerator.id, state: 'off' }, gw)).status, 200);
    const command = await f.request(`/devices/${aerator.id}/commands`, 'POST', { action: 'on', idempotencyKey: 'live-command-001' });
    assert.equal(command.status, 202);
    f.runtime.sweep(Date.now() + 2000);
    assert.equal((await f.request('/snapshot')).data.commands[0].status, 'pending');
    assert.equal((await f.request('/gateway/receipts', 'POST', { commandId: command.data.command.id, deviceId: sensor.id, result: 'succeeded', actualState: 'on' }, gw)).status, 409);
    const receipt = { commandId: command.data.command.id, deviceId: aerator.id, result: 'succeeded', actualState: 'on' };
    assert.equal((await f.request('/gateway/receipts', 'POST', receipt, gw)).status, 200);
    assert.equal((await f.request('/snapshot')).data.devices.find((x: { id: string }) => x.id === aerator.id).state, 'on');
    assert.equal((await f.request('/demo/scenarios', 'POST', { pondId: pond.id, scenario: 'low-oxygen' })).status, 404);
  } finally { await f.close(); }
});
