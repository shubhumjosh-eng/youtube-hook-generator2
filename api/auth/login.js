import { users, verifyPassword, createToken } from './_store.js';
import { encrypt, decryptRequest, isEncryptionConfigured } from '../../lib/_crypto.js';

const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_ATTEMPTS = 10;
const rateLimitMap = new Map();

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
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

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip = getClientIp(req);
  if (!rateLimit(ip)) {
    res.status(429).json({ error: 'Too many attempts. Please try again later.' });
    return;
  }

  let body;
  try {
    body = await decryptRequest(req);
  } catch {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }
  if (!body) {
    res.status(400).json({ error: 'Decryption failed' });
    return;
  }

  const { email, password } = body || {};

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const user = users.get(normalizedEmail);

  if (!user) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  try {
    const valid = await verifyPassword(password, user.salt, user.hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = await createToken(user.userId, normalizedEmail);
    const result = { success: true, token, user: { email: normalizedEmail, premium: !!user.premium } };

    if (isEncryptionConfigured()) {
      const encrypted = await encrypt(result);
      res.json(encrypted);
    } else {
      res.json(result);
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
