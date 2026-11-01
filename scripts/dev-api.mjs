/** Local development startup and liveness, independent of the application database. */
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

export function devApiTarget(env=process.env){
 const port=Number(env.PORT||3001);if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('PORT cần là cổng API từ 1 đến 65535.');
 let host=env.HOST||'127.0.0.1';if(host.startsWith('[')&&host.endsWith(']'))host=host.slice(1,-1);
 if(host==='0.0.0.0')host='127.0.0.1';if(host==='::')host='::1';
 if(!/^[\w.:-]+$/.test(host))throw new Error('HOST của API không hợp lệ.');
 return new URL(`http://${host.includes(':')?`[${host}]`:host}:${port}`).origin;
}
export async function probeDevApi(target,{fetchImpl=fetch,timeoutMs=1200}={}){
 try{
  const response=await fetchImpl(`${target}/api/health`,{signal:AbortSignal.timeout(timeoutMs),redirect:'error'});
  const body=await response.json().catch(()=>null);
  return response.ok&&body?.ok===true&&body.database==='sqlite'&&typeof body.version==='string'?'ready':'other';
 }catch(error){return ['ECONNREFUSED','ECONNRESET','ETIMEDOUT'].includes(error.cause?.code)||['TimeoutError','AbortError'].includes(error.name)?'unavailable':'other';}
}
/** Return a bounded JSON error before Vite's default empty 500 response. */
export function devProxyError(_error,_request,response){
 if(!response||typeof response.writeHead!=='function'||response.headersSent||response.writableEnded)return;
 response.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
 response.end(JSON.stringify({error:'Máy chủ API Trozy chưa sẵn sàng. Hãy kiểm tra cửa sổ đang chạy npm run dev rồi thử lại.'}));
}

/** Stop only a child this session created, including the Windows watch process tree. */
const childStops=new WeakMap();
export function stopDevChild(child){
 if(!child||child.exitCode!==null||(child.signalCode??null)!==null||!child.pid)return Promise.resolve();
 if(childStops.has(child))return childStops.get(child);
 const stopping=process.platform==='win32'?new Promise(resolve=>{
  const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
  killer.once('error',()=>{child.kill();resolve();});killer.once('close',resolve);
 }):new Promise(resolve=>{child.once('close',resolve);child.kill('SIGTERM');});
 childStops.set(child,stopping);return stopping;
}

export function createDevSession({env=process.env,spawnImpl=spawn,stopChild=stopDevChild,probe=probeDevApi,sleep=delay,clock=Date.now,intervalMs=2000,graceMs=15000,startupMs=15000,maxRestarts=2,message=console.log}={}){
 const target=devApiTarget(env),controller=new AbortController(),children=new Set();
 let closed=false,backend=null,restarts=0,closePromise,resolveDone;
 const done=new Promise(resolve=>{resolveDone=resolve;});
 function launch(role,args){
  const child=spawnImpl(process.execPath,args,{cwd:process.cwd(),env:{...env},stdio:'inherit',windowsHide:true});
  const record={role,child,ended:false,error:null};children.add(record);
  child.once('error',error=>{record.error=error;record.ended=true;if(role==='web')void stop(1,`Không thể mở giao diện: ${error.message}`);});
  child.once('exit',code=>{record.ended=true;if(role==='web'&&!closed)void stop(code||0,'Giao diện phát triển đã dừng.');});
  return record;
 }
 async function waitReady(record){
  const start=clock();
  while(!closed){
   if(record?.ended)throw new Error(record.error?.message||'Tiến trình API đã thoát trước khi sẵn sàng.');
   const state=await probe(target);if(state==='ready')return;
   if(state==='other')throw new Error('Cổng API đang được một dịch vụ khác sử dụng. Kiểm tra HOST và PORT trước khi chạy lại.');
   if(clock()-start>=startupMs)throw new Error('API không khởi động được. Xem lỗi phía trên trong cửa sổ npm run dev.');
   await sleep(250,undefined,{signal:controller.signal});
  }
 }
 async function stop(code=0,reason=''){
  if(closePromise)return closePromise;closed=true;controller.abort();if(reason)message(`[Trozy dev] ${reason}`);
  closePromise=Promise.allSettled([...children].map(record=>stopChild(record.child))).then(()=>{resolveDone(code);});return closePromise;
 }
 async function monitor(){
  let failedAt=null;
  try{while(!closed){
   await sleep(intervalMs,undefined,{signal:controller.signal});if(closed)return;
   const state=await probe(target);if(state==='ready'){failedAt=null;continue;}
   failedAt??=clock();if(clock()-failedAt<graceMs)continue;
   if(!backend)throw new Error('API được dùng lại đã ngừng phản hồi. Mở lại máy chủ API rồi chạy npm run dev.');
   if(restarts>=maxRestarts)throw new Error('API vẫn không hoạt động sau các lần khởi động lại. Đã dừng giao diện; xem lỗi API phía trên.');
   message(`[Trozy dev] API ngừng phản hồi; khởi động lại tiến trình theo dõi (${++restarts}/${maxRestarts}).`);
   await stopChild(backend.child);children.delete(backend);
   if(closed)return;backend=launch('api',['--watch','src/backend/server.mjs']);
   try{await waitReady(backend);}catch(error){if(restarts>=maxRestarts)throw error;}
   failedAt=null;
  }}catch(error){if(!closed)await stop(1,error.message);}
 }
 async function start(){
  try{
   if(closed)return;
   const state=await probe(target);
   if(closed)return;
   if(state==='other')throw new Error('Cổng API đang được một dịch vụ khác sử dụng. Kiểm tra HOST và PORT trước khi chạy lại.');
   if(state==='ready')message(`[Trozy dev] Dùng máy chủ API Trozy đang hoạt động tại ${target}; không mở thêm tiến trình API.`);
   else{backend=launch('api',['--watch','src/backend/server.mjs']);await waitReady(backend);}
   if(closed)return;launch('web',['node_modules/vite/bin/vite.js','--host','127.0.0.1']);
   void monitor();return {target,reusedApi:!backend};
  }catch(error){await stop(1,error.message);throw error;}
 }
 return {start,stop,done,target};
}
