import { applyRateLimit, sanitize, checkOrigin, jsonError } from '../lib/_security.js';

const ALLOWED_ORIGINS = [
  'https://youtube-hook-generator2.vercel.app',
  'https://youtube-hook-generator.vercel.app',
  'http://localhost:3000',
  'http://localhost:5000'
];

export const config = { runtime: 'edge' };

export default async function handler(request) {
  if (request.method !== 'POST') return jsonError(405, 'Method not allowed');
  if (!checkOrigin(request, ALLOWED_ORIGINS)) return jsonError(403, 'Origin not allowed');

  const rl = applyRateLimit(request, '/api/redeem', false);
  if (rl) return rl;

  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'Invalid JSON'); }
  if (!body || typeof body !== 'object') return jsonError(400, 'Invalid request body');

  const { code, clientId } = body;
  if (!code || typeof code !== 'string') return jsonError(400, 'Code is required');
  if (!clientId || typeof clientId !== 'string' || clientId.length < 8 || clientId.length > 128) return jsonError(400, 'Invalid client ID');

  const sanitizedCode = code.trim().toUpperCase();
  if (!/^[A-Z0-9-]{8,32}$/.test(sanitizedCode)) return jsonError(400, 'Invalid code format');

  const validCodes = getValidCodes();
  if (!validCodes.includes(sanitizedCode)) return jsonError(401, 'Invalid unlock code');

  try {
    const token = await createSignedToken(clientId, sanitizedCode);
    return new Response(JSON.stringify({ success: true, token }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return jsonError(500, 'Internal server error');
  }
}

function getValidCodes() {
  try {
    const codes = process.env.UNLOCK_CODES;
    if (!codes) return [];
    return JSON.parse(codes);
  } catch { return []; }
}

async function createSignedToken(clientId, code) {
  const secret = process.env.UNLOCK_SECRET || process.env.OPENROUTER_API_KEY;
  const data = JSON.stringify({ clientId, code, iat: Date.now() });
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${btoa(data)}.${sigHex}`;
}
