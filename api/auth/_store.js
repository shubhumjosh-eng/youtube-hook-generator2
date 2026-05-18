const PBKDF2_ITERATIONS = 600000;
const SALT_LENGTH = 16;

const users = new Map();

function generateSalt() {
  const bytes = new Uint8Array(SALT_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password, salt, hash) {
  const computedHash = await hashPassword(password, salt);
  if (computedHash.length !== hash.length) return false;
  const computed = new Uint8Array(computedHash.match(/.{2}/g).map(b => parseInt(b, 16)));
  const stored = new Uint8Array(hash.match(/.{2}/g).map(b => parseInt(b, 16)));
  if (computed.length !== stored.length) return false;
  let match = 0;
  for (let i = 0; i < computed.length; i++) {
    match |= computed[i] ^ stored[i];
  }
  return match === 0;
}

async function createToken(userId, email) {
  const secret = process.env.UNLOCK_SECRET || process.env.OPENROUTER_API_KEY;
  if (!secret) throw new Error('No secret configured');
  const data = JSON.stringify({ userId, email, type: 'auth', iat: Date.now() });
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  const sigHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
  const payload = btoa(data);
  return `${payload}.${sigHex}`;
}

async function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const secret = process.env.UNLOCK_SECRET || process.env.OPENROUTER_API_KEY;
  if (!secret) return null;
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const expectedSig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(parts[0]));
    const expectedHex = Array.from(new Uint8Array(expectedSig))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    if (expectedHex !== parts[1]) return null;
    const decoded = JSON.parse(atob(parts[0]));
    if (decoded.type !== 'auth') return null;
    const TOKEN_TTL = 365 * 24 * 60 * 60 * 1000;
    if (Date.now() - decoded.iat > TOKEN_TTL) return null;
    return { userId: decoded.userId, email: decoded.email };
  } catch {
    return null;
  }
}

export { users, generateSalt, hashPassword, verifyPassword, createToken, verifyToken };
