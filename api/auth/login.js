import { users, verifyPassword, createToken } from './_store.js';
import { getFingerprint, checkRateLimit } from '../lib/_security.js';

export const maxDuration = 60;

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const fp = getFingerprint(req);
  if (!checkRateLimit(fp, false).allowed) { res.status(429).json({ error: 'Too many attempts.' }); return; }

  const { email, password } = req.body || {};
  if (!email || !password) { res.status(400).json({ error: 'Email and password required' }); return; }

  const normalizedEmail = email.toLowerCase().trim();
  const user = users.get(normalizedEmail);
  if (!user) { res.status(401).json({ error: 'Invalid email or password' }); return; }

  try {
    const valid = await verifyPassword(password, user.salt, user.hash);
    if (!valid) { res.status(401).json({ error: 'Invalid email or password' }); return; }
    const token = await createToken(user.userId, normalizedEmail);
    res.status(200).json({ success: true, token, user: { email: normalizedEmail } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
