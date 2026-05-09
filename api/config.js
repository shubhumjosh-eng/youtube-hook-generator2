export const config = {
  runtime: 'edge'
};

export default async function handler() {
  return new Response(JSON.stringify({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
