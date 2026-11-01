import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {fixture,note,status} from './fixtures/manual-meter-fixture.mjs';
import {dataFor} from '../src/backend/domain.mjs';
import {createMeterReaderService} from '../src/backend/meter-reader-service.mjs';
import {createApp} from '../src/backend/server.mjs';

const corners=[[.1,.2],[.9,.2],[.9,.8],[.1,.8]];
const quality={canRead:true,checks:{resolution:true,exposure:true,contrast:true,sharpness:true},metrics:{width:200,height:60,cellWidth:33.33,meanLuma:120,contrast:50,edgeEnergy:150}};
const statusResult={available:true,readerAvailable:true,locatorAvailable:true,message:'Bộ đọc cục bộ sẵn sàng.',model:'wheels-v2',mechanicalOnly:true};
async function pixels(){return sharp({create:{width:240,height:90,channels:3,background:'#dddddd'}}).png().toBuffer();}
function ready(input,{integerValue=13010,status='ready',confidence=.91}={}){
 const integerDigits=String(integerValue).padStart(input.digits-input.decimals,'0'),fractionalDigits='4'.repeat(input.decimals),digits=integerDigits+fractionalDigits;
 return {width:240,height:90,status,confidence,warnings:[],quality:structuredClone(quality),model:input.utility==='electric'?'paddleocr-ppocrv6':'wheels-v2',engine:input.utility==='electric'?'paddleocr':'visionstate',...(input.utility==='electric'?{cells:[],ocrEvidence:{scope:'owner-region',observations:['region','crop'].map(pass=>({text:digits,confidence,corners,pass})),selectedObservationIndices:status==='ready'?[0,1]:[],agreement:status==='ready'}}:{cells:Array.from({length:input.digits},(_,index)=>({index,position:1,confidence,alternatives:[{position:1,confidence}]}))}),reading:status==='ready'?{digits,integerDigits,fractionalDigits,displayText:integerDigits+(input.decimals?'.'+fractionalDigits:''),integerValue,unit:input.utility==='electric'?'kWh':'m3'}:null};
}
async function setup(t,run){
 const f=fixture(t),bytes=await pixels(),fileId=f.file({bytes}),receipt=f.service.submitPhotos(f.tenant,f.request('electric',fileId));
 const input={fileId,version:receipt.status==='pending'?1:0,corners,digits:6,decimals:1,regionConfirmed:true};
 const calls=[],reader=createMeterReaderService(f.store,{status:async()=>statusResult,run:async value=>{calls.push(value);return run?run(value):ready(value,{integerValue:f.prior.electricNew+10});}});
 return {...f,bytes,fileId,receipt,input,calls,reader};
}

test('owner-guided proposals remain private evidence until explicit image and fractional confirmation',async t=>{
 const f=await setup(t),before=JSON.stringify([f.store.list('readings'),f.store.list('invoices')]);
 assert.deepEqual(await f.reader.status(f.owner),statusResult);await assert.rejects(()=>f.reader.status(f.tenant),status(403));
 const {proposal}=await f.reader.read(f.owner,f.receipt.id,f.input);
 assert.equal(proposal.status,'ready');assert.equal(proposal.reading.integerValue,f.prior.electricNew+10);assert.equal(proposal.config.decimals,1);assert.equal(proposal.submissionVersion,1);
 assert.equal(f.store.get('meterSubmissions',f.receipt.id).version,1);assert.equal(JSON.stringify([f.store.list('readings'),f.store.list('invoices')]),before);
 assert.ok(!JSON.stringify(dataFor(f.store,f.tenant)).includes(proposal.id));assert.ok(!JSON.stringify(dataFor(f.store,f.owner).meterSubmissions).includes(proposal.id));
 const approval={decision:'approve',version:1,value:proposal.reading.integerValue,selectedFileId:f.fileId,imageChecked:true,note,proposalId:proposal.id};
 assert.throws(()=>f.service.review(f.owner,f.receipt.id,approval),status(400));
 assert.throws(()=>f.service.review(f.owner,f.receipt.id,{...approval,fractionalChecked:true,value:approval.value+1}),status(400));
 assert.throws(()=>f.service.review(f.owner,f.receipt.id,{...approval,fractionalChecked:true,imageChecked:false}),status(400));
 const reviewed=f.service.review(f.owner,f.receipt.id,{...approval,fractionalChecked:true});
 assert.equal(reviewed.reading.electricNew,proposal.reading.integerValue);assert.equal(reviewed.reading.confirmed,false);assert.equal(reviewed.submission.verificationSource,'paddleocr-and-human');
 assert.equal(JSON.stringify(f.store.list('invoices')),JSON.stringify(JSON.parse(before)[1]));
 assert.throws(()=>f.service.review(f.owner,f.receipt.id,{...approval,fractionalChecked:true}),status(409));
});

test('reader authorizes ownership, exact submission evidence and bounded explicit configuration before inference',async t=>{
 const f=await setup(t);
 await assert.rejects(()=>f.reader.read(f.tenant,f.receipt.id,f.input),status(403));
 await assert.rejects(()=>f.reader.locate(f.tenant,f.receipt.id,{fileId:f.fileId,version:1}),status(403));
 await assert.rejects(()=>f.reader.preview(f.tenant,f.receipt.id,f.fileId),status(403));
 await assert.rejects(()=>f.reader.read(f.other,f.receipt.id,f.input),status(404));
 await assert.rejects(()=>f.reader.read(f.owner,f.receipt.id,{...f.input,fileId:f.file()}),status(403));
 await assert.rejects(()=>f.reader.read(f.owner,f.receipt.id,{...f.input,version:2}),status(409));
 for(const change of [{host:'https://example.com'},{digits:0},{digits:13},{digits:12,decimals:0},{decimals:6},{regionConfirmed:false},{corners:[[0,0],[1,1],[1,0],[0,1]]},{corners:[[0,0],[1,0],[1,1],[-.1,1]]}])await assert.rejects(()=>f.reader.read(f.owner,f.receipt.id,{...f.input,...change}),status(400));
 assert.equal(f.calls.length,0);
});

test('a proposal cannot survive source, version, expiry or active-tenancy changes',async t=>{
 for(const change of ['version','file','expiry','tenancy'])await t.test(change,async t=>{
  const f=await setup(t),{proposal}=await f.reader.read(f.owner,f.receipt.id,f.input);
  if(change==='version'){const row=f.store.get('meterSubmissions',f.receipt.id);f.store.put('meterSubmissions',{...row,version:2});}
  if(change==='file')f.store.db.prepare('UPDATE files SET bytes=? WHERE id=?').run(Buffer.from('changed'),f.fileId);
  if(change==='expiry')f.store.db.prepare('UPDATE meter_reader_proposals SET expires_at=0 WHERE id=?').run(proposal.id);
  if(change==='tenancy'){const tenant=f.store.get('tenants','tenant_01');f.store.put('tenants',{...tenant,status:'checked_out'});}
  const row=f.store.get('meterSubmissions',f.receipt.id);
  assert.throws(()=>f.service.review(f.owner,row.id,{decision:'approve',version:row.version,value:proposal.reading.integerValue,selectedFileId:f.fileId,imageChecked:true,note,proposalId:proposal.id,fractionalChecked:true}),status(409));
 });
});

test('async inference cannot persist a result after the submission changes',async t=>{
 let resume;const waiting=new Promise(resolve=>{resume=resolve;});
 const f=await setup(t,async input=>{await waiting;return ready(input);}),pending=f.reader.read(f.owner,f.receipt.id,f.input);
 while(!f.calls.length)await new Promise(resolve=>setTimeout(resolve,1));
 const row=f.store.get('meterSubmissions',f.receipt.id);f.store.put('meterSubmissions',{...row,status:'rejected',version:2});resume();
 await assert.rejects(()=>pending,status(409));assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM meter_reader_proposals').get().n,0);
});

test('low-confidence and retake observations cannot be applied; malformed ready evidence fails closed',async t=>{
 const f=await setup(t,input=>ready(input,{status:'needs_review',confidence:.4})),{proposal}=await f.reader.read(f.owner,f.receipt.id,f.input);
 assert.equal(proposal.reading,null);assert.equal(proposal.status,'needs_review');
 assert.throws(()=>f.service.review(f.owner,f.receipt.id,{decision:'approve',version:1,value:13010,note,imageChecked:true,proposalId:proposal.id,fractionalChecked:true}),status(400));
 for(const breakResult of [value=>{value.reading.unit='m3';},value=>{value.reading.integerValue++;},value=>{value.quality.canRead=false;},value=>{value.ocrEvidence.observations[0].confidence=.1;},value=>{value.reading.digits='1';}]){
  const invalid=createMeterReaderService(f.store,{run:async input=>{const value=ready(input);breakResult(value);return value;}});
  await assert.rejects(()=>invalid.read(f.owner,f.receipt.id,f.input),status(502));
 }
});

test('preview and model input share one EXIF-normalized raster and original bytes remain intact',async t=>{
 const f=fixture(t),bytes=await sharp({create:{width:40,height:20,channels:3,background:'#cccccc'}}).jpeg().withMetadata({orientation:6}).toBuffer(),fileId=f.file({bytes}),receipt=f.service.submitPhotos(f.tenant,f.request('electric',fileId));
 let received;const reader=createMeterReaderService(f.store,{run:async input=>{received=input;return {width:20,height:40,status:'no_window',candidates:[],warnings:[]};}});
 const preview=await reader.preview(f.owner,receipt.id,fileId);assert.equal(preview.width,20);assert.equal(preview.height,40);
 const located=await reader.locate(f.owner,receipt.id,{fileId,version:1});assert.equal(located.width,20);assert.deepEqual(received.bytes,preview.bytes);assert.equal(received.mime,'image/png');
 assert.deepEqual(Buffer.from(f.store.db.prepare('SELECT bytes FROM files WHERE id=?').get(fileId).bytes),bytes);
});

test('truncated and oversized images are rejected before a worker runs; manual verification remains available',async t=>{
 const f=fixture(t),bytes=Buffer.from([137,80,78,71,13,10,26,10,0,0,0]),fileId=f.file({bytes}),receipt=f.service.submitPhotos(f.tenant,f.request('electric',fileId));let calls=0;
 const reader=createMeterReaderService(f.store,{run:async()=>{calls++;throw Error('must not run');}});
 await assert.rejects(()=>reader.locate(f.owner,receipt.id,{fileId,version:1}),status(400));
 f.store.db.prepare('UPDATE files SET bytes=? WHERE id=?').run(Buffer.alloc(5*1024*1024+1),fileId);
 await assert.rejects(()=>reader.preview(f.owner,receipt.id,fileId),status(413));assert.equal(calls,0);
 f.store.db.prepare('UPDATE files SET bytes=? WHERE id=?').run(await pixels(),fileId);
 const approved=f.service.review(f.owner,receipt.id,{decision:'approve',version:1,value:f.prior.electricNew+1,note,imageChecked:true});assert.equal(approved.submission.verificationSource,'manual');
});

test('owner evidence enters the same immutable proposal/review flow without exposing it to a tenant',async t=>{
 const f=fixture(t),bytes=await pixels(),fileId=f.file({bytes,uploaderId:f.owner.id,roomId:'room_103'});
 f.store.db.prepare('UPDATE files SET tenant_id=NULL WHERE id=?').run(fileId);
 const input={roomId:'room_103',period:'2026-11',utility:'electric',photos:[{fileId}]};
 assert.throws(()=>f.service.submitOwnerEvidence(f.tenant,input),status(403));
 assert.throws(()=>f.service.submitOwnerEvidence(f.other,input),status(403));
 assert.throws(()=>f.service.submitOwnerEvidence(f.owner,{...input,roomId:'room_101'}),status(403));
 assert.throws(()=>f.service.submitOwnerEvidence(f.owner,{...input,photos:[{fileId:f.file({bytes})}]}),status(403));
 const before=JSON.stringify(f.store.list('readings')),row=f.service.submitOwnerEvidence(f.owner,input);
 assert.equal(row.source,'owner');assert.equal(row.tenantId,null);assert.equal(row.status,'pending');assert.equal(JSON.stringify(f.store.list('readings')),before);
 assert.ok(!dataFor(f.store,f.tenant).meterSubmissions.some(item=>item.id===row.id));assert.throws(()=>f.service.submitOwnerEvidence(f.owner,input),status(409));
 const reader=createMeterReaderService(f.store,{run:async request=>ready(request,{integerValue:5})});
 const {proposal}=await reader.read(f.owner,row.id,{fileId,version:1,digits:6,decimals:1,corners,regionConfirmed:true});
 const approval={decision:'approve',version:1,value:5,selectedFileId:fileId,note,proposalId:proposal.id,fractionalChecked:true};
 assert.throws(()=>f.service.review(f.owner,row.id,approval),status(400));
 const reviewed=f.service.review(f.owner,row.id,{...approval,imageChecked:true});assert.equal(reviewed.reading.electricNew,5);assert.equal(reviewed.reading.confirmed,false);
});

test('missing runtime or a cancelled inference does not persist a proposal or disable manual review',async t=>{
 const f=await setup(t),error=Object.assign(new Error('Runtime unavailable'),{status:503});
 const absent=createMeterReaderService(f.store,{run:async()=>{throw error;}});
 await assert.rejects(()=>absent.read(f.owner,f.receipt.id,f.input),status(503));
 let receivedSignal;
 const controller=new AbortController(),cancelled=createMeterReaderService(f.store,{run:async(input,{signal})=>{receivedSignal=signal;await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));return ready(input);}});
 const pending=cancelled.read(f.owner,f.receipt.id,f.input,{signal:controller.signal});
 while(!receivedSignal)await new Promise(resolve=>setTimeout(resolve,1));controller.abort();
 await assert.rejects(()=>pending,status(499));assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM meter_reader_proposals').get().n,0);
 assert.equal(f.service.review(f.owner,f.receipt.id,{decision:'approve',version:1,value:f.prior.electricNew+1,note,imageChecked:true}).submission.verificationSource,'manual');
});

test('new HTTP reader endpoints are landlord-only and expose no proposals through tenant bootstrap/export',async t=>{
 const app=createApp({dbPath:':memory:',seed:true,meterReader:{status:async()=>statusResult,run:async input=>input.mode==='locate'?{width:240,height:90,status:'selected',candidates:[{corners,confidence:.9}],warnings:[]}:ready(input)}});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(async()=>{app.server.closeAllConnections();await app.close();});
 const base=`http://127.0.0.1:${app.server.address().port}/api`;
 function client(){let cookie='';return async(path,body)=>{const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return {status:response.status,body:response.headers.get('content-type').startsWith('application/json')?await response.json():Buffer.from(await response.arrayBuffer())};};}
 const owner=client(),tenant=client(),other=client(),anonymous=client();for(const [request,email] of [[owner,'chu@trozy.vn'],[tenant,'thue@trozy.vn'],[other,'khac@trozy.vn']])await request('/auth/login',{email,password:'Trozy@2026'});
 assert.equal((await anonymous('/meter/reader/status')).status,401);assert.equal((await tenant('/meter/reader/status')).status,403);assert.equal((await owner('/meter/reader/status')).body.readerAvailable,true);
 const file=await tenant('/files',{name:'meter.png',type:'image/png',roomId:'room_101',data:(await pixels()).toString('base64')}),sent=await tenant('/meter/submissions',{roomId:'room_101',period:'2026-11',utility:'electric',photos:[{fileId:file.body.id}]});
 const prefix=`/meter/submissions/${sent.body.id}`,input={fileId:file.body.id,version:1,corners,digits:6,decimals:1,regionConfirmed:true};
 assert.equal((await other(prefix+'/read',input)).status,404);assert.equal((await tenant(prefix+'/read',input)).status,403);assert.equal((await tenant(prefix+`/image/${file.body.id}`)).status,403);
 assert.equal((await owner(prefix+`/image/${file.body.id}`)).status,200);assert.equal((await owner(prefix+'/locate',{fileId:file.body.id,version:1})).body.candidates.length,1);
 const read=await owner(prefix+'/read',input);assert.equal(read.status,200);assert.equal(read.body.proposal.reading.displayText,'13010.4');
 for(const route of ['/bootstrap','/export'])assert.ok(!JSON.stringify((await tenant(route)).body).includes(read.body.proposal.id));
 const ownerFile=await owner('/files',{name:'owner-meter.png',type:'image/png',roomId:'room_103',data:(await pixels()).toString('base64')}),ownerInput={roomId:'room_103',period:'2026-11',utility:'water',photos:[{fileId:ownerFile.body.id}]};
 assert.equal((await tenant('/meter/owner-evidence',ownerInput)).status,403);
 const ownEvidence=await owner('/meter/owner-evidence',ownerInput);assert.equal(ownEvidence.status,201);assert.equal(ownEvidence.body.source,'owner');assert.equal(ownEvidence.body.tenantId,null);
 assert.ok(!(await tenant('/meter/submissions')).body.records.some(row=>row.id===ownEvidence.body.id));
 assert.equal((await tenant('/meter_reader_proposals')).status,404);
});

test('electric OCR requires two complete agreeing region/crop observations and never fabricates wheel evidence',async t=>{
 const f=await setup(t),{proposal}=await f.reader.read(f.owner,f.receipt.id,f.input);
 assert.equal(proposal.engine,'paddleocr');assert.equal(proposal.model,'paddleocr-ppocrv6');assert.deepEqual(proposal.cells,[]);assert.equal(proposal.ocrEvidence.observations.length,2);
 assert.equal(proposal.ocrEvidence.scope,'owner-region');assert.deepEqual(proposal.ocrEvidence.observations.map(row=>row.pass),['region','crop']);
 const variants=[
  value=>{value.ocrEvidence.observations[1].text='130114';},
  value=>{value.ocrEvidence.observations[0].text='130';value.ocrEvidence.observations[1].text='104';},
  value=>{value.ocrEvidence.observations[0].text='1301.04';},
  value=>{value.ocrEvidence.observations[0].text='SỐ 130104';},
  value=>{value.ocrEvidence.selectedObservationIndices=[0,0];},
  value=>{value.ocrEvidence.observations[1].pass='full';},
  value=>{value.ocrEvidence.observations[0].pass='full';value.ocrEvidence.scope='automatic';},
  value=>{delete value.ocrEvidence.scope;},
  value=>{value.ocrEvidence.observations[0].confidence=.84;value.confidence=.84;},
  value=>{value.ocrEvidence.agreement=false;},
  value=>{value.ocrEvidence.selectedObservationIndices=[0,2];},
  value=>{value.ocrEvidence.observations[0].corners=[[0,0],[1,1],[1,0],[0,1]];},
  value=>{value.ocrEvidence.observations[0].corners=[[.91,.1],[.99,.1],[.99,.2],[.91,.2]];},
  value=>{value.ocrEvidence.observations[1].corners=[[.91,.8],[.99,.8],[.99,.9],[.91,.9]];},
  value=>{value.ocrEvidence.observations[0].corners=[[.15,.3],[.3,.3],[.3,.6],[.15,.6]];value.ocrEvidence.observations[1].corners=[[.7,.3],[.85,.3],[.85,.6],[.7,.6]];},
  value=>{value.ocrEvidence.observations[1].corners=[[0,0],[1,0],[1,1],[0,1]];},
  value=>{value.cells=[{index:0,position:1,confidence:.91,alternatives:[]}];},
  value=>{value.engine='visionstate';value.model='wheels-v2';},
 ];
 for(const corrupt of variants){
  const reader=createMeterReaderService(f.store,{run:async input=>{const value=ready(input);corrupt(value);return value;}});
  await assert.rejects(()=>reader.read(f.owner,f.receipt.id,f.input),status(502));
 }
 const exact=createMeterReaderService(f.store,{run:async input=>{const value=ready(input,{integerValue:5});value.ocrEvidence.observations[0].text='0 0 0 0 5 . 4';return value;}});
 const leading=(await exact.read(f.owner,f.receipt.id,f.input)).proposal;assert.equal(leading.reading.displayText,'00005.4');assert.equal(leading.reading.digits,'000054');
});

test('water stays on wheel evidence, and status/locate dispatch uses server-scoped utility and confirmed counts',async t=>{
 const f=fixture(t),bytes=await pixels(),fileId=f.file({bytes}),receipt=f.service.submitPhotos(f.tenant,f.request('water',fileId));
 const value=f.prior.waterNew+5,calls=[],statusCalls=[],reader=createMeterReaderService(f.store,{status:async utility=>{statusCalls.push(utility);return {utility};},run:async input=>{calls.push(input);return input.mode==='locate'?{width:240,height:90,status:'selected',candidates:[{corners,confidence:.9}],warnings:[]}:ready(input,{integerValue:value});}});
 f.store.put('meterProfiles',{id:'test-water-profile',ownerId:f.owner.id,propertyId:'property_01',roomId:'room_101',utility:'water',digits:6,decimals:1,meterType:'mechanical',confirmed:true,reader:'visionstate-v2',version:1});
 assert.deepEqual(await reader.status(f.owner,'electric'),{utility:'electric'});assert.deepEqual(await reader.status(f.owner,'water'),{utility:'water'});assert.deepEqual(statusCalls,['electric','water']);
 await assert.rejects(()=>reader.status(f.tenant,'water'),status(403));await assert.rejects(()=>reader.status(f.owner,'gas'),status(400));
 await reader.locate(f.owner,receipt.id,{fileId,version:1});assert.equal(calls.at(-1).utility,'water');assert.deepEqual(calls.at(-1).profile,{digits:6,decimals:1});
 await reader.locate(f.owner,receipt.id,{fileId,version:1,digits:5,decimals:0});assert.deepEqual(calls.at(-1).profile,{digits:5,decimals:0});assert.equal(f.store.get('meterProfiles','test-water-profile').digits,6);
 await assert.rejects(()=>reader.locate(f.owner,receipt.id,{fileId,version:1,digits:5}),status(400));
 const input={fileId,version:1,corners,digits:6,decimals:1,regionConfirmed:true},{proposal}=await reader.read(f.owner,receipt.id,input);
 assert.equal(proposal.engine,'visionstate');assert.equal(proposal.model,'wheels-v2');assert.equal(proposal.cells.length,6);assert.equal(proposal.ocrEvidence,undefined);
 const wrong=createMeterReaderService(f.store,{run:async input=>ready({...input,utility:'electric'})});
 // The immutable utility is decided by the server scope, never a client-supplied engine.
 await assert.rejects(()=>wrong.read(f.owner,receipt.id,input),status(502));
 const reviewed=f.service.review(f.owner,receipt.id,{decision:'approve',version:1,value,selectedFileId:fileId,note,imageChecked:true,proposalId:proposal.id,fractionalChecked:true});assert.equal(reviewed.submission.verificationSource,'wheel-reader-and-human');
});

test('legacy electric wheel proposals and stale OCR scope are invalid after the engine split',async t=>{
 const f=await setup(t),{proposal}=await f.reader.read(f.owner,f.receipt.id,f.input);
 const old={...proposal,engine:'visionstate',model:'wheels-v2'};f.store.db.prepare('UPDATE meter_reader_proposals SET result=? WHERE id=?').run(JSON.stringify(old),proposal.id);
 assert.throws(()=>f.service.review(f.owner,f.receipt.id,{decision:'approve',version:1,value:old.reading.integerValue,selectedFileId:f.fileId,note,imageChecked:true,proposalId:old.id,fractionalChecked:true}),status(409));
 const wrongScope={...proposal,ocrEvidence:{...proposal.ocrEvidence,scope:'automatic'}};f.store.db.prepare('UPDATE meter_reader_proposals SET result=? WHERE id=?').run(JSON.stringify(wrongScope),proposal.id);
 assert.throws(()=>f.service.review(f.owner,f.receipt.id,{decision:'approve',version:1,value:proposal.reading.integerValue,selectedFileId:f.fileId,note,imageChecked:true,proposalId:proposal.id,fractionalChecked:true}),status(409));
});
