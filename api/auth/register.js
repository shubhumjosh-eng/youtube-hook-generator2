import { users, generateSalt, hashPassword, createToken } from './_store.js';
import { encrypt, decryptRequest, isEncryptionConfigured } from '../../lib/_crypto.js';

const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_ATTEMPTS = 5;
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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128;
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

  if (!email || !isValidEmail(email)) {
    res.status(400).json({ error: 'Valid email is required' });
    return;
  }

  if (!isValidPassword(password)) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  if (users.has(normalizedEmail)) {
    res.status(409).json({ error: 'An account with this email already exists' });
    return;
  }

  try {
    const salt = generateSalt();
    const hash = await hashPassword(password, salt);
    const userId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

    users.set(normalizedEmail, { userId, email: normalizedEmail, hash, salt, createdAt: Date.now(), premium: false });

    const token = await createToken(userId, normalizedEmail);
    const result = { success: true, token, user: { email: normalizedEmail, premium: false } };

    if (isEncryptionConfigured()) {
      const encrypted = await encrypt(result);
      res.json(encrypted);
    } else {
      res.json(result);
    }
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
