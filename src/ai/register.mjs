import {registerExtension} from '../backend/extensions.mjs';
import {answerQuestion} from './copilot.mjs';
import {classifyMaintenance} from './maintenance.mjs';
import {analyzeUtilities} from './anomalies.mjs';

export function registerDefaultExtensions(){
 registerExtension('B01',answerQuestion);
 registerExtension('B02',analyzeUtilities);
 registerExtension('B04',classifyMaintenance);
}
