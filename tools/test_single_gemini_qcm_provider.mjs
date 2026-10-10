import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.OPENROUTER_API_KEY = 'test-openrouter-secret';
process.env.OPENROUTER_MODEL = 'anthropic/claude-haiku-5.5';
process.env.OPENROUTER_VERIFIER_MODEL = 'anthropic/claude-sonnet-5.5';
process.env.GEMINI_API_KEY = 'test-gemini-secret';
process.env.GEMINI_MODEL = 'gemini-3.7-flash';
process.env.GEMINI_VERIFIER_MODEL = 'gemini-3.1-pro-preview';
process.env.AI_QCM_PROVIDER = 'openrouter';
process.env.AI_QCM_FALLBACK_ENABLED = 'true';

const requests = [];
globalThis.fetch = async (url, options = {}) => {
  const href = String(url);
  const body = options.body ? JSON.parse(String(options.body)) : {};
  requests.push({ url:href, body });
  if (href.includes('generativelanguage.googleapis.com/v1beta/models?')){
    return new Response(JSON.stringify({
      models:[{ name:'models/gemini-2.5-flash', supportedGenerationMethods:['generateContent'] }]
    }), { status:200, headers:{ 'content-type':'application/json' } });
  }
  if (href.includes('generativelanguage.googleapis.com')){
    return new Response(JSON.stringify({
      candidates:[{ content:{ parts:[{ text:'{"questions":[]}' }] } }]
    }), { status:200, headers:{ 'content-type':'application/json' } });
  }
  return new Response(JSON.stringify({
    model:'anthropic/claude-sonnet-5.5',
    choices:[{ message:{ content:'{"reviews":[]}' } }]
  }), { status:200, headers:{ 'content-type':'application/json' } });
};

const { aiProviderStatus, callAiGenerateParts } = await import('../backend/server.js');

const status = aiProviderStatus();
assert.equal(status.singleProvider, true);
assert.equal(status.hybrid, false);
assert.equal(status.generationProvider, 'gemini');
assert.equal(status.verificationProvider, 'server');
assert.equal(status.model, 'gemini-3.7-flash');
assert.equal(status.verifierModel, 'contrôles-déterministes-v2');
assert.equal(status.fallback, false);

const generated = await callAiGenerateParts([{ text:'Génère un QCM.' }], {
  preferredProvider:'gemini',
  grounding:true,
  maxOutputTokens:500
});
assert.equal(generated.provider, 'gemini');
assert.match(requests[0].url, /generativelanguage\.googleapis\.com\/v1beta\/models\?/);
assert.match(requests[1].url, /models\/gemini-2\.5-flash:generateContent/);
assert.deepEqual(requests[1].body.tools, [{ google_search:{} }]);
assert.equal(requests[1].body.generationConfig.responseMimeType, undefined);

const checked = await callAiGenerateParts([{ text:'Contrôle ce QCM.' }], {
  preferredProvider:'openrouter',
  verifier:true,
  grounding:false,
  maxOutputTokens:500
});
assert.equal(checked.provider, 'gemini');
assert.match(requests[2].url, /generativelanguage\.googleapis\.com/);
assert.equal(requests.some(request => request.url.includes('openrouter.ai')), false);

console.log('Single Gemini QCM provider tests: OK');
