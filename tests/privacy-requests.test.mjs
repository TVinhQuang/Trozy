import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../src/backend/db.mjs';
import {performAction,dataFor,createRecord,updateRecord,deleteRecord} from '../src/backend/domain.mjs';

function fixture(t){
  const store=openStore(':memory:');t.after(()=>store.close());
  const owner={id:'owner',role:'landlord',name:'Chủ trọ'};
  store.db.prepare('INSERT INTO users(id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(owner.id,owner.name,'owner@example.test','unused','landlord','2026-01-01');
  const user={id:'user',role:'tenant',tenant_id:'tenant',landlord_id:'owner',name:'An'};
  const put=(collection,row)=>store.put(collection,{ownerId:'owner',propertyId:'property',...row});
  put('properties',{id:'property',name:'Cơ sở A'});
  put('tenants',{id:'tenant',roomId:'room',name:'An',userId:'user',phone:'0900000000',email:'an@example.test',status:'left',moveOutDate:'2026-10-01',
    memberProfiles:[{id:'member',name:'Hà',status:'left',moveOutDate:'2026-10-01',phone:'0900000001',email:'ha@example.test'}]});
  const action=(name,input,actor=owner)=>store.transaction(()=>performAction(store,actor,'privacy-'+name,input));
  const submit=(changes={})=>action('submit',{fields:['phone','payments'],...changes},user);
  const review=(r,changes={})=>action('preview',{id:r.id,settled:true,neededFields:[],...changes});
  const confirm=(p)=>action('confirm',{id:p.id,previewId:p.previewId,confirmed:true,fields:p.decisions.filter(d=>d.eligible).map(d=>d.field)});
  return {owner,user,store,put,action,submit,review,confirm};
}

test('UC67 partially fulfills a personal request, leaves ledger and login untouched, and requires a fresh explicit confirmation',t=>{
  const {store,action,submit,review,confirm,user}=fixture(t);
  const receipt=store.put('payments',{id:'receipt',ownerId:'owner',propertyId:'property',tenantId:'tenant',amount:100});
  const r=submit();
  assert.throws(()=>action('confirm',{id:r.id,confirmed:true,fields:['phone']}),/xem trước/i);
  const p=review(r);
  assert.deepEqual(p.decisions.map(d=>[d.field,d.eligible]),[['phone',true],['payments',false]]);
  assert.throws(()=>action('confirm',{id:r.id,previewId:p.previewId,confirmed:false,fields:['phone']}),/xác nhận/i);
  assert.throws(()=>action('confirm',{id:r.id,previewId:p.previewId,confirmed:true,fields:['phone','payments']}),/phạm vi|đủ điều kiện/i);
  assert.throws(()=>action('confirm',{id:r.id,previewId:p.previewId,confirmed:true,fields:['phone']},user),e=>e.status===403);
  const profile=store.get('tenants','tenant');store.put('tenants',{...profile,phone:'0900000022'});
  assert.throws(()=>confirm(p),e=>e.status===409);
  const current=review(r);assert.equal(confirm(current).status,'partial');
  assert.equal(confirm(current).status,'partial');
  assert.equal(store.get('tenants','tenant').phone,'');assert.equal(store.get('tenants','tenant').email,profile.email);
  assert.deepEqual(store.get('payments','receipt'),receipt);
  assert.equal(store.get('tenants','tenant').memberProfiles[0].phone,'0900000001');
  assert.equal(dataFor(store,user).privacyRequests[0].status,'partial');
  const traces=JSON.stringify([...store.list('privacyRequests'),...store.list('audits'),...store.list('notifications')]);
  assert.doesNotMatch(traces,/0900000022|0900000000/);
});

test('UC67 limits online requests to self, verifies a delegate offline, and isolates member results',t=>{
  const {store,owner,user,action,submit,review,confirm}=fixture(t);
  assert.throws(()=>submit({personId:'member'}),e=>e.status===403);
  assert.throws(()=>submit({tenantId:'someone-else'}),e=>e.status===403);
  const r=action('submit',{propertyId:'property',tenantId:'tenant',personId:'member',source:'delegate',requesterName:'Người đại diện',fields:['email','loginEmail']});
  assert.throws(()=>review(r),/xác minh|đối chiếu/i);
  assert.throws(()=>review(r,{identityChecked:true}),/ủy quyền/i);
  assert.throws(()=>action('preview',{id:r.id},{id:'other',role:'landlord'}),e=>e.status===404);
  assert.equal(dataFor(store,user).privacyRequests.length,0);
  for(const fn of [()=>createRecord(store,owner,'privacyRequests',r),()=>updateRecord(store,owner,'privacyRequests',r.id,{status:'complete'}),()=>deleteRecord(store,owner,'privacyRequests',r.id)])assert.throws(fn);
  const p=review(r,{identityChecked:true,authorityChecked:true});
  assert.equal(confirm(p).status,'partial');
  assert.equal(store.get('tenants','tenant').memberProfiles[0].email,'');
  assert.equal(store.get('tenants','tenant').email,'an@example.test');
  assert.equal(dataFor(store,user).notifications.length,0);
  assert.ok(action('delivered',{id:r.id}).deliveredAt);
});

test('UC67 retains in-use, unsettled and unresolved fields, and records cancellation and rejection',t=>{
  const {store,put,action,submit,review,confirm}=fixture(t);
  const r=submit({fields:['phone','email','other']});
  put('invoices',{id:'debt',tenantId:'tenant',status:'issued',total:100,paid:0});
  let p=review(r);assert.ok(p.decisions.every(d=>!d.eligible));
  put('invoices',{id:'debt',tenantId:'tenant',status:'issued',total:100,paid:100});
  p=review(r,{neededFields:['email']});assert.deepEqual(p.decisions.map(d=>d.eligible),[true,false,false]);
  const profile=store.get('tenants','tenant');put('tenants',{...profile,status:'active',occupantStatus:'active'});
  assert.throws(()=>confirm(p),e=>e.status===409);
  const held=review(r);assert.equal(confirm(held).status,'retained');
  assert.equal(store.get('tenants','tenant').phone,profile.phone);
  assert.equal(action('cancel',{id:submit().id}).status,'cancelled');
  assert.equal(action('reject',{id:submit().id,reason:'identity'}).status,'rejected');
});

test('UC67 rechecks new open cases, rolls back contact removal with its result, and allows safe retry',t=>{
  const {store,put,submit,review,confirm}=fixture(t);
  const r=submit({fields:['phone','email']});
  const initial=review(r);put('tickets',{id:'case',tenantId:'tenant',status:'open'});
  assert.throws(()=>confirm(initial),e=>e.status===409);
  const fresh=review(r);
  store.db.exec("CREATE TEMP TRIGGER fail_privacy_result BEFORE INSERT ON records WHEN NEW.collection='notifications' BEGIN SELECT RAISE(ABORT,'simulated delivery record failure'); END;");
  assert.throws(()=>confirm(fresh),/simulated/);
  assert.equal(store.get('tenants','tenant').phone,'0900000000');
  assert.equal(store.get('privacyRequests',r.id).status,'reviewed');
  store.db.exec('DROP TRIGGER fail_privacy_result');
  assert.equal(confirm(fresh).status,'complete');
  assert.equal(store.get('tenants','tenant').email,'');
  assert.equal(confirm(fresh).status,'complete');
  assert.equal(store.list('audits').filter(a=>a.action==='privacy-complete').length,1);
});
