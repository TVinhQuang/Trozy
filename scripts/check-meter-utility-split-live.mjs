/** Real CPU utility split over HTTP, using SQLite RAM only; no application DB is opened. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import sharp from 'sharp';
import {createApp} from '../src/backend/server.mjs';
import {meterReaderStatus} from '../src/ai/meter-reader.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const local=path=>new URL('../'+path,import.meta.url);
const output=process.argv[2];
if(output)assert(/^docs[\\/]test[\\/][A-Za-z0-9_.-]+\.json$/.test(output),'Use a named JSON report inside docs/test.');
const status={electric:meterReaderStatus('electric'),water:meterReaderStatus('water')};
for(const [utility,value] of Object.entries(status))assert.equal(value.automaticAvailable,true,`Prepare the existing project-local ${utility} runtime first; this script never downloads models.`);
const manifest=JSON.parse(await readFile(local('docs/test/fixtures/visionstate-yolo-samples.json'),'utf8'));
const sample=async id=>{
 const entry=manifest.samples.find(row=>row.id===id);assert(entry);
 const bytes=await readFile(local(entry.file));assert.equal(digest(bytes),entry.sha256);
 return {entry,bytes};
};
const electric=await sample('electric-clear'),water=await sample('water-blue');
const svgPath='tests/fixtures/electric-paddle-synthetic.svg',svg=await readFile(local(svgPath));
const synthetic=await sharp(svg).png().toBuffer();
const paths=[
 'src/ai/meter-reader.mjs','src/ai/meter_reader_worker.py','src/ai/meter_paddle.py','src/ai/meter_wheels.py','src/ai/meter_geometry.py','src/ai/meter_row_geometry.py',
 'src/backend/meter-reader-service.mjs','src/backend/meter-automatic.mjs','src/backend/meter-profile.mjs','src/backend/meter-submissions.mjs','src/backend/meter-visibility.mjs','src/backend/server.mjs',
 'src/frontend/meter-reader-panel.tsx','src/frontend/meter-automatic-panel.tsx','src/frontend/meter-submissions-panel.tsx','src/frontend/meter-evidence-capture.tsx','src/frontend/api.ts',
 'scripts/check-meter-utility-split-live.mjs','docs/test/fixtures/visionstate-yolo-samples.json',svgPath,
];
const modelPaths={
 electricDetection:'.runtime/paddleocr/models/PP-OCRv6_small_det_onnx_infer/inference.onnx',
 electricRecognition:'.runtime/paddleocr/models/PP-OCRv6_small_rec_onnx_infer/inference.onnx',
 waterWindow:'.runtime/meter-digits/visionstate-yolo/models/stage1_meter_window_digits.pt',
 waterWheels:'.runtime/meter-digits/visionstate-yolo/models/wheels-v2.onnx',
};
const hashes=async()=>Object.fromEntries(await Promise.all([...paths,...Object.values(modelPaths)].map(async path=>[path,digest(await readFile(local(path)))])));
const startedHashes=await hashes();
const evidence={
 createdAt:new Date().toISOString(),scope:'Real CPU HTTP utility split against isolated SQLite RAM; no application database opened.',
 referencePolicy:'Reused locked agent visual annotations are not user-verified billing truth or a held-out accuracy benchmark. Synthetic SVG is a deterministic plumbing control, not accuracy evidence.',
 runtimeStatus:status,modelSha256:Object.fromEntries(Object.entries(modelPaths).map(([name,path])=>[name,startedHashes[path]])),
 sources:{electric:{sample:electric.entry.id,sha256:electric.entry.sha256},water:{sample:water.entry.id,sha256:water.entry.sha256},synthetic:{source:svgPath,svgSha256:digest(svg),renderedPngSha256:digest(synthetic),synthetic:true}},
};
const app=createApp({dbPath:':memory:',seed:true});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${app.server.address().port}/api`;
async function request(cookie,path,input,method=input===undefined?'GET':'POST'){
 const response=await fetch(base+path,{method,headers:{cookie,'Content-Type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)})});
 return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function login(email){const response=await request('','/auth/login',{email,password:'Trozy@2026'});assert.equal(response.status,200);assert(response.cookie);return response.cookie;}
async function profile(cookie,roomId,utility,digits,decimals){
 const response=await request(cookie,'/meter/profile',{roomId,utility,digits,decimals,meterType:'mechanical',confirmed:true},'PUT');
 assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.profile.engine,utility==='electric'?'paddleocr':'visionstate');return response.body.profile;
}
async function submit(cookie,roomId,utility,bytes,type,owner=false){
 const uploaded=await request(cookie,'/files',{name:`split-${utility}.${type==='image/png'?'png':'jpg'}`,type,data:bytes.toString('base64'),roomId,propertyId:'property_01'});
 assert.equal(uploaded.status,201,JSON.stringify(uploaded.body));
 const fileId=uploaded.body.id,sent=await request(cookie,owner?'/meter/owner-evidence':'/meter/submissions',{roomId,period:'2026-11',utility,photos:[{fileId}]});
 assert.equal(sent.status,owner?201:202,JSON.stringify(sent.body));
 const row=sent.body.submission||sent.body;return {row,fileId,prefix:`/meter/submissions/${row.id}`,status:sent.status};
}
async function automatic(cookie,submission){
 const started=Date.now(),states=[];
 while(Date.now()-started<120_000){
  const response=await request(cookie,submission.prefix+`/automatic?fileId=${submission.fileId}`);
  assert.equal(response.status,200,JSON.stringify(response.body));
  if(states.at(-1)!==response.body.status)states.push(response.body.status);
  if(!['queued','processing'].includes(response.body.status))return {...response.body,states,durationMs:Date.now()-started};
  await delay(200);
 }
 assert.fail('Automatic job exceeded the bounded live-check deadline.');
}
const snapshot=()=>JSON.stringify({readings:app.store.list('readings'),invoices:app.store.list('invoices')});
function paddleProposal(proposal,scope,digits){
 assert.equal(proposal.status,'ready');assert.equal(proposal.engine,'paddleocr');assert.equal(proposal.model,'paddleocr-ppocrv6');assert.deepEqual(proposal.cells,[]);
 assert.equal(proposal.reading.digits,digits);assert.equal(proposal.ocrEvidence.scope,scope);assert.equal(proposal.ocrEvidence.agreement,true);
 const selected=proposal.ocrEvidence.selectedObservationIndices.map(index=>proposal.ocrEvidence.observations[index]);
 assert.equal(selected.length,2);assert.deepEqual(selected.map(row=>row.pass).sort(),scope==='automatic'?['crop','full']:['crop','region']);assert(selected.every(row=>row.confidence>=.85));
}
try{
 const owner=await login('chu@trozy.vn'),tenant=await login('thue@trozy.vn'),other=await login('khac@trozy.vn');
 for(const row of app.store.list('readings','owner_demo').filter(row=>row.roomId==='room_101'))app.store.put('readings',{...row,electricOld:0,electricNew:0,waterOld:0,waterNew:0});
 const original=snapshot(),invoicesBefore=JSON.stringify(app.store.list('invoices'));
 for(const utility of ['electric','water']){
  const response=await request(owner,`/meter/reader/status?utility=${utility}`);assert.equal(response.status,200);assert.equal(response.body.engine,status[utility].engine);
  assert.equal((await request(tenant,`/meter/reader/status?utility=${utility}`)).status,403);
 }
 await profile(owner,'room_101','electric',6,1);await profile(owner,'room_101','water',8,3);
 assert.equal(snapshot(),original);
 const realElectric=await submit(tenant,'room_101','electric',electric.bytes,'image/jpeg');
 assert.equal((await request(tenant,realElectric.prefix+`/automatic?fileId=${realElectric.fileId}`)).status,403);
 assert.equal((await request(other,realElectric.prefix+`/automatic?fileId=${realElectric.fileId}`)).status,404);
 const electricAuto=await automatic(owner,realElectric);
 assert.equal(electricAuto.status,'needs_review',JSON.stringify(electricAuto));assert.equal(electricAuto.proposal,null,'Missing full-photo fractional digit must not become an automatic proposal.');assert.equal(snapshot(),original);
 const ownerRows=await request(owner,'/meter/submissions');assert.equal(ownerRows.status,200);
 realElectric.row=ownerRows.body.records.find(row=>row.id===realElectric.row.id);assert(realElectric.row&&Number.isSafeInteger(realElectric.row.version),'Read review version from owner evidence, never from the tenant receipt.');
 const corners=electric.entry.manualRegion.corners.map(([x,y])=>[x/electric.entry.sourceSize.width,y/electric.entry.sourceSize.height]);
 const manualInput={fileId:realElectric.fileId,version:realElectric.row.version,corners,digits:6,decimals:1,regionConfirmed:true};
 assert.equal((await request(tenant,realElectric.prefix+'/read',manualInput)).status,403);
 assert.equal((await request(other,realElectric.prefix+'/read',manualInput)).status,404);
 const manual=await request(owner,realElectric.prefix+'/read',manualInput);assert.equal(manual.status,200,JSON.stringify(manual.body));
 const proposal=manual.body.proposal;paddleProposal(proposal,'owner-region','007664');assert.equal(proposal.reading.displayText,'00766.4');assert.equal(snapshot(),original);
 for(const route of ['/bootstrap','/export']){
  const exported=JSON.stringify((await request(tenant,route)).body);
  for(const secret of [proposal.id,'ocrEvidence','00766.4','paddleocr-ppocrv6','profileVersion'])assert(!exported.includes(secret),`Tenant ${route} leaked ${secret}`);
 }
 const review={decision:'approve',version:realElectric.row.version,selectedFileId:realElectric.fileId,value:766,proposalId:proposal.id,note:'Phép kiểm chứng RAM: đã đối chiếu riêng ảnh gốc và phần lẻ.',imageChecked:true};
 assert.equal((await request(owner,realElectric.prefix+'/review',{...review,imageChecked:false,fractionalChecked:true})).status,400);assert.equal(snapshot(),original);
 assert.equal((await request(owner,realElectric.prefix+'/review',review)).status,400);assert.equal(snapshot(),original);
 const approved=await request(owner,realElectric.prefix+'/review',{...review,fractionalChecked:true});assert.equal(approved.status,200,JSON.stringify(approved.body));
 assert.equal(approved.body.reading.electricNew,766);assert.equal(approved.body.reading.confirmed,false);assert.equal(approved.body.submission.verificationSource,'paddleocr-and-human');assert.equal(JSON.stringify(app.store.list('invoices')),invoicesBefore);
 evidence.realElectric={automatic:{status:electricAuto.status,states:electricAuto.states,durationMs:electricAuto.durationMs,reason:electricAuto.reason,proposal:null},manual:{status:manual.status,engine:proposal.engine,model:proposal.model,reading:proposal.reading,confidence:proposal.confidence,quality:proposal.quality,cells:proposal.cells,ocrEvidence:proposal.ocrEvidence},review:{missingImageConsent:400,missingFractionalConsent:400,explicitReview:200,electricValue:766,verificationSource:approved.body.submission.verificationSource,periodConfirmed:false,invoicesUnchanged:true},reference:electric.entry.reference};
 const afterReview=snapshot(),realWater=await submit(tenant,'room_101','water',water.bytes,'image/jpeg');
 const waterAuto=await automatic(owner,realWater);assert.equal(waterAuto.status,'ready',JSON.stringify(waterAuto));
 const waterProposal=waterAuto.proposal;assert.equal(waterProposal.engine,'visionstate');assert.equal(waterProposal.model,'wheels-v2');assert.equal(waterProposal.reading.displayText,'00001.056');assert.equal(waterProposal.cells.length,8);assert.equal(waterProposal.ocrEvidence,undefined);assert.equal(waterProposal.source,'automatic');assert.equal(snapshot(),afterReview);
 const waterExport=JSON.stringify((await request(tenant,'/export')).body);for(const secret of [waterProposal.id,'00001.056','ocrEvidence','profileVersion'])assert(!waterExport.includes(secret));
 evidence.realWater={status:waterAuto.status,states:waterAuto.states,durationMs:waterAuto.durationMs,engine:waterProposal.engine,model:waterProposal.model,reading:waterProposal.reading,confidence:waterProposal.confidence,quality:waterProposal.quality,cells:waterProposal.cells,hasOCREvidence:false,approved:false,readingsAndInvoicesUnchanged:true,reference:water.entry.reference};
 await profile(owner,'room_102','electric',6,1);
 const ownerSynthetic=await submit(owner,'room_102','electric',synthetic,'image/png',true),syntheticAuto=await automatic(owner,ownerSynthetic);
 assert.equal(syntheticAuto.status,'ready',JSON.stringify(syntheticAuto));paddleProposal(syntheticAuto.proposal,'automatic','012345');assert.equal(syntheticAuto.proposal.reading.displayText,'01234.5');assert.equal(snapshot(),afterReview);
 evidence.syntheticElectric={synthetic:true,accuracyBenchmark:false,submissionStatus:ownerSynthetic.status,status:syntheticAuto.status,states:syntheticAuto.states,durationMs:syntheticAuto.durationMs,engine:syntheticAuto.proposal.engine,model:syntheticAuto.proposal.model,reading:syntheticAuto.proposal.reading,confidence:syntheticAuto.proposal.confidence,ocrEvidence:syntheticAuto.proposal.ocrEvidence,approved:false,readingsAndInvoicesUnchanged:true};
 evidence.authorization={tenantReaderStatus:403,tenantAutomatic:403,otherOwnerAutomatic:404,tenantManualRead:403,otherOwnerManualRead:404,tenantBootstrapAndExportHaveMachineEvidence:false};
 evidence.sourceSha256=await hashes();assert.deepEqual(evidence.sourceSha256,startedHashes,'Source or model files changed during verification. Rerun after edits finish.');evidence.sourcesStable=true;
 if(output)await writeFile(output,JSON.stringify(evidence,null,2)+'\n','utf8');
 console.log(JSON.stringify({ok:true,scope:'SQLite RAM only',realElectricAutomatic:electricAuto.status,realElectricManual:proposal.reading.displayText,explicitElectricReview:approved.body.submission.verificationSource,waterAutomatic:waterProposal.reading.displayText,syntheticElectricAutomatic:syntheticAuto.proposal.reading.displayText,syntheticIsNotAccuracyEvidence:true,sourceHashesStable:true,report:output||null}));
}finally{app.server.closeAllConnections();await app.close();}
