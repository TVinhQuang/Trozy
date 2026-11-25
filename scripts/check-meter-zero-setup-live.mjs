/** Actual local OCR over HTTP with no meter profiles and SQLite RAM only. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import sharp from 'sharp';
import {createApp} from '../src/backend/server.mjs';
import {meterReaderStatus} from '../src/ai/meter-reader.mjs';

const output=process.argv[2];
if(output)assert(/^docs[\\/]test[\\/][A-Za-z0-9_.-]+\.json$/.test(output),'Use a named report in docs/test.');
const local=path=>new URL('../'+path,import.meta.url),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(await readFile(local('docs/test/fixtures/visionstate-yolo-samples.json'),'utf8'));
const cases=[];
for(const [id,utility,expected] of [['water-blue','water','00001056'],['electric-clear','electric','007664'],['electric-26762','electric',null],['electric-screenshot','electric',null],['water-weathered','water','13038']]){
 const entry=manifest.samples.find(row=>row.id===id),bytes=await readFile(local(entry.file));assert.equal(sha(bytes),entry.sha256);
 cases.push({id,utility,expected,bytes,sha256:sha(bytes),synthetic:false});
}
const synthetic=await sharp(await readFile(local('tests/fixtures/electric-paddle-synthetic.svg'))).png().toBuffer();
// The old synthetic fixture has no decimal mark or red suffix: layout is unknown.
cases.push({id:'electric-unmarked-control',utility:'electric',expected:null,bytes:synthetic,sha256:sha(synthetic),synthetic:true});
const blank=await sharp({create:{width:640,height:240,channels:3,background:'#ffffff'}}).png().toBuffer();
for(const utility of ['electric','water'])cases.push({id:`blank-${utility}`,utility,expected:null,bytes:blank,sha256:sha(blank),synthetic:true});
for(const utility of ['electric','water'])assert.equal(meterReaderStatus(utility).automaticAvailable,true,`Prepare the existing ${utility} models first; this check never downloads.`);
const app=createApp({dbPath:':memory:',seed:true,meterAutomatic:{maxAttempts:1}});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${app.server.address().port}/api`;
function client(){let cookie='';return async(path,input)=>{
 const response=await fetch(base+path,{method:input===undefined?'GET':'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)})});
 if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
 return {status:response.status,body:await response.json()};
};}
const owner=client(),tenant=client(),other=client(),results=[];
try{
 for(const [request,email] of [[owner,'chu@trozy.vn'],[tenant,'thue@trozy.vn'],[other,'khac@trozy.vn']])assert.equal((await request('/auth/login',{email,password:'Trozy@2026'})).status,200);
 // An explicit verified zero baseline in isolated demo data, never a missing-data fallback.
 for(const row of app.store.list('readings','owner_demo').filter(row=>row.roomId==='room_101'))app.store.put('readings',{...row,electricOld:0,electricNew:0,waterOld:0,waterNew:0});
 const finances=()=>JSON.stringify([app.store.list('readings'),app.store.list('invoices')]),before=finances();
 for(const sample of cases){
  assert.equal(app.store.list('meterProfiles').length,0);
  const uploaded=await tenant('/files',{name:`${sample.id}.png`,type:'image/png',roomId:'room_101',data:sample.bytes.toString('base64')});assert.equal(uploaded.status,201);
  const sent=await tenant('/meter/submissions',{roomId:'room_101',period:'2026-11',utility:sample.utility,photos:[{fileId:uploaded.body.id}]});assert.equal(sent.status,202);
  const path=`/meter/submissions/${sent.body.id}/automatic?fileId=${uploaded.body.id}`,started=Date.now();
  // Poll durable jobs directly to prove completion does not require an owner opening the page.
  let job;
  do{job=app.store.db.prepare('SELECT status FROM meter_reader_jobs WHERE submission_id=?').get(sent.body.id);if(!['queued','processing'].includes(job.status))break;await delay(150);}while(Date.now()-started<120_000);
  assert(!['queued','processing','needs_setup'].includes(job.status));
  const value=await owner(path);assert.equal(value.status,200);assert.equal(value.body.profile,null);
  assert.equal((await tenant(path)).status,403);assert.equal((await other(path)).status,404);
  const result=value.body;
  if(result.status==='ready'){
   assert(sample.expected,`${sample.id} must not produce a reading`);assert.equal(result.proposal.reading.digits,sample.expected);
   assert.equal(result.proposal.profileSource,'image');assert.equal(result.proposal.configNeedsConfirmation,false);
   assert.equal(result.usage.status,'available');assert.equal(result.usage.consumption,result.proposal.reading.integerValue);
  }else assert.equal(result.proposal?.reading??null,null);
  if(sample.expected===null)assert.notEqual(result.status,'ready');
  assert.equal(finances(),before);assert.equal(app.store.list('meterProfiles').length,0);
  const summary={id:sample.id,utility:sample.utility,sha256:sample.sha256,synthetic:sample.synthetic,status:result.status,reading:result.proposal?.reading??null,usage:result.usage,layout:result.proposal?.layoutEvidence??null,durationMs:Date.now()-started,reason:result.reason};
  results.push(summary);console.log(JSON.stringify({sample:sample.id,status:summary.status,reading:summary.reading?.displayText??null,durationMs:summary.durationMs}));
  // End this disposable sample's pending slot before reusing the same room/type.
  const closed=await owner(`/meter/submissions/${sent.body.id}/review`,{decision:'reject',version:1,note:'Kết thúc mẫu kiểm thử riêng trong SQLite RAM.'});assert.equal(closed.status,200);
 }
 const report={createdAt:new Date().toISOString(),scope:'Actual project-local CPU OCR over HTTP; no configured profiles, SQLite RAM only, original photos unchanged.',referencePolicy:'Reused development fixtures and synthetic plumbing controls, not a held-out accuracy benchmark.',results,financialDataUnchanged:true,ownerProfileCount:0};
 if(output)await writeFile(local(output),JSON.stringify(report,null,2)+'\n');
 assert(results.some(row=>row.id==='water-blue'&&row.status==='ready'),'Water real-photo regression must read without setup.');
 assert(results.some(row=>row.id==='electric-clear'&&row.status==='ready'),'Electric real-photo regression must read without setup.');
 console.log('PASS zero-setup background recognition, private usage previews, controls and unchanged financial data');
}finally{app.server.closeAllConnections();await app.close();}
