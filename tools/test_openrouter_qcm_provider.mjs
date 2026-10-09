import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.OPENROUTER_API_KEY = 'test-openrouter-secret';
process.env.OPENROUTER_MODEL = 'anthropic/claude-haiku-5.5';
process.env.OPENROUTER_VERIFIER_MODEL = 'anthropic/claude-sonnet-5.5';
process.env.AI_QCM_PROVIDER = 'openrouter';
process.env.AI_QCM_FALLBACK_ENABLED = 'true';
process.env.GEMINI_API_KEY = '';

const requests = [];
globalThis.fetch = async (url, options = {}) => {
  requests.push({ url:String(url), options, body:JSON.parse(String(options.body || '{}')) });
  return new Response(JSON.stringify({
    model:'anthropic/claude-haiku-5.5',
    choices:[{
      message:{
        content:'{"questions":[]}',
        annotations:[{
          type:'url_citation',
          url_citation:{
            url:'https://www.education.gov.bf/actualites/exemple',
            title:'Source officielle',
            content:'Extrait probant de la source officielle.'
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
  openRouterMessageContent,
  groundingSourcesFromOpenRouter
} = await import('../backend/server.js');

const status = aiProviderStatus();
assert.equal(status.configured, true);
assert.equal(status.provider, 'openrouter');
assert.equal(status.providers.openrouter, true);
assert.equal(status.providers.gemini, false);
assert.equal(status.model, 'anthropic/claude-haiku-5.5');
assert.equal(status.verifierModel, 'anthropic/claude-sonnet-5.5');

const textOnly = openRouterMessageContent([{ text:'Bonjour' }]);
assert.equal(textOnly, 'Bonjour');
const multipart = openRouterMessageContent([
  { text:'Lis le document.' },
  { inline_data:{ mime_type:'application/pdf', data:'JVBERi0xLjQ=' } }
]);
assert.equal(multipart[1].type, 'file');
assert.match(multipart[1].file.file_data, /^data:application\/pdf;base64,/);

const generated = await callAiGenerateParts([{ text:'Réponds en JSON.' }], {
  grounding:true,
  allowedDomains:['gov.bf', 'education.gov.bf'],
  maxOutputTokens:500
});
assert.equal(generated.provider, 'openrouter');
assert.match(generated.model, /^openrouter:/);
assert.equal(generated.text, '{"questions":[]}');
assert.equal(generated.groundingSources[0].url, 'https://www.education.gov.bf/actualites/exemple');
assert.equal(requests[0].url, 'https://openrouter.ai/api/v1/chat/completions');
assert.equal(requests[0].options.headers.Authorization, 'Bearer test-openrouter-secret');
assert.equal(requests[0].body.model, 'anthropic/claude-haiku-5.5');
assert.equal(requests[0].body.tools[0].type, 'openrouter:web_search');
assert.deepEqual(requests[0].body.tools[0].parameters.allowed_domains, ['gov.bf', 'education.gov.bf']);
assert.equal(requests[0].body.tools.length, 1);
assert.equal(requests[0].body.tools[0].parameters.max_uses, 1);
assert.equal(requests[0].body.max_tool_calls, 1);
assert.equal(requests[0].body.provider.data_collection, 'deny');
assert.equal(requests[0].body.response_format.type, 'json_object');
assert.deepEqual(requests[0].body.reasoning, { effort:'low' });
assert.equal(requests[0].body.temperature, undefined);
assert.equal(requests[0].body.top_p, undefined);

await callAiGenerateParts([
  { text:'Lis ce PDF.' },
  { inline_data:{ mime_type:'application/pdf', data:'JVBERi0xLjQ=' } }
], { grounding:false, maxOutputTokens:500 });
assert.equal(requests[1].body.messages[0].content[1].type, 'file');
assert.equal(requests[1].body.plugins[0].id, 'file-parser');
assert.equal(requests[1].body.plugins[0].pdf.engine, 'cloudflare-ai');
assert.equal(requests[1].body.tools, undefined);

await callAiGenerateParts([{ text:'Vérifie ce QCM.' }], {
  verifier:true,
  grounding:false,
  maxOutputTokens:500
});
assert.equal(requests[2].body.model, 'anthropic/claude-sonnet-5.5');
assert.deepEqual(requests[2].body.reasoning, { effort:'low' });
assert.equal(requests[2].body.temperature, undefined);
assert.equal(requests[2].body.top_p, undefined);

const parsedSources = groundingSourcesFromOpenRouter({
  choices:[{ message:{ annotations:[{ url_citation:{ url:'https://www.insd.bf/source', title:'INSD', content:'Citation' } }] } }]
});
assert.deepEqual(parsedSources, [{ url:'https://www.insd.bf/source', title:'INSD', quote:'Citation' }]);

console.log('OpenRouter QCM provider tests: OK');
