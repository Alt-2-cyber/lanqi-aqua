import assert from 'node:assert/strict';
import test from 'node:test';
import { createIdempotencyKey } from '../src/lib/idempotency.ts';

test('command keys work over HTTP when randomUUID is unavailable', () => {
  const source = { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) };
  const values = Array.from({ length: 1000 }, () => createIdempotencyKey(source));
  assert.equal(new Set(values).size, values.length);
  assert.ok(values.every(value => value.length >= 16 && value.length < 120));
});

test('noncredential keys remain unique when crypto is absent', () => {
  const values = Array.from({ length: 1000 }, () => createIdempotencyKey({}));
  assert.equal(new Set(values).size, values.length);
});
