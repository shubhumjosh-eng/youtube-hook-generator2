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
  if (contentLength > 1024 * 50) { res.status(413).json({ error: 'Request too large' }); return; }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const clientId = req.headers['x-client-id'] || '';

  const session = await verifyToken(token);
  if (!session) { res.status(403).json({ error: 'Unauthorized. Sign in or enter a valid unlock code.' }); return; }

  if (session.type === 'unlock' && session.clientId !== clientId) {
    res.status(403).json({ error: 'Token does not match this session.' });
    return;
  }

  const { hook, topic, style } = req.body || {};
  if (!hook || typeof hook !== 'string') { res.status(400).json({ error: 'Hook is required' }); return; }
  if (!topic || typeof topic !== 'string') { res.status(400).json({ error: 'Topic is required' }); return; }

  const safeHook = sanitize(hook, 200);
  const safeTopic = sanitize(topic, 200);
  if (safeHook.length < 3) { res.status(400).json({ error: 'Hook too short' }); return; }
  if (safeTopic.length < 2) { res.status(400).json({ error: 'Topic too short' }); return; }

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
    if (!text) { res.status(502).json({ error: 'Empty response. Try a different hook.' }); return; }

    res.status(200).json({ script: text });
  } catch (err) {
    console.error('Script error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
