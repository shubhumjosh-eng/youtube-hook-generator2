export const maxDuration = 60;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { script, topic, hook, style } = req.body;

  if (!script && !topic) {
    res.status(400).json({ error: 'Script or topic is required' });
    return;
  }

  const prompt = `You are an expert video director for faceless YouTube channels. Create a detailed shot-by-shot video plan for the following content.

Video Topic: ${topic}
Hook: "${hook || ''}"
Style: ${style || 'Curiosity'}

${script ? `Full Script:\n${script}\n\n` : ''}

Generate a complete video production plan with:

1. SHOT LIST - Every scene from start to finish
2. B-ROLL SUGGESTIONS - Specific stock footage keywords for each scene
3. VISUAL CUES - Animations, transitions, text overlays, zoom effects
4. TIMING - Exact second-by-second breakdown
5. AUDIO CUES - Music mood changes, sound effects
6. COLOR GRADING - Mood/tone for each section
7. STOCK FOOTAGE SEARCH TERMS - Exact keywords to find footage on Pexels/Pixabay

Format as:

[SCENE 1 - 0:00 to 0:05]
- Visual: [describe what's on screen]
- B-Roll: [stock footage description]
- Search: [exact keywords for Pexels/Pixabay]
- Text: [any on-screen text]
- Transition: [how to enter/exit scene]
- Audio: [music mood + sound effects]
- Zoom/Effect: [camera movement]

[SCENE 2 - 0:05 to 0:15]
...

Include at least 8-12 scenes. Make every visual decision intentional. No generic advice.`;

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

    res.status(200).json({ videoPlan: generatedText });
  } catch (err) {
    console.error('Video plan error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
