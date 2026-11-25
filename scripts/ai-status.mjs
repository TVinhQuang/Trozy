import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
if(existsSync('.env'))loadEnvFile('.env');
const {getAiStatus}=await import('../src/ai/llm.mjs');
const status=await getAiStatus();
console.log(JSON.stringify(status,null,2));
if(!status.available||!status.modelInstalled)process.exitCode=1;
