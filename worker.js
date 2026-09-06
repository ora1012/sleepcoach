export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://ora1012.github.io',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });

    try {
      const body = await request.json();
      const prompt = body.prompt;
      if (!prompt) return new Response('Prompt is required', { status: 400, headers: corsHeaders });

      // Workers AI — API 키 없음. env.AI 바인딩으로 호출
      const result = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
        messages: [
          { role: 'system', content: '너는 청소년 수면 코치야. 반드시 한국어로, 다정한 친구 말투의 반말로, 잔소리 없이 딱 2문장만 말해.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 200,
        temperature: 0.9,
      });

      const commentText = (result.response || '').trim();
      return new Response(JSON.stringify({ comment: commentText }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: `Workers AI Error: ${error.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },
};
