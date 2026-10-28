import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createApp } from '../src/app.js';

test('telemetry ordering is per metric, missing values stay unavailable, and telemetry expires', async () => {
  const runtime = createApp({ mode: 'live', dbPath: ':memory:', adminUsername: 'admin', adminPassword: 'test-only-long-password', ingestToken: 'test-only-gateway-token', autoTick: false });
  const server = createServer(runtime.app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const addr = server.address(); if (!addr || typeof addr === 'string') throw Error('port');
  const base = `http://127.0.0.1:${addr.port}/api`;
  let userToken = '';
  async function call(path: string, method = 'GET', body?: unknown, gateway = false) {
    const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${gateway ? 'test-only-gateway-token' : userToken}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() };
  }
  try {
    userToken = (await call('/auth/login', 'POST', { username: 'admin', password: 'test-only-long-password' })).data.token;
    const pond = (await call('/ponds', 'POST', { name: '现场塘', areaMu: 3, species: '草鱼', location: '现场' })).data.pond;
    const device = (await call('/devices', 'POST', { name: '水质站', pondId: pond.id, type: 'sensor' })).data.device;
    const now = Date.now();
    const sample = (metric: string, value: number, unit: string, age = 0) => ({ deviceId: device.id, pondId: pond.id, sampleId: `sample-${metric}-${age}`, metric, value, unit, ts: new Date(now - age).toISOString(), quality: 'valid' });
    assert.equal((await call('/gateway/observations', 'POST', sample('oxygen', 6.8, 'mg/L'), true)).status, 201);
    assert.equal((await call('/gateway/observations', 'POST', sample('temperature', 24.5, '℃', 1000), true)).status, 201);
    assert.equal((await call('/gateway/observations', 'POST', sample('ph', 7.4, 'pH', 1500), true)).status, 201);
    const complete = (await call('/snapshot')).data.ponds[0];
    assert.equal(complete.status, 'normal');
    assert.deepEqual(complete.availableMetrics.sort(), ['oxygen', 'ph', 'temperature']);
    assert.ok(!complete.availableMetrics.includes('turbidity'));
    assert.ok(!complete.availableMetrics.includes('waterLevel'));
    assert.equal((await call('/gateway/observations', 'POST', sample('oxygen', 3, 'mg/L', 500), true)).status, 409);
    runtime.sweep(now + 301_000);
    const stale = runtime.store.read().ponds[0]!;
    assert.equal(stale.status, 'offline');
    assert.deepEqual(stale.availableMetrics, []);
  } finally { await new Promise<void>(r => { server.close(() => r()); server.closeAllConnections(); }); runtime.close(); }
});
