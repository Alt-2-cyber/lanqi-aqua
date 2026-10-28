import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createApp } from './app.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
if (existsSync(resolve(root, '.env'))) loadEnvFile(resolve(root, '.env'));
const mode = process.env.DEMO_MODE === 'false' ? 'live' : 'demo';
const runtime = createApp({
  mode, dbPath: resolve(process.env.DATA_DIR || resolve(root, 'data'), `${mode}.sqlite`),
  adminUsername: process.env.ADMIN_USERNAME, adminPassword: process.env.ADMIN_PASSWORD,
  ingestToken: process.env.DEVICE_INGEST_TOKEN,
  allowedOrigins: (process.env.WEB_ORIGINS ?? '').split(',').map(x => x.trim()).filter(Boolean),
  secureCookies: process.env.SECURE_COOKIES === 'true',
});
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4300);
const server = runtime.app.listen(port, host, () => console.log(`Lanqi Aqua ${mode} API: http://${host}:${port}`));
const stop = () => { server.close(() => { runtime.close(); process.exit(0); }); server.closeAllConnections(); };
process.once('SIGINT', stop); process.once('SIGTERM', stop);
