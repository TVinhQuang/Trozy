import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {prepareProjectRuntime} from './project-runtime.mjs';
import {projectRoot,projectDirectory} from '../src/shared/project-paths.mjs';

const args=process.argv.slice(2),cleanup=prepareProjectRuntime();
let executable=process.execPath,command=args;
if(args[0]==='--powershell'){
 const script=projectDirectory(args[1]||'');
 if(!script)throw new Error('A project PowerShell script is required.');
 executable='powershell.exe';command=['-NoProfile','-ExecutionPolicy','Bypass','-File',script,...args.slice(2)];
}else if(args[0]==='--python'){
 const script=projectDirectory(args[1]||'');
 if(!script||!script.toLowerCase().endsWith('.py'))throw new Error('A project Python script is required.');
 executable=projectDirectory(`.runtime/meter-digits/visionstate-yolo/python/${process.platform==='win32'?'python.exe':'bin/python3'}`);
 if(!executable||!existsSync(executable))throw new Error('Prepare the project-local meter reader Python runtime first.');
 command=['-B',script,...args.slice(2)];
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
