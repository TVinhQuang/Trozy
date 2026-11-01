import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {projectDirectory,projectRoot} from '../src/shared/project-paths.mjs';

/** Start only an already-installed local runtime. Never installs or downloads. */
export async function startPreparedOllama(){
 if(['false','0'].includes(String(process.env.TROZY_AI_AUTO_START).toLowerCase())||['false','0'].includes(String(process.env.TROZY_AI_ENABLED).toLowerCase()))return null;
 try{const response=await fetch('http://127.0.0.1:11434/api/version',{signal:AbortSignal.timeout(1200)});if(response.ok)return null;}catch{}
 const manifest=resolve(projectRoot,'.cache/ollama-location.json');
 try{
  const config=existsSync(manifest)?JSON.parse(readFileSync(manifest,'utf8').replace(/^\uFEFF/,'')):{};
  const root=projectDirectory(config.installRoot||'')||projectDirectory('.runtime/ollama');
  const executable=projectDirectory(join(root,'runtime','ollama.exe')),models=projectDirectory(join(root,'models'));
  if(!executable||!models||!existsSync(executable)||!existsSync(models))return null;
  const temporary=projectDirectory(join(root,'tmp')),profile=projectDirectory(join(root,'profile'));
  if(!temporary||!profile)return null;
  for(const path of [temporary,profile,join(profile,'AppData','Local'),join(profile,'AppData','Roaming')])mkdirSync(path,{recursive:true});
  const env={...process.env,OLLAMA_HOST:'127.0.0.1:11434',OLLAMA_MODELS:models,OLLAMA_NO_CLOUD:'1',OLLAMA_TMPDIR:temporary,TEMP:temporary,TMP:temporary,TMPDIR:temporary,...(process.platform==='win32'?{USERPROFILE:profile,LOCALAPPDATA:join(profile,'AppData','Local'),APPDATA:join(profile,'AppData','Roaming')}:{})};
  const child=spawn(executable,['serve'],{cwd:root,env,stdio:'ignore',windowsHide:true});
  child.on('error',()=>console.warn('Chưa khởi động được Ollama. Các luồng nhập tay và tra cứu vẫn hoạt động.'));
  if(child.pid)writeFileSync(resolve(root,'server.pid'),String(child.pid));
  console.log('Đang mở Ollama đã cài trên máy; không tải thêm model.');
  return child;
 }catch{return null;}
}
