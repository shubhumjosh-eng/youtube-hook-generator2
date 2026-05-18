import { applyRateLimit, sanitize, jsonError, checkOrigin } from '../lib/_security.js';

const ALLOWED_ORIGINS = [
  'https://youtube-hook-generator2.vercel.app',
  'https://youtube-hook-generator.vercel.app',
  'http://localhost:3000',
  'http://localhost:5000'
];

export const config = { runtime: 'edge' };

export default async function handler(request) {
  if (request.method !== 'POST') return jsonError(405, 'Method not allowed');

  if (!checkOrigin(request, ALLOWED_ORIGINS)) return jsonError(403, 'Origin not allowed');

  const rl = applyRateLimit(request, '/api/generate', false);
  if (rl) return rl;

  const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
  if (contentLength > 1024 * 10) return jsonError(413, 'Request too large');

  let body;
  try { body = await request.json(); } catch { return jsonError(400, 'Invalid JSON'); }
  if (!body || typeof body !== 'object') return jsonError(400, 'Invalid request body');

  const rawTopic = body.topic;
  if (!rawTopic || typeof rawTopic !== 'string') return jsonError(400, 'Topic is required');

  const topic = sanitize(rawTopic, 200);
  if (topic.length < 2) return jsonError(400, 'Topic must be at least 2 characters');

  const rawStyles = body.styles;
  const validStyles = ['Curiosity', 'Shock', 'Authority', 'Story'];
  let styles = ['Curiosity'];
  if (Array.isArray(rawStyles) && rawStyles.length > 0) {
    const filtered = rawStyles.filter(s => typeof s === 'string' && validStyles.includes(s)).slice(0, 4);
    if (filtered.length > 0) styles = filtered;
  }

  const prompt = `Generate 5 viral YouTube hooks for a faceless YouTube video.

Topic: ${topic}
Style: ${styles.join(', ')}

Rules:
* Max 12 words per hook
* Extremely high curiosity
* Designed for first 5 seconds retention
* No fluff, no generic phrases
* Make each hook irresistible
Return as a numbered list.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://youtube-hook-generator2.vercel.app',
        'X-Title': 'HookForge'
      },
      body: JSON.stringify({
        model: 'nvidia/nemotron-3-nano-30b-a3b:free',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      await response.text();
      return jsonError(502, 'AI service error. Please try again.');
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    if (!text) return jsonError(502, 'Empty response. Try a different topic.');

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Generate error:', err);
    return jsonError(500, 'Internal server error');
  }
}
