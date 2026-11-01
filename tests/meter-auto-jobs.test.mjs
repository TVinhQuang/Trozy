import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {openStore,id,now} from '../src/backend/db.mjs';
import {seedDemo} from '../src/backend/seed.mjs';
import {createMeterSubmissionService} from '../src/backend/meter-submissions.mjs';
import {createMeterReaderService} from '../src/backend/meter-reader-service.mjs';
import {createMeterAutomaticService} from '../src/backend/meter-automatic.mjs';
import {dataFor} from '../src/backend/domain.mjs';

const corners=[[.1,.2],[.9,.2],[.9,.8],[.1,.8]];
const profile={roomId:'room_101',utility:'electric',digits:6,decimals:1,meterType:'mechanical',confirmed:true};
function ready(input){
 const {digits,decimals}=input.profile,integerDigits='13010'.padStart(digits-decimals,'0'),fractionalDigits='4'.repeat(decimals);
 return {width:240,height:90,status:'ready',confidence:.91,warnings:[],model:input.utility==='electric'?'paddleocr-ppocrv6':'wheels-v2',engine:input.utility==='electric'?'paddleocr':'visionstate',config:{digits,decimals,corners},profileSource:'confirmed',configNeedsConfirmation:false,
 quality:{canRead:true,checks:{resolution:true,exposure:true,contrast:true,sharpness:true},metrics:{width:200,height:60,cellWidth:33,meanLuma:120,contrast:50,edgeEnergy:150}},
 ...(input.utility==='electric'?{cells:[],ocrEvidence:{scope:input.mode==='read'?'owner-region':'automatic',observations:[input.mode==='read'?'region':'full','crop'].map(pass=>({text:integerDigits+fractionalDigits,confidence:.91,corners,pass})),selectedObservationIndices:[0,1],agreement:true}}:{cells:Array.from({length:digits},(_,index)=>({index,position:1,confidence:.91,alternatives:[{position:1,confidence:.91}]}))}),
 reading:{digits:integerDigits+fractionalDigits,integerDigits,fractionalDigits,displayText:integerDigits+(decimals?'.'+fractionalDigits:''),integerValue:Number(integerDigits),unit:input.utility==='electric'?'kWh':'m3'}};
}
async function until(check){for(let i=0;i<400;i++){const result=check();if(result)return result;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('automatic job did not reach expected state');}
async function setup(t,run=async input=>ready(input),options={}){
 const store=openStore(':memory:');seedDemo(store);
 const user=key=>store.db.prepare('SELECT * FROM users WHERE id=?').get(key),owner=user('owner_demo'),tenant=user('user_tenant');
 const service=createMeterSubmissionService(store),reader=createMeterReaderService(store,{run});let auto=createMeterAutomaticService(store,reader,{retryMs:5,...options});
 t.after(async()=>{await auto.close();store.close();});
 const bytes=await sharp({create:{width:240,height:90,channels:3,background:'#ddd'}}).png().toBuffer();
 function submit(utility='electric',sourceBytes=bytes){
  const fileId=id('file');store.db.prepare('INSERT INTO files(id,owner_id,uploader_id,property_id,tenant_id,room_id,name,type,bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(fileId,owner.id,tenant.id,'property_01','tenant_01','room_101','meter.png','image/png',sourceBytes,now());
  const receipt=service.submitPhotos(tenant,{roomId:'room_101',period:'2026-11',utility,photos:[{fileId}]});return {receipt,fileId};
 }
 return {store,owner,tenant,service,reader,bytes,get auto(){return auto;},submit,async restart(){await auto.close();auto=createMeterAutomaticService(store,reader,{retryMs:5,...options});return auto;}};
}

test('new jobs require explicit current profiles; old submissions and historical profiles are never silently processed',async t=>{
 let calls=0;const f=await setup(t,async input=>{calls++;return ready(input);});
 f.store.put('meterProfiles',{id:'old_profile',ownerId:f.owner.id,propertyId:'property_01',roomId:'room_101',utility:'electric',digits:6,decimals:1,confirmed:true,version:9});
 const {receipt,fileId}=f.submit();await f.restart();await new Promise(resolve=>setTimeout(resolve,15));
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM meter_reader_jobs').get().n,0);assert.equal(calls,0);
 f.auto.enqueue(receipt.id);assert.equal(f.auto.get(f.owner,receipt.id,fileId).status,'needs_setup');assert.equal(f.auto.getProfile(f.owner,'room_101','electric').profile,null);
 const saved=f.auto.saveProfile(f.owner,profile).profile;assert.equal(saved.version,1);assert.equal(saved.reader,'meter-reader-v3');
 const result=await until(()=>{const result=f.auto.get(f.owner,receipt.id,fileId);return result.status==='ready'&&result;});
 assert.equal(calls,1);assert.equal(result.proposal.profileVersion,1);assert.equal(result.proposal.profileSource,'confirmed');assert.equal(result.proposal.configNeedsConfirmation,false);
});

test('automatic ready results remain private proposals and preserve all financial data until image review',async t=>{
 const f=await setup(t);f.auto.saveProfile(f.owner,profile);const {receipt,fileId}=f.submit(),before=JSON.stringify([f.store.list('readings'),f.store.list('invoices')]);
 f.auto.enqueue(receipt.id);const result=await until(()=>{const result=f.auto.get(f.owner,receipt.id,fileId);return result.status==='ready'&&result;});
 assert.equal(JSON.stringify([f.store.list('readings'),f.store.list('invoices')]),before);assert.equal(f.store.get('meterSubmissions',receipt.id).version,1);
 const tenantJSON=JSON.stringify(dataFor(f.store,f.tenant));for(const secret of [result.proposal.id,'profileVersion','meter-auto-proposal','Đã có chỉ số điện đề xuất'])assert.ok(!tenantJSON.includes(secret));
 assert.equal(dataFor(f.store,f.tenant).meterProfiles.length,0);assert.equal(f.store.list('notifications',f.owner.id).filter(row=>row.title.startsWith('Đã có chỉ số điện')).length,1);
 const approval={decision:'approve',version:1,value:13010,note:'Đã đối chiếu ảnh gốc và kiểm tra chỉ số.',imageChecked:true,selectedFileId:fileId,proposalId:result.proposal.id,fractionalChecked:true};
 assert.equal(f.service.review(f.owner,receipt.id,approval).submission.verificationSource,'paddleocr-and-human');
});

test('job retries are bounded and manual retry can recover after runtime repair',async t=>{
 let available=false,calls=0;const f=await setup(t,async input=>{calls++;if(!available)throw Object.assign(new Error('offline'),{status:503});return ready(input);});
 f.auto.saveProfile(f.owner,profile);const {receipt,fileId}=f.submit();f.auto.enqueue(receipt.id);
 await until(()=>f.auto.get(f.owner,receipt.id,fileId).status==='unavailable');assert.equal(calls,3);
 await new Promise(resolve=>setTimeout(resolve,25));assert.equal(calls,3);
 available=true;assert.equal(f.auto.retry(f.owner,receipt.id,{fileId,version:1}).status,'queued');
 await until(()=>f.auto.get(f.owner,receipt.id,fileId).status==='ready');assert.equal(calls,4);
});

test('shared-reader contention defers more than three times without exhausting inference attempts',async t=>{
 let calls=0;const f=await setup(t,async input=>{if(++calls<=5)throw Object.assign(new Error('reader busy'),{status:429});return ready(input);});
 f.auto.saveProfile(f.owner,profile);const {receipt,fileId}=f.submit();f.auto.enqueue(receipt.id);
 await until(()=>f.auto.get(f.owner,receipt.id,fileId).status==='ready');
 assert.equal(calls,6);assert.equal(f.store.db.prepare('SELECT attempts FROM meter_reader_jobs WHERE submission_id=?').get(receipt.id).attempts,1);
});

test('accepted tenant images between three and five MB support automatic reading, preview and manual fallback',async t=>{
 const f=await setup(t,async input=>ready(input.mode==='auto'?input:{...input,profile:{digits:input.digits,decimals:input.decimals}}));
 const source=Buffer.concat([f.bytes,Buffer.alloc(4*1024*1024)]);assert.ok(source.length>3*1024*1024&&source.length<5*1024*1024);
 f.auto.saveProfile(f.owner,profile);const {receipt,fileId}=f.submit('electric',source);f.auto.enqueue(receipt.id);
 await until(()=>f.auto.get(f.owner,receipt.id,fileId).status==='ready');
 const preview=await f.reader.preview(f.owner,receipt.id,fileId);assert.equal(preview.width,240);assert.equal(preview.height,90);
 const manual=await f.reader.read(f.owner,receipt.id,{fileId,version:1,digits:6,decimals:1,corners,regionConfirmed:true});assert.equal(manual.proposal.status,'ready');
 assert.deepEqual(Buffer.from(f.store.db.prepare('SELECT bytes FROM files WHERE id=?').get(fileId).bytes),source);
});

test('processing is serialized; shutdown cancels and restart recovers only durable jobs',async t=>{
 let calls=0,inFlight=0,maxFlight=0,block=true;
 const f=await setup(t,async(input,{signal})=>{calls++;inFlight++;maxFlight=Math.max(maxFlight,inFlight);try{if(block)await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));return ready(input);}finally{inFlight--;}});
 f.auto.saveProfile(f.owner,profile);f.auto.saveProfile(f.owner,{...profile,utility:'water'});
 const one=f.submit(),two=f.submit('water');f.auto.enqueue(one.receipt.id);f.auto.enqueue(two.receipt.id);
 await until(()=>calls===1);const reloading=f.restart();block=false;await reloading;
 await until(()=>f.auto.get(f.owner,one.receipt.id,one.fileId).status==='ready'&&f.auto.get(f.owner,two.receipt.id,two.fileId).status==='ready');
 assert.equal(maxFlight,1);assert.equal(calls,3);assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM meter_reader_proposals').get().n,2);
});

test('expired process leases recover after restart, while a live lease cannot be stolen',async t=>{
 let calls=0;const f=await setup(t,async input=>{calls++;return ready(input);});f.auto.saveProfile(f.owner,profile);
 const {receipt,fileId}=f.submit();f.auto.enqueue(receipt.id);await f.auto.close();
 f.store.db.prepare("UPDATE meter_reader_jobs SET status='processing',lease_token='old-process',lease_until=?,attempts=1").run(Date.now()+10000);
 await f.restart();await new Promise(resolve=>setTimeout(resolve,15));assert.equal(calls,0);
 await f.auto.close();f.store.db.prepare('UPDATE meter_reader_jobs SET lease_until=0').run();await f.restart();
 await until(()=>f.auto.get(f.owner,receipt.id,fileId).status==='ready');assert.equal(calls,1);
});

test('a profile change and source/version races discard late results and invalidate prior proposals',async t=>{
 let release,blocked=true;const f=await setup(t,async input=>{if(blocked)await new Promise(resolve=>{release=resolve;});return ready(input);});
 f.auto.saveProfile(f.owner,profile);const {receipt,fileId}=f.submit();f.auto.enqueue(receipt.id);await until(()=>release);
 blocked=false;f.auto.saveProfile(f.owner,{...profile,decimals:0,version:1});release();
 const result=await until(()=>{const result=f.auto.get(f.owner,receipt.id,fileId);return result.status==='ready'&&result;});
 assert.equal(result.proposal.profileVersion,2);assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM meter_reader_proposals').get().n,1);
 f.auto.saveProfile(f.owner,{...profile,version:2});
 assert.throws(()=>f.service.review(f.owner,receipt.id,{decision:'approve',version:1,value:result.proposal.reading.integerValue,note:'Đã đối chiếu ảnh gốc và kiểm tra chỉ số.',imageChecked:true,selectedFileId:fileId,proposalId:result.proposal.id}),error=>error.status===409);
 // A late result after the submission changes also cannot create a usable proposal.
 await until(()=>f.auto.get(f.owner,receipt.id,fileId).status==='ready');
 const record=f.store.get('meterSubmissions',receipt.id);f.store.put('meterSubmissions',{...record,status:'rejected',version:2});
 assert.equal(f.auto.get(f.owner,receipt.id,fileId).proposal,null);assert.equal(f.auto.get(f.owner,receipt.id,fileId).status,'needs_review');
});

test('malformed automatic configurations and fabricated ready evidence fail closed',async t=>{
 for(const change of [value=>({...value,config:null}),value=>({...value,profileSource:null}),value=>({...value,config:{...value.config,decimals:0}}),value=>({...value,quality:null}),value=>({...value,reading:{...value.reading,integerValue:8}})])await t.test('reject worker mismatch',async t=>{
  const f=await setup(t,async input=>change(ready(input)),{maxAttempts:1});f.auto.saveProfile(f.owner,profile);const {receipt,fileId}=f.submit();f.auto.enqueue(receipt.id);
  await until(()=>f.auto.get(f.owner,receipt.id,fileId).status==='unavailable');assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM meter_reader_proposals').get().n,0);
 });
});

test('owner polling hides ready proposals after billing, tenancy or baseline changes',async t=>{
 for(const change of ['billing','tenancy','baseline'])await t.test(change,async t=>{
  const f=await setup(t);f.auto.saveProfile(f.owner,profile);const {receipt,fileId}=f.submit();f.auto.enqueue(receipt.id);
  await until(()=>f.auto.get(f.owner,receipt.id,fileId).status==='ready');
  if(change==='billing')f.store.put('invoices',{id:id('invoice'),ownerId:f.owner.id,propertyId:'property_01',roomId:'room_101',period:'2026-11',status:'issued'});
  if(change==='tenancy'){const tenant=f.store.get('tenants','tenant_01');f.store.put('tenants',{...tenant,status:'left'});}
  if(change==='baseline'){const previous=f.store.list('readings',f.owner.id).filter(row=>row.roomId==='room_101'&&row.confirmed).sort((a,b)=>b.period.localeCompare(a.period))[0];f.store.put('readings',{...previous,electricNew:previous.electricNew+1});}
  const stale=f.auto.get(f.owner,receipt.id,fileId);assert.equal(stale.status,'needs_review');assert.equal(stale.proposal,null);
 });
});

test('source and submission changes during inference cannot persist a late automatic proposal',async t=>{
 for(const change of ['source','version'])await t.test(change,async t=>{
  let release;const f=await setup(t,async input=>{await new Promise(resolve=>{release=resolve;});return ready(input);});
  f.auto.saveProfile(f.owner,profile);const {receipt,fileId}=f.submit();f.auto.enqueue(receipt.id);await until(()=>release);
  if(change==='source')f.store.db.prepare('UPDATE files SET bytes=? WHERE id=?').run(Buffer.from('changed'),fileId);
  else{const row=f.store.get('meterSubmissions',receipt.id);f.store.put('meterSubmissions',{...row,version:2});}
  release();await until(()=>f.store.db.prepare('SELECT status FROM meter_reader_jobs WHERE submission_id=?').get(receipt.id).status==='needs_review');
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM meter_reader_proposals').get().n,0);assert.equal(f.auto.get(f.owner,receipt.id,fileId).proposal,null);
 });
});

test('explicit layout profiles survive the engine split while stale jobs/proposals require an engine-correct retry',async t=>{
 const f=await setup(t);
 f.store.put('meterProfiles',{id:'confirmed-layout',ownerId:f.owner.id,propertyId:'property_01',roomId:'room_101',utility:'electric',digits:6,decimals:1,meterType:'mechanical',reader:'visionstate-v2',confirmed:true,version:4});
 const confirmed=f.auto.getProfile(f.owner,'room_101','electric').profile;assert.equal(confirmed.version,4);assert.equal(confirmed.engine,'paddleocr');
 const {receipt,fileId}=f.submit();f.auto.enqueue(receipt.id);const current=await until(()=>{const value=f.auto.get(f.owner,receipt.id,fileId);return value.status==='ready'&&value;});
 assert.equal(current.proposal.engine,'paddleocr');assert.equal(current.proposal.model,'paddleocr-ppocrv6');assert.equal(current.proposal.profileVersion,4);assert.deepEqual(current.proposal.cells,[]);
 f.store.db.prepare("UPDATE meter_reader_jobs SET engine='visionstate' WHERE submission_id=?").run(receipt.id);
 const old=f.auto.get(f.owner,receipt.id,fileId);assert.equal(old.status,'needs_review');assert.equal(old.proposal,null);
 f.auto.retry(f.owner,receipt.id,{fileId,version:1});const retried=await until(()=>{const value=f.auto.get(f.owner,receipt.id,fileId);return value.status==='ready'&&value;});
 assert.notEqual(retried.proposal.id,current.proposal.id);assert.equal(retried.profile.version,4);
 const record=f.store.db.prepare('SELECT result FROM meter_reader_proposals WHERE id=?').get(retried.proposal.id),tampered=JSON.parse(record.result);tampered.engine='visionstate';tampered.model='wheels-v2';
 f.store.db.prepare('UPDATE meter_reader_proposals SET result=? WHERE id=?').run(JSON.stringify(tampered),retried.proposal.id);
 assert.equal(f.auto.get(f.owner,receipt.id,fileId).proposal,null);
});
