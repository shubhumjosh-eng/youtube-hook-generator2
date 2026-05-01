export const maxDuration = 60;

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { hook, topic, style } = await request.json();

  if (!hook || !topic) {
    return new Response(JSON.stringify({ error: 'Hook and topic are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
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
[H00K] Opening line
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
      return new Response(JSON.stringify({ error: 'AI service error. Please try again.' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();
    const generatedText = data.choices?.[0]?.message?.content || '';

    return new Response(JSON.stringify({ script: generatedText }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
