const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_FREE = 10;
const RATE_LIMIT_AUTHED = 30;
const BANNED_PATHS = /\.\.|\0|\\|\x00|%2e%2e/i;

const rateLimitMap = new Map();

function getClientIp(request) {
  const forwarded = request.headers.get?.('x-forwarded-for') || request.headers?.['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = request.headers.get?.('x-real-ip') || request.headers?.['x-real-ip'];
  if (realIp) return realIp.trim();
  return 'unknown';
}

function getFingerprint(request) {
  const ip = getClientIp(request);
  const ua = request.headers.get?.('user-agent') || request.headers?.['user-agent'] || '';
  const hash = ip + '|' + ua;
  let h = 0;
  for (let i = 0; i < hash.length; i++) {
    h = ((h << 5) - h) + hash.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

function checkRateLimit(fingerprint, isAuthed) {
  const now = Date.now();
  const max = isAuthed ? RATE_LIMIT_AUTHED : RATE_LIMIT_FREE;
  const entry = rateLimitMap.get(fingerprint);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(fingerprint, { count: 1, windowStart: now });
    return { allowed: true, remaining: max - 1 };
  }
  if (entry.count >= max) {
    return { allowed: false, remaining: 0 };
  }
  entry.count++;
  return { allowed: true, remaining: max - entry.count };
}

function cleanupRateLimit() {
  const now = Date.now();
  for (const [key, val] of rateLimitMap) {
    if (now - val.windowStart > RATE_LIMIT_WINDOW * 2) rateLimitMap.delete(key);
  }
}

setInterval(cleanupRateLimit, 60 * 1000);

function isSuspiciousRequest(req) {
  const path = req.url || '';
  if (BANNED_PATHS.test(path)) return true;
  const headers = req.headers || {};
  const ua = req.headers.get?.('user-agent') || headers['user-agent'] || '';
  if (ua.length === 0 || /bot|crawler|scraper/i.test(ua)) return false;
  if (ua.length > 500) return true;
  return false;
}

function checkOrigin(request, allowedOrigins) {
  const origin = request.headers.get?.('origin') || request.headers?.origin || '';
  if (!origin) return true;
  if (!allowedOrigins || allowedOrigins.length === 0) return true;
  return allowedOrigins.some(a => origin === a);
}

async function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const secret = process.env.UNLOCK_SECRET || process.env.OPENROUTER_API_KEY;
  if (!secret) return null;

  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );

    const expectedSig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(parts[0]));
    const expectedHex = Array.from(new Uint8Array(expectedSig))
      .map(b => b.toString(16).padStart(2, '0')).join('');

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
  } catch {
    return null;
  }
}

function sanitize(str, maxLen) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>&"'`]/g, '').trim().slice(0, maxLen || 200);
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export {
  getClientIp, getFingerprint, checkRateLimit, isSuspiciousRequest,
  checkOrigin, verifyToken, sanitize, jsonError
};
