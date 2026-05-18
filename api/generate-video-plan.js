import { getFingerprint, checkRateLimit, sanitize, checkOrigin, verifyToken } from '../lib/_security.js';

const ALLOWED_ORIGINS = [
  'https://youtube-hook-generator2.vercel.app',
  'https://youtube-hook-generator.vercel.app',
  'http://localhost:3000',
  'http://localhost:5000'
];

export const maxDuration = 60;

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  if (!checkOrigin(req, ALLOWED_ORIGINS)) { res.status(403).json({ error: 'Origin not allowed' }); return; }

  const fp = getFingerprint(req);
  const { allowed } = checkRateLimit(fp, false);
  if (!allowed) { res.status(429).json({ error: 'Rate limit exceeded.' }); return; }

  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 1024 * 100) { res.status(413).json({ error: 'Request too large' }); return; }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const clientId = req.headers['x-client-id'] || '';

  const session = await verifyToken(token);
  if (!session) { res.status(403).json({ error: 'Unauthorized. Sign in or enter a valid unlock code.' }); return; }

  if (session.type === 'unlock' && session.clientId !== clientId) {
    res.status(403).json({ error: 'Token does not match this session.' });
    return;
  }

  const { topic, hook, style, script } = req.body || {};
  if (!topic || typeof topic !== 'string') { res.status(400).json({ error: 'Topic is required' }); return; }

  const safeTopic = sanitize(topic, 200);
  const safeHook = hook ? sanitize(String(hook), 200) : '';
  const safeScript = script ? sanitize(String(script), 50000) : '';
  if (safeTopic.length < 2) { res.status(400).json({ error: 'Topic too short' }); return; }

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

    if (!response.ok) { await response.text(); res.status(502).json({ error: 'AI service error.' }); return; }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    if (!text) { res.status(502).json({ error: 'Empty response.' }); return; }

    res.status(200).json({ videoPlan: text });
  } catch (err) {
    console.error('Video plan error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
