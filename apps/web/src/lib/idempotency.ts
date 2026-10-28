type CryptoSource = Partial<Pick<Crypto, 'randomUUID' | 'getRandomValues'>>;
let sequence = 0;

// A request deduplication key is not an authentication credential. Keep commands
// usable on HTTP LAN deployments, where randomUUID is not always available.
export function createIdempotencyKey(source: CryptoSource | undefined = globalThis.crypto): string {
  if (typeof source?.randomUUID === 'function') {
    try { return source.randomUUID(); } catch { /* Try the broadly supported random source below. */ }
  }
  if (typeof source?.getRandomValues === 'function') {
    try {
      const bytes = source.getRandomValues(new Uint8Array(16));
      return `command-${Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')}`;
    } catch { /* A local sequence still provides noncredential deduplication. */ }
  }
  sequence += 1;
  return `command-${Date.now().toString(36)}-${sequence.toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}
