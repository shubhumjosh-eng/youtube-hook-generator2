import { users, generateSalt, hashPassword, createToken } from './_store.js';
import { applyRateLimit, sanitize, jsonError } from '../../lib/_security.js';

export const config = { runtime: 'edge' };

export default async function handler(request) {
  if (request.method !== 'POST') return jsonError(405, 'Method not allowed');

  const rl = applyRateLimit(request, '/api/auth/register', false);
  if (rl) return rl;

  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'Invalid JSON'); }

  const email = body?.email;
  const password = body?.password;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonError(400, 'Valid email required');
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) return jsonError(400, 'Password must be 8-128 characters');

  const normalizedEmail = email.toLowerCase().trim();
  if (users.has(normalizedEmail)) return jsonError(409, 'Email already registered');

  try {
    const salt = generateSalt();
    const hash = await hashPassword(password, salt);
    const userId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    users.set(normalizedEmail, { userId, email: normalizedEmail, hash, salt, createdAt: Date.now() });
    const token = await createToken(userId, normalizedEmail);
    return new Response(JSON.stringify({ success: true, token, user: { email: normalizedEmail } }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Register error:', err);
    return jsonError(500, 'Internal server error');
  }
}
