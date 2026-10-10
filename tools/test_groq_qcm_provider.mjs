import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.GROQ_API_KEY = 'test-groq-secret';
process.env.GROQ_MODEL = 'openai/gpt-oss-120b';
process.env.GROQ_REASONING_EFFORT = 'low';
process.env.GEMINI_API_KEY = 'test-gemini-secret-still-configured';
// Simule l'ancienne configuration Vercel : la présence de GROQ_API_KEY doit
// tout de même basculer le flux quotidien vers Groq sans consommer Gemini.
process.env.AI_QCM_PROVIDER = 'gemini';
process.env.AI_QCM_SINGLE_GEMINI_MODE = 'true';
process.env.AI_QCM_SINGLE_GROQ_MODE = 'true';
process.env.AI_QCM_FALLBACK_ENABLED = 'false';

const requests = [];
globalThis.fetch = async (url, options = {}) => {
  const href = String(url);
  const body = options.body ? JSON.parse(String(options.body)) : {};
  requests.push({ url:href, headers:options.headers || {}, body });
  return new Response(JSON.stringify({
    model:'openai/gpt-oss-120b',
    choices:[{
      message:{
        content:'```json\n{"questions":[]}\n```',
        executed_tools:[{
          type:'browser_search',
          search_results:{
            results:[{
              url:'https://www.education.gov.bf/actualites/exemple',
              title:'Source officielle',
              content:'Extrait probant de la source officielle.'
            }]
          }
        }]
      }
    }],
    usage:{ prompt_tokens:100, completion_tokens:20, total_tokens:120 }
  }), { status:200, headers:{ 'content-type':'application/json' } });
};

const {
  aiProviderStatus,
  callAiGenerateParts,
  extractJsonFromAi,
  groqTextContent,
  groundingSourcesFromGroq
} = await import('../backend/server.js');

const status = aiProviderStatus();
assert.equal(status.configured, true);
assert.equal(status.provider, 'groq');
assert.equal(status.providers.groq, true);
assert.equal(status.providers.gemini, true);
assert.equal(status.generationProvider, 'groq');
assert.equal(status.verificationProvider, 'server');
assert.equal(status.singleProvider, true);
assert.equal(status.hybrid, false);
assert.equal(status.model, 'openai/gpt-oss-120b');
assert.equal(status.verifierModel, 'contrôles-déterministes-v2');
assert.equal(status.fallback, false);

assert.equal(
  groqTextContent([{ text:'Bonjour' }], { grounding:false }),
  'Bonjour'
);
assert.match(
  groqTextContent([{ text:'Cherche.' }], { grounding:true, allowedDomains:['gov.bf', 'insd.bf'] }),
  /gov\.bf, insd\.bf/
);
assert.throws(
  () => groqTextContent([{ inline_data:{ mime_type:'application/pdf', data:'JVBERi0xLjQ=' } }], {}),
  /pièces jointes/i
);
assert.deepEqual(
  extractJsonFromAi('Résultats [extrait non JSON] avant la réponse.\n```json\n{"questions":[]}\n```\n'),
  { questions:[] }
);
assert.deepEqual(
  extractJsonFromAi('Recherche terminée [source]. Réponse finale: {"reviews":[]} puis citation '),
  { reviews:[] }
);

const generated = await callAiGenerateParts([{ text:'Réponds uniquement en JSON.' }], {
  preferredProvider:'gemini',
  grounding:true,
  allowedDomains:['gov.bf', 'education.gov.bf'],
  maxOutputTokens:500
});
assert.equal(generated.provider, 'groq');
assert.equal(generated.model, 'groq:openai/gpt-oss-120b');
assert.equal(generated.groundingSources[0].url, 'https://www.education.gov.bf/actualites/exemple');
assert.equal(requests[0].url, 'https://api.groq.com/openai/v1/chat/completions');
assert.equal(requests[0].headers.Authorization, 'Bearer test-groq-secret');
assert.equal(requests[0].body.model, 'openai/gpt-oss-120b');
assert.deepEqual(requests[0].body.tools, [{ type:'browser_search' }]);
assert.equal(requests[0].body.tool_choice, 'required');
assert.equal(requests[0].body.response_format, undefined);
assert.equal(requests[0].body.reasoning_effort, 'low');
assert.equal(requests[0].body.max_completion_tokens, 500);
assert.match(requests[0].body.messages[0].content, /education\.gov\.bf/);
assert.equal(requests.some(request => request.url.includes('generativelanguage.googleapis.com')), false);

await callAiGenerateParts([{ text:'{"questions":[]}' }], {
  grounding:false,
  maxOutputTokens:500
});
assert.deepEqual(requests[1].body.response_format, { type:'json_object' });
assert.equal(requests[1].body.tools, undefined);
assert.equal(requests.some(request => request.url.includes('generativelanguage.googleapis.com')), false);

const parsedSources = groundingSourcesFromGroq({
  choices:[{ message:{ executed_tools:[{ search_results:{ results:[
    { url:'https://www.insd.bf/source', title:'INSD', content:'Citation' },
    { url:'https://www.insd.bf/source', title:'Doublon', content:'Citation' }
  ] } }] } }]
});
assert.deepEqual(parsedSources, [{ url:'https://www.insd.bf/source', title:'INSD', quote:'Citation' }]);

console.log('Groq QCM provider tests: OK');
