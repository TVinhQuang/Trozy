import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createApp} from '../src/backend/server.mjs';
import {today} from '../src/backend/db.mjs';
import {deliverAuthMail,authMail} from '../src/backend/mail.mjs';

async function fixture(t,options={}){
  const app=createApp({dbPath:':memory:',seed:true,...options});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  t.after(async()=>{app.server.closeAllConnections();await app.close();});
  async function request(path,{method='GET',body,cookie,origin=base}={}){
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const type=response.headers.get('content-type')||'';const value=type.includes('application/json')?await response.json():await response.text();return {status:response.status,body:value,cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
  }
  async function login(email='chu@trozy.vn',password='Trozy@2026'){const response=await request('/api/auth/login',{method:'POST',body:{email,password}});assert.equal(response.status,200,response.body.error);return response.cookie;}
  return {...app,request,login,base};
}
const post=(cookie,body)=>({method:'POST',cookie,body});
const patch=(cookie,body)=>({method:'PATCH',cookie,body});

test('UC67 Node exposes the linked requester’s result and retains contact data during an active tenancy',async t=>{
  const {request,login,store}=await fixture(t),landlord=await login(),tenant=await login('thue@trozy.vn');
  const act=(name,body,actor)=>request('/api/actions/privacy-'+name,post(actor,body));
  const submitted=await act('submit',{fields:['phone','deposits']},tenant);
  assert.equal(submitted.status,200,submitted.body.error);
  const key=submitted.body.id,resource='/api/privacyRequests/'+key;
  assert.equal((await request(resource,{cookie:tenant})).status,200);
  assert.equal((await request(resource,patch(landlord,{status:'complete'}))).status,403);
  const preview=await act('preview',{id:key,settled:true,neededFields:[]},landlord);
  assert.ok(preview.body.decisions.every(d=>!d.eligible));
  const contact=store.get('tenants','tenant_01').phone;
  const retained=await act('confirm',{id:key,previewId:preview.body.previewId,fields:[],confirmed:true},landlord);
  assert.equal(retained.body.status,'retained');
  assert.equal(store.get('tenants','tenant_01').phone,contact);
  assert.equal((await request(resource,{cookie:tenant})).body.previewId,undefined);
});

test('UC20 confirms future contracts without occupying a room early or promising it twice',async t=>{
  const {store,request,login}=await fixture(t),owner=await login();
  const tenant=(await request('/api/tenants',post(owner,{propertyId:'property_01',roomId:'room_103',name:'Người thuê tương lai'}))).body;
  const input={roomId:'room_103',propertyId:'property_01',tenantId:tenant.id,startDate:'2098-02-01',endDate:'2099-01-31',rent:3200000,deposit:0,terms:'Điều khoản thuê phòng'};
  const draft=async()=> (await request('/api/contracts',post(owner,input))).body;
  const activate=id=>request('/api/actions/contract-activate',post(owner,{id}));
  const one=await draft();
  assert.equal((await activate(one.id)).body.status,'scheduled');
  assert.equal(store.get('rooms',input.roomId).status,'vacant');
  assert.equal((await activate((await draft()).id)).status,409);
  store.put('contracts',{...store.get('contracts',one.id),startDate:today()});
  await request('/api/bootstrap',{cookie:owner});
  await request('/api/bootstrap',{cookie:owner});
  assert.equal(store.get('contracts',one.id).status,'active');
  assert.equal(store.get('tenants',tenant.id).status,'active');
  assert.equal(store.get('rooms',input.roomId).status,'occupied');
  assert.equal(store.list('audits').filter(a=>a.action==='contract-effective'&&a.recordId===one.id).length,1);
});

test('UC21 prices invoices by the addendum effective date and requires agreement for split months',async t=>{
  const {store,request,login}=await fixture(t),owner=await login(),contract=store.get('contracts','contract_01');
  const config=store.list('settings').find(s=>s.propertyId===contract.propertyId);
  store.put('settings',{...config,electricMethod:'fixed',waterMethod:'fixed'});
  const input={id:contract.id,endDate:contract.endDate,rent:4100000,effectiveDate:'2027-02-15',terms:'Phụ lục tăng tiền thuê'};
  assert.equal((await request('/api/actions/contract-renew',post(owner,input))).status,200);
  const preview=(period,more={})=>request('/api/actions/invoice-preview',post(owner,{roomId:contract.roomId,period,...more}));
  assert.equal((await preview('2027-01')).body.rent,contract.rent);
  assert.equal((await preview('2027-02')).status,400);
  assert.equal((await preview('2027-02',{rent:3900000})).body.rent,3900000);
  assert.equal((await preview('2027-03')).body.rent,input.rent);
  assert.equal((await request('/api/actions/contract-renew',post(owner,{...input,effectiveDate:'2027-01-01',rent:4200000}))).status,400);
});

test('UC42 corrects the original receipt, invoice and ledger together and rejects stale confirmations',async t=>{
  const {store,request,login}=await fixture(t), owner=await login(),tenant=await login('thue@trozy.vn');
  const invoice=(await request('/api/actions/invoice-issue',post(owner,nextInvoice(store)))).body;
  const receipt=(await request('/api/actions/payment-record',post(owner,{invoiceId:invoice.id,amount:50000,method:'cash'}))).body;
  const ledger=store.list('transactions').find(row=>row.sourceId===receipt.id);
  const input={id:receipt.id,expectedRevision:0,expectedPaid:50000,expectedTotal:invoice.total,amount:70000,date:'2026-11-03',reason:'Đã kiểm lại chứng từ gốc',requestId:'fix-receipt-test'};
  const route='/api/actions/payment-correct';
  assert.equal((await request(route,post(tenant,input))).status,403);
  assert.equal((await request(route,post(owner,input))).status,200);
  assert.equal((await request(route,post(owner,input))).status,200);
  assert.equal((await request(route,post(owner,{...input,requestId:'second-fix'}))).status,409);
  assert.equal(store.get('invoices',invoice.id).paid,70000);
  assert.equal(store.get('payments',receipt.id).corrections[0].before.amount,50000);
  assert.equal(store.get('transactions',ledger.id).amount,70000);
  assert.equal(store.get('transactions',ledger.id).date,input.date);
  assert.equal(store.list('transactions').filter(row=>row.sourceId===receipt.id).length,1);
  const pdf=await request('/api/payments/'+receipt.id+'/pdf',{cookie:tenant});
  assert.equal(pdf.status,200);assert.match(pdf.body,/^%PDF/);
  assert.equal((await request('/api/payments/'+receipt.id+'/pdf',{cookie:await login('khac@trozy.vn')})).status,404);
});

test('UC04 signs out all sessions of the current account only',async t=>{
  const {request,login}=await fixture(t),first=await login(),second=await login(),tenant=await login('thue@trozy.vn');
  assert.equal((await request('/api/auth/logout',post(first,{allDevices:true}))).status,200);
  for(const cookie of [first,second])assert.equal((await request('/api/bootstrap',{cookie})).status,401);
  assert.equal((await request('/api/bootstrap',{cookie:tenant})).status,200);
});

test('UC25 duplicate tenancy requests return the pending ticket and withdrawing it allows a new request',async t=>{
  const {request,login,store}=await fixture(t),tenant=await login('thue@trozy.vn'),owner=await login();
  const input={roomId:'room_101',category:'renew',contractId:'contract_01',title:'Gia hạn hợp đồng',body:'Xin gia hạn hợp đồng của phòng.'};
  const first=await request('/api/tickets',post(tenant,input));assert.equal(first.status,201,first.body.error);
  const repeat=await request('/api/tickets',post(tenant,input));assert.equal(repeat.body.id,first.body.id);
  const withdraw=await request('/api/actions/contract-request-cancel',post(tenant,{id:first.body.id}));assert.equal(withdraw.body.status,'resolved');
  const next=await request('/api/tickets',post(tenant,input));assert.notEqual(next.body.id,first.body.id);
  assert.equal((await request('/api/actions/contract-renew',post(owner,{id:'contract_01',endDate:'2099-12-31'}))).status,200);
  assert.equal(store.get('tickets',next.body.id).status,'resolved');
});
function nextInvoice(store,roomId='room_101'){
  const period='2026-11';
  let reading=store.list('readings').find(r=>r.roomId===roomId&&r.period===period);
  if(!reading){
    const previous=store.list('readings').filter(r=>r.roomId===roomId&&r.confirmed&&r.period<period).sort((a,b)=>b.period.localeCompare(a.period))[0];
    assert(previous,`Missing previous finalized reading for ${roomId}.`);
    const room=store.get('rooms',roomId);
    reading=store.put('readings',{id:`test_reading_${roomId}_${period}`,ownerId:'owner_demo',propertyId:room.propertyId,roomId,period,electricOld:previous.electricNew,electricNew:previous.electricNew+80,waterOld:previous.waterNew,waterNew:previous.waterNew+5,confirmed:true,recorderId:'test',recordedAt:'2026-11-01T00:00:00.000Z',finalizedAt:'2026-11-01T00:00:00.000Z'});
  }
  return {roomId,period,electricOld:reading.electricOld,electricNew:reading.electricNew,waterOld:reading.waterOld,waterNew:reading.waterNew,electricRate:3500,waterRate:15000,serviceFee:130000,adjustment:0};
}

async function zeroFinal(store,request,owner){
  const input=nextInvoice(store);
  const result=await request('/api/actions/invoice-issue',post(owner,{...input,finalInvoice:true,rent:0,electricRate:0,waterRate:0,serviceItems:[],adjustment:0}));
  assert.equal(result.status,200,result.body.error);
  const due=result.body.total;
  if(due)assert.equal((await request('/api/actions/payment-record',post(owner,{invoiceId:result.body.id,amount:due,method:'cash'}))).status,200);
}
test('strict owner and tenant data boundaries',async t=>{
  const {request,login}=await fixture(t);const owner=await login(),tenant=await login('thue@trozy.vn'),other=await login('khac@trozy.vn');
  assert.equal((await request('/api/bootstrap')).status,401);
  const landlordData=(await request('/api/bootstrap',{cookie:owner})).body;
  assert.equal(landlordData.data.properties.length,2);assert.equal(landlordData.data.rooms.length,9);assert.equal(landlordData.capabilities.B01,true);assert.equal(landlordData.capabilities.B05,false);
  const tenantData=(await request('/api/bootstrap',{cookie:tenant})).body;
  assert.equal(tenantData.data.rooms.length,1);assert.equal(tenantData.data.tenants.length,1);assert.equal(tenantData.data.transactions.length,0);assert.equal(tenantData.data.audits.length,0);
  assert(tenantData.data.invoices.every(i=>i.tenantId==='tenant_01'));assert(tenantData.data.documents.every(d=>d.visibility!=='landlord'));
  assert.equal((await request('/api/bootstrap',{cookie:other})).body.data.properties[0].id,'property_other');
  assert.equal((await request('/api/properties/property_01',patch(other,{name:'Intrusion'}))).status,404);
  assert.equal((await request('/api/rooms',post(tenant,{propertyId:'property_01',code:'HACK',area:20,capacity:2,price:1}))).status,403);
  assert.equal((await request('/api/invoices/HD-10-101',patch(tenant,{paid:9999999}))).status,403);
  assert.equal((await request('/api/actions/payment-record',post(tenant,{invoiceId:'HD-10-101',amount:1,method:'cash'}))).status,403);
  assert.equal((await request('/api/extensions/B05',post(tenant,{question:'test'}))).status,501);
  const ownIssue=await request('/api/issues',post(tenant,{roomId:'room_102',tenantId:'tenant_02',propertyId:'property_02',title:'Yêu cầu mới',category:'Khác',description:'Nội dung sự cố đủ dài để kiểm tra.'}));
  assert.equal(ownIssue.status,201);assert.equal(ownIssue.body.tenantId,'tenant_01');assert.equal(ownIssue.body.roomId,'room_101');
});

test('invoice validation, duplicate prevention and concurrent partial payment',async t=>{
  const {store,request,login}=await fixture(t);const cookie=await login();const input=nextInvoice(store);
  assert.equal((await request('/api/actions/invoice-preview',post(cookie,{...input,electricNew:input.electricOld-1}))).status,400);
  const preview=await request('/api/actions/invoice-preview',post(cookie,input));assert.equal(preview.status,200);assert.equal(preview.body.total,3985000);
  const issued=await request('/api/actions/invoice-issue',post(cookie,input));assert.equal(issued.status,200);assert.equal(issued.body.status,'issued');
  assert.equal((await request('/api/actions/invoice-issue',post(cookie,input))).status,409);
  assert.equal((await request('/api/invoices/'+issued.body.id,patch(cookie,{rent:1,paid:3985000}))).status,400);
  assert.equal((await request('/api/readings',post(cookie,{propertyId:'property_01',roomId:'room_101',period:'2026-12',electricOld:0,electricNew:100,waterOld:0,waterNew:1,confirmed:true}))).status,400);
  const payment=await request('/api/actions/payment-record',post(cookie,{invoiceId:issued.body.id,amount:1000000,method:'transfer',date:'2026-11-04'}));assert.equal(payment.status,200);
  const simultaneous=await Promise.all([1,2].map(()=>request('/api/actions/payment-record',post(cookie,{invoiceId:issued.body.id,amount:2000000,method:'cash',date:'2026-11-04'}))));assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,200]);
  const invoice=store.get('invoices',issued.body.id);assert.equal(invoice.paid,invoice.total);
  const bootstrap=(await request('/api/bootstrap',{cookie})).body;assert.equal(bootstrap.data.credits.filter(credit=>credit.tenantId==='tenant_01').reduce((sum,credit)=>sum+credit.balance,0),1015000);
  assert.equal((await request('/api/actions/invoice-cancel',post(cookie,{id:invoice.id,reason:'Kiểm tra điều chỉnh hóa đơn'}))).status,400);
  const transaction=store.list('transactions').find(tx=>tx.sourceId===payment.body.id);assert.equal(transaction.amount,1000000);
  assert.equal((await request('/api/transactions/'+transaction.id,patch(cookie,{amount:1}))).status,400);
  assert.equal((await request('/api/transactions/'+transaction.id,{method:'DELETE',cookie})).status,403);
});

test('contract overlap, renewal acknowledgement and move-out settlement',async t=>{
  const {store,request,login}=await fixture(t);const owner=await login(),tenant=await login('thue@trozy.vn');
  const created=await request('/api/tenants',post(owner,{propertyId:'property_01',roomId:'room_101',name:'Khách mới kiểm thử',email:'moi@example.com'}));assert.equal(created.status,201);
  const contractBody={propertyId:'property_01',roomId:'room_103',tenantId:created.body.id,startDate:'2026-11-01',endDate:'2027-10-31',rent:3200000,deposit:3200000,terms:'Điều khoản hợp đồng thử nghiệm.'};
  const contract=await request('/api/contracts',post(owner,contractBody));assert.equal(contract.status,201);assert.equal((await request('/api/actions/contract-activate',post(owner,{id:contract.body.id}))).status,200);
  assert.equal(store.get('rooms','room_103').status,'occupied');
  const secondTenant=await request('/api/tenants',post(owner,{propertyId:'property_01',roomId:'room_102',name:'Khách thứ hai'}));
  const overlap=await request('/api/contracts',post(owner,{...contractBody,tenantId:secondTenant.body.id}));assert.equal(overlap.status,201);assert.equal((await request('/api/actions/contract-activate',post(owner,{id:overlap.body.id}))).status,409);
  assert.equal((await request('/api/rooms/room_103',patch(owner,{status:'vacant'}))).status,400);
  const renewed=await request('/api/actions/contract-renew',post(owner,{id:'contract_01',endDate:'2027-07-31',rent:3600000}));assert.equal(renewed.status,200);assert.equal(renewed.body.acceptedAt,null);assert.equal(renewed.body.version,2);
  assert.equal((await request('/api/actions/contract-accept',post(tenant,{id:'contract_01',version:renewed.body.version}))).status,200);
  assert.equal((await request('/api/actions/contract-end',post(owner,{id:'contract_01',endDate:today(),reason:'Hai bên thống nhất trả phòng'}))).status,200);assert.equal(store.get('rooms','room_101').status,'handover');
  const handover=await request('/api/handovers',post(owner,{propertyId:'property_01',roomId:'room_101',tenantId:'tenant_01',contractId:'contract_01',type:'move_out',date:'2026-11-01',condition:'Đã kiểm tra hiện trạng phòng.',electricReading:1400,waterReading:130}));assert.equal(handover.status,201);
  assert.equal((await request('/api/actions/handover-confirm',post(owner,{id:handover.body.id}))).status,200);
  assert.equal((await request('/api/actions/handover-confirm',post(tenant,{id:handover.body.id}))).status,200);
  assert.equal(store.get('rooms','room_101').status,'handover');assert.equal(store.get('contracts','contract_01').status,'terminating');
  assert.equal((await request('/api/actions/deposit-record',post(owner,{contractId:'contract_01',type:'refund',amount:3500001,date:'2026-11-01'}))).status,400);
  assert.equal((await request('/api/actions/deposit-record',post(owner,{contractId:'contract_01',type:'refund',amount:3500000,date:'2026-11-01'}))).status,400);
  assert.equal((await request('/api/actions/deposit-record',post(owner,{contractId:'contract_01',type:'receipt',amount:1,date:'2026-11-01'}))).status,400);
  const due=store.list('invoices').find(i=>i.id==='HD-10-101');assert.equal((await request('/api/actions/payment-record',post(owner,{invoiceId:due.id,amount:due.total-due.paid,method:'transfer',date:'2026-11-01'}))).status,200);
  assert.equal((await request('/api/actions/handover-confirm',post(tenant,{id:handover.body.id}))).status,409);assert.equal(store.get('rooms','room_101').status,'handover');assert.equal(store.get('contracts','contract_01').status,'terminating');
  await zeroFinal(store,request,owner);
  const settlement=await request('/api/actions/deposit-settlement-create',post(owner,{contractId:'contract_01',deductions:[{label:'Sơn lại cửa',reason:'Sửa vết trầy khi trả phòng',amount:500000}]}));
  assert.equal(settlement.status,200,settlement.body.error);
  assert.equal(settlement.body.refundAmount,3000000);assert.equal(settlement.body.excessInvoiceId,null);
  const finish=()=>request('/api/actions/deposit-settlement-refund',post(owner,{id:settlement.body.id,method:'transfer',reference:'REF-01'}));
  assert.notEqual((await finish()).status,200);
  assert.equal((await request('/api/actions/deposit-settlement-respond',post(tenant,{id:settlement.body.id,decision:'accept'}))).status,200);
  assert.equal((await finish()).status,200);assert.notEqual((await finish()).status,200);
  assert.deepEqual(store.list('transactions','owner_demo').filter(t=>t.sourceId===settlement.body.id).map(t=>[t.type,t.amount]),[['expense',3000000]]);

});

test('two-party maintenance workflow, support ticket reopen and notification read state',async t=>{
  const {request,login,store}=await fixture(t);const owner=await login(),tenant=await login('thue@trozy.vn');
  assert.equal((await request('/api/actions/issue-transition',post(tenant,{id:'issue_01',status:'resolved'}))).status,403);
  assert.equal((await request('/api/actions/issue-transition',post(owner,{id:'issue_01',status:'closed'}))).status,403);
  assert.equal((await request('/api/actions/issue-transition',post(owner,{id:'issue_01',status:'resolved',resolution:'Đã vệ sinh đường nước máy lạnh.',cost:150000,recordExpense:true}))).status,200);
  assert.equal((await request('/api/actions/issue-transition',post(tenant,{id:'issue_01',status:'closed',rating:5}))).status,200);assert.equal(store.get('issues','issue_01').rating,5);
  assert.equal(store.list('transactions').filter(tx=>tx.source==='issue'&&tx.sourceId==='issue_01').length,1);
  assert.equal((await request('/api/actions/ticket-transition',post(tenant,{id:'ticket_01',status:'resolved'}))).status,403);
  assert.equal((await request('/api/actions/ticket-reply',post(owner,{id:'ticket_01',body:'Phí gồm Internet và vệ sinh.'}))).status,200);
  assert.equal((await request('/api/actions/ticket-transition',post(owner,{id:'ticket_01',status:'resolved'}))).status,200);
  assert.equal((await request('/api/actions/ticket-transition',post(tenant,{id:'ticket_01',status:'open'}))).status,200);
  assert.equal((await request('/api/actions/notification-read',post(tenant,{id:'notice_01'}))).status,200);
  const scoped=(await request('/api/bootstrap',{cookie:tenant})).body;assert.deepEqual(scoped.data.notifications.find(n=>n.id==='notice_01').readBy,['user_tenant']);
});

test('only tenants create support tickets while landlords receive and respond within their own scope',async t=>{
  const {request,login,store}=await fixture(t);const owner=await login(),tenant=await login('thue@trozy.vn'),other=await login('khac@trozy.vn');
  const input={propertyId:'property_01',roomId:'room_101',tenantId:'tenant_01',title:'Kiểm tra phí Internet',category:'Hóa đơn',body:'Nhờ chủ trọ kiểm tra lại phí Internet của tháng này.'};
  const beforeTickets=store.list('tickets').length,beforeAudits=store.list('audits').length;
  const rejected=await request('/api/tickets',post(owner,input));
  assert.equal(rejected.status,403);assert.match(rejected.body.error,/Chỉ người thuê/);
  assert.equal((await request('/api/tickets',post(other,input))).status,403);
  assert.equal(store.list('tickets').length,beforeTickets);assert.equal(store.list('audits').length,beforeAudits);
  const created=await request('/api/tickets',post(tenant,{...input,propertyId:'property_other',roomId:'room_b01',tenantId:'tenant_02',status:'resolved',messages:[{body:'Nội dung giả'}]}));
  assert.equal(created.status,201);assert.equal(created.body.propertyId,'property_01');assert.equal(created.body.roomId,'room_101');assert.equal(created.body.tenantId,'tenant_01');assert.equal(created.body.status,'open');
  assert.equal(created.body.messages.length,1);assert.equal(created.body.messages[0].authorId,'user_tenant');assert.equal(created.body.messages[0].body,input.body);
  const ticketId=created.body.id;
  const incoming=(await request('/api/bootstrap',{cookie:owner})).body.data.tickets.find(row=>row.id===ticketId);assert.equal(incoming.title,input.title);
  assert.equal((await request('/api/actions/ticket-reply',post(other,{id:ticketId,body:'Phản hồi ngoài phạm vi'}))).status,404);
  assert.equal((await request('/api/actions/ticket-transition',post(owner,{id:ticketId,status:'progress'}))).status,200);
  const response=await request('/api/actions/ticket-reply',post(owner,{id:ticketId,body:'Tôi đã kiểm tra và cập nhật phí Internet.'}));
  assert.equal(response.status,200);assert.equal(response.body.messages.at(-1).authorId,'owner_demo');
  const tenantView=(await request('/api/bootstrap',{cookie:tenant})).body.data.tickets.find(row=>row.id===ticketId);assert.equal(tenantView.messages.at(-1).body,response.body.messages.at(-1).body);
  assert.equal((await request('/api/actions/ticket-transition',post(owner,{id:ticketId,status:'resolved'}))).status,200);
  assert.equal((await request('/api/actions/ticket-transition',post(tenant,{id:ticketId,status:'open'}))).status,200);
});

test('invite linking, local mail tokens, reset invalidation and origin protection',async t=>{
  const {request,login,store}=await fixture(t);const owner=await login();
  assert.equal((await request('/api/auth/register',post(null,{name:'Kiểm thử',email:'none@example.com',password:'Password@123',role:'landlord'}))).status,400);
  const invite=await request('/api/actions/invite-tenant',post(owner,{id:'tenant_02'}));assert.equal(invite.status,200);
  const bad=await request('/api/auth/register',post(null,{name:'Hà',email:'wrong@example.com',password:'Password@123',consent:true,phone:'0912345678',role:'tenant',inviteCode:'INVALID'}));assert.equal(bad.status,400);
  const registered=await request('/api/auth/register',post(null,{name:'Trần Thu Hà',email:'ha.demo@example.com',password:'Password@123',consent:true,phone:'0912345678',role:'tenant',inviteCode:invite.body.inviteCode}));assert.equal(registered.status,201);assert(!registered.cookie);assert(!registered.body.user.tenantId);assert.equal((await request('/api/auth/login',post(null,{email:'ha.demo@example.com',password:'Password@123'}))).status,403);assert(!JSON.stringify(registered.body).includes('"token"'));
  const verification=store.db.prepare('SELECT token FROM mail_outbox WHERE email=? AND kind=?').get('ha.demo@example.com','verify');
  assert.equal((await request('/api/auth/verify-email',post(null,{token:verification.token}))).status,200);
  assert.equal(store.get('tenants','tenant_02').userId,registered.body.user.id);
  const forgot=await request('/api/auth/forgot-password',post(null,{email:'ha.demo@example.com'}));assert.equal(forgot.status,200);assert(!JSON.stringify(forgot.body).includes('"token"'));
  const reset=store.db.prepare('SELECT token FROM mail_outbox WHERE email=? AND kind=?').get('ha.demo@example.com','reset');
  assert.match(reset.token,/^[0-9]+$/);
  const verify=await request('/api/auth/verify-reset-otp',post(null,{email:'ha.demo@example.com',otp:reset.token}));
  assert.equal(verify.status,200,verify.body.error);
  const replacement={token:verify.body.resetToken,password:'NewPassword@123',confirmation:'NewPassword@123'};
  assert.equal((await request('/api/auth/reset-password',post(null,replacement))).status,200);
  assert.equal((await request('/api/bootstrap',{cookie:registered.cookie})).status,401);
  assert.equal((await request('/api/auth/reset-password',post(null,replacement))).status,400);
  await login('ha.demo@example.com','NewPassword@123');
  assert.equal((await request('/api/rooms',{...post(owner,{}),origin:'https://attacker.example'})).status,403);
  assert.equal((await request('/api/auth/login',{...post(null,{email:'chu@trozy.vn',password:'Trozy@2026'}),origin:'null'})).status,403);
});

test('UC18 Node registers with a different email and links only after scoped approval',async t=>{
  const {request,login,store}=await fixture(t),owner=await login(),other=await login('khac@trozy.vn');
  const invite=async()=> (await request('/api/actions/invite-tenant',post(owner,{id:'tenant_02'}))).body.inviteCode;
  const first=await invite(),email='new-resident@example.com',password='Password@123';
  const app='/api/auth/tenant-link-requests';
  assert.equal((await request('/api/auth/register',post(null,{name:'Trần Thu Hà',email,password,consent:true,phone:'0912345678',role:'tenant',inviteCode:first}))).status,201);
  assert.deepEqual((await request(app,{cookie:owner})).body.requests,[]);
  const {token}=store.db.prepare("SELECT token FROM mail_outbox WHERE email=? AND kind='verify'").get(email);
  assert.equal((await request('/api/auth/verify-email',post(null,{token}))).body.linkStatus,'pending');
  const tenant=await login(email,password),tenantState=()=>request(app,{cookie:tenant});
  assert.equal((await tenantState()).body.status,'pending');
  assert.deepEqual((await request('/api/bootstrap',{cookie:tenant})).body.data.rooms,[]);
  const pending=async()=> (await request(app,{cookie:owner})).body.requests[0];
  const original=await pending();
  assert.equal(original.profileEmail,'ha.demo@example.com');
  assert.equal(original.requestedEmail,email);
  assert.equal((await request('/api/auth/link-tenant',post(tenant,{inviteCode:first}))).body.status,'pending');
  assert.equal((await pending()).id,original.id);
  assert.equal((await request(app,post(other,{id:original.id,decision:'approve'}))).status,404);
  assert.equal((await request(app,post(owner,{id:original.id,decision:'reject'}))).body.status,'rejected');
  assert.equal((await tenantState()).body.status,'rejected');
  assert.equal(store.get('tenants','tenant_02').email,'ha.demo@example.com');
  assert.equal((await request('/api/auth/link-tenant',post(tenant,{inviteCode:first}))).status,400);
  const second=await invite();
  assert.notEqual(second,first);
  assert.equal((await request('/api/auth/link-tenant',post(tenant,{inviteCode:second}))).body.status,'pending');
  const stale=await pending(),replacement='verified-replacement@example.com';
  assert.equal((await request('/api/auth/profile',patch(tenant,{email:replacement}))).status,200);
  assert.equal((await tenantState()).body.status,'pending');
  const newToken=store.db.prepare("SELECT token FROM mail_outbox WHERE email=? AND kind='change-email'").get(replacement).token;
  assert.equal((await request('/api/auth/verify-email',post(null,{token:newToken}))).status,200);
  assert.equal((await tenantState()).body.status,'expired');
  assert.equal((await request(app,post(owner,{id:stale.id,decision:'approve'}))).status,409);
  assert.equal((await request('/api/auth/link-tenant',post(tenant,{inviteCode:second}))).body.status,'pending');
  const next=await pending();
  assert.equal(next.requestedEmail,replacement);
  assert.equal((await request(app,post(owner,{id:next.id,decision:'approve'}))).body.status,'approved');
  assert.equal((await tenantState()).body.status,'approved');
  assert.equal(store.get('tenants','tenant_02').email,replacement);
  assert.equal(store.get('tenants','tenant_02').inviteCode,null);
  assert.equal((await request('/api/bootstrap',{cookie:tenant})).body.user.tenantId,'tenant_02');
});

test('authorized file association, atomic imports and amenity capacity',async t=>{
  const {request,login,store}=await fixture(t);const owner=await login(),tenant=await login('thue@trozy.vn'),other=await login('khac@trozy.vn');
  const file=await request('/api/files',post(owner,{name:'noi-quy.txt',type:'text/plain',data:Buffer.from('Nội quy mẫu').toString('base64'),propertyId:'property_01'}));assert.equal(file.status,201);
  assert.equal((await request('/api/files/'+file.body.id,{cookie:tenant})).status,404);assert.equal((await request('/api/files/'+file.body.id,{cookie:other})).status,404);
  const doc=await request('/api/documents',post(owner,{propertyId:'property_01',name:'Nội quy thử nghiệm',category:'rules',visibility:'all',fileId:file.body.id}));assert.equal(doc.status,201);
  assert.equal((await request('/api/files/'+file.body.id,{cookie:tenant})).status,200);
  const privateFile=await request('/api/files',post(other,{name:'private.txt',type:'text/plain',data:'cHJpdmF0ZQ==',propertyId:'property_other'}));assert.equal(privateFile.status,201);
  assert.equal((await request('/api/documents',post(owner,{propertyId:'property_01',name:'Giả mạo file',category:'other',visibility:'all',fileId:privateFile.body.id}))).status,403);
  const before=store.list('rooms').length;
  const imported=await request('/api/import',post(owner,{collection:'rooms',rows:[{propertyId:'property_01',code:'NEW-01',area:20,capacity:2,price:3000000},{propertyId:'property_01',code:'101',area:20,capacity:2,price:3000000}]}));assert.equal(imported.status,409);assert.equal(store.list('rooms').length,before);
  const booking={amenityId:'amenity_01',date:'2026-10-28',startTime:'18:30',endTime:'19:30'};assert.equal((await request('/api/bookings',post(tenant,booking))).status,201);assert.equal((await request('/api/bookings',post(tenant,booking))).status,409);
  assert.equal((await request('/api/vehicles',post(tenant,{roomId:'room_102',tenantId:'tenant_02',plate:'59-X1 123.45',type:'Xe máy',fee:0}))).status,409);
});

test('due reminders deduplicate, retain read state and follow remaining balances',async t=>{
  const {request,login,store}=await fixture(t);const owner=await login();
  const invoice=await request('/api/actions/invoice-issue',post(owner,{...nextInvoice(store),dueDate:today()}));assert.equal(invoice.status,200);
  const key='rem_invoice_'+invoice.body.id;
  let bootstrap=(await request('/api/bootstrap',{cookie:owner})).body;
  assert.equal(bootstrap.data.notifications.filter(row=>row.id===key).length,1);
  assert.equal((await request('/api/actions/notification-read',post(owner,{id:key}))).status,200);
  assert.equal((await request('/api/actions/payment-record',post(owner,{invoiceId:invoice.body.id,amount:100000,method:'cash',date:today()}))).status,200);
  bootstrap=(await request('/api/bootstrap',{cookie:owner})).body;
  const notice=bootstrap.data.notifications.find(row=>row.id===key);assert(notice.body.includes((invoice.body.total-100000).toLocaleString('vi-VN')));assert(notice.readBy.includes('owner_demo'));
  assert.equal((await request('/api/actions/payment-record',post(owner,{invoiceId:invoice.body.id,amount:invoice.body.total-100000,method:'cash',date:today()}))).status,200);
  bootstrap=(await request('/api/bootstrap',{cookie:owner})).body;assert(!bootstrap.data.notifications.some(row=>row.id===key));
});

test('itemized service quantities and vehicle fees persist in unpublished invoice drafts',async t=>{
  const {request,login,store}=await fixture(t);const owner=await login(),tenant=await login('thue@trozy.vn');
  store.put('tenants',{...store.get('tenants','tenant_01'),members:'Người cùng phòng A\nNgười cùng phòng B'});
  const usage=await request('/api/services',post(owner,{propertyId:'property_01',name:'Giặt sấy',unit:'usage',rate:12000,active:true}));assert.equal(usage.status,201);
  const input=nextInvoice(store);delete input.serviceFee;
  const auto=await request('/api/actions/invoice-preview',post(owner,input));assert.equal(auto.status,200);assert.equal(auto.body.serviceFee,290000);assert.equal(auto.body.serviceItems.find(item=>item.serviceId===usage.body.id).quantity,0);
  const explicit=auto.body.serviceItems.filter(item=>!item.serviceId?.startsWith('vehicle:')).map(item=>({...item,quantity:item.serviceId===usage.body.id?2.5:item.quantity,amount:1}));
  const draft=await request('/api/actions/invoice-draft',post(owner,{...input,serviceItems:explicit}));assert.equal(draft.status,200);assert.equal(draft.body.status,'draft');assert.equal(draft.body.serviceFee,320000);assert.equal(draft.body.serviceItems.filter(item=>item.serviceId==='vehicle:vehicle_01').length,1);
  assert.equal((await request('/api/invoices/'+draft.body.id,{cookie:tenant})).status,404);
  const updated=await request('/api/actions/invoice-draft',post(owner,{id:draft.body.id,rent:3550000}));assert.equal(updated.status,200);assert.equal(updated.body.serviceFee,320000);
  const issued=await request('/api/actions/invoice-issue',post(owner,{id:draft.body.id}));assert.equal(issued.status,200);assert.equal(issued.body.serviceFee,320000);
  assert.equal(issued.body.items.filter(item=>item.serviceId==='vehicle:vehicle_01').length,1);assert.equal(issued.body.items.reduce((sum,item)=>sum+item.amount,0),issued.body.total);
  assert.equal((await request('/api/invoices/'+draft.body.id,{cookie:tenant})).status,200);
  const duplicated=await request('/api/actions/invoice-preview',post(owner,{...input,serviceItems:[explicit[0],explicit[0]]}));assert.equal(duplicated.status,400);
});

test('profile image ownership, gallery ACL and persisted notification preferences',async t=>{
  const {request,login}=await fixture(t);const owner=await login(),tenant=await login('thue@trozy.vn');
  const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/RZkAAAAASUVORK5CYII=';
  const file=await request('/api/files',post(owner,{name:'room.png',type:'image/png',data:image,propertyId:'property_01'}));assert.equal(file.status,201);
  const second=await request('/api/files',post(owner,{name:'room2.png',type:'image/png',data:image,propertyId:'property_01'}));assert.equal(second.status,201);
  assert.equal((await request('/api/rooms/room_101',patch(owner,{imageFileIds:[file.body.id,second.body.id]}))).status,200);
  assert.equal((await request('/api/files/'+second.body.id+'?inline=1',{cookie:tenant})).status,200);
  assert.equal((await request('/api/auth/profile',patch(tenant,{avatarFileId:file.body.id}))).status,403);
  const avatar=await request('/api/files',post(tenant,{name:'avatar.png',type:'image/png',data:image}));assert.equal(avatar.status,201);
  const profile=await request('/api/auth/profile',patch(tenant,{avatarFileId:avatar.body.id,notificationPreferences:{invoices:false,contracts:true,maintenance:true,general:true}}));assert.equal(profile.status,200);assert.equal(profile.body.user.avatarFileId,avatar.body.id);
  const bootstrap=(await request('/api/bootstrap',{cookie:tenant})).body;assert.equal(bootstrap.user.notificationPreferences.invoices,false);assert(bootstrap.data.notifications.every(notice=>notice.kind!=='invoice'||notice.automatic));
  assert(bootstrap.data.notifications.some(notice=>notice.kind==='invoice'&&notice.automatic));
  assert.equal((await request('/api/auth/profile',patch(tenant,{notificationPreferences:{invoices:'false'}}))).status,400);
  const foreignProperty=await request('/api/files',post(owner,{name:'other.png',type:'image/png',data:image,propertyId:'property_02'}));assert.equal(foreignProperty.status,201);
  assert.equal((await request('/api/rooms/room_101',patch(owner,{imageFileIds:[foreignProperty.body.id]}))).status,403);
});

test('SMTP delivery uses verified TLS config and local outbox stores success or failure safely',async t=>{
  const {store}=await fixture(t);const record={id:'mail_transport_test',email:'test@example.com',kind:'verify',token:'local-test-token'};
  store.db.prepare('INSERT INTO mail_outbox(id,email,kind,token,created_at) VALUES(?,?,?,?,?)').run(record.id,record.email,record.kind,record.token,new Date().toISOString());
  let config,sent;
  const env={SMTP_HOST:'smtp.example.test',SMTP_PORT:'587',SMTP_FROM:'Trozy <no-reply@example.test>',SMTP_USER:'test-user',SMTP_PASS:'test-password',TROZY_PUBLIC_URL:'https://trozy.example.test'};
  const delivered=await deliverAuthMail(store,record,{env,transportFactory:options=>{config=options;return {sendMail:async value=>{sent=value;},close(){}};}});
  assert.equal(delivered,true);assert.equal(config.requireTLS,true);assert.equal(config.tls.rejectUnauthorized,true);assert(sent.text.includes('https://trozy.example.test/?action=verify&token=local-test-token'));
  assert.equal(store.db.prepare('SELECT status FROM mail_outbox WHERE id=?').get(record.id).status,'sent');
  assert.equal(await deliverAuthMail(store,record,{env:{}}),false);
  const failure=await deliverAuthMail(store,record,{env,transportFactory:()=>({sendMail:async()=>{throw Object.assign(new Error('Contains sensitive provider response'),{code:'EAUTH'});},close(){}})});
  assert.equal(failure,false);assert.equal(store.db.prepare('SELECT delivery_error FROM mail_outbox WHERE id=?').get(record.id).delivery_error,'EAUTH');
  assert(authMail({...record,kind:'reset'},env).text.includes('OTP'));
});

test('identity numbers encrypted at rest, persistent and recoverable from full backup',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'trozy-test-'));const path=join(directory,'db.sqlite');
  try{
    const app=createApp({dbPath:path,seed:true});
    app.store.put('tenants',{...app.store.get('tenants','tenant_01'),identityNumber:'012345678901'});
    const raw=app.store.db.prepare('SELECT data FROM records WHERE collection=? AND id=?').get('tenants','tenant_01').data;assert(!raw.includes('012345678901'));assert(raw.includes('enc:'));await app.close();
    const reopened=createApp({dbPath:path,seed:true});assert.equal(reopened.store.get('tenants','tenant_01').identityNumber,'012345678901');assert.equal(reopened.store.list('properties').length,3);await reopened.close();
    const destination=join(directory,'backup');
    await promisify(execFile)(process.execPath,['src/backend/backup.mjs',destination],{env:{...process.env,TROZY_DB_PATH:path}});
    const restored=createApp({dbPath:join(destination,'trozy.sqlite'),seed:false});assert.equal(restored.store.get('tenants','tenant_01').identityNumber,'012345678901');assert.equal(restored.store.list('properties').length,3);await restored.close();
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('M06 non-meter billing accepts per-person and fixed rates without finalized readings',async t=>{
  const {request,login}=await fixture(t);const owner=await login();
  const settings=await request('/api/settings/settings_property_01',patch(owner,{electricMethod:'person',electricPersonRate:120000,waterMethod:'fixed',waterFixedFee:80000,effectiveFrom:'2026-11-01'}));
  assert.equal(settings.status,200);
  const preview=await request('/api/actions/invoice-preview',post(owner,{roomId:'room_101',period:'2026-11',serviceFee:0}));
  assert.equal(preview.status,200,preview.body.error);
  assert.equal(preview.body.electricMethod,'person');assert.equal(preview.body.waterMethod,'fixed');
  assert.equal(preview.body.items.find(item=>item.name==='Điện').amount,120000);
  assert.equal(preview.body.items.find(item=>item.name==='Nước').amount,80000);
});

test('M06 meter replacement before reading entry preserves every meter segment in consumption',async t=>{
  const {store,request,login}=await fixture(t);const owner=await login(),room=store.get('rooms','room_101'),period='2026-11';
  const previous=store.list('readings','owner_demo').filter(row=>row.roomId===room.id&&row.confirmed&&row.period<period).sort((a,b)=>b.period.localeCompare(a.period))[0];
  assert(previous,'Fixture needs a previous finalized reading.');
  const first=await request('/api/meters',post(owner,{propertyId:room.propertyId,roomId:room.id,utility:'electric',code:'E-TEST-01',initialReading:previous.electricNew,installedAt:'2026-11-01',status:'active'}));
  assert.equal(first.status,201,first.body.error);
  const replace1=await request('/api/actions/meter-replace',post(owner,{id:first.body.id,finalReading:previous.electricNew+30,newCode:'E-TEST-02',initialReading:5,effectiveDate:'2026-11-08'}));
  assert.equal(replace1.status,200,replace1.body.error);
  const replace2=await request('/api/actions/meter-replace',post(owner,{id:replace1.body.replacement.id,finalReading:20,newCode:'E-TEST-03',initialReading:2,effectiveDate:'2026-11-12'}));
  assert.equal(replace2.status,200,replace2.body.error);
  const reading=await request('/api/readings',post(owner,{propertyId:room.propertyId,roomId:room.id,period,electricOld:2,electricNew:10,waterOld:previous.waterNew,waterNew:previous.waterNew+3,confirmed:false}));
  assert.equal(reading.status,201,reading.body.error);assert.equal(reading.body.meterBreakdown.filter(row=>row.utility==='electric').length,2);
  assert.equal((await request('/api/actions/reading-finalize',post(owner,{id:reading.body.id,confirmAnomaly:true}))).status,200);
  const preview=await request('/api/actions/invoice-preview',post(owner,{roomId:room.id,period}));
  assert.equal(preview.status,200,preview.body.error);
  const invalid=await request('/api/actions/invoice-preview',post(owner,{roomId:room.id,period,electricOld:0,electricNew:1}));
  assert.equal(invalid.status,400,'Closing must reach the currently installed meter opening even if the edited form supplies a lower one.');
  assert.equal(preview.body.items.find(item=>item.name==='Điện').quantity,53,'30 + 15 + 8 units should be charged across the three meter segments.');
});

test('M09 tenant transfer reports remain pending until landlord confirmation',async t=>{
  const {store,request,login}=await fixture(t);const owner=await login(),tenant=await login('thue@trozy.vn');
  const invoice=store.get('invoices','HD-10-101'),paidBefore=invoice.paid,transactionsBefore=store.list('transactions','owner_demo').length;
  const report=await request('/api/actions/payment-report-transfer',post(tenant,{invoiceId:invoice.id,amount:100000,date:today()}));
  assert.equal(report.status,200,report.body.error);assert.equal(report.body.status,'pending');assert.equal(report.body.appliedAmount,0);
  assert.equal(store.get('invoices',invoice.id).paid,paidBefore);assert.equal(store.list('transactions','owner_demo').length,transactionsBefore);
  const confirmed=await request('/api/actions/payment-confirm-transfer',post(owner,{id:report.body.id}));
  assert.equal(confirmed.status,200,confirmed.body.error);assert.equal(confirmed.body.status,'confirmed');
  assert.equal(store.get('invoices',invoice.id).paid,paidBefore+100000);
  assert.equal(store.list('transactions','owner_demo').length,transactionsBefore+1);
});

test('M10 deposit settlement requires cleared invoices, tenant agreement and payment of excess damage',async t=>{
  const {store,request,login}=await fixture(t);const owner=await login(),tenant=await login('thue@trozy.vn');
  assert.equal((await request('/api/actions/contract-end',post(owner,{id:'contract_01',endDate:today(),reason:'Hai bên thống nhất trả phòng'}))).status,200);
  const handover=await request('/api/handovers',post(owner,{propertyId:'property_01',roomId:'room_101',tenantId:'tenant_01',contractId:'contract_01',type:'move_out',date:today(),condition:'Đã kiểm tra và ghi nhận tình trạng phòng.'}));assert.equal(handover.status,201);
  assert.equal((await request('/api/actions/handover-confirm',post(owner,{id:handover.body.id}))).status,200);
  assert.equal((await request('/api/actions/handover-confirm',post(tenant,{id:handover.body.id}))).status,200);
  const action=(key,body,actor=owner)=>request('/api/actions/'+key,post(actor,body));
  const proposal={contractId:'contract_01',deductions:[{label:'Cửa hỏng',reason:'Thay cửa khi bàn giao',amount:3600000}]};
  assert.equal((await action('deposit-settlement-create',proposal)).status,409);
  const invoice=store.get('invoices','HD-10-101');
  const report=await action('payment-report-transfer',{invoiceId:invoice.id,amount:100},tenant);
  assert.equal((await action('payment-record',{invoiceId:invoice.id,amount:invoice.total-invoice.paid,method:'cash'})).status,200);
  assert.equal((await action('deposit-settlement-create',proposal)).status,409);
  await action('payment-reject-transfer',{id:report.body.id,reason:'Đã đối soát tại quầy'});
  await zeroFinal(store,request,owner);
  const settlement=await action('deposit-settlement-create',proposal);
  assert.equal(settlement.status,200,settlement.body.error);
  assert.equal(settlement.body.refundAmount,0);
  assert.equal(settlement.body.deductionTotal,3500000);
  assert.equal(settlement.body.excessAmount,100000);
  const bill=store.get('invoices',settlement.body.excessInvoiceId);
  assert.equal(bill.status,'draft');assert.equal(bill.total,100000);
  const respond=decision=>action('deposit-settlement-respond',{id:settlement.body.id,decision,note:'Kiểm tra lại chi phí'},tenant);
  await respond('dispute');
  const revised=await action('deposit-settlement-revise',{id:settlement.body.id,deductions:[{...settlement.body.deductions[0],amount:3700000}]});
  assert.equal(revised.status,200,revised.body.error);assert.equal(revised.body.excessInvoiceId,bill.id);
  await respond('accept');
  const finish=()=>action('deposit-settlement-refund',{id:settlement.body.id});
  assert.equal((await finish()).status,409);
  const issued=await action('invoice-issue',{id:bill.id});
  assert.equal(issued.status,200,issued.body.error);assert.equal(issued.body.total,200000);
  assert.equal((await finish()).status,409);
  assert.equal((await action('payment-record',{invoiceId:bill.id,amount:200000,method:'cash'})).status,200);
  assert.equal((await finish()).status,200);
  assert.equal(store.get('rooms','room_101').status,'handover');
  assert.equal((await action('tenancy-close',{id:'contract_01'})).status,200);
  assert.equal(store.get('rooms','room_101').status,'vacant');
  assert.equal(store.get('contracts','contract_01').status,'ended');
  assert.equal(store.list('deposits','owner_demo').filter(d=>d.settlementId===settlement.body.id).reduce((n,d)=>n+d.amount,0),3500000);
  assert.equal(store.list('transactions','owner_demo').filter(r=>r.source==='deposit_settlement').length,0);
});

test('one-time fees survive preview, draft, issue and adjustment exactly once',async t=>{
  const {store,request,login}=await fixture(t);const owner=await login();
  const input=nextInvoice(store);
  const charge=await request('/api/charges',post(owner,{roomId:input.roomId,propertyId:'property_01',tenantId:'tenant_01',period:input.period,type:'charge',amount:50000,reason:'Thay khóa phòng'}));
  assert.equal(charge.status,201);
  const draft=await request('/api/actions/invoice-draft',post(owner,input));
  assert.equal(draft.status,200);
  const issue=await request('/api/actions/invoice-issue',post(owner,{id:draft.body.id}));
  assert.equal(issue.status,200,issue.body.error);
  const revision=await request('/api/actions/invoice-adjust',post(owner,{id:issue.body.id,adjustment:10000,reason:'Điều chỉnh tiền thuê'}));
  assert.equal(revision.status,200,revision.body.error);
  assert.equal(revision.body.serviceItems.filter(s=>s.serviceId==='charge:'+charge.body.id).length,1);
});

test('old meter closing reading cannot precede the last finalized reading',async t=>{
  const {store,request,login}=await fixture(t);const owner=await login();
  const last=store.list('readings','owner_demo').filter(r=>r.roomId==='room_101'&&r.confirmed&&r.period<'2026-11').sort((a,b)=>b.period.localeCompare(a.period))[0];
  const meter=await request('/api/meters',post(owner,{propertyId:'property_01',roomId:'room_101',utility:'electric',code:'OLD-M06',initialReading:0,installedAt:'2026-01-01'}));
  assert.equal(meter.status,201);
  const replace=await request('/api/actions/meter-replace',post(owner,{id:meter.body.id,newCode:'NEW-M06',finalReading:last.electricNew-1,initialReading:0,effectiveDate:'2026-11-01'}));
  assert.equal(replace.status,400);assert.equal(store.get('meters',meter.body.id).status,'active');
});

test('verified transfer overpayment creates one receipt and a usable credit',async t=>{
  const {store,request,login}=await fixture(t);const owner=await login(),tenant=await login('thue@trozy.vn');
  const invoice=store.get('invoices','HD-10-101'),due=invoice.total-invoice.paid;
  const report=await request('/api/actions/payment-report-transfer',post(tenant,{invoiceId:invoice.id,amount:due+10000}));
  assert.equal(report.status,200,report.body.error);
  const retry=await request('/api/actions/payment-report-transfer',post(tenant,{invoiceId:invoice.id,amount:due+10000}));
  assert.equal(retry.status,200);assert.equal(retry.body.id,report.body.id);
  const outdated=await request('/api/actions/payment-confirm-transfer',post(owner,{id:report.body.id,amount:due+12000,expectedBalance:due-1}));
  assert.equal(outdated.status,409);assert.equal(store.get('payments',report.body.id).status,'pending');
  const confirm=()=>request('/api/actions/payment-confirm-transfer',post(owner,{id:report.body.id,amount:due+12000}));
  const actual=await confirm();assert.equal(actual.status,200,actual.body.error);
  assert.equal(actual.body.appliedAmount,due);assert.equal(actual.body.creditAmount,12000);
  assert.equal(store.get('invoices',invoice.id).paid,invoice.total);
  const repeated=await confirm();assert.equal(repeated.status,200);assert.deepEqual(repeated.body,actual.body);
  assert.equal(store.list('transactions','owner_demo').filter(row=>row.sourceId===actual.body.id).length,1);
  assert.equal(store.list('audits','owner_demo').filter(row=>row.action==='payment-confirm-transfer'&&row.recordId===actual.body.id).length,1);
});

test('PA3 UC02/06/07 keeps the old email until the exact replacement is verified',async t=>{
  const {request,login,store}=await fixture(t);const owner=await login();
  const update=email=>request('/api/auth/profile',patch(owner,{name:'Chủ trọ',email,notificationPreferences:{emailNotifications:false}}));
  const first=await update('new1@example.com');assert.equal(first.status,200,first.body.error);
  assert.equal(first.body.user.email,'chu@trozy.vn');assert.equal(first.body.user.pendingEmail,'new1@example.com');
  const token=email=>store.db.prepare("SELECT token FROM mail_outbox WHERE email=? AND kind='change-email' ORDER BY rowid DESC").get(email).token;
  const old=token('new1@example.com');await update('new2@example.com');
  assert.equal((await request('/api/auth/verify-email',post(null,{token:old}))).status,400);
  assert.equal((await request('/api/auth/verify-email',post(null,{token:token('new2@example.com')}))).status,200);
  const view=(await request('/api/bootstrap',{cookie:owner})).body.user;
  assert.equal(view.email,'new2@example.com');assert(!view.pendingEmail);assert.equal(view.notificationPreferences.emailNotifications,false);
});

test('PA3 UC20/24 contract PDF and acknowledgements follow the displayed version',async t=>{
  const {request,login,store}=await fixture(t);const owner=await login(),tenant=await login('thue@trozy.vn');
  const act=(name,body,who)=>request('/api/actions/'+name,post(who,body));
  const before=store.get('contracts','contract_01');
  const pdf=await request('/api/contracts/contract_01/pdf?version='+before.version,{cookie:tenant});
  assert.equal(pdf.status,200);assert.match(pdf.body.slice(0,8),/^%PDF-/);
  const accept=version=>act('contract-accept',{id:before.id,version},tenant);
  assert.equal((await accept(before.version)).status,200);
  const renewal=await act('contract-renew',{id:before.id,endDate:'2028-01-01',rent:4000000},owner);
  assert.equal(renewal.status,200);assert.equal(renewal.body.versions.at(-1).acceptedVersion,before.version);
  assert.equal((await accept(before.version)).status,409);
  const next=await accept(renewal.body.version);assert.equal(next.body.acceptedBy,'user_tenant');
  assert.equal((await request('/api/contracts/contract_01/pdf?version='+before.version,{cookie:tenant})).status,200);
});

test('PA3 UC45–48 saves a single repair report, tracks the proposal and tenant reopening',async t=>{
  const {request,login,store}=await fixture(t);const owner=await login(),tenant=await login('thue@trozy.vn');
  const body={title:'Máy lạnh rỉ nước',description:'Máy lạnh phòng bị rỉ nước xuống sàn.',category:'Khác',priority:'low',submissionId:'repeated-incident-01'};
  const send=()=>request('/api/issues',post(tenant,body));
  const first=await send();assert.equal(first.status,201,first.body.error);const replay=await send();
  assert.equal(replay.body.id,first.body.id);
  const issue=store.get('issues',first.body.id);
  assert.equal(issue.submittedCategory,'Khác');assert.equal(issue.submittedPriority,'low');assert.equal(issue.status,'new');
  assert(issue.classificationProposal||issue.classificationAttempt==='failed');
  const ownerNotices=store.list('notifications','owner_demo').filter(n=>n.issueId===issue.id&&n.recipientUserId==='owner_demo');
  assert.equal(ownerNotices.length,1);
  const move=(status,who,extra={})=>request('/api/actions/issue-transition',post(who,{id:issue.id,status,...extra}));
  assert.equal((await move('progress',owner,{category:'Nước',priority:'normal',estimatedDate:today()})).status,200);
  assert.equal(store.get('issues',issue.id).category,'Nước');
  await move('resolved',owner,{resolution:'Đã vệ sinh đường ống',cost:50000,recordExpense:false});
  assert.equal(store.list('transactions','owner_demo').filter(tx=>tx.sourceId===issue.id).length,0);
  assert.equal((await move('progress',tenant,{reason:'Ống tiếp tục rỉ nước'})).status,200);
  assert.equal(store.get('issues',issue.id).history.at(-1).reason,'Ống tiếp tục rỉ nước');
});

test('UC41 supplemental invoice can coexist with the monthly invoice of the same room',async t=>{
  const {store}=await fixture(t);
  const base=store.get('invoices','HD-10-101');
  store.put('invoices',{...base,id:'damage-invoice',settlementId:'settlement-01',status:'draft',paid:0,total:100});
  assert.equal(store.get('invoices','damage-invoice').period,base.period);
});

test('UC22 repeated termination opens the same inspection draft',async t=>{
  const {request,login,store}=await fixture(t);const owner=await login();
  const approve=()=>request('/api/actions/contract-end',post(owner,{id:'contract_01',endDate:today(),reason:'Trả phòng theo thỏa thuận'}));
  const first=await approve(),again=await approve();
  assert.equal(first.status,200);assert.equal(again.status,200);assert(first.body.moveOutId);
  assert.equal(again.body.moveOutId,first.body.moveOutId);
  const draft=store.get('handovers',first.body.moveOutId);
  assert.equal(draft.status,'draft');assert.equal(draft.date,today());
  assert.equal(store.get('rooms','room_101').status,'handover');
});

test('UC47 repair damage links the same charge to a single invoice and retains evidence notes',async t=>{
  const {request,login,store}=await fixture(t);const owner=await login();
  const values={id:'issue_01',status:'resolved',resolution:'Đã sửa thiết bị phòng',damageCharge:{amount:120000,reason:'Làm hỏng thiết bị',notes:'Thống nhất thay khóa',period:'2026-11'}};
  const proof=await request('/api/files',post(owner,{name:'bien-ban.txt',type:'text/plain',data:Buffer.from('Biên bản xác nhận hư hỏng').toString('base64'),propertyId:'property_01',tenantId:'tenant_01'}));
  values.damageCharge.evidenceFileId=proof.body.id;
  const result=await request('/api/actions/issue-transition',post(owner,values));assert.equal(result.status,200,result.body.error);
  assert(result.body.damageChargeId);const charge=store.get('charges',result.body.damageChargeId);
  assert.equal(charge.sourceId,'issue_01');assert.equal(charge.notes,values.damageCharge.notes);
  const preview=await request('/api/actions/invoice-preview',post(owner,nextInvoice(store)));
  assert.equal(preview.body.items.find(i=>i.serviceId==='charge:'+charge.id).notes,charge.notes);
});

test('UC58 active contract documents cannot be deleted and UC68 logs scoped downloads',async t=>{
  const {request,login,store}=await fixture(t); const owner=await login(),tenant=await login('thue@trozy.vn');
  const doc=await request('/api/documents',post(owner,{name:'Nội quy hợp đồng',category:'contract',propertyId:'property_01',roomId:'room_101',contractId:'contract_01',visibility:'tenant',content:'Văn bản'}));assert.equal(doc.status,201);
  assert.equal((await request('/api/documents/'+doc.body.id,{...post(owner,{}),method:'DELETE'})).status,409);
  await request('/api/contracts/contract_01/pdf',{cookie:tenant});
  const log=await request('/api/access-log?propertyId=property_01',{cookie:owner});
  assert.equal(log.status,200);assert(log.body.records.some(r=>r.resource==='contracts'&&r.recordId==='contract_01'&&r.actorId==='user_tenant'&&r.outcome==='success'));
  assert.equal((await request('/api/access-log?propertyId=property_01',{cookie:tenant})).status,403);
});

test('UC34 downloads an issued invoice and keeps other tenancies and drafts private',async t=>{
  const {store,login,request}=await fixture(t);
  const tenant=await login('thue@trozy.vn'),owner=await login();
  const invoice=store.list('invoices',store.get('contracts','contract_01').ownerId).find(i=>i.tenantId==='tenant_01'&&i.status==='issued');
  const get=(id,cookie)=>request('/api/invoices/'+id+'/pdf',{cookie});
  const file=await get(invoice.id,tenant);assert.equal(file.status,200);assert.match(file.body.slice(0,8),/^%PDF-/);
  const other=store.put('invoices',{...invoice,id:'pdf-test-other',status:'cancelled',tenantId:'tenant_other'});
  assert.equal((await get(other.id,tenant)).status,404);
  const draft=store.put('invoices',{...invoice,id:'pdf-test-draft',period:'2099-03',status:'draft'});
  assert.equal((await get(draft.id,tenant)).status,404);assert.equal((await get(draft.id,owner)).status,200);
});

test('UC52 carries an unissued incident charge once to the agreed final invoice',async t=>{
  const {store,request,login}=await fixture(t),owner=await login();
  const contract=store.get('contracts','contract_01'),bill=nextInvoice(store);
  const action=(name,body)=>request('/api/actions/'+name,post(owner,body));
  const ending=await action('contract-end',{id:contract.id,reason:'Hai bên thống nhất trả phòng',endDate:bill.period+'-28'});
  const h=store.get('handovers',ending.body.moveOutId);store.put('handovers',{...h,inspectionPending:false,status:'confirmed',tenantAcceptedAt:today()});
  const fee=store.put('charges',{id:'pending-active-damage',ownerId:contract.ownerId,propertyId:contract.propertyId,roomId:contract.roomId,tenantId:contract.tenantId,contractId:contract.id,type:'charge',sourceId:'issue_01',period:'2026-12',amount:27000,notes:'Ảnh khóa cửa',reason:'Thay khóa'});
  const final={...bill,contractId:contract.id,finalInvoice:true,rent:0};
  const regular=await action('invoice-preview',bill);assert(!regular.body.items.some(i=>i.sourceId===fee.sourceId));
  const preview=await action('invoice-preview',final);assert.equal(preview.body.items.filter(i=>i.sourceId===fee.sourceId).length,1);
  assert.equal(store.get('charges',fee.id).invoiceId,undefined);
  const issued=await action('invoice-issue',final);assert.equal(issued.status,200,issued.body.error);assert.equal(issued.body.finalInvoice,true);
  assert.equal(store.get('charges',fee.id).invoiceId,issued.body.id);
});

test('UC67 exports exactly the selected property and reviewed data types',async t=>{
  const {login,request,store}=await fixture(t),owner=await login(),tenant=await login('thue@trozy.vn');
  const selection={propertyId:'property_01',collections:['rooms','invoices'],operation:'export'};
  const run=(step,body,cookie=owner)=>request('/api/export/'+step,post(cookie,body));
  assert.equal((await run('preview',selection,tenant)).status,403);
  assert.equal((await run('preview',{...selection,propertyId:'property_other'})).status,404);
  const preview=await run('preview',selection);assert.equal(preview.status,200);assert(preview.body.counts.rooms>0);
  assert(!preview.body.data);
  assert.equal((await run('download',{...selection,revision:preview.body.revision,collections:['tenants']})).status,409);
  const ok=await run('download',{...selection,revision:preview.body.revision});
  assert.equal(ok.status,200);assert.deepEqual(Object.keys(ok.body.data).sort(),selection.collections.slice().sort());
  assert(ok.body.data.rooms.every(row=>row.propertyId===selection.propertyId));
  const room=store.get('rooms','room_101');store.put('rooms',{...room,description:'Đã cập nhật hiện trạng'});
  assert.equal((await run('download',{...selection,revision:preview.body.revision})).status,409);
});

test('UC15 creates separate member profiles, masks IDs and preserves membership identifiers on edit',async t=>{
  const {request,login,store}=await fixture(t),owner=await login();
  const body={propertyId:'property_01',roomId:'room_101',name:'Người đại diện thử',identityNumber:'000000000123',memberProfiles:[{name:'Thành viên thử',birthDate:'2001-02-03',identityNumber:'000000000456'}]};
  const create=body=>request('/api/tenants',post(owner,body));
  assert.equal((await create({...body,roomId:''})).status,400);
  assert.equal((await create({...body,identityNumber:'123'})).status,400);
  const created=await create(body);assert.equal(created.status,201,created.body.error);
  assert.equal(created.body.status,'pending');assert(!created.body.moveInDate);
  const member=created.body.memberProfiles[0];assert(member.id);assert.match(member.identityNumber,/•/);
  assert(!JSON.stringify(created.body).includes('000000000123'));
  const raw=store.db.prepare("SELECT data FROM records WHERE collection='tenants' AND id=?").get(created.body.id).data;
  assert(!raw.includes('000000000456'));
  const edit=await request('/api/tenants/'+created.body.id,{...post(owner,{memberProfiles:[{...member,phone:'0900000123'}]}),method:'PATCH'});
  assert.equal(edit.status,200);assert.equal(edit.body.memberProfiles[0].id,member.id);
  assert.equal(store.get('tenants',created.body.id).memberProfiles[0].identityNumber,'000000000456');
  assert.equal((await create({...body,name:'Tên trùng định danh'})).status,409);
});

test('UC16 paper OCR is scoped and fills only supported proposals, without saving the image or profile',async t=>{
  let calls=0;
  const {store,login,request}=await fixture(t,{readPaperContract:async()=>{calls++;return ['Bên thuê: Nguyễn Văn An','Phòng: 101','Giá thuê: 3.500.000 đồng','Tiền cọc: 0 đồng','CCCD: 000000000123'];}});
  const owner=await login(),tenant=await login('thue@trozy.vn');
  const body={geminiConsent:true,source:'paper-contract',fileName:'hop-dong.png',contractText:'HỢP ĐỒNG THUÊ PHÒNG\nBên thuê: Nguyễn Văn An\nGiá thuê: 3.500.000 đồng',collection:'tenants',roomId:'room_101'};
  const run=(data,actor=owner)=>request('/api/paper-contract/extract',post(actor,data));
  const before=store.get('tenants','tenant_01'),fileCount=()=>store.db.prepare('SELECT COUNT(*) AS n FROM files').get().n;
  const count=fileCount();
  assert.equal((await run({...body,geminiConsent:false})).status,400);
  assert.equal((await run({...body,fileName:'Căn cước.png'})).status,400);
  assert.equal((await run({...body,source:'cccd'})).status,400);
  assert.equal((await run(body,tenant)).status,403);
  assert.equal((await run({...body,roomId:'room_other'})).status,404);assert.equal(calls,0);
  const result=await run(body);assert.equal(result.status,200,result.body.error);assert.deepEqual(result.body.fields,{name:'Nguyễn Văn An'});
  const contract=await run({...body,collection:'contracts'});assert.equal(contract.body.fields.rent,'3500000');assert.equal(contract.body.fields.deposit,'0');
  const apply=await request('/api/paper-contract/confirm',post(owner,{...body,id:'tenant_01'}));assert.equal(apply.status,200);
  assert.equal(fileCount(),count);assert.deepEqual(store.get('tenants',before.id),before);
});

test('UC17 checks a transfer again at confirmation and preserves account, old documents and contract versions',async t=>{
  const {store,request,login}=await fixture(t),owner=await login(),tenant=await login('thue@trozy.vn');
  const initial=store.get('tenants','tenant_01'),source=store.get('rooms',initial.roomId);
  store.put('documents',{id:'old-rule',ownerId:source.ownerId,propertyId:source.propertyId,roomId:source.id,visibility:'tenant',name:'Nội quy phòng',version:1});
  const move={tenantId:initial.id,people:[initial.id],roomId:'room_103',date:today(),terms:'Thống nhất đổi sang phòng 103'};
  const run=(step,body,who=owner)=>request('/api/occupancy/'+step,post(who,body));
  assert.equal((await run('preview',move,tenant)).status,403);
  const view=await run('preview',move);assert.equal(view.status,200,view.body.error);assert.equal(store.get('tenants',initial.id).roomId,source.id);
  assert.equal((await run('confirm',{...move,terms:'Thay đổi phụ lục',revision:view.body.revision})).status,409);
  const moved=await run('confirm',{...move,revision:view.body.revision});assert.equal(moved.status,200,moved.body.error);
  assert.equal(store.get('tenants',initial.id).userId,initial.userId);assert.equal(store.get('rooms',source.id).status,'vacant');
  assert.equal(store.get('contracts','contract_01').versions.at(-1).roomId,source.id);
  assert.equal((await request('/api/documents/old-rule',{cookie:tenant})).status,200);
  const boot=await request('/api/bootstrap',{cookie:tenant});assert.deepEqual(boot.body.data.rooms.map(r=>r.id),['room_103']);
});
test('UC17 checks capacity, records member dates and activates the reviewed split contract',async t=>{
  const {store,request,login}=await fixture(t),owner=await login();
  const run=(step,body)=>request('/api/occupancy/'+step,post(owner,body));
  const update=await request('/api/tenants/tenant_01',patch(owner,{memberProfiles:[{name:'Thành viên B'}]}));
  const member=update.body.memberProfiles[0],stay={tenantId:'tenant_01',personId:member.id,date:today(),direction:'in'};
  assert.equal((await run('stay',stay)).status,200);
  assert.equal((await run('stay',stay)).status,409);
  const move={tenantId:'tenant_01',people:[member.id],roomId:'room_103',date:today(),terms:'Hợp đồng riêng cho thành viên B'};
  assert.equal((await run('preview',move)).status,409);
  const draft=await request('/api/contracts',post(owner,{propertyId:'property_01',roomId:move.roomId,tenantId:member.id,startDate:today(),endDate:'2027-06-30',rent:3000000,deposit:3000000,terms:move.terms}));assert.equal(draft.status,201,draft.body.error);
  move.otherContractId=draft.body.id;const preview=await run('preview',move);assert.equal(preview.status,200,preview.body.error);
  assert.equal((await run('confirm',{...move,revision:preview.body.revision})).status,200);
  assert.equal(store.get('tenants',member.id).roomId,move.roomId);assert.equal(store.get('rooms','room_101').status,'occupied');
  assert.equal(store.get('contracts',draft.body.id).status,'active');assert.equal(store.get('tenants','tenant_01').memberProfiles.length,0);
});

test('UC32 generates eligible drafts once and identifies rooms still missing readings',async t=>{
  const {store,login,request}=await fixture(t),owner=await login(),bill=nextInvoice(store);
  const batch=()=>request('/api/actions/invoice-generate-period',post(owner,{propertyId:'property_01',period:bill.period}));
  const first=await batch();assert.equal(first.status,200);const ready=first.body.results.find(i=>i.roomId===bill.roomId);assert.equal(ready.status,'created');
  assert(first.body.results.some(i=>i.status==='pending'&&i.reason));const again=await batch();
  assert.equal(again.body.results.find(i=>i.roomId===bill.roomId).id,ready.id);
  assert.equal(store.get('invoices',ready.id).status,'draft');
});
test('UC52 final billing in the same period retains the original payment and only bills remaining charges',async t=>{
  const {store,request,login}=await fixture(t),owner=await login();
  const act=(name,body)=>request('/api/actions/'+name,post(owner,body)),monthly=nextInvoice(store);
  const first=await act('invoice-issue',{...monthly,serviceItems:[]});assert.equal(first.status,200);
  const end=await act('contract-end',{id:'contract_01',endDate:today(),reason:'Trả phòng theo thỏa thuận'});
  const h=store.get('handovers',end.body.moveOutId);store.put('handovers',{...h,status:'confirmed',tenantAcceptedAt:today(),inspectionPending:false});
  const fin=await act('invoice-issue',{...monthly,finalInvoice:true,rent:0,serviceItems:[]});
  assert.equal(fin.status,200,fin.body.error);assert.equal(fin.body.total,0);assert.equal(fin.body.earlierInvoiceId,first.body.id);
  assert.equal(store.get('invoices',first.body.id).total,first.body.total);
});

test('UC66 import preview validates duplicates without saving, and UC68 records old and new values',async t=>{
  const {store,request,login}=await fixture(t),owner=await login();
  const example={propertyId:'property_01',code:'PTEST',area:28,capacity:2,price:3000000};
  const rows=[example,{...example},{...example,code:'PTEST2',propertyId:'property_other'}];
  const before=store.list('rooms').length;
  const preview=await request('/api/import/preview',post(owner,{rows,collection:'rooms',propertyId:'property_01'}));
  assert.equal(preview.status,200,preview.body.error);assert.deepEqual(preview.body.valid,[0]);assert.deepEqual(preview.body.errors.map(e=>e.row),[3,4]);assert.equal(store.list('rooms').length,before);
  const imported=await request('/api/import',post(owner,{collection:'rooms',propertyId:'property_01',rows:[example]}));assert.equal(imported.body.count,1);
  const cfg=store.list('settings','owner_demo').find(s=>s.propertyId==='property_01');
  const changed=await request('/api/settings/'+cfg.id,patch(owner,{billingDay:7}));assert.equal(changed.status,200,changed.body.error);
  const log=store.list('audits',cfg.ownerId).find(r=>r.recordId===cfg.id&&r.action==='update');
  assert.deepEqual(log.changes.find(c=>c.field==='billingDay'),{field:'billingDay',before:cfg.billingDay,after:7});
  assert.equal((await request('/api/audits/'+log.id+'?propertyId=property_02',{cookie:owner})).status,404);
});
test('UC51 preserves handover feedback, updates the agreed date and requires the same inspection to be confirmed again',async t=>{
  const {store,request,login}=await fixture(t),owner=await login(),tenant=await login('thue@trozy.vn');
  const act=(name,body,who=owner)=>request('/api/actions/'+name,post(who,body));
  const ending=await act('contract-end',{id:'contract_01',endDate:today(),reason:'Hai bên thống nhất'}),id=ending.body.moveOutId;
  const changed=await act('handover-reschedule',{id,date:today(),reason:'Thỏa thuận lại giờ bàn giao'});assert.equal(changed.status,200);assert.equal(changed.body.scheduleHistory.length,1);
  await request('/api/handovers/'+id,patch(owner,{condition:'Đã kiểm tra tình trạng cửa'}));assert.equal((await act('handover-confirm',{id})).status,200);
  assert.equal((await act('handover-feedback',{id,reason:'Cần ghi lại tình trạng khóa cửa'},tenant)).status,200);
  assert.equal((await act('handover-confirm',{id},tenant)).status,400);assert.equal(store.get('rooms','room_101').status,'handover');
  const fix=await request('/api/handovers/'+id,patch(owner,{condition:'Đã cập nhật hiện trạng khóa cửa'}));assert.equal(fix.body.feedback.length,1);
  assert.equal((await act('handover-confirm',{id})).status,200);assert.equal((await act('handover-confirm',{id},tenant)).status,200);
});
