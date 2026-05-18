import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/* ── Read .env ── */
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}
loadEnv();

/* ── Serve static files ── */
async function serveStatic(reqUrl, res) {
  let filePath = path.join(__dirname, reqUrl === '/' ? 'index.html' : reqUrl);
  if (!fs.existsSync(filePath)) {
    const alt = path.join(__dirname, reqUrl + '.html');
    if (fs.existsSync(alt)) filePath = alt;
    else { res.writeHead(404); res.end('Not found'); return; }
  }
  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': mime });
  res.end(content);
}

/* ── Dynamic API handler ── */
async function callApi(modulePath, req, res) {
  const fullPath = path.join(__dirname, 'api', modulePath);
  if (!fs.existsSync(fullPath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  let mod;
  try {
    mod = await import(fullPath);
  } catch (err) {
    console.error(`Import error (${modulePath}):`, err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Import failed', detail: err.message }));
    return;
  }

  const handler = mod.default;
  if (!handler) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No default export' }));
    return;
  }

  const isEdge = mod.config?.runtime === 'edge';

  if (isEdge) {
    await handleEdge(handler, req, res);
  } else {
    await handleServerless(handler, req, res);
  }
}

/* ── Edge function: handler(request) → Response ── */
async function handleEdge(handler, req, res) {
  const body = await new Promise((r) => {
    let d = '';
    req.on('data', (c) => d += c);
    req.on('end', () => r(d));
  });

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  const request = {
    method: req.method,
    url: req.url,
    headers: new Map(Object.entries(req.headers)),
    json: async () => {
      try { return JSON.parse(body); }
      catch { throw new Error('Invalid JSON'); }
    },
    text: async () => body,
  };

  request.headers.get = function (key) {
    const val = this.get(key) || req.headers[key.toLowerCase()];
    return val || null;
  };

  let response;
  try {
    response = await handler(request);
  } catch (err) {
    console.error('Handler error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
    return;
  }

  if (response instanceof Response || (response && typeof response.status === 'number')) {
    const status = response.status || 200;
    const headers = {};
    if (response.headers?.forEach) {
      response.headers.forEach((v, k) => { headers[k] = v; });
    }
    const text = await (response.text ? response.text() : Promise.resolve(''));
    try {
      const parsed = JSON.parse(text);
      res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
      res.end(JSON.stringify(parsed));
    } catch {
      res.writeHead(status, headers);
      res.end(text);
    }
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
  }
}

/* ── Serverless function: handler(req, res) ── */
async function handleServerless(handler, req, res) {
  const body = await new Promise((r) => {
    let d = '';
    req.on('data', (c) => d += c);
    req.on('end', () => r(d));
  });

  let parsedBody = {};
  try { if (body) parsedBody = JSON.parse(body); } catch {}

  const srvReq = {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: parsedBody,
    query: Object.fromEntries(new URL(req.url, `http://localhost`).searchParams),
    socket: { remoteAddress: req.socket?.remoteAddress || '127.0.0.1' },
  };

  let statusCode = 200;
  let responseHeaders = {};
  let responseBody = null;

  const srvRes = {
    status: (code) => { statusCode = code; return srvRes; },
    json: (data) => { responseBody = data; },
    send: (data) => { responseBody = data; },
    setHeader: (key, val) => { responseHeaders[key] = val; },
    end: (data) => { responseBody = responseBody || data; },
    writeHead: (code, headers) => { statusCode = code; if (headers) Object.assign(responseHeaders, headers); },
  };

  try {
    await handler(srvReq, srvRes);
  } catch (err) {
    console.error('Handler error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
    return;
  }

  const finalHeaders = { 'Content-Type': 'application/json', ...responseHeaders };
  res.writeHead(statusCode, finalHeaders);
  res.end(JSON.stringify(responseBody));
}

/* ── Router ── */
const ROUTES = {
  '/api/generate': 'generate.js',
  '/api/generate-script': 'generate-script.js',
  '/api/generate-video-plan': 'generate-video-plan.js',
  '/api/redeem': 'redeem.js',
  '/api/config': 'config.js',
  '/api/key': 'key.js',
  '/api/auth/register': 'auth/register.js',
  '/api/auth/login': 'auth/login.js',
  '/api/auth/me': 'auth/me.js',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  /* ── CORS for local dev ── */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const route = ROUTES[pathname];
  if (route) {
    await callApi(route, req, res);
    return;
  }

  if (pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API route not found' }));
    return;
  }

  await serveStatic(pathname, res);
});

server.listen(PORT, () => {
  console.log(`\n  🚀  HookForge Dev Server\n`);
  console.log(`  Local:    http://localhost:${PORT}`);
  console.log(`  Network:  http://127.0.0.1:${PORT}\n`);
  console.log(`  Create a .env file with your keys to enable API features.\n`);
});
