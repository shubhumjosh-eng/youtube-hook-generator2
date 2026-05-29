import { applyRateLimit, sanitize, checkOrigin, verifyToken } from '../lib/_security.js';
import { cacheKey, get, set } from '../lib/_cache.js';

const ALLOWED_ORIGINS = [
  'https://youtube-hook-generator2.vercel.app',
  'https://youtube-hook-generator.vercel.app',
  'http://localhost:3000',
  'http://localhost:5000'
];

const AI_TIMEOUT = 30_000;

export const config = { runtime: 'edge' };

export default async function handler(request) {
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });

  if (!checkOrigin(request, ALLOWED_ORIGINS)) return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

  const rl = applyRateLimit(request, '/api/generate-script', false);
  if (rl) return rl;

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const clientId = request.headers.get('x-client-id') || '';

  const session = await verifyToken(token);
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized. Sign in or enter a valid unlock code.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

  if (session.type === 'unlock' && session.clientId !== clientId) {
    return new Response(JSON.stringify({ error: 'Token does not match this session.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }

  const hook = body?.hook;
  const topic = body?.topic;
  const style = body?.style;
  if (!hook || typeof hook !== 'string') return new Response(JSON.stringify({ error: 'Hook is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (!topic || typeof topic !== 'string') return new Response(JSON.stringify({ error: 'Topic is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const safeHook = sanitize(hook, 200);
  const safeTopic = sanitize(topic, 200);
  if (safeHook.length < 3) return new Response(JSON.stringify({ error: 'Hook too short' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (safeTopic.length < 2) return new Response(JSON.stringify({ error: 'Topic too short' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const validStyles = ['Curiosity', 'Shock', 'Authority', 'Story'];
  const safeStyle = validStyles.includes(style) ? style : 'Curiosity';

  const prompt = `You are an expert YouTube scriptwriter for faceless channels. Write a full, engaging YouTube script based on this hook.

Hook: "${safeHook}"
Video Topic: ${safeTopic}
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

Make every second count.`;

  const bodyForCache = { hook: safeHook, topic: safeTopic, style: safeStyle };
  const cKey = cacheKey('/api/generate-script', bodyForCache);
  const cached = get(cKey);
  if (cached) {
    return new Response(JSON.stringify({ script: cached, cached: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT);

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
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) { await response.text(); return new Response(JSON.stringify({ error: 'AI service error.' }), { status: 502, headers: { 'Content-Type': 'application/json' } }); }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    if (!text) return new Response(JSON.stringify({ error: 'Empty response. Try a different hook.' }), { status: 502, headers: { 'Content-Type': 'application/json' } });

    set(cKey, text);

    return new Response(JSON.stringify({ script: text }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    if (err.name === 'AbortError') {
      return new Response(JSON.stringify({ error: 'AI service timed out. Try again.' }), { status: 504, headers: { 'Content-Type': 'application/json' } });
    }
    console.error('Script error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
