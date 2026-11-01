import {spawn} from 'node:child_process';
import {prepareProjectRuntime} from './project-runtime.mjs';
import {projectRoot,projectDirectory} from '../src/shared/project-paths.mjs';

const args=process.argv.slice(2),cleanup=prepareProjectRuntime();
let executable=process.execPath,command=args;
if(args[0]==='--powershell'){
 const script=projectDirectory(args[1]||'');
 if(!script)throw new Error('A project PowerShell script is required.');
 executable='powershell.exe';command=['-NoProfile','-ExecutionPolicy','Bypass','-File',script,...args.slice(2)];
}
if(!command.length)throw new Error('A project script or Node arguments are required.');
let child;
const signals=['SIGINT','SIGTERM'];
const stop=signal=>child?.kill(signal);
for(const signal of signals)process.on(signal,stop);
try{
 const status=await new Promise((resolve,reject)=>{
  child=spawn(executable,command,{cwd:projectRoot,env:process.env,stdio:'inherit',windowsHide:true});
  child.once('error',reject);child.once('close',(code,signal)=>resolve(code??(signal?1:0)));
 });
 process.exitCode=status;
}finally{
 for(const signal of signals)process.removeListener(signal,stop);
 cleanup();
}
