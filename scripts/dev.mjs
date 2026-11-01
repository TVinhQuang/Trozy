import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {startPreparedOllama} from './local-ai.mjs';
import {prepareProjectRuntime} from './project-runtime.mjs';
import {createDevSession,stopDevChild} from './dev-api.mjs';
if(existsSync('.env'))loadEnvFile('.env');
const cleanup=prepareProjectRuntime();
let ai,session;
const stop=()=>{void session?.stop();};for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
try{session=createDevSession();ai=await startPreparedOllama();await session.start();process.exitCode=await session.done;}
catch(error){console.error(`[Trozy dev] ${error.message}`);process.exitCode=1;}
finally{for(const signal of ['SIGINT','SIGTERM'])process.removeListener(signal,stop);await stopDevChild(ai);cleanup();}
