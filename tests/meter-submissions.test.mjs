import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecord,updateRecord,deleteRecord,performAction} from '../src/backend/domain.mjs';
import {meterSubmissionUsage} from '../src/backend/meter-workflow.mjs';
import {fixture,status,note} from './fixtures/manual-meter-fixture.mjs';

test('UC26–29 photo review uses the installed meter and retains the removed meter consumption',t=>{
  const f=fixture(t),scope={roomId:'room_101',propertyId:'property_01',utility:'electric'};
  const meter=createRecord(f.store,f.owner,'meters',{...scope,code:'EL-OLD',initialReading:100});
  performAction(f.store,f.owner,'meter-replace',{id:meter.id,finalReading:f.prior.electricNew+45,newCode:'EL-NEW',initialReading:5,effectiveDate:'2026-11-02'});
  const receipt=f.service.submitPhotos(f.tenant,f.request());
  const row=f.store.get('meterSubmissions',receipt.id);
  const preview=meterSubmissionUsage(f.store,row,{status:'ready',reading:{integerValue:25}});
  assert.equal(preview.consumption,65);
  const {reading}=f.service.review(f.owner,row.id,{decision:'approve',version:1,value:25,imageChecked:true,note});
  assert.equal(reading.confirmed,false);
  assert.equal(reading.electricOld,5);
  assert.equal(reading.meterBreakdown[0].oldClosing,f.prior.electricNew+45);
});

test('submission records require the image review service and cannot bypass owner access',t=>{
 const f=fixture(t),receipt=f.service.submitPhotos(f.tenant,f.request());
 for(const user of [f.owner,f.tenant,f.other])for(const action of [()=>createRecord(f.store,user,'meterSubmissions',{status:'approved'}),()=>updateRecord(f.store,user,'meterSubmissions',receipt.id,{status:'approved'}),()=>deleteRecord(f.store,user,'meterSubmissions',receipt.id)])assert.throws(action,error=>[403,404].includes(error.status));
 assert.throws(()=>f.service.review(f.other,receipt.id,{decision:'reject',version:1,note}),status(404));
 assert.equal(f.store.get('meterSubmissions',receipt.id).status,'pending');
});

test('manual approval cannot change an invoiced period or a former tenancy',async t=>{
 for(const change of ['invoice','tenancy'])await t.test(change,t=>{
  const f=fixture(t),receipt=f.service.submitPhotos(f.tenant,f.request());
  if(change==='invoice')f.store.put('invoices',{id:'blocking_invoice',ownerId:f.owner.id,roomId:'room_101',period:'2026-11',status:'draft'});
  else{const tenant=f.store.get('tenants','tenant_01');f.store.put('tenants',{...tenant,status:'checked_out'});}
  const before=JSON.stringify([f.store.list('readings'),f.store.list('invoices')]);
  assert.throws(()=>f.service.review(f.owner,receipt.id,{decision:'approve',version:1,value:f.prior.electricNew+1,imageChecked:true,note}),status(409));
  assert.equal(JSON.stringify([f.store.list('readings'),f.store.list('invoices')]),before);
  assert.equal(f.store.get('meterSubmissions',receipt.id).status,'pending');
 });
});
