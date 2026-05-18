import { users, verifyPassword, createToken } from './_store.js';
import { applyRateLimit, jsonError } from '../../lib/_security.js';

export const config = { runtime: 'edge' };

export default async function handler(request) {
  if (request.method !== 'POST') return jsonError(405, 'Method not allowed');

  const rl = applyRateLimit(request, '/api/auth/login', false);
  if (rl) return rl;

  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'Invalid JSON'); }

  const email = body?.email;
  const password = body?.password;
  if (!email || !password) return jsonError(400, 'Email and password required');

  const normalizedEmail = email.toLowerCase().trim();
  const user = users.get(normalizedEmail);
  if (!user) return jsonError(401, 'Invalid email or password');

  try {
    const valid = await verifyPassword(password, user.salt, user.hash);
    if (!valid) return jsonError(401, 'Invalid email or password');
    const token = await createToken(user.userId, normalizedEmail);
    return new Response(JSON.stringify({ success: true, token, user: { email: normalizedEmail } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Login error:', err);
    return jsonError(500, 'Internal server error');
  }
}
