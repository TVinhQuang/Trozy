import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createConnection} from 'node:net';
import {createApp} from '../src/backend/server.mjs';
import {HttpError} from '../src/backend/domain.mjs';

const profile={roomId:'room_101',utility:'electric',digits:6,decimals:1,meterType:'mechanical',confirmed:true};
const corners=[[.1,.2],[.9,.2],[.9,.8],[.1,.8]];
function ready(input){
 const {digits,decimals}=input.profile,integerDigits='13010'.padStart(digits-decimals,'0'),fractionalDigits='4'.repeat(decimals);
 return {width:240,height:90,status:'ready',confidence:.91,warnings:[],model:input.utility==='electric'?'paddleocr-ppocrv6':'wheels-v2',engine:input.utility==='electric'?'paddleocr':'visionstate',config:{digits,decimals,corners},profileSource:'confirmed',configNeedsConfirmation:false,
 quality:{canRead:true,checks:{resolution:true,exposure:true,contrast:true,sharpness:true},metrics:{width:200,height:60,cellWidth:33,meanLuma:120,contrast:50,edgeEnergy:150}},
 ...(input.utility==='electric'?{cells:[],ocrEvidence:{scope:'automatic',observations:['full','crop'].map(pass=>({text:integerDigits+fractionalDigits,confidence:.91,corners,pass})),selectedObservationIndices:[0,1],agreement:true}}:{cells:Array.from({length:digits},(_,index)=>({index,position:1,confidence:.91,alternatives:[{position:1,confidence:.91}]}))}),reading:{digits:integerDigits+fractionalDigits,integerDigits,fractionalDigits,displayText:integerDigits+(decimals?'.'+fractionalDigits:''),integerValue:Number(integerDigits),unit:input.utility==='electric'?'kWh':'m3'}};
}
async function poll(request,path,status='ready'){for(let i=0;i<200;i++){const result=await request(path);if(result.body.status===status)return result.body;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('automatic API did not finish');}
async function setup(t,run=async input=>ready(input)){
 const calls=[],statusCalls=[],app=createApp({dbPath:':memory:',seed:true,meterAutomatic:{retryMs:5,maxAttempts:1},meterReader:{status:async utility=>{statusCalls.push(utility);return {available:true,readerAvailable:true,automaticAvailable:true,engine:utility==='electric'?'paddleocr':'visionstate'};},run:async(input,options)=>{calls.push(input);return run(input,options);}}});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(async()=>{app.server.closeAllConnections();await app.close();});
 const base=`http://127.0.0.1:${app.server.address().port}/api`;
 function client(){let cookie='';return async(path,body,method=body===undefined?'GET':'POST',headers={})=>{
  const response=await fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return {status:response.status,body:await response.json()};
 };}
 const owner=client(),tenant=client(),other=client(),anonymous=client();
 for(const [request,email] of [[owner,'chu@trozy.vn'],[tenant,'thue@trozy.vn'],[other,'khac@trozy.vn']])assert.equal((await request('/auth/login',{email,password:'Trozy@2026'})).status,200);
 const data=(await sharp({create:{width:240,height:90,channels:3,background:'#ddd'}}).png().toBuffer()).toString('base64');
 async function submit(request=tenant,roomId='room_101',utility='electric'){
  const uploaded=await request('/files',{name:'meter.png',type:'image/png',roomId,data});assert.equal(uploaded.status,201);
  const sent=await request(request===tenant?'/meter/submissions':'/meter/owner-evidence',{roomId,period:'2026-11',utility,photos:[{fileId:uploaded.body.id}]});
  assert.equal(sent.status,request===tenant?202:201);return {sent:sent.body,fileId:uploaded.body.id,path:`/meter/submissions/${sent.body.id}/automatic?fileId=${uploaded.body.id}`};
 }
 return {app,calls,statusCalls,owner,tenant,other,anonymous,submit,data};
}

test('automatic HTTP status/profile/retry are owner-only and jobs never leak into tenant receipt, bootstrap or export',async t=>{
 const f=await setup(t),submission=await f.submit(),{sent,fileId,path}=submission;
 assert.equal((await f.anonymous(path)).status,401);assert.equal((await f.tenant(path)).status,403);assert.equal((await f.other(path)).status,404);
 assert.equal((await f.owner('/meter/reader/status?utility=electric')).body.engine,'paddleocr');assert.equal((await f.owner('/meter/reader/status?utility=water')).body.engine,'visionstate');assert.deepEqual(f.statusCalls,['electric','water']);
 assert.equal((await f.tenant('/meter/reader/status?utility=electric')).status,403);assert.equal((await f.owner('/meter/reader/status?utility=gas')).status,400);
 const setupResult=await f.owner(path);assert.equal(setupResult.status,200);assert.equal(setupResult.body.status,'needs_setup');assert.equal(setupResult.body.profile,null);assert.equal(f.calls.length,0);
 assert.deepEqual(Object.keys(sent).sort(),['createdAt','id','period','photos','propertyId','roomId','status','tenantId','updatedAt','utility'].sort());
 assert.equal((await f.tenant('/meter/profile?roomId=room_101&utility=electric')).status,403);
 assert.equal((await f.other('/meter/profile?roomId=room_101&utility=electric')).status,403);
 assert.equal((await f.tenant('/meter/profile',profile,'PUT')).status,403);
 assert.equal((await f.owner('/meter/profile',{...profile,confirmed:false},'PUT')).status,400);
 assert.equal((await f.owner('/meter/profile',{...profile,corners},'PUT')).status,400);
 assert.equal((await f.owner('/meter/profile',profile,'PUT',{'Sec-Fetch-Site':'cross-site'})).status,403);
 assert.equal((await f.owner('/meterProfiles',profile)).status,404);
 assert.equal((await f.owner('/import',{collection:'meterProfiles',rows:[profile]})).status,400);
 const versionBefore=(await f.owner('/meter/updates')).body.revision;
 const saved=await f.owner('/meter/profile',profile,'PUT');assert.equal(saved.status,200);assert.equal(saved.body.profile.version,1);
 const result=await poll(f.owner,path);assert.equal(result.proposal.reading.displayText,'13010.4');assert.equal(result.proposal.profileVersion,1);assert.equal(result.profile.version,1);assert.equal(result.proposal.engine,'paddleocr');assert.equal(result.proposal.model,'paddleocr-ppocrv6');assert.deepEqual(result.proposal.cells,[]);
 assert.equal(result.fileId,fileId);assert.equal(result.submissionVersion,1);assert.ok(f.calls.every(input=>input.mode==='auto'&&input.mime==='image/png'));
 assert.deepEqual(f.calls[0].profile,{digits:6,decimals:1});assert.notEqual((await f.owner('/meter/updates')).body.revision,versionBefore);
 for(const route of ['/bootstrap','/export','/meter/submissions']){
  const json=JSON.stringify((await f.tenant(route)).body);for(const secret of [result.proposal.id,'profileVersion','profileSource','meter-reader-jobs','meter-auto-proposal','13010.4'])assert.ok(!json.includes(secret));
 }
 assert.equal((await f.tenant('/meter_reader_jobs')).status,404);assert.equal((await f.owner('/meter_reader_jobs')).status,404);
 const retry=`/meter/submissions/${sent.id}/automatic/retry`;
 assert.equal((await f.tenant(retry,{fileId,version:1})).status,403);assert.equal((await f.other(retry,{fileId,version:1})).status,404);
 assert.equal((await f.owner(retry,{fileId,version:2})).status,409);assert.equal((await f.owner(retry,{fileId:'unknown',version:1})).status,403);
 assert.equal((await f.owner(retry,{fileId,version:1,host:'https://example.com'})).status,400);
});

test('owner photo upload schedules background reading without holding the upload or changing readings and invoices',async t=>{
 let release,entered=false;const f=await setup(t,async(input,{signal})=>{entered=true;await new Promise(resolve=>{release=resolve;signal.addEventListener('abort',resolve,{once:true});});return ready(input);});
 const ownerProfile={...profile,roomId:'room_103',utility:'water'};assert.equal((await f.owner('/meter/profile',ownerProfile,'PUT')).status,200);
 const before=JSON.stringify([f.app.store.list('readings'),f.app.store.list('invoices')]),submission=await f.submit(f.owner,'room_103','water');
 assert.equal(submission.sent.source,'owner');assert.equal(submission.sent.tenantId,null);
 for(let i=0;!entered&&i<100;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(entered);
 assert.equal((await f.owner(submission.path)).body.status,'processing');assert.equal(JSON.stringify([f.app.store.list('readings'),f.app.store.list('invoices')]),before);
 assert.ok(!(await f.tenant('/meter/submissions')).body.records.some(row=>row.id===submission.sent.id));release();
 const result=await poll(f.owner,submission.path);assert.equal(result.proposal.reading.unit,'m3');assert.equal(JSON.stringify([f.app.store.list('readings'),f.app.store.list('invoices')]),before);
});

test('profile updates require optimistic version and stale automatic proposals cannot be approved',async t=>{
 const f=await setup(t);assert.equal((await f.owner('/meter/profile',profile,'PUT')).status,200);const submission=await f.submit(),result=await poll(f.owner,submission.path);
 assert.equal((await f.owner('/meter/profile',{...profile,decimals:0},'PUT')).status,409);
 assert.equal((await f.owner('/meter/profile',{...profile,decimals:0,version:2},'PUT')).status,409);
 const saved=await f.owner('/meter/profile',{...profile,decimals:0,version:1},'PUT');assert.equal(saved.body.profile.version,2);
 const approved=await f.owner(`/meter/submissions/${submission.sent.id}/review`,{decision:'approve',version:1,value:result.proposal.reading.integerValue,imageChecked:true,fractionalChecked:true,selectedFileId:submission.fileId,proposalId:result.proposal.id,note:'Đã đối chiếu đầy đủ trên ảnh công tơ.'});assert.equal(approved.status,409);
 const replacement=await poll(f.owner,submission.path);assert.equal(replacement.proposal.profileVersion,2);assert.notEqual(replacement.proposal.id,result.proposal.id);
 f.app.store.db.prepare('UPDATE meter_reader_proposals SET expires_at=0 WHERE id=?').run(replacement.proposal.id);
 const expired=(await f.owner(submission.path)).body;assert.equal(expired.status,'needs_review');assert.equal(expired.proposal,null);
});

test('photo submissions and their durable jobs roll back together when queue persistence fails',async t=>{
 for(const role of ['tenant','owner'])await t.test(role,async t=>{
  const f=await setup(t),request=role==='tenant'?f.tenant:f.owner,roomId=role==='tenant'?'room_101':'room_103',route=role==='tenant'?'/meter/submissions':'/meter/owner-evidence';
  const upload=await request('/files',{name:'meter.png',type:'image/png',roomId,data:f.data}),input={roomId,period:'2026-11',utility:'electric',photos:[{fileId:upload.body.id}]};
  const before=JSON.stringify([f.app.store.list('meterSubmissions'),f.app.store.list('notifications'),f.app.store.list('audits')]);
  const enqueue=f.app.meterAutomatic.enqueueCreated;
  f.app.meterAutomatic.enqueueCreated=row=>{enqueue(row);throw new HttpError(503,'queue persistence failed');};
  assert.equal((await request(route,input)).status,503);
  assert.equal(JSON.stringify([f.app.store.list('meterSubmissions'),f.app.store.list('notifications'),f.app.store.list('audits')]),before);
  assert.equal(f.app.store.db.prepare('SELECT count(*) AS n FROM meter_reader_jobs').get().n,0);
  f.app.meterAutomatic.enqueueCreated=enqueue;
  const sent=await request(route,input);assert.equal(sent.status,role==='tenant'?202:201);
  const job=f.app.store.db.prepare('SELECT * FROM meter_reader_jobs WHERE submission_id=?').get(sent.body.id);assert.equal(job.file_id,upload.body.id);assert.equal(job.status,'needs_setup');
 });
});

test('shutdown stops accepting connections before waiting for the background worker to finish',async t=>{
 let entered=false,aborted=false,release;
 const f=await setup(t,async(input,{signal})=>{entered=true;await new Promise(resolve=>{release=resolve;signal.addEventListener('abort',()=>{aborted=true;},{once:true});});return ready(input);});
 await f.owner('/meter/profile',profile,'PUT');await f.submit();for(let i=0;!entered&&i<100;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(entered);
 const port=f.app.server.address().port,closing=f.app.close();assert.equal(f.app.server.listening,false);assert.ok(aborted);
 const connection=await new Promise(resolve=>{const socket=createConnection({port,host:'127.0.0.1'});socket.once('error',error=>resolve(error.code));socket.once('connect',()=>{socket.destroy();resolve('connected');});});
 assert.notEqual(connection,'connected');release();await closing;assert.equal(f.app.close(),closing);
});
