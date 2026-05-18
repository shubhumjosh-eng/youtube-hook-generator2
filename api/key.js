const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_ATTEMPTS = 20;
const rateLimitMap = new Map();

function getClientIp(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

function rateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

export const config = {
  runtime: 'edge'
};

export default async function handler(request) {
  const origin = request.headers.get('origin') || '';
  const allowedOrigins = [
    'https://youtube-hook-generator.vercel.app',
    'http://localhost:3000',
    'http://localhost:5000'
  ];

  const isAllowed = allowedOrigins.some(o => origin.startsWith(o) || origin === o);
  if (!isAllowed && origin) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const ip = getClientIp(request);
  if (!rateLimit(ip)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const keyHex = process.env.REQUEST_ENCRYPTION_KEY;
  if (!keyHex) {
    return new Response(JSON.stringify({ error: 'Encryption not configured' }), {
      status: 501,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, max-age=0'
  };

  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return new Response(JSON.stringify({ key: keyHex }), {
    status: 200,
    headers
  });
}
