export const config = {
  runtime: 'edge'
};

export default async function handler(request) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({
    app: 'HookForge',
    version: '1.0.0'
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
