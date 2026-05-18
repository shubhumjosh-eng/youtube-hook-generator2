import { applyRateLimit, jsonError } from '../../lib/_security.js';
import { verifyToken, users } from './_store.js';

export const config = { runtime: 'edge' };

export default async function handler(request) {
  if (request.method !== 'GET') return jsonError(405, 'Method not allowed');

  const rl = applyRateLimit(request, '/api/auth/me', false);
  if (rl) return rl;

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const session = await verifyToken(token);
  if (!session) return jsonError(401, 'Unauthorized');

  const user = users.get(session.email);
  if (!user) return jsonError(401, 'User not found');

  return new Response(JSON.stringify({ user: { email: session.email, createdAt: user.createdAt } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
