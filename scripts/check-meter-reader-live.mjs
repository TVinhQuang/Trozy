/** Real-model HTTP verification on isolated SQLite memory, never the user's data. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createApp} from '../src/backend/server.mjs';
import {meterReaderStatus} from '../src/ai/meter-reader.mjs';

const status=meterReaderStatus('electric');
assert.equal(status.readerAvailable,true,'Prepare the local CPU runtime first. No model download is performed by this check.');
const manifest=JSON.parse(await readFile(new URL('../docs/test/fixtures/visionstate-yolo-samples.json',import.meta.url),'utf8'));
const sample=manifest.samples.find(row=>row.id==='electric-clear');
const photo=await readFile(new URL('../'+sample.file,import.meta.url));
assert.equal(createHash('sha256').update(photo).digest('hex'),sample.sha256);
const app=createApp({dbPath:':memory:',seed:true});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${app.server.address().port}/api`;
async function login(email){
 const response=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'Trozy@2026'})});
 assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];
}
async function request(cookie,path,input){
 const response=await fetch(base+path,{method:input===undefined?'GET':'POST',headers:{cookie,'Content-Type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)})});
 const contentType=response.headers.get('content-type')||'';
 return {status:response.status,body:contentType.includes('application/json')?await response.json():Buffer.from(await response.arrayBuffer())};
}
const evidence={scope:'Real CPU model through HTTP against isolated SQLite RAM; no original app DB opened',createdAt:new Date().toISOString(),sourcePhotoSha256:sample.sha256};
try{
 const owner=await login('chu@trozy.vn'),tenant=await login('thue@trozy.vn'),other=await login('khac@trozy.vn');
 // Only the in-memory fixture has a zero baseline so sample 00766.4 is a legal increase.
 for(const row of app.store.list('readings','owner_demo').filter(row=>row.roomId==='room_101'))app.store.put('readings',{...row,electricOld:0,electricNew:0,waterOld:0,waterNew:0});
 const uploaded=await request(tenant,'/files',{name:'real-meter.jpg',type:'image/jpeg',data:photo.toString('base64'),propertyId:'property_01',roomId:'room_101'});assert.equal(uploaded.status,201);
 const fileId=uploaded.body.id;
 const sent=await request(tenant,'/meter/submissions',{roomId:'room_101',period:'2026-11',utility:'electric',photos:[{fileId}]});assert.equal(sent.status,202);
 const submission=(await request(owner,'/meter/submissions')).body.records.find(row=>row.id===sent.body.id);assert(submission);
 const prefix=`/meter/submissions/${submission.id}`;
 assert.equal((await request(tenant,'/meter/reader/status')).status,403);
 assert.equal((await request(tenant,prefix+`/image/${fileId}`)).status,403);
 const preview=await request(owner,prefix+`/image/${fileId}`);assert.equal(preview.status,200);assert(preview.body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
 const corners=sample.manualRegion.corners.map(([x,y])=>[x/sample.sourceSize.width,y/sample.sourceSize.height]);
 const input={fileId,version:submission.version,corners,digits:6,decimals:1,regionConfirmed:true};
 const before=JSON.stringify([app.store.list('readings'),app.store.list('invoices')]);
 assert.equal((await request(other,prefix+'/read',input)).status,404);
 const result=await request(owner,prefix+'/read',input);assert.equal(result.status,200,JSON.stringify(result.body));
 const proposal=result.body.proposal;assert.equal(proposal.status,'ready');assert.equal(proposal.reading.displayText,'00766.4');assert.equal(proposal.reading.integerValue,766);
 assert.equal(JSON.stringify([app.store.list('readings'),app.store.list('invoices')]),before,'Inference must not write readings or invoices');
 const tenantExport=(await request(tenant,'/export')).body;assert(!JSON.stringify(tenantExport).includes(proposal.id));assert(!JSON.stringify(tenantExport).includes('00766.4'));
 const review={decision:'approve',version:submission.version,selectedFileId:fileId,value:766,proposalId:proposal.id,note:'Đã đối chiếu ảnh gốc và phần lẻ trong phép kiểm chứng dữ liệu RAM.',imageChecked:true};
 assert.equal((await request(owner,prefix+'/review',review)).status,400,'Fractional consent remains separate');
 const approved=await request(owner,prefix+'/review',{...review,fractionalChecked:true});assert.equal(approved.status,200);assert.equal(approved.body.reading.electricNew,766);assert.equal(approved.body.reading.confirmed,false);assert.equal(approved.body.submission.verificationSource,'paddleocr-and-human');
 assert.equal(JSON.stringify(app.store.list('invoices')),JSON.stringify(JSON.parse(before)[1]));
 evidence.read={status:proposal.status,reading:proposal.reading,confidence:proposal.confidence,cells:proposal.cells,quality:proposal.quality};
 evidence.authorization={tenantReader:403,tenantPreview:403,otherOwnerRead:404,tenantExportHasProposal:false};
 evidence.review={withoutFractionalConsent:400,withExplicitImageAndFractionalConsent:200,electricValue:766,periodConfirmed:false,invoicesUnchanged:true};
 // Paddle's electric-region hints remain proposals, with no business writes.
 const ownerFile=await request(owner,'/files',{name:'owner-meter.jpg',type:'image/jpeg',data:photo.toString('base64'),propertyId:'property_01',roomId:'room_102'});assert.equal(ownerFile.status,201);
 const own=await request(owner,'/meter/owner-evidence',{roomId:'room_102',period:'2026-11',utility:'electric',photos:[{fileId:ownerFile.body.id}]});assert.equal(own.status,201,JSON.stringify(own.body));
 const ownRow=own.body.submission||own.body;
 if(status.locatorAvailable){
  const located=await request(owner,`/meter/submissions/${ownRow.id}/locate`,{fileId:ownerFile.body.id,version:ownRow.version});assert.equal(located.status,200,JSON.stringify(located.body));
  evidence.locate={status:located.body.status,candidates:located.body.candidates.length,noReadingProduced:!Object.hasOwn(located.body,'reading')};
 }
 evidence.ownerEvidence={status:own.status,source:ownRow.source,pending:ownRow.status==='pending'};
 const output=process.argv[2];
 if(output){assert(/^docs[\\/]test[\\/][A-Za-z0-9_.-]+\.json$/.test(output),'Use a named report file in docs/test');await writeFile(output,JSON.stringify(evidence,null,2)+'\n','utf8');}
 console.log(JSON.stringify(evidence,null,2));
}finally{app.server.closeAllConnections();await app.close();}
