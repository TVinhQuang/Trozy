import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {prepareProjectRuntime} from './project-runtime.mjs';
import {createDevSession} from './dev-api.mjs';
if(existsSync('.env'))loadEnvFile('.env');
const cleanup=prepareProjectRuntime();
let session;
const stop=()=>{void session?.stop();};for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
try{session=createDevSession();await session.start();process.exitCode=await session.done;}
catch(error){console.error(`[Trozy dev] ${error.message}`);process.exitCode=1;}
finally{for(const signal of ['SIGINT','SIGTERM'])process.removeListener(signal,stop);cleanup();}
