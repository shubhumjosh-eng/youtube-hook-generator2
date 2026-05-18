/* ── Security hardening: sliding window rate limiting + IP protection ── */

const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_LIMIT = 15;

const ENDPOINT_LIMITS = {
  '/api/generate':            { window: 60_000,  limit: 10,  banAfter: 30 },
  '/api/generate-script':     { window: 60_000,  limit: 8,   banAfter: 25 },
  '/api/generate-video-plan': { window: 60_000,  limit: 8,   banAfter: 25 },
  '/api/redeem':              { window: 60_000,  limit: 5,   banAfter: 20 },
  '/api/auth/register':       { window: 60_000,  limit: 3,   banAfter: 15 },
  '/api/auth/login':          { window: 60_000,  limit: 5,   banAfter: 30 },
  '/api/auth/me':             { window: 60_000,  limit: 20,  banAfter: 50 },
};

const BANNED_PATHS = /\.\.|\0|\\|\x00|%2e%2e/i;

/* ── In-memory stores ── */
const timestamps = new Map();
const bannedIPs = new Map();
const ipAbuseCount = new Map();

const BAN_DURATION = 30 * 60 * 1000;
const ABUSE_RESET = 10 * 60 * 1000;

/* ── IP extraction ── */
function getClientIp(request) {
  const xff = request.headers.get?.('x-forwarded-for') || request.headers?.['x-forwarded-for'];
  if (xff) { const first = xff.split(',')[0].trim(); if (first && first !== 'unknown') return first; }
  const xri = request.headers.get?.('x-real-ip') || request.headers?.['x-real-ip'];
  if (xri) return xri.trim();
  const cf = request.headers.get?.('cf-connecting-ip') || request.headers?.['cf-connecting-ip'];
  if (cf) return cf.trim();
  return '127.0.0.1';
}

function normalizeIP(ip) {
  if (!ip) return '';
  return ip.replace(/^::ffff:/, '').trim().toLowerCase();
}

function isPrivateIP(ip) {
  return ip.startsWith('127.') || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.') || ip === '::1' || ip === 'localhost';
}

/* ── Fingerprinting ── */
function getFingerprint(request) {
  const ip = normalizeIP(getClientIp(request));
  const ua = request.headers.get?.('user-agent') || request.headers?.['user-agent'] || '';
  const fp = [ip, ua.substring(0, 120)].join('|');
  let h = 0;
  for (let i = 0; i < fp.length; i++) {
    h = ((h << 5) - h) + fp.charCodeAt(i);
    h |= 0;
  }
  return `fp_${Math.abs(h).toString(36)}`;
}

/* ── True sliding window ── */
function slidingWindowCheck(key, endpoint, isAuthed, rawIp) {
  const now = Date.now();
  const config = ENDPOINT_LIMITS[endpoint] || { window: DEFAULT_WINDOW_MS, limit: DEFAULT_LIMIT, banAfter: DEFAULT_LIMIT * 3 };
  let limit = config.limit;
  if (isAuthed) limit = Math.floor(limit * 2.5);

  let ring = timestamps.get(key);
  if (!ring) {
    ring = [];
    timestamps.set(key, ring);
  }

  const cutoff = now - config.window;
  for (let i = ring.length - 1; i >= 0; i--) {
    if (ring[i] < cutoff) ring.splice(0, i + 1);
    break;
  }

  const count = ring.length;
  if (count >= limit) {
    const abuseKey = `${key}:abuse`;
    let abuseCount = ipAbuseCount.get(abuseKey) || 0;
    abuseCount++;
    ipAbuseCount.set(abuseKey, abuseCount);

    if (abuseCount >= config.banAfter) {
      if (rawIp && !isPrivateIP(rawIp)) {
        bannedIPs.set(rawIp, now + BAN_DURATION);
      }
      return { allowed: false, remaining: 0, limit, retryAfter: config.window / 1000, banned: true };
    }

    return { allowed: false, remaining: 0, limit, retryAfter: config.window / 1000, banned: false };
  }

  ring.push(now);
  return { allowed: true, remaining: limit - count - 1, limit };
}

function isIPBanned(ip) {
  const norm = normalizeIP(ip);
  if (isPrivateIP(norm)) return false;
  const banEnd = bannedIPs.get(norm);
  if (!banEnd) return false;
  if (Date.now() > banEnd) { bannedIPs.delete(norm); return false; }
  return true;
}

function unbanIP(ip) { bannedIPs.delete(normalizeIP(ip)); }

/* ── Cleanup ── */
function cleanup() {
  const now = Date.now();
  for (const [key, ring] of timestamps) {
    const cutoff = now - DEFAULT_WINDOW_MS * 2;
    while (ring.length > 0 && ring[0] < cutoff) ring.shift();
    if (ring.length === 0) timestamps.delete(key);
  }
  for (const [key, banEnd] of bannedIPs) {
    if (now > banEnd) bannedIPs.delete(key);
  }
  for (const [key, lastHit] of ipAbuseCount) {
    if (now - lastHit > ABUSE_RESET) ipAbuseCount.delete(key);
  }
}

setInterval(cleanup, 30 * 1000);

/* ── Request inspection ── */
function isSuspiciousRequest(req) {
  const url = req.url || '';
  if (BANNED_PATHS.test(url)) return true;
  const headers = req.headers || {};
  const ua = req.headers.get?.('user-agent') || headers['user-agent'] || '';
  if (ua.length === 0) return true;
  if (ua.length > 500) return true;
  return false;
}

function checkOrigin(request, allowedOrigins) {
  const origin = request.headers.get?.('origin') || request.headers?.origin || '';
  if (!origin) return true;
  if (!allowedOrigins || allowedOrigins.length === 0) return true;
  return allowedOrigins.some(a => origin === a);
}

/* ── Token verification ── */
async function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const secret = process.env.UNLOCK_SECRET || process.env.OPENROUTER_API_KEY;
  if (!secret) return null;

  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const expectedSig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(parts[0]));
    const expectedHex = Array.from(new Uint8Array(expectedSig)).map(b => b.toString(16).padStart(2, '0')).join('');
    if (expectedHex !== parts[1]) return null;

    const decoded = JSON.parse(atob(parts[0]));
    if (decoded.type === 'auth') {
      const TOKEN_TTL = 365 * 24 * 60 * 60 * 1000;
      if (Date.now() - decoded.iat > TOKEN_TTL) return null;
      return { type: 'auth', userId: decoded.userId, email: decoded.email };
    }
    if (decoded.clientId) {
      if (Date.now() - decoded.iat > 365 * 24 * 60 * 60 * 1000) return null;
      return { type: 'unlock', clientId: decoded.clientId, code: decoded.code };
    }
    return null;
  } catch { return null; }
}

/* ── Helpers ── */
function sanitize(str, maxLen) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>&"'`]/g, '').trim().slice(0, maxLen || 200);
}

function jsonError(status, message, headers) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

function rateLimitHeaders(remaining, limit, retryAfter) {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(Math.max(0, remaining)),
    ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {})
  };
}

/* ── Middleware: apply rate limiting + ban check ── */
function applyRateLimit(request, endpoint, isAuthed) {
  const ip = getClientIp(request);
  if (isIPBanned(ip)) {
    return jsonError(429, 'Too many requests. You have been temporarily banned.', { 'Retry-After': String(BAN_DURATION / 1000) });
  }

  const fingerprint = getFingerprint(request);
  const key = `${fingerprint}:${endpoint}`;
  const result = slidingWindowCheck(key, endpoint, isAuthed, normalizeIP(ip));

  if (!result.allowed) {
    if (result.banned) {
      return jsonError(429, 'Too many requests. You have been temporarily banned.', { 'Retry-After': String(BAN_DURATION / 1000) });
    }
    return jsonError(429, 'Rate limit exceeded. Please try again later.', rateLimitHeaders(result.remaining, result.limit, result.retryAfter));
  }

  return null;
}

/* ── Exports ── */
export {
  getClientIp, getFingerprint, isIPBanned, unbanIP,
  applyRateLimit, rateLimitHeaders,
  isSuspiciousRequest, checkOrigin, verifyToken,
  sanitize, jsonError, cleanup
};
