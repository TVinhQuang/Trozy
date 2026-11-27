import * as model from './llm.mjs';
import {classifyMaintenance as run} from './maintenance-engine.mjs';
export * from './maintenance-engine.mjs';

export function classifyMaintenance(options){
  return run(options,['0','false'].includes(process.env.TROZY_AI_ENABLED)?null:model);
}
