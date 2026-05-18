const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;

function getKeyHex() {
  return process.env.REQUEST_ENCRYPTION_KEY;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function arrayBufferToHex(buf) {
  return bytesToHex(new Uint8Array(buf));
}

async function importKey(rawKey) {
  return crypto.subtle.importKey(
    'raw', rawKey, { name: ALGORITHM }, false, ['encrypt', 'decrypt']
  );
}

export async function encrypt(plaintext) {
  const keyHex = getKeyHex();
  if (!keyHex) return null;

  const rawKey = hexToBytes(keyHex);
  const key = await importKey(rawKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encoded = encoder.encode(JSON.stringify(plaintext));

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv }, key, encoded
  );

  return {
    iv: bytesToHex(iv),
    data: arrayBufferToHex(ciphertext)
  };
}

export async function decrypt(encrypted) {
  const keyHex = getKeyHex();
  if (!keyHex || !encrypted || !encrypted.iv || !encrypted.data) return null;

  try {
    const rawKey = hexToBytes(keyHex);
    const key = await importKey(rawKey);
    const iv = hexToBytes(encrypted.iv);
    const ciphertext = hexToBytes(encrypted.data);

    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv }, key, ciphertext
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted));
  } catch {
    return null;
  }
}

export function isEncryptionConfigured() {
  return !!getKeyHex();
}

export async function decryptRequest(req) {
  if (!isEncryptionConfigured() || !req.body) return req.body;
  const encrypted = req.body;
  if (!encrypted.iv || !encrypted.data) return req.body;
  const decrypted = await decrypt(encrypted);
  return decrypted || req.body;
}

export async function encryptResponse(data) {
  if (!isEncryptionConfigured()) return data;
  const encrypted = await encrypt(data);
  return encrypted || data;
}

export async function decryptEdgeRequest(request) {
  const body = await request.json();
  if (!isEncryptionConfigured()) return body;
  if (!body.iv || !body.data) return body;
  const decrypted = await decrypt(body);
  return decrypted || body;
}

export function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
