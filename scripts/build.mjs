import {spawnSync} from 'node:child_process';

for(const args of [['node_modules/typescript/bin/tsc','--noEmit'],['node_modules/vite/bin/vite.js','build']]){
 const result=spawnSync(process.execPath,args,{stdio:'inherit',env:process.env,windowsHide:true});
 if(result.error)throw result.error;
 if(result.status!==0){process.exitCode=result.status??1;break;}
}
