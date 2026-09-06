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

      const models = [
        '@cf/meta/llama-4-scout-17b-16e-instruct',
        '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
        '@cf/meta/llama-3.1-8b-instruct'
      ];

      let finalComment = null;
      let finalModel = null;
      let lastError = null;

      for (const model of models) {
        try {
          const result = await env.AI.run(model, {
            messages: [
              { role: 'system', content: "너는 청소년 수면 코치야. 반드시 한국어만 사용해. 중국어·한자·영어 단어를 절대 섞지 마. 다정한 친구 말투의 반말로 딱 2문장. 예시: '어젯밤 3시간 40분은 너무 적었어. 오늘은 11시 전에 꼭 눕자.'" },
              { role: 'user', content: prompt },
            ],
            max_tokens: 200,
            temperature: 0.9,
          });

          let text = (result.response || '').trim();
          
          // 한자(유니코드 \u4e00-\u9fff) 제거
          text = text.replace(/[\u4e00-\u9fff]/g, '').trim();

          // 너무 짧아지면 다음 모델 시도
          if (text.length >= 20) {
            finalComment = text;
            finalModel = model;
            break;
          } else {
            lastError = new Error(`Filtered comment too short for model ${model}`);
          }
        } catch (e) {
          lastError = e;
        }
      }

      if (!finalComment) {
        throw lastError || new Error("All models failed.");
      }

      return new Response(JSON.stringify({ comment: finalComment, model: finalModel }), {
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
