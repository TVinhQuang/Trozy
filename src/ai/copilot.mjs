import * as model from './llm.mjs';
import {answerQuestion as run} from './copilot-engine.mjs';
export * from './copilot-engine.mjs';

export function answerQuestion(options){
  return run(options,['0','false'].includes(process.env.TROZY_AI_ENABLED)?null:model);
}
