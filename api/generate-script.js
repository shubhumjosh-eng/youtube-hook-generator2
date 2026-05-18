import { encrypt, decryptRequest, isEncryptionConfigured } from '../_crypto.js';

const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_REQUESTS = 5;
const MAX_REQUEST_SIZE = 1024 * 50;
const MAX_HOOK_LENGTH = 200;
const MAX_TOPIC_LENGTH = 200;

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
    return { allowed: true, remaining: MAX_REQUESTS - 1 };
  }
  if (entry.count >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }
  entry.count++;
  return { allowed: true, remaining: MAX_REQUESTS - entry.count };
}

function sanitize(str) {
  return String(str).replace(/[<>&"'`]/g, '').trim();
}

async function verifyUnlockToken(token, clientId) {
  if (!token || !clientId) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const secret = process.env.UNLOCK_SECRET || process.env.OPENROUTER_API_KEY;
  if (!secret) return false;
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const expectedSig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(parts[0]));
    const expectedHex = Array.from(new Uint8Array(expectedSig))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    if (expectedHex !== parts[1]) return false;
    const decoded = JSON.parse(atob(parts[0]));
    if (decoded.clientId !== clientId) return false;
    if (Date.now() - decoded.iat > 365 * 24 * 60 * 60 * 1000) return false;
    return true;
  } catch {
    return false;
  }
}

async function verifyAuthToken(token) {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const secret = process.env.UNLOCK_SECRET || process.env.OPENROUTER_API_KEY;
  if (!secret) return false;
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const expectedSig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(parts[0]));
    const expectedHex = Array.from(new Uint8Array(expectedSig))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    if (expectedHex !== parts[1]) return false;
    const decoded = JSON.parse(atob(parts[0]));
    if (decoded.type !== 'auth') return false;
    if (Date.now() - decoded.iat > 365 * 24 * 60 * 60 * 1000) return false;
    return true;
  } catch {
    return false;
  }
}

export const maxDuration = 60;

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip = getClientIp(req);
  const { allowed, remaining } = rateLimit(ip);
  if (!allowed) {
    res.status(429).json({ error: 'Rate limit exceeded. Please wait before generating more scripts.' });
    return;
  }

  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_REQUEST_SIZE) {
    res.status(413).json({ error: 'Request too large' });
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

  const token = req.headers['authorization']?.replace('Bearer ', '');
  const clientId = req.headers['x-client-id'];

  const isUnlockToken = await verifyUnlockToken(token, clientId);
  const isAuthToken = await verifyAuthToken(token);
  if (!isUnlockToken && !isAuthToken) {
    res.status(403).json({ error: 'Payment required. Please sign in or unlock premium features.' });
    return;
  }

  const { hook, topic, style } = body;

  if (!hook || typeof hook !== 'string') {
    res.status(400).json({ error: 'Hook is required and must be a string' });
    return;
  }
  if (!topic || typeof topic !== 'string') {
    res.status(400).json({ error: 'Topic is required and must be a string' });
    return;
  }

  const sanitizedHook = sanitize(hook).slice(0, MAX_HOOK_LENGTH);
  const sanitizedTopic = sanitize(topic).slice(0, MAX_TOPIC_LENGTH);

  if (sanitizedHook.length < 3) {
    res.status(400).json({ error: 'Hook must be at least 3 characters' });
    return;
  }
  if (sanitizedTopic.length < 2) {
    res.status(400).json({ error: 'Topic must be at least 2 characters' });
    return;
  }

  const validStyles = ['Curiosity', 'Shock', 'Authority', 'Story'];
  const safeStyle = validStyles.includes(style) ? style : 'Curiosity';

  const prompt = `You are an expert YouTube scriptwriter for faceless channels. Write a full, engaging YouTube script based on this hook.

Hook: "${sanitizedHook}"
Video Topic: ${sanitizedTopic}
Style: ${safeStyle}

Script requirements:
- 800-1200 words (about 5-7 minute video)
- Start with the hook in the first 5 seconds
- Include pattern interrupts every 30 seconds
- Use short, punchy sentences
- Add suspense and curiosity loops
- No fluff, no filler
- Include visual cues in [brackets] for the editor
- End with a strong CTA
- Make it impossible to stop watching
- Use conversational tone

Format:
[HOOK] Opening line
[SECTION 1] First key point
[SECTION 2] Second key point
[SECTION 3] Third key point
[CTA] Call to action

Make every second count. Write it now.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://youtube-hook-generator.vercel.app',
        'X-Title': 'YouTube Hook Generator'
      },
      body: JSON.stringify({
        model: 'nvidia/nemotron-3-nano-30b-a3b:free',
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OpenRouter error:', errText);
      res.status(502).json({ error: 'AI service error. Please try again.' });
      return;
    }

    const data = await response.json();
    const generatedText = data.choices?.[0]?.message?.content || '';

    if (!generatedText) {
      res.status(502).json({ error: 'AI returned empty response. Try a different hook.' });
      return;
    }

    const result = { script: generatedText };

    if (isEncryptionConfigured()) {
      const encrypted = await encrypt(result);
      res.json(encrypted);
    } else {
      res.json(result);
    }
  } catch (err) {
    console.error('Script generation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
