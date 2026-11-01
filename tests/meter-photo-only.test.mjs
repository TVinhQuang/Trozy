import test from 'node:test';
import assert from 'node:assert/strict';
import {dataFor} from '../src/backend/domain.mjs';
import {fixture,status} from './fixtures/manual-meter-fixture.mjs';

test('tenant submission accepts only photos and provides a receipt without owner review values',t=>{
 const f=fixture(t),request=f.request(),before=JSON.stringify([f.store.list('readings'),f.store.list('invoices')]);
 for(const extra of [{value:12345},{suggestedValue:12345},{result:{}},{analysisIds:['obsolete']}])assert.throws(()=>f.service.submitPhotos(f.tenant,{...request,...extra}),status(400));
 const receipt=f.service.submitPhotos(f.tenant,request);assert.equal(receipt.status,'pending');assert.equal(receipt.photos[0].fileId,request.photos[0].fileId);
 const row=f.store.get('meterSubmissions',receipt.id);f.store.put('meterSubmissions',{...row,verifiedValue:987654,reviewNote:'PRIVATE-REVIEW',photos:row.photos.map(photo=>({...photo,result:{rawText:'PRIVATE-MACHINE'}}))});
 const tenantView=JSON.stringify(dataFor(f.store,f.tenant).meterSubmissions);assert.ok(!/987654|PRIVATE-REVIEW|PRIVATE-MACHINE/.test(tenantView));
 assert.equal(dataFor(f.store,f.other).meterSubmissions.length,0);assert.equal(JSON.stringify([f.store.list('readings'),f.store.list('invoices')]),before);
});

test('photo receipt notifies only the managing owner and duplicate submissions cannot duplicate notices',t=>{
 const f=fixture(t),request=f.request(),receipt=f.service.submitPhotos(f.tenant,request);
 assert.throws(()=>f.service.submitPhotos(f.tenant,request),status(409));
 const notices=dataFor(f.store,f.owner).notifications.filter(row=>row.meterSubmissionId===receipt.id);assert.equal(notices.length,1);
 assert.equal(dataFor(f.store,f.tenant).notifications.some(row=>row.meterSubmissionId===receipt.id),false);
 assert.equal(dataFor(f.store,f.other).notifications.some(row=>row.meterSubmissionId===receipt.id),false);
});
