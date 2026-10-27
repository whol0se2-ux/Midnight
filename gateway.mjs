import { spawn } from 'node:child_process';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { handleGameRequest } from './game-proxy.mjs';

const token = process.env.MIDNIGHT_BRIDGE_TOKEN;
if (!token || token.length < 32) {
  console.error('Set MIDNIGHT_BRIDGE_TOKEN in Hostless before deployment.');
  process.exit(1);
}

const publicPort = Number(process.env.PORT || 8080);
if (!Number.isInteger(publicPort) || publicPort < 1 || publicPort > 65535 || publicPort === 20128) {
  console.error('Invalid public PORT.');
  process.exit(1);
}

const derive = (name) => createHmac('sha256', token).update(`omniroute:${name}`).digest('hex');
const omniEnv = {
  ...process.env,
  PORT: '20128',
  HOST: '127.0.0.1',
  HOSTNAME: '127.0.0.1',
  BIND: '127.0.0.1',
  NODE_ENV: 'production',
  DATA_DIR: '/tmp/omniroute-data',
  NEXT_PUBLIC_BASE_URL: 'http://localhost:20128',
  REQUIRE_API_KEY: 'false',
  AUTH_COOKIE_SECURE: 'false',
  OMNIROUTE_MEMORY_MB: '512',
  API_KEY_SECRET: derive('api-key'),
  JWT_SECRET: derive('jwt'),
  MACHINE_ID_SALT: derive('machine-id'),
  STORAGE_ENCRYPTION_KEY: derive('storage'),
  OMNIROUTE_WS_BRIDGE_SECRET: derive('ws-bridge')
};

const omni = spawn(process.execPath, ['dev/run-standalone.mjs'], {
  cwd: '/app',
  env: omniEnv,
  stdio: 'inherit'
});

const expected = Buffer.from(`Bearer ${token}`);
const authorized = (value) => {
  const supplied = Buffer.from(value || '');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
};

const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (await handleGameRequest(req, res)) return;

  if (req.method === 'GET' && req.url === '/health') {
    let ready = false;
    try {
      await fetch('http://127.0.0.1:20128/', { signal: AbortSignal.timeout(1000) });
      ready = true;
    } catch { /* The gateway is up while OmniRoute starts. */ }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ gateway: 'ok', omniRouteReady: ready }));
    return;
  }

  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
    res.writeHead(404).end();
    return;
  }
  if (!authorized(req.headers.authorization)) {
    res.writeHead(401).end();
    return;
  }
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
    res.writeHead(415).end();
    return;
  }

  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1024 * 1024) {
        res.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }

    const upstream = await fetch('http://127.0.0.1:20128/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.concat(chunks),
      signal: AbortSignal.timeout(45000)
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' }).end(body);
  } catch {
    res.writeHead(502, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'OmniRoute is unavailable.' }));
  }
});

server.listen(publicPort, '0.0.0.0');

omni.on('exit', (code, signal) => {
  console.error(`OmniRoute exited (${code ?? signal}).`);
  process.exit(code || 1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close();
    omni.kill(signal);
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
