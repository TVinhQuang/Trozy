import {existsSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const projectRoot=fileURLToPath(new URL('../../',import.meta.url));
export const runtimeRoot=resolve(projectRoot,'.runtime');

/** Resolve repo-owned runtime storage; do not follow a symlink out of the repo. */
export function projectDirectory(value){
 const candidate=resolve(projectRoot,value),inside=relative(projectRoot,candidate);
 if(!inside||inside==='..'||inside.startsWith('..'+(process.platform==='win32'?'\\':'/'))||isAbsolute(inside))return null;
 let ancestor=candidate;
 while(!existsSync(ancestor)){const parent=dirname(ancestor);if(parent===ancestor)return null;ancestor=parent;}
 const actual=relative(realpathSync(projectRoot),realpathSync(ancestor));
 if(actual==='..'||actual.startsWith('..'+(process.platform==='win32'?'\\':'/'))||isAbsolute(actual))return null;
 return candidate;
}
