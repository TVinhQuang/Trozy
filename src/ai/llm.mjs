/** Unified LLM provider selector for Trozy language features (B01, B04).
 *
 * Defaults to local Ollama when no GEMINI_API_KEY is configured, and switches
 * automatically to Gemini (with free-model rotation) when configured or forced
 * via TROZY_AI_PROVIDER=gemini.
 */
import { geminiJson, getGeminiStatus, hasGeminiKeys } from './gemini.mjs';
import { getOllamaStatus, ollamaConfig, ollamaJson } from './ollama.mjs';

export function activeAiProvider(env = process.env) {
  const mode = String(env.TROZY_AI_PROVIDER || 'auto').trim().toLowerCase();
  if (mode === 'ollama') return 'ollama';
  if (mode === 'gemini') return 'gemini';
  return hasGeminiKeys(env) ? 'gemini' : 'ollama';
}

export function isProviderError(error) {
  return error?.name === 'OllamaError' || error?.name === 'GeminiError';
}

export async function getAiStatus() {
  return activeAiProvider() === 'gemini' ? getGeminiStatus() : getOllamaStatus();
}

export async function llmJson({ system, prompt, schema, maxTokens = 900, timeoutMs, signal } = {}) {
  if (activeAiProvider() === 'gemini') {
    const response = await geminiJson({ system, prompt, schema, maxTokens, timeoutMs, signal });
    return {
      data: response.data,
      engine: 'gemini',
      model: response.model,
      rotatedFrom: response.rotatedFrom,
    };
  }
  const data = await ollamaJson({ system, prompt, schema, maxTokens, timeoutMs });
  return {
    data,
    engine: 'ollama',
    model: ollamaConfig().model,
    rotatedFrom: [],
  };
}
