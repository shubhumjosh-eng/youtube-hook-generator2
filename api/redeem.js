import { encrypt, decryptEdgeRequest, isEncryptionConfigured, jsonError } from '../_crypto.js';

const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_ATTEMPTS = 5;

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
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0 };
  }
  entry.count++;
  return { allowed: true, remaining: MAX_ATTEMPTS - entry.count };
}

function getValidCodes() {
  try {
    const codes = process.env.UNLOCK_CODES;
    if (!codes) return [];
    return JSON.parse(codes);
  } catch {
    return [];
  }
}

async function createSignedToken(clientId, code) {
  const secret = process.env.UNLOCK_SECRET || process.env.OPENROUTER_API_KEY;
  const data = JSON.stringify({ clientId, code, iat: Date.now() });
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  const sigHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
  const payload = btoa(data);
  return `${payload}.${sigHex}`;
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return jsonError(405, 'Method not allowed');
  }

  const ip = getClientIp(request);
  const { allowed, remaining } = rateLimit(ip);
  if (!allowed) {
    return jsonError(429, 'Too many attempts. Please try again later.');
  }

  let body;
  try {
    body = await decryptEdgeRequest(request);
  } catch {
    return jsonError(400, 'Invalid request body');
  }
  if (!body) {
    return jsonError(400, 'Decryption failed');
  }

  const { code, clientId } = body;

  if (!code || typeof code !== 'string') {
    return jsonError(400, 'Unlock code is required');
  }

  if (!clientId || typeof clientId !== 'string' || clientId.length < 8 || clientId.length > 128) {
    return jsonError(400, 'Valid client ID is required');
  }

  const sanitizedCode = code.trim().toUpperCase();
  if (!/^[A-Z0-9-]{8,32}$/.test(sanitizedCode)) {
    return jsonError(400, 'Invalid code format');
  }

  const validCodes = getValidCodes();
  const isValid = validCodes.includes(sanitizedCode);

  if (!isValid) {
    return new Response(JSON.stringify({ error: 'Invalid unlock code' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'X-RateLimit-Remaining': String(remaining) }
    });
  }

  try {
    const token = await createSignedToken(clientId, sanitizedCode);
    const result = { success: true, token };

    let responseBody;
    if (isEncryptionConfigured()) {
      const encrypted = await encrypt(result);
      responseBody = JSON.stringify(encrypted);
    } else {
      responseBody = JSON.stringify(result);
    }

    return new Response(responseBody, {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return jsonError(500, 'Internal server error');
  }
}
