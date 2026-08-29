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

      // 4. Call Gemini 1.5 Flash API
      // env.GEMINI_API_KEY must be set in Cloudflare Workers settings
      const apiKey = env.GEMINI_API_KEY; 
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

      const geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (!geminiResponse.ok) {
        throw new Error(`Gemini API Error: ${geminiResponse.statusText}`);
      }

      const data = await geminiResponse.json();
      const commentText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

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
