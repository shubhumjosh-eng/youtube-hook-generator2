import { verifyToken, users } from './_store.js';
import { encrypt, isEncryptionConfigured } from '../../lib/_crypto.js';

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const session = await verifyToken(authHeader.replace('Bearer ', ''));
  if (!session) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const user = users.get(session.email);
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

  const result = { user: { email: session.email, premium: !!user.premium, createdAt: user.createdAt } };

  if (isEncryptionConfigured()) {
    const encrypted = await encrypt(result);
    res.json(encrypted);
  } else {
    res.json(result);
  }
}
