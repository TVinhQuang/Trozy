/** Real automatic jobs through HTTP on SQLite RAM; never opens the application DB. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {createApp} from '../src/backend/server.mjs';
import {meterReaderStatus} from '../src/ai/meter-reader.mjs';

assert.equal(meterReaderStatus().automaticAvailable,true,'Use the prepared project-local CPU runtime; this check never downloads models.');
const manifest=JSON.parse(await readFile(new URL('../docs/test/fixtures/visionstate-yolo-samples.json',import.meta.url),'utf8'));
const sample=manifest.samples.find(row=>row.id==='water-blue');
const photo=await readFile(new URL('../'+sample.file,import.meta.url));
assert.equal(createHash('sha256').update(photo).digest('hex'),sample.sha256);
const paths=['src/ai/meter-reader.mjs','src/ai/meter_reader_worker.py','src/ai/meter_wheels.py','src/ai/meter_geometry.py','src/ai/meter_row_geometry.py','src/backend/meter-reader-service.mjs','src/backend/meter-automatic.mjs','src/backend/meter-profile.mjs','src/backend/server.mjs','src/backend/meter-submissions.mjs','src/frontend/meter-automatic-panel.tsx','src/frontend/meter-submissions-panel.tsx','src/frontend/meter-reader-panel.tsx','scripts/check-meter-automatic-live.mjs'];
const sourceHashes=()=>Promise.all(paths.map(async path=>[path,createHash('sha256').update(await readFile(new URL('../'+path,import.meta.url))).digest('hex')])).then(Object.fromEntries);
const sourcesAtStart=await sourceHashes();
const app=createApp({dbPath:':memory:',seed:true});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${app.server.address().port}/api`;
const evidence={createdAt:new Date().toISOString(),scope:'Automatic background jobs against isolated SQLite RAM; no original application DB opened',sourcePhotoSha256:sample.sha256,referencePolicy:'Locked agent visual annotation, not a user-verified or held-out accuracy benchmark',manualReadOrLocateCalls:0};
async function login(email){
 const response=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'Trozy@2026'})});
 assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];
}
async function request(cookie,path,input,method=input===undefined?'GET':'POST'){
 const response=await fetch(base+path,{method,headers:{cookie,'Content-Type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)})});
 return {status:response.status,body:await response.json()};
}
async function upload(cookie,roomId){
 const response=await request(cookie,'/files',{name:'automatic-water.jpg',type:'image/jpeg',data:photo.toString('base64'),propertyId:'property_01',roomId});
 assert.equal(response.status,201,JSON.stringify(response.body));return response.body.id;
}
async function waitForJob(cookie,key,fileId){
 const started=Date.now(),states=[];
 while(Date.now()-started<90_000){
  const response=await request(cookie,`/meter/submissions/${key}/automatic?fileId=${fileId}`);
  assert.equal(response.status,200,JSON.stringify(response.body));
  if(states.at(-1)!==response.body.status)states.push(response.body.status);
  if(!['queued','processing'].includes(response.body.status))return {...response.body,states,durationMs:Date.now()-started};
  await delay(200);
 }
 throw Error('Automatic job exceeded live-check deadline');
}
try{
 const owner=await login('chu@trozy.vn'),tenant=await login('thue@trozy.vn'),other=await login('khac@trozy.vn');
 for(const row of app.store.list('readings','owner_demo').filter(row=>row.roomId==='room_101'))app.store.put('readings',{...row,electricOld:0,electricNew:0,waterOld:0,waterNew:0});
 const snapshot=()=>JSON.stringify([app.store.list('readings'),app.store.list('invoices')]);
 const before=snapshot(),fileId=await upload(tenant,'room_101');
 const submitted=await request(tenant,'/meter/submissions',{roomId:'room_101',period:'2026-11',utility:'water',photos:[{fileId}]});
 assert.equal(submitted.status,202,JSON.stringify(submitted.body));
 const key=submitted.body.id,prefix=`/meter/submissions/${key}`;
 const setup=await request(owner,prefix+`/automatic?fileId=${fileId}`);
 assert.equal(setup.body.status,'needs_setup');assert.equal(setup.body.proposal,null);
 assert.equal((await request(tenant,prefix+`/automatic?fileId=${fileId}`)).status,403);
 assert.equal((await request(other,prefix+`/automatic?fileId=${fileId}`)).status,404);
 assert.equal((await request(tenant,'/meter/profile?roomId=room_101&utility=water')).status,403);
 const layout={roomId:'room_101',utility:'water',digits:8,decimals:3,meterType:'mechanical',confirmed:true};
 assert.equal((await request(owner,'/meter/profile',layout,'PUT')).status,200);
 // Saving the once-only profile queues this pending photo. Polling is read-only:
 // no locate/read/retry call is needed to create a proposal.
 const automatic=await waitForJob(owner,key,fileId);
 assert.equal(automatic.status,'ready',JSON.stringify(automatic));
 const proposal=automatic.proposal;
 assert.equal(proposal.source,'automatic');assert.equal(proposal.profileSource,'confirmed');
 assert.equal(proposal.reading.digits,'00001056');assert.equal(proposal.reading.displayText,'00001.056');
 assert.equal(proposal.config.digits,8);assert.equal(proposal.config.decimals,3);
 assert.equal(snapshot(),before,'Uploading, configuring and background inference cannot write readings/invoices');
 const exportBody=JSON.stringify((await request(tenant,'/export')).body);
 assert(!exportBody.includes(proposal.id));assert(!exportBody.includes('00001.056'));assert(!exportBody.includes('visionstate-v2'));
 const row=(await request(owner,'/meter/submissions')).body.records.find(row=>row.id===key);
 const review={decision:'approve',version:row.version,selectedFileId:fileId,value:1,proposalId:proposal.id,note:'Mô phỏng chủ nhà đối chiếu ảnh và phần lẻ trên dữ liệu RAM.',imageChecked:true};
 assert.equal((await request(owner,prefix+'/review',{...review,imageChecked:false,fractionalChecked:true})).status,400);
 assert.equal((await request(owner,prefix+'/review',review)).status,400);
 const approved=await request(owner,prefix+'/review',{...review,fractionalChecked:true});
 assert.equal(approved.status,200,JSON.stringify(approved.body));assert.equal(approved.body.reading.waterNew,1);
 assert.equal(approved.body.reading.confirmed,false);assert.equal(approved.body.submission.verificationSource,'wheel-reader-and-human');
 assert.deepEqual(app.store.list('invoices'),JSON.parse(before)[1]);
 evidence.tenantSubmission={status:202,firstStatus:'needs_setup',automaticStates:automatic.states,durationMs:automatic.durationMs,reading:proposal.reading,confidence:proposal.confidence,quality:proposal.quality,source:proposal.source};
 evidence.authorization={tenantStatus:403,otherOwnerStatus:404,tenantProfile:403,tenantExportHasMachineEvidence:false};
 evidence.review={imageConsentRequired:true,fractionalConsentRequired:true,explicitFixtureReviewStatus:200,waterValue:1,periodConfirmed:false,invoicesUnchanged:true};
 // A newly submitted owner photo starts by itself with a previously saved profile.
 assert.equal((await request(owner,'/meter/profile',{...layout,roomId:'room_102'},'PUT')).status,200);
 const ownerFile=await upload(owner,'room_102'),secondBefore=snapshot();
 const owned=await request(owner,'/meter/owner-evidence',{roomId:'room_102',period:'2026-11',utility:'water',photos:[{fileId:ownerFile}]});
 assert.equal(owned.status,201,JSON.stringify(owned.body));
 const ownerRow=owned.body.submission||owned.body,second=await waitForJob(owner,ownerRow.id,ownerFile);
 assert.equal(second.status,'ready',JSON.stringify(second));assert.equal(second.proposal.reading.digits,'00001056');
 assert.equal(snapshot(),secondBefore);
 evidence.ownerSubmission={status:201,automaticStates:second.states,durationMs:second.durationMs,profileReused:true,reading:second.proposal.reading,readingsAndInvoicesUnchanged:true};
 evidence.sourceSha256=await sourceHashes();assert.deepEqual(evidence.sourceSha256,sourcesAtStart,'Source changed during live verification; rerun after edits finish.');
 const output=process.argv[2];
 if(output){assert(/^docs[\\/]test[\\/][A-Za-z0-9_.-]+\.json$/.test(output),'Use a named JSON report file in docs/test');await writeFile(output,JSON.stringify(evidence,null,2)+'\n');}
 console.log(JSON.stringify(evidence,null,2));
}finally{app.server.closeAllConnections();await app.close();}
