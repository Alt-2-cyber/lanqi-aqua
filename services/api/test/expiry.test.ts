import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/seed.js';
import { createApp } from '../src/app.js';
import { createServer } from 'node:http';
import { once } from 'node:events';

test('expired command is never dispatched or accepted by a live gateway', async () => {
  const runtime = createApp({ mode: 'live', dbPath: ':memory:', adminUsername: 'admin', adminPassword: 'test-only-long-password', ingestToken: 'test-only-device-token', autoTick: false });
  const state = createInitialState('demo');
  state.commands.unshift({ id: 'cmd-expiring', deviceId: 'pond-1-aerator', action: 'on', idempotencyKey: 'expiry-test-key', operator: 'admin', createdAt: new Date(Date.now() - 45_000).toISOString(), finishedAt: null, error: null, status: 'pending' });
  runtime.store.save(state);
  const server = createServer(runtime.app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const addr = server.address(); if (!addr || typeof addr === 'string') throw Error('port');
  const base = `http://127.0.0.1:${addr.port}/api`;
  const headers = { Authorization: 'Bearer test-only-device-token', 'Content-Type': 'application/json' };
  try {
    const dispatch = await fetch(`${base}/gateway/commands?deviceId=pond-1-aerator`, { headers });
    assert.deepEqual((await dispatch.json()).commands, []);
    const receipt = await fetch(`${base}/gateway/receipts`, { method: 'POST', headers, body: JSON.stringify({ deviceId: 'pond-1-aerator', commandId: 'cmd-expiring', result: 'succeeded', actualState: 'on' }) });
    assert.equal(receipt.status, 409);
    assert.equal(runtime.store.read().devices.find(d => d.id === 'pond-1-aerator')?.state, 'off');
    assert.equal(runtime.store.read().commands[0]?.status, 'expired');
  } finally { await new Promise<void>(r => { server.close(() => r()); server.closeAllConnections(); }); runtime.close(); }
});

test('live mode fails closed if admin or gateway credentials are missing', () => {
  assert.throws(() => createApp({ mode: 'live', dbPath: ':memory:' }), /真实模式/);
});
