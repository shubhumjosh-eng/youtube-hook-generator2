import { verifyToken, users } from './_store.js';

export const maxDuration = 10;

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const session = await verifyToken(token);
  if (!session) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const user = users.get(session.email);
  if (!user) { res.status(401).json({ error: 'User not found' }); return; }

  res.status(200).json({ user: { email: session.email, createdAt: user.createdAt } });
}
