export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { hook, topic, style } = req.body;

  if (!hook || !topic) {
    res.status(400).json({ error: 'Hook and topic are required' });
    return;
  }

  const prompt = `You are an expert YouTube scriptwriter for faceless channels. Write a full, engaging YouTube script based on this hook.

Hook: "${hook}"
Video Topic: ${topic}
Style: ${style || 'Curiosity'}

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
        model: 'openai/gpt-oss-120b:free',
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

    res.status(200).json({ script: generatedText });
  } catch (err) {
    console.error('Script generation error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
