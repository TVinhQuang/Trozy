import {mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {basename,dirname,join} from 'node:path';
import {projectDirectory,runtimeRoot} from '../src/shared/project-paths.mjs';

/** A private temp directory per Node process; delete only that exact directory. */
export function prepareProjectRuntime(){
 const parent=join(runtimeRoot,'tmp');
 if(!projectDirectory(parent))throw new Error('Project temporary path escapes the repository.');
 mkdirSync(parent,{recursive:true});
 const directory=mkdtempSync(join(parent,'node-'));
 for(const key of ['TEMP','TMP','TMPDIR'])process.env[key]=directory;
 process.env.NPM_CONFIG_CACHE=projectDirectory('.cache/npm');
 process.env.XDG_CACHE_HOME=projectDirectory('.cache');
 const cleanup=()=>{if(projectDirectory(directory)===directory&&dirname(directory)===parent&&basename(directory).startsWith('node-'))rmSync(directory,{recursive:true,force:true,maxRetries:3,retryDelay:100});};
 process.once('exit',cleanup);
 return cleanup;
}
