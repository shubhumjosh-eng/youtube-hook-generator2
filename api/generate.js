import { encrypt, decryptEdgeRequest, isEncryptionConfigured, jsonError } from '../_crypto.js';

const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_REQUESTS = 10;
const MAX_REQUEST_SIZE = 1024 * 10;
const MAX_TOPIC_LENGTH = 200;
const MAX_STYLES = 4;

const rateLimitMap = new Map();

function getClientIp(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
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

function sanitizeInput(str) {
  return String(str).replace(/[<>&"'`]/g, '').trim().slice(0, MAX_TOPIC_LENGTH);
}

export const config = {
  runtime: 'edge'
};

export default async function handler(request) {
  if (request.method !== 'POST') {
    return jsonError(405, 'Method not allowed');
  }

  const ip = getClientIp(request);
  const { allowed, remaining } = rateLimit(ip);
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please wait before generating more hooks.' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '60',
        'X-RateLimit-Remaining': '0'
      }
    });
  }

  const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_REQUEST_SIZE) {
    return jsonError(413, 'Request too large');
  }

  let body;
  try {
    body = await decryptEdgeRequest(request);
  } catch {
    return jsonError(400, 'Invalid request body');
  }
  if (!body) {
    return jsonError(400, 'Decryption failed');
  }

  const rawTopic = body.topic;
  const rawStyles = body.styles;

  if (!rawTopic || typeof rawTopic !== 'string') {
    return jsonError(400, 'Topic is required and must be a string');
  }

  const topic = sanitizeInput(rawTopic);
  if (topic.length < 2) {
    return jsonError(400, 'Topic must be at least 2 characters');
  }

  let styles = ['Curiosity'];
  if (Array.isArray(rawStyles) && rawStyles.length > 0) {
    const validStyles = ['Curiosity', 'Shock', 'Authority', 'Story'];
    const filtered = rawStyles
      .filter(s => typeof s === 'string' && validStyles.includes(s))
      .slice(0, MAX_STYLES);
    if (filtered.length > 0) {
      styles = filtered;
    }
  }

  const prompt = `Generate 5 viral YouTube hooks for a faceless YouTube video.

Topic: ${topic}

Style: ${styles.join(', ')}

Rules:
* Max 12 words per hook
* Extremely high curiosity
* Designed for first 5 seconds retention
* No fluff
* No generic phrases
* Make each hook irresistible

Return as a numbered list.`;

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
      return jsonError(502, 'AI service error. Please try again.');
    }

    const data = await response.json();
    const generatedText = data.choices?.[0]?.message?.content || '';

    if (!generatedText) {
      return jsonError(502, 'AI returned empty response. Try a different topic.');
    }

    const result = { text: generatedText };
    let responseBody;

    if (isEncryptionConfigured()) {
      const encrypted = await encrypt(result);
      responseBody = JSON.stringify(encrypted);
    } else {
      responseBody = JSON.stringify(result);
    }

    return new Response(responseBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Remaining': String(remaining)
      }
    });
  } catch (err) {
    console.error('Generation error:', err);
    return jsonError(500, 'Internal server error');
  }
}
