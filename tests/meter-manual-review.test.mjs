import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore,id,now} from '../src/backend/db.mjs';
import {seedDemo} from '../src/backend/seed.mjs';
import {dataFor} from '../src/backend/domain.mjs';
import {createMeterSubmissionService} from '../src/backend/meter-submissions.mjs';
import {createApp} from '../src/backend/server.mjs';

const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=','base64');
const status=code=>error=>error.status===code;
const note='Đã mở ảnh gốc và đối chiếu chỉ số công tơ.';
function fixture(t){
 const store=openStore(':memory:');seedDemo(store);t.after(()=>store.close());
 const tenant=store.db.prepare('SELECT * FROM users WHERE id=?').get('user_tenant'),owner=store.db.prepare('SELECT * FROM users WHERE id=?').get('owner_demo'),service=createMeterSubmissionService(store);
 const file=(extra={})=>{const key=id('file');store.db.prepare('INSERT INTO files(id,owner_id,uploader_id,property_id,tenant_id,room_id,name,type,bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(key,'owner_demo','user_tenant','property_01','tenant_01',extra.roomId||'room_101','meter.png','image/png',extra.bytes||image,now());return key;};
 const request=(utility='electric',fileId=file())=>({roomId:'room_101',period:'2026-11',utility,photos:[{fileId}]});
 const prior=store.list('readings','owner_demo').filter(row=>row.roomId==='room_101'&&row.confirmed).sort((a,b)=>b.period.localeCompare(a.period))[0];
 return {store,tenant,owner,service,file,request,prior};
}

test('photo-only submissions wait for manual review and only two explicit approvals confirm a reading',t=>{
 const f=fixture(t),before=JSON.stringify([f.store.list('readings'),f.store.list('invoices')]);
 const electric=f.service.submitPhotos(f.tenant,f.request()),water=f.service.submitPhotos(f.tenant,f.request('water'));
 assert.equal(electric.status,'pending');assert.equal(water.status,'pending');assert.deepEqual(Object.keys(electric.photos[0]).sort(),['createdAt','fileId']);
 assert.equal(JSON.stringify([f.store.list('readings'),f.store.list('invoices')]),before);
 assert.equal(f.store.list('notifications').filter(row=>row.meterSubmissionId===electric.id&&row.recipientUserId===f.owner.id).length,1);
 assert.equal(dataFor(f.store,f.tenant).notifications.some(row=>row.meterSubmissionId===electric.id),false);
 const input={decision:'approve',version:1,value:f.prior.electricNew+10,imageChecked:true,note};
 assert.throws(()=>f.service.review(f.tenant,electric.id,input),status(403));
 assert.throws(()=>f.service.review(f.owner,electric.id,{...input,imageChecked:false}),status(400));
 assert.throws(()=>f.service.review(f.owner,electric.id,{...input,note:''}),status(400));
 assert.throws(()=>f.service.review(f.owner,electric.id,{...input,selectedFileId:'foreign-file'}),status(400));
 const first=f.service.review(f.owner,electric.id,input);assert.equal(first.reading.confirmed,false);assert.equal(first.submission.verificationSource,'manual');
 assert.equal(dataFor(f.store,f.tenant).readings.some(row=>row.id===first.reading.id),false);
 const second=f.service.review(f.owner,water.id,{...input,value:f.prior.waterNew+2,readingUpdatedAt:first.reading.updatedAt});
 assert.equal(second.reading.confirmed,true);assert.equal(second.reading.electricNew,f.prior.electricNew+10);assert.equal(second.reading.waterNew,f.prior.waterNew+2);
 assert.ok(dataFor(f.store,f.tenant).readings.some(row=>row.id===second.reading.id));
 assert.equal(JSON.stringify(f.store.list('invoices')),JSON.stringify(JSON.parse(before)[1]));
 const receipt=dataFor(f.store,f.tenant).meterSubmissions.find(row=>row.id===electric.id);for(const key of ['verifiedValue','reviewNote','verificationSource','selectedFileId'])assert.ok(!Object.hasOwn(receipt,key));
 assert.throws(()=>f.service.review(f.owner,electric.id,input),status(409));
});

test('submission authorization rejects client readings, foreign evidence, duplicate photos and fake image signatures',t=>{
 const f=fixture(t),request=f.request();
 for(const extra of [{value:123},{electricNew:123},{result:{}},{analysisIds:['x']}])assert.throws(()=>f.service.submitPhotos(f.tenant,{...request,...extra}),status(400));
 assert.throws(()=>f.service.submitPhotos(f.tenant,{...request,photos:[{...request.photos[0],rectangle:{left:0,top:0,width:8,height:8}}]}),status(400));
 assert.throws(()=>f.service.submitPhotos(f.tenant,f.request('electric',f.file({roomId:'room_102'}))),status(403));
 assert.throws(()=>f.service.submitPhotos(f.tenant,f.request('electric',f.file({bytes:Buffer.from('not-an-image')}))),status(400));
 assert.throws(()=>f.service.submitPhotos(f.tenant,{...request,photos:[...request.photos,{fileId:f.file()}]}),status(400));
 f.service.submitPhotos(f.tenant,request);assert.throws(()=>f.service.submitPhotos(f.tenant,request),status(409));
});

test('manual review preserves baseline, active tenancy and version checks',t=>{
 const f=fixture(t),receipt=f.service.submitPhotos(f.tenant,f.request()),input={decision:'approve',version:1,value:f.prior.electricNew+10,imageChecked:true,note};
 assert.throws(()=>f.service.review(f.owner,receipt.id,{...input,version:99}),status(409));
 assert.throws(()=>f.service.review(f.owner,receipt.id,{...input,value:f.prior.electricNew-1}),status(400));
 f.store.put('readings',{...f.prior,electricNew:f.prior.electricNew+1});
 assert.throws(()=>f.service.review(f.owner,receipt.id,input),status(409));
 const rejected=f.service.review(f.owner,receipt.id,{decision:'reject',version:1,note:'Ảnh chưa đủ rõ, vui lòng chụp lại.'});assert.equal(rejected.submission.status,'rejected');assert.equal(rejected.reading,null);
});

test('previously queued photos become reviewable while historical records and source bytes remain intact',t=>{
 const f=fixture(t),receipt=f.service.submitPhotos(f.tenant,f.request()),row=f.store.get('meterSubmissions',receipt.id),legacyResult={rawText:'OLD-MACHINE-TEXT',proposedReading:{value:123}};
 f.store.put('meterSubmissions',{...row,status:'processing',selectedAnalysisId:'old-analysis',photos:row.photos.map(photo=>({...photo,analysisId:'old-analysis',result:legacyResult,rectangle:{left:0,top:0,width:8,height:8}})),jobLeaseToken:'old-worker'});
 const before=Buffer.from(f.store.db.prepare('SELECT bytes FROM files WHERE id=?').get(row.photos[0].fileId).bytes);
 createMeterSubmissionService(f.store);
 const stored=f.store.get('meterSubmissions',receipt.id);assert.equal(stored.status,'pending');assert.equal(stored.version,2);assert.deepEqual(stored.photos[0].result,legacyResult);assert.equal(stored.jobLeaseToken,null);
 assert.deepEqual(Buffer.from(f.store.db.prepare('SELECT bytes FROM files WHERE id=?').get(row.photos[0].fileId).bytes),before);
 const ownerRow=dataFor(f.store,f.owner).meterSubmissions.find(item=>item.id===row.id);assert.equal(ownerRow.selectedFileId,row.photos[0].fileId);assert.ok(!JSON.stringify(ownerRow).includes('OLD-MACHINE-TEXT'));assert.ok(!JSON.stringify(ownerRow).includes('analysisId'));
});

test('HTTP routes expose manual submissions while removed recognition APIs cannot run',async t=>{
 const app=createApp({dbPath:':memory:',seed:true});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(async()=>{app.server.closeAllConnections();await app.close();});
 const base=`http://127.0.0.1:${app.server.address().port}/api`;
 function client(){let cookie='';return async(path,body)=>{const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];return {status:response.status,body:await response.json()};};}
 const owner=client(),tenant=client(),other=client();for(const [request,email] of [[owner,'chu@trozy.vn'],[tenant,'thue@trozy.vn'],[other,'khac@trozy.vn']])await request('/auth/login',{email,password:'Trozy@2026'});
 const capabilities=(await owner('/bootstrap')).body.capabilities;assert.equal(capabilities.B03,false);
 for(const request of [owner,tenant])assert.equal((await request('/extensions/B03',{})).status,410);
 for(const path of ['/meter/quality','/meter/analyses','/meter/profiles','/meter/submissions/missing/reanalyze'])assert.equal((await owner(path,{})).status,404);
 const file=await tenant('/files',{name:'meter.png',type:'image/png',roomId:'room_101',data:image.toString('base64')});assert.equal(file.status,201);
 const sent=await tenant('/meter/submissions',{roomId:'room_101',period:'2026-11',utility:'electric',photos:[{fileId:file.body.id}]});assert.equal(sent.status,202);assert.equal(sent.body.status,'pending');
 assert.equal((await other('/meter/submissions')).body.records.length,0);
 const listed=(await owner('/meter/submissions')).body.records.find(row=>row.id===sent.body.id);assert.equal(listed.selectedFileId,file.body.id);assert.equal(listed.photos[0].result,undefined);
 app.store.db.prepare('INSERT INTO ai_history(id,user_id,feature,input,result,created_at) VALUES(?,?,?,?,?,?)').run(id('ai'),'owner_demo','B03','{}','{"rawText":"OLD-MACHINE-TEXT"}',now());
 for(const path of ['/ai/history','/ai/history?feature=B03'])assert.ok(!(await owner(path)).body.entries.some(row=>row.feature==='B03'));
 assert.equal((await owner('/meter/updates')).status,200);assert.equal((await tenant('/meter/updates')).status,403);
});
