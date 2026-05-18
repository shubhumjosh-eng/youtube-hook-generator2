import { users, generateSalt, hashPassword, createToken } from './_store.js';
import { getFingerprint, checkRateLimit, sanitize } from '../lib/_security.js';

export const maxDuration = 60;

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const fp = getFingerprint(req);
  if (!checkRateLimit(fp, false).allowed) { res.status(429).json({ error: 'Too many attempts.' }); return; }

  const { email, password } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: 'Valid email required' }); return; }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) { res.status(400).json({ error: 'Password must be 8-128 characters' }); return; }

  const normalizedEmail = email.toLowerCase().trim();
  if (users.has(normalizedEmail)) { res.status(409).json({ error: 'Email already registered' }); return; }

  try {
    const salt = generateSalt();
    const hash = await hashPassword(password, salt);
    const userId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    users.set(normalizedEmail, { userId, email: normalizedEmail, hash, salt, createdAt: Date.now() });
    const token = await createToken(userId, normalizedEmail);
    res.status(201).json({ success: true, token, user: { email: normalizedEmail } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
