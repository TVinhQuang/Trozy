import {createGeminiClient, defaultClient, GeminiError} from './gemini.mjs';

function provider(client, env) {
  const enabled = () => !['0','false'].includes(String(env.TROZY_AI_ENABLED).toLowerCase());
  return {
    getStatus() {
      const status = client.getStatus();
      return enabled() ? status : {...status, available:false, modelInstalled:false, message:'Gemini đã được tắt trong cấu hình máy chủ.'};
    },
    async llmJson(options) {
      if (!enabled()) throw new GeminiError('disabled','Gemini đã được tắt trong cấu hình máy chủ.',503);
      const {data,model,rotatedFrom} = await client.geminiJson(options);
      return {data,model,rotatedFrom,engine:'gemini'};
    },
    async contractFields(options) {
      if (!enabled()) throw new GeminiError('disabled','Gemini đã được tắt trong cấu hình máy chủ.',503);
      return client.imageJson(options);
    },
    isProviderError: error => error instanceof GeminiError,
  };
}

const bindings = new WeakMap();
export function workerGemini(env) {
  if (!bindings.has(env)) bindings.set(env,provider(createGeminiClient({env:()=>env}),env));
  return bindings.get(env);
}

export const nodeGemini = () => provider(defaultClient,process.env);
export const llmJson = options => nodeGemini().llmJson(options);
export const getAiStatus = () => nodeGemini().getStatus();
export const isProviderError = error => error instanceof GeminiError;
