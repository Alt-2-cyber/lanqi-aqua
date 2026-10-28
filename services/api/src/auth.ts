import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { hash } from './store.js';

export function equalSecret(a: string | undefined, b: string | undefined) {
  if (!a || !b) return false;
  return timingSafeEqual(Buffer.from(hash(a), 'hex'), Buffer.from(hash(b), 'hex'));
}
export function requestToken(req: Request) {
  const auth = req.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  try { return decodeURIComponent((req.get('cookie') ?? '').split(';').map(x => x.trim()).find(x => x.startsWith('lanqi_session='))?.slice(14) ?? ''); }
  catch { return ''; }
}
