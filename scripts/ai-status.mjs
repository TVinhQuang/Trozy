import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
if(existsSync('.env'))loadEnvFile('.env');
const {getOllamaStatus}=await import('../src/ai/ollama.mjs');
const status=await getOllamaStatus();
console.log(JSON.stringify(status,null,2));
if(!status.available||!status.modelInstalled)process.exitCode=1;
