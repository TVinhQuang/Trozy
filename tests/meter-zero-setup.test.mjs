/** Zero-setup inference is isolated in RAM; inferred readings remain private drafts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {openStore,id,now} from '../src/backend/db.mjs';
import {seedDemo} from '../src/backend/seed.mjs';
import {createMeterSubmissionService} from '../src/backend/meter-submissions.mjs';
import {createMeterReaderService} from '../src/backend/meter-reader-service.mjs';
import {createMeterAutomaticService} from '../src/backend/meter-automatic.mjs';
import {dataFor} from '../src/backend/domain.mjs';
import {meterReaderModelDigests} from '../src/ai/meter-reader.mjs';

const corners=[[.1,.2],[.9,.2],[.9,.8],[.1,.8]];
const note='Đã đối chiếu ảnh gốc và kiểm tra đầy đủ phần lẻ.';
function workerResult(input,value=13010){
 const digits=6,decimals=1,integerDigits=String(value).padStart(digits-decimals,'0'),fractionalDigits='4';
 return {width:240,height:90,status:'ready',confidence:.91,warnings:[],model:input.utility==='electric'?'paddleocr-ppocrv6':'wheels-v2',engine:input.utility==='electric'?'paddleocr':'visionstate',modelDigest:meterReaderModelDigests(input.utility).modelDigest,
  config:{digits,decimals,corners},profileSource:'image',configNeedsConfirmation:false,
  layoutEvidence:{version:1,source:'image',method:'red-suffix',digits,decimals,cells:Array.from({length:digits},(_,index)=>({index,redShare:index===digits-1 ? .25 : .001,neutralShare:.5})),separatorTexts:[],countSource:input.utility==='electric'?'ocr-line':'detected-wheel-grid',complete:true},
  quality:{canRead:true,checks:{resolution:true,exposure:true,contrast:true,sharpness:true},metrics:{width:200,height:60,cellWidth:33,meanLuma:120,contrast:50,edgeEnergy:150}},
  ...(input.utility==='electric'?{cells:[],ocrEvidence:{scope:'automatic',observations:['full','crop'].map(pass=>({text:integerDigits+fractionalDigits,confidence:.91,corners,pass})),selectedObservationIndices:[0,1],agreement:true}}:{cells:Array.from({length:digits},(_,index)=>({index,position:1,confidence:.91,alternatives:[{position:1,confidence:.91}]})),waterEvidence:{agreement:true,observations:[0,1].map(()=>({digits:integerDigits+fractionalDigits,corners,confidence:.91}))}}),
  reading:{digits:integerDigits+fractionalDigits,integerDigits,fractionalDigits,displayText:integerDigits+'.'+fractionalDigits,integerValue:value,unit:input.utility==='electric'?'kWh':'m3'}};
}
async function until(check){for(let i=0;i<400;i++){const result=check();if(result)return result;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('zero-setup background job did not reach expected state');}
async function setup(t,run=async input=>workerResult(input),afterReview=()=>{}){
 const store=openStore(':memory:');seedDemo(store);const calls=[];
 const user=key=>store.db.prepare('SELECT * FROM users WHERE id=?').get(key),owner=user('owner_demo'),tenant=user('user_tenant'),other=user('owner_other');
 let auto;const service=createMeterSubmissionService(store,{onCreated:row=>auto.enqueueCreated(row),onReviewed:(user,row,proposal)=>{auto.rememberVerifiedLayout(user,row,proposal);afterReview(user,row,proposal);}}),reader=createMeterReaderService(store,{run:async(input,options)=>{calls.push(input);return run(input,options);}});
 auto=createMeterAutomaticService(store,reader,{retryMs:5,maxAttempts:1});
 t.after(async()=>{await auto.close();store.close();});
 const bytes=await sharp({create:{width:240,height:90,channels:3,background:'#ddd'}}).png().toBuffer();
 function submit(utility='electric'){
  const fileId=id('file');store.db.prepare('INSERT INTO files(id,owner_id,uploader_id,property_id,tenant_id,room_id,name,type,bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(fileId,owner.id,tenant.id,'property_01','tenant_01','room_101','meter.png','image/png',bytes,now());
  return {receipt:service.submitPhotos(tenant,{roomId:'room_101',period:'2026-11',utility,photos:[{fileId}]}),fileId};
 }
 const job=key=>store.db.prepare('SELECT * FROM meter_reader_jobs WHERE submission_id=?').get(key);
 const clearBaseline=()=>{for(const collection of ['readings','handovers'])for(const row of store.list(collection,owner.id).filter(row=>row.roomId==='room_101'))store.remove(collection,row.id);};
 return {store,owner,tenant,other,service,reader,auto,calls,submit,job,clearBaseline};
}

test('tenant photos finish background OCR without a profile or landlord visit and expose period usage only to the owner',async t=>{
 for(const utility of ['electric','water'])await t.test(utility,async t=>{
  const f=await setup(t),prior=f.store.list('readings',f.owner.id).filter(row=>row.roomId==='room_101'&&row.confirmed).sort((a,b)=>b.period.localeCompare(a.period))[0];
  const before=JSON.stringify([f.store.list('readings'),f.store.list('invoices')]),{receipt,fileId}=f.submit(utility);
  await until(()=>f.job(receipt.id).status==='ready');
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].profile,null);assert.equal(f.job(receipt.id).profile_version,null);
  const result=f.auto.get(f.owner,receipt.id,fileId),previousValue=prior[utility==='electric'?'electricNew':'waterNew'];
  assert.equal(result.profile,null);assert.equal(result.proposal.profileSource,'image');assert.equal(result.proposal.profileVersion,null);assert.equal(result.proposal.configNeedsConfirmation,false);
  assert.deepEqual(result.usage,{status:'available',previousValue,proposedValue:13010,consumption:13010-previousValue,unit:utility==='electric'?'kWh':'m3',baselineSource:'previous-reading'});
  assert.equal(JSON.stringify([f.store.list('readings'),f.store.list('invoices')]),before);
  assert.throws(()=>f.auto.get(f.tenant,receipt.id,fileId),error=>error.status===403);assert.throws(()=>f.auto.get(f.other,receipt.id,fileId),error=>error.status===404);
  const tenantState=JSON.stringify(dataFor(f.store,f.tenant));for(const secret of [result.proposal.id,'layoutEvidence','profileSource','13010.4'])assert.ok(!tenantState.includes(secret));
  const approval={decision:'approve',version:1,value:13010,note,selectedFileId:fileId,proposalId:result.proposal.id,imageChecked:true,fractionalChecked:true};
  assert.throws(()=>f.service.review(f.owner,receipt.id,{...approval,imageChecked:false}),error=>error.status===400);
  assert.throws(()=>f.service.review(f.owner,receipt.id,{...approval,fractionalChecked:false}),error=>error.status===400);
  assert.equal(JSON.stringify([f.store.list('readings'),f.store.list('invoices')]),before);
  assert.equal(f.store.list('meterProfiles',f.owner.id).length,0);
  const approved=f.service.review(f.owner,receipt.id,approval);assert.equal(approved.submission.verificationSource,utility==='electric'?'paddleocr-and-human':'wheel-reader-and-human');
  assert.equal(approved.reading.confirmed,false);assert.equal(JSON.stringify(f.store.list('invoices')),JSON.stringify(JSON.parse(before)[1]));
  const learned=f.store.list('meterProfiles',f.owner.id);assert.equal(learned.length,1);assert.equal(learned[0].source,'image-and-review');assert.equal(learned[0].sourceSubmissionId,receipt.id);assert.equal(learned[0].version,1);assert.equal(learned[0].confirmed,true);assert.equal(learned[0].digits,6);assert.equal(learned[0].decimals,1);
 });
});

test('submission returns while no-profile inference is processing and needs no owner trigger',async t=>{
 let release,entered=false;const f=await setup(t,async(input,{signal})=>{entered=true;await new Promise(resolve=>{release=resolve;signal.addEventListener('abort',resolve,{once:true});});return workerResult(input);});
 const {receipt,fileId}=f.submit();assert.equal(receipt.status,'pending');await until(()=>entered);
 assert.equal(f.job(receipt.id).status,'processing');assert.equal(f.auto.get(f.owner,receipt.id,fileId).usage,null);release();
 await until(()=>f.job(receipt.id).status==='ready');assert.equal(f.calls.length,1);
});

test('usage uses a confirmed move-in baseline when no previous verified reading exists',async t=>{
 const f=await setup(t);for(const row of f.store.list('readings',f.owner.id).filter(row=>row.roomId==='room_101'))f.store.remove('readings',row.id);
 const {receipt,fileId}=f.submit();await until(()=>f.job(receipt.id).status==='ready');
 assert.deepEqual(f.auto.get(f.owner,receipt.id,fileId).usage,{status:'available',previousValue:1000,proposedValue:13010,consumption:12010,unit:'kWh',baselineSource:'handover'});
});

test('an absent baseline or unverified current reading never turns an implicit zero into claimed consumption',async t=>{
 for(const current of [false,true])await t.test(current?'unverified current':'no baseline',async t=>{
  const f=await setup(t);f.clearBaseline();
  if(current)f.store.put('readings',{id:'unverified-current',ownerId:f.owner.id,propertyId:'property_01',roomId:'room_101',period:'2026-11',electricOld:100,electricNew:100,waterOld:10,waterNew:10,confirmed:false});
  const {receipt,fileId}=f.submit();await until(()=>f.job(receipt.id).status==='ready');
  assert.deepEqual(f.auto.get(f.owner,receipt.id,fileId).usage,{status:'missing_baseline',previousValue:null,proposedValue:13010,consumption:null,unit:'kWh',baselineSource:null});
 });
});

test('a real verified zero baseline remains valid while a decreased proposal never displays negative usage',async t=>{
 for(const previousValue of [0,13011])await t.test(String(previousValue),async t=>{
  const f=await setup(t);f.clearBaseline();f.store.put('readings',{id:'verified-prior',ownerId:f.owner.id,propertyId:'property_01',roomId:'room_101',period:'2026-10',electricOld:0,electricNew:previousValue,waterOld:0,waterNew:0,confirmed:true});
  const {receipt,fileId}=f.submit();await until(()=>f.job(receipt.id).status==='ready');
  const usage=f.auto.get(f.owner,receipt.id,fileId).usage;assert.equal(usage.previousValue,previousValue);assert.equal(usage.proposedValue,13010);
  assert.equal(usage.status,previousValue===0?'available':'decreased');assert.equal(usage.consumption,previousValue===0?13010:null);
 });
});

test('missing, incomplete or inconsistent inferred-layout evidence cannot create a ready proposal',async t=>{
 const changes=[
  value=>({...value,layoutEvidence:undefined}),
  value=>({...value,layoutEvidence:{...value.layoutEvidence,complete:false}}),
  value=>({...value,layoutEvidence:{...value.layoutEvidence,decimals:2}}),
  value=>({...value,layoutEvidence:{...value.layoutEvidence,cells:value.layoutEvidence.cells.map(cell=>({...cell,redShare:.001}))}}),
  value=>({...value,layoutEvidence:{...value.layoutEvidence,cells:[...value.layoutEvidence.cells.slice(0,-1),{...value.layoutEvidence.cells.at(-1),index:0}]}}),
 ];
 for(const [index,change] of changes.entries())await t.test(String(index),async t=>{
  const f=await setup(t,async input=>change(workerResult(input))),{receipt,fileId}=f.submit();await until(()=>f.job(receipt.id).status==='unavailable');
  assert.equal(f.auto.get(f.owner,receipt.id,fileId).proposal,null);assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM meter_reader_proposals').get().n,0);
 });
});

test('printed decimal proof must come from the two selected OCR observations rather than detached strings',async t=>{
 const f=await setup(t,async input=>{
  const result=workerResult(input);
  return {...result,layoutEvidence:{...result.layoutEvidence,method:'printed-decimal',cells:[],separatorTexts:['13010.4','13010.4']}};
 }),{receipt,fileId}=f.submit();
 await until(()=>f.job(receipt.id).status==='unavailable');assert.equal(f.auto.get(f.owner,receipt.id,fileId).proposal,null);
 assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM meter_reader_proposals').get().n,0);
});

test('two real OCR observations of the same printed decimal can establish layout without owner setup',async t=>{
 const f=await setup(t,async input=>{
  const result=workerResult(input),text=result.reading.displayText;
  return {...result,layoutEvidence:{...result.layoutEvidence,method:'printed-decimal',cells:[],separatorTexts:[text,text]},ocrEvidence:{...result.ocrEvidence,observations:result.ocrEvidence.observations.map(row=>({...row,text}))}};
 }),{receipt,fileId}=f.submit();
 await until(()=>f.job(receipt.id).status==='ready');const result=f.auto.get(f.owner,receipt.id,fileId);
 assert.equal(result.profile,null);assert.equal(result.proposal.profileSource,'image');assert.equal(result.proposal.layoutEvidence.method,'printed-decimal');assert.equal(result.proposal.reading.displayText,'13010.4');
});

test('missing or conflicting water reread evidence never creates an image-derived ready proposal',async t=>{
 for(const change of [value=>({...value,waterEvidence:undefined}),value=>({...value,waterEvidence:{...value.waterEvidence,agreement:false}}),value=>({...value,waterEvidence:{...value.waterEvidence,observations:[value.waterEvidence.observations[0],{...value.waterEvidence.observations[1],digits:'130105'}]}})])await t.test('water evidence rejected',async t=>{
  const f=await setup(t,async input=>change(workerResult(input))),{receipt,fileId}=f.submit('water');await until(()=>f.job(receipt.id).status==='unavailable');
  assert.equal(f.auto.get(f.owner,receipt.id,fileId).proposal,null);assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM meter_reader_proposals').get().n,0);
 });
});

test('rejecting an inferred reading never remembers its layout',async t=>{
 const f=await setup(t),{receipt}=f.submit();await until(()=>f.job(receipt.id).status==='ready');
 const rejected=f.service.review(f.owner,receipt.id,{decision:'reject',version:1,note:'Ảnh chưa phù hợp, đề nghị chụp lại rõ hơn.'});assert.equal(rejected.submission.status,'rejected');assert.equal(f.store.list('meterProfiles',f.owner.id).length,0);
});

test('failure after remembering layout rolls back reading, profile, review and proposal consumption together',async t=>{
 const f=await setup(t,async input=>workerResult(input),()=>{throw new Error('simulated post-review failure');}),{receipt,fileId}=f.submit();await until(()=>f.job(receipt.id).status==='ready');
 const result=f.auto.get(f.owner,receipt.id,fileId),before=JSON.stringify([f.store.list('readings'),f.store.list('invoices'),f.store.list('audits')]);
 assert.throws(()=>f.service.review(f.owner,receipt.id,{decision:'approve',version:1,value:13010,note,selectedFileId:fileId,proposalId:result.proposal.id,imageChecked:true,fractionalChecked:true}),/simulated post-review failure/);
 assert.equal(f.store.get('meterSubmissions',receipt.id).status,'pending');assert.equal(f.store.list('meterProfiles',f.owner.id).length,0);assert.equal(f.store.db.prepare('SELECT used_at FROM meter_reader_proposals WHERE id=?').get(result.proposal.id).used_at,null);
 assert.equal(JSON.stringify([f.store.list('readings'),f.store.list('invoices'),f.store.list('audits')]),before);
});

test('a changed baseline invalidates both the prepared reading and its calculated usage',async t=>{
 const f=await setup(t),{receipt,fileId}=f.submit();await until(()=>f.job(receipt.id).status==='ready');
 const prior=f.store.list('readings',f.owner.id).filter(row=>row.roomId==='room_101'&&row.confirmed).sort((a,b)=>b.period.localeCompare(a.period))[0];f.store.put('readings',{...prior,electricNew:prior.electricNew+1});
 const result=f.auto.get(f.owner,receipt.id,fileId);assert.equal(result.status,'needs_review');assert.equal(result.proposal,null);assert.equal(result.usage,null);
});

test('a prepared automatic result remains available when the landlord returns the following day',async t=>{
 const f=await setup(t),{receipt,fileId}=f.submit();await until(()=>f.job(receipt.id).status==='ready');
 const prepared=f.auto.get(f.owner,receipt.id,fileId),actualNow=Date.now;
 try{
  Date.now=()=>actualNow()+24*60*60*1000;
  const nextDay=f.auto.get(f.owner,receipt.id,fileId);assert.equal(nextDay.status,'ready');assert.equal(nextDay.proposal.id,prepared.proposal.id);assert.deepEqual(nextDay.usage,prepared.usage);
 }finally{Date.now=actualNow;}
});
