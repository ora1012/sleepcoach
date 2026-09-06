export default {
  async fetch(request, env, ctx) {
    // 1. Handle CORS Preflight (OPTIONS request)
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://ora1012.github.io', // 보안을 위해 GitHub Pages 도메인만 허용
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 2. Only allow POST requests
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    try {
      // 3. Parse incoming request body
      const body = await request.json();
      const prompt = body.prompt;

      if (!prompt) {
        return new Response('Prompt is required', { status: 400, headers: corsHeaders });
      }

      // 4. Call GitHub Models API
      // env.GITHUB_TOKEN must be set in Cloudflare Workers settings
      const token = env.GITHUB_TOKEN; 
      const apiUrl = 'https://models.github.ai/inference/chat/completions';

      const apiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [
            { role: "system", content: "너는 청소년 수면 코치야. 다정한 반말로 2문장만 말해." },
            { role: "user", content: prompt }
          ],
          temperature: 0.9,
          max_tokens: 200
        })
      });

      if (!apiResponse.ok) {
        const errorBody = await apiResponse.text();
        throw new Error(`GitHub Models API Error (${apiResponse.status}): ${errorBody}`);
      }

      const data = await apiResponse.json();
      const commentText = data.choices?.[0]?.message?.content || '';

      // 5. Return the comment to the frontend
      return new Response(JSON.stringify({ comment: commentText.trim() }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
      
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, 
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  },
};
