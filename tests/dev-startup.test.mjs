import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createDevSession,devApiTarget,probeDevApi,devProxyError,stopDevChild} from '../scripts/dev-api.mjs';

function harness({initial='ready',onSpawn=()=>{},maxRestarts=2}={}){
 let state=initial,time=0,pid=1000;const launched=[],stopped=[],messages=[],pending=[];
 const sleep=(ms,_value,{signal}={})=>new Promise((resolve,reject)=>{
  const entry={ms,resolve:()=>{signal?.removeEventListener('abort',abort);resolve();}};
  function abort(){const index=pending.indexOf(entry);if(index>=0)pending.splice(index,1);reject(Object.assign(new Error('aborted'),{name:'AbortError'}));}
  if(signal?.aborted)return abort();pending.push(entry);signal?.addEventListener('abort',abort,{once:true});
 });
 const session=createDevSession({env:{HOST:'127.0.0.1',PORT:'4187'},probe:async()=>state,sleep,clock:()=>time,intervalMs:2,graceMs:6,startupMs:400,maxRestarts,message:value=>messages.push(value),
  spawnImpl:(executable,args,options)=>{const child=new EventEmitter();child.pid=++pid;child.exitCode=null;const record={executable,args,options,child};launched.push(record);onSpawn(record,()=>{state='ready';});return child;},
  stopChild:async child=>{if(child.exitCode!==null)return;stopped.push(child.pid);child.exitCode=0;child.emit('exit',0);child.emit('close',0);}
 });
 async function flush(){await new Promise(resolve=>setImmediate(resolve));}
 async function tick(){await flush();const next=pending.shift();assert.ok(next,'expected a scheduled readiness/monitor wait');time+=next.ms;next.resolve();await flush();}
 return {session,launched,stopped,messages,tick,flush,set state(value){state=value;},get state(){return state;}};
}

test('development target follows HOST/PORT and refuses malformed ports or target injection',()=>{
 assert.equal(devApiTarget({}),'http://127.0.0.1:3001');assert.equal(devApiTarget({HOST:'0.0.0.0',PORT:'4187'}),'http://127.0.0.1:4187');
 assert.equal(devApiTarget({HOST:'::',PORT:'4187'}),'http://[::1]:4187');
 assert.equal(devApiTarget({HOST:'[::1]',PORT:'4187'}),'http://[::1]:4187');
 for(const PORT of ['0','65536','xyz','3.5'])assert.throws(()=>devApiTarget({PORT}));
 assert.throws(()=>devApiTarget({HOST:'127.0.0.1/path'}));
});

test('cleanup never targets a child that has already exited by signal',async()=>{
 let kills=0;await stopDevChild({pid:1234,exitCode:null,signalCode:'SIGTERM',kill(){kills++;}});assert.equal(kills,0);
});

test('API readiness requires Trozy JSON and treats connection refusal as unavailable',async()=>{
 const target='http://127.0.0.1:4187';
 assert.equal(await probeDevApi(target,{fetchImpl:async url=>{assert.equal(url,target+'/api/health');return new Response(JSON.stringify({ok:true,database:'sqlite',version:'0.1.0'}));}}),'ready');
 for(const response of [new Response('<html>other application</html>'),new Response(JSON.stringify({ok:true})),new Response('{}',{status:503})])assert.equal(await probeDevApi(target,{fetchImpl:async()=>response}),'other');
 assert.equal(await probeDevApi(target,{fetchImpl:async()=>{throw Object.assign(new Error('fetch failed'),{cause:{code:'ECONNREFUSED'}});}}),'unavailable');
});

test('healthy API is reused without spawning or stopping another backend; custom target reaches Vite',async()=>{
 const h=harness();const started=await h.session.start();assert.equal(started.reusedApi,true);assert.equal(h.launched.length,1);
 assert.ok(h.launched[0].args[0].includes('vite'));assert.equal(h.launched[0].options.env.PORT,'4187');
 await h.session.stop();assert.deepEqual(h.stopped,[h.launched[0].child.pid]);assert.equal(await h.session.done,0);
});

test('frontend starts only after its owned API is healthy, and an occupied foreign port starts nothing',async()=>{
 const h=harness({initial:'unavailable'});const starting=h.session.start();await h.flush();assert.equal(h.launched.length,1);assert.equal(h.launched[0].args[0],'--watch');
 h.state='ready';await h.tick();await starting;assert.equal(h.launched.length,2);assert.ok(h.launched[1].args[0].includes('vite'));
 await h.session.stop();assert.equal(h.stopped.length,2);
 const other=harness({initial:'other'});await assert.rejects(()=>other.session.start(),/dịch vụ khác/);assert.equal(other.launched.length,0);assert.equal(await other.session.done,1);
});

test('normal watch reload downtime remains within the health grace without restarting or stopping Vite',async()=>{
 const h=harness({initial:'unavailable',onSpawn:(record,ready)=>{if(record.args[0]==='--watch')ready();}});await h.session.start();
 h.state='unavailable';await h.tick();await h.tick();await h.tick();h.state='ready';await h.tick();
 assert.equal(h.launched.length,2);assert.equal(h.stopped.length,0);await h.session.stop();
});

test('a dead owned API watcher is restarted a bounded number of times then its frontend stops',async()=>{
 let backends=0;const h=harness({initial:'unavailable',onSpawn:(record,ready)=>{if(record.args[0]==='--watch'&&++backends===1)ready();}});await h.session.start();h.state='unavailable';
 let done=false;h.session.done.then(()=>{done=true;});for(let n=0;!done&&n<24;n++)await h.tick();
 assert.ok(done);assert.equal(await h.session.done,1);assert.equal(backends,3);assert.equal(h.launched.filter(record=>record.args[0].includes('vite')).length,1);
 assert.deepEqual(new Set(h.stopped),new Set(h.launched.map(record=>record.child.pid)));assert.ok(h.messages.some(message=>message.includes('(2/2)')));
});

test('a reused API failure stops only the frontend and never replaces or kills the reused API',async()=>{
 const h=harness();await h.session.start();h.state='unavailable';for(let i=0;i<4;i++)await h.tick();
 assert.equal(await h.session.done,1);assert.equal(h.launched.length,1);assert.deepEqual(h.stopped,[h.launched[0].child.pid]);
});

test('development proxy emits bounded private JSON503 once and never leaks exception details',()=>{
 const observed={};const response={headersSent:false,writableEnded:false,writeHead(status,headers){observed.status=status;observed.headers=headers;this.headersSent=true;},end(body){observed.body=body;this.writableEnded=true;}};
 devProxyError(new Error('private path and stack'),{},response);assert.equal(observed.status,503);assert.match(observed.headers['Content-Type'],/application\/json/);assert.equal(observed.headers['Cache-Control'],'no-store');
 const body=JSON.parse(observed.body);assert.match(body.error,/Máy chủ API Trozy chưa sẵn sàng/);assert.ok(!observed.body.includes('private path'));assert.ok(observed.body.length<400);
 devProxyError(new Error('again'),{},response);assert.equal(observed.status,503);
});
