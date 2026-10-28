import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { State, User, AuditEvent } from './types.js';
import { createInitialState } from './seed.js';

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const id = (prefix: string) => `${prefix}-${randomUUID()}`;

export class Store {
  readonly db: DatabaseSync;
  constructor(path: string, private mode: 'demo' | 'live') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_json TEXT NOT NULL, expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS samples (id TEXT PRIMARY KEY, created INTEGER NOT NULL);');
    if (!this.db.prepare('SELECT id FROM state WHERE id=1').get()) this.save(createInitialState(mode));
    this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  }
  read(): State {
    const state = JSON.parse((this.db.prepare('SELECT value FROM state WHERE id=1').get() as { value: string }).value) as State;
    state.metricTimestamps ??= {};
    state.availableMetrics ??= {};
    for (const pond of state.ponds) {
      const known = state.availableMetrics[pond.id] ?? (this.mode === 'demo' && pond.updatedAt !== '1970-01-01T00:00:00.000Z' ? ['oxygen', 'temperature', 'ph', 'turbidity', 'waterLevel'] : []);
      state.metricTimestamps[pond.id] ??= Object.fromEntries(known.map(metric => [metric, pond.updatedAt]));
      pond.availableMetrics ??= known;
    }
    return state;
  }
  save(state: State) { this.db.prepare('INSERT INTO state(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(state)); }
  mutate<T>(fn: (state: State) => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const state = this.read(); const value = fn(state); this.save(state); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  session(user: User) {
    const token = randomBytes(32).toString('base64url');
    this.db.prepare('INSERT INTO sessions(token_hash,user_json,expires) VALUES(?,?,?)').run(hash(token), JSON.stringify(user), Date.now() + 8 * 3600_000);
    return token;
  }
  user(token: string): User | null {
    if (!token) return null;
    const row = this.db.prepare('SELECT user_json FROM sessions WHERE token_hash=? AND expires>?').get(hash(token), Date.now()) as { user_json: string } | undefined;
    return row ? JSON.parse(row.user_json) as User : null;
  }
  logout(token: string) { this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token)); }
  sampleSeen(sampleId: string) { return Boolean(this.db.prepare('SELECT id FROM samples WHERE id=?').get(sampleId)); }
  rememberSample(sampleId: string) { this.db.prepare('INSERT OR IGNORE INTO samples(id,created) VALUES(?,?)').run(sampleId, Date.now()); }
  close() { this.db.close(); }
}

export function record(state: State, event: Omit<AuditEvent, 'id' | 'createdAt'>) {
  state.events.unshift({ ...event, id: id('event'), createdAt: new Date().toISOString() });
  state.events = state.events.slice(0, 1000);
}
