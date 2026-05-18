import { applyRateLimit, sanitize, checkOrigin, verifyToken } from '../lib/_security.js';

const ALLOWED_ORIGINS = [
  'https://youtube-hook-generator2.vercel.app',
  'https://youtube-hook-generator.vercel.app',
  'http://localhost:3000',
  'http://localhost:5000'
];

export const config = { runtime: 'edge' };

export default async function handler(request) {
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });

  if (!checkOrigin(request, ALLOWED_ORIGINS)) return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

  const rl = applyRateLimit(request, '/api/generate-video-plan', false);
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

  const topic = body?.topic;
  const hook = body?.hook || '';
  const style = body?.style;
  const script = body?.script || '';
  if (!topic || typeof topic !== 'string') return new Response(JSON.stringify({ error: 'Topic is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const safeTopic = sanitize(topic, 200);
  const safeHook = sanitize(String(hook), 200);
  const safeScript = sanitize(String(script), 50000);
  if (safeTopic.length < 2) return new Response(JSON.stringify({ error: 'Topic too short' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const validStyles = ['Curiosity', 'Shock', 'Authority', 'Story'];
  const safeStyle = validStyles.includes(style) ? style : 'Curiosity';

  const prompt = `You are an expert video director for faceless YouTube channels. Create a detailed shot-by-shot video plan.

Video Topic: ${safeTopic}
Hook: "${safeHook || ''}"
Style: ${safeStyle}

${safeScript ? `Full Script:\n${safeScript}\n\n` : ''}

Generate a complete video production plan with:
1. SHOT LIST - Every scene from start to finish
2. B-ROLL SUGGESTIONS - Specific stock footage keywords
3. VISUAL CUES - Animations, transitions, text overlays
4. TIMING - Exact second-by-second breakdown
5. AUDIO CUES - Music mood changes, sound effects
6. COLOR GRADING - Mood/tone for each section
7. STOCK FOOTAGE SEARCH TERMS - Exact keywords for Pexels/Pixabay

Format as:
[SCENE 1 - 0:00 to 0:05]
- Visual: [describe what's on screen]
- B-Roll: [stock footage description]
- Search: [exact keywords]
- Text: [on-screen text]
- Transition: [how to enter/exit]
- Audio: [music mood + SFX]
- Zoom/Effect: [camera movement]

Include at least 8-12 scenes.`;

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

    if (!response.ok) { await response.text(); return new Response(JSON.stringify({ error: 'AI service error.' }), { status: 502, headers: { 'Content-Type': 'application/json' } }); }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    if (!text) return new Response(JSON.stringify({ error: 'Empty response.' }), { status: 502, headers: { 'Content-Type': 'application/json' } });

    return new Response(JSON.stringify({ videoPlan: text }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Video plan error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
