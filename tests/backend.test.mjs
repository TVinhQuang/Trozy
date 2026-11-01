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

async function fixture(t){
  const app=createApp({dbPath:':memory:',seed:true});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
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
function nextInvoice(store,roomId='room_101'){
  const reading=store.list('readings').filter(r=>r.roomId===roomId).sort((a,b)=>b.period.localeCompare(a.period))[0];
  return {roomId,period:'2026-11',electricOld:reading.electricNew,electricNew:reading.electricNew+80,waterOld:reading.waterNew,waterNew:reading.waterNew+5,electricRate:3500,waterRate:15000,serviceFee:130000,adjustment:0};
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
  const created=await request('/api/tenants',post(owner,{propertyId:'property_01',name:'Khách mới kiểm thử',email:'moi@example.com'}));assert.equal(created.status,201);
  const contractBody={propertyId:'property_01',roomId:'room_103',tenantId:created.body.id,startDate:'2026-11-01',endDate:'2027-10-31',rent:3200000,deposit:3200000,terms:'Điều khoản hợp đồng thử nghiệm.'};
  const contract=await request('/api/contracts',post(owner,contractBody));assert.equal(contract.status,201);assert.equal((await request('/api/actions/contract-activate',post(owner,{id:contract.body.id}))).status,200);
  assert.equal(store.get('rooms','room_103').status,'occupied');
  const secondTenant=await request('/api/tenants',post(owner,{propertyId:'property_01',name:'Khách thứ hai'}));
  const overlap=await request('/api/contracts',post(owner,{...contractBody,tenantId:secondTenant.body.id}));assert.equal(overlap.status,201);assert.equal((await request('/api/actions/contract-activate',post(owner,{id:overlap.body.id}))).status,409);
  assert.equal((await request('/api/rooms/room_103',patch(owner,{status:'vacant'}))).status,400);
  const renewed=await request('/api/actions/contract-renew',post(owner,{id:'contract_01',endDate:'2027-07-31',rent:3600000}));assert.equal(renewed.status,200);assert.equal(renewed.body.acceptedAt,null);assert.equal(renewed.body.version,2);
  assert.equal((await request('/api/actions/contract-accept',post(tenant,{id:'contract_01'}))).status,200);
  assert.equal((await request('/api/actions/contract-end',post(owner,{id:'contract_01'}))).status,200);assert.equal(store.get('rooms','room_101').status,'handover');
  const handover=await request('/api/handovers',post(owner,{propertyId:'property_01',roomId:'room_101',tenantId:'tenant_01',contractId:'contract_01',type:'move_out',date:'2026-11-01',condition:'Đã kiểm tra hiện trạng phòng.',electricReading:1400,waterReading:130}));assert.equal(handover.status,201);
  assert.equal((await request('/api/actions/handover-confirm',post(owner,{id:handover.body.id}))).status,200);
  assert.equal((await request('/api/actions/handover-confirm',post(tenant,{id:handover.body.id}))).status,400);
  assert.equal((await request('/api/actions/deposit-record',post(owner,{contractId:'contract_01',type:'refund',amount:3500001,date:'2026-11-01'}))).status,400);
  assert.equal((await request('/api/actions/deposit-record',post(owner,{contractId:'contract_01',type:'refund',amount:3500000,date:'2026-11-01'}))).status,200);
  assert.equal((await request('/api/actions/deposit-record',post(owner,{contractId:'contract_01',type:'receipt',amount:1,date:'2026-11-01'}))).status,400);
  const due=store.list('invoices').find(i=>i.id==='HD-10-101');assert.equal((await request('/api/actions/payment-record',post(owner,{invoiceId:due.id,amount:due.total-due.paid,method:'transfer',date:'2026-11-01'}))).status,200);
  assert.equal((await request('/api/actions/handover-confirm',post(tenant,{id:handover.body.id}))).status,200);assert.equal(store.get('rooms','room_101').status,'vacant');assert.equal(store.get('tenants','tenant_01').status,'left');
});

test('two-party maintenance workflow, support ticket reopen and notification read state',async t=>{
  const {request,login,store}=await fixture(t);const owner=await login(),tenant=await login('thue@trozy.vn');
  assert.equal((await request('/api/actions/issue-transition',post(tenant,{id:'issue_01',status:'resolved'}))).status,403);
  assert.equal((await request('/api/actions/issue-transition',post(owner,{id:'issue_01',status:'closed'}))).status,403);
  assert.equal((await request('/api/actions/issue-transition',post(owner,{id:'issue_01',status:'resolved',resolution:'Đã vệ sinh đường nước máy lạnh.',cost:150000}))).status,200);
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
  const invite=await request('/api/actions/invite-tenant',post(owner,{id:'tenant_02'}));assert.equal(invite.status,200);
  const bad=await request('/api/auth/register',post(null,{name:'Hà',email:'wrong@example.com',password:'Password@123',role:'tenant',inviteCode:invite.body.inviteCode}));assert.equal(bad.status,400);
  const registered=await request('/api/auth/register',post(null,{name:'Trần Thu Hà',email:'ha.demo@example.com',password:'Password@123',role:'tenant',inviteCode:invite.body.inviteCode}));assert.equal(registered.status,201);assert.equal(registered.body.user.tenantId,'tenant_02');assert(!JSON.stringify(registered.body).includes('"token"'));
  assert.equal((await request('/api/auth/register',post(null,{name:'Khách khác',email:'new@example.com',password:'Password@123',role:'tenant',inviteCode:invite.body.inviteCode}))).status,400);
  const verification=store.db.prepare('SELECT token FROM mail_outbox WHERE email=? AND kind=?').get('ha.demo@example.com','verify');
  assert.equal((await request('/api/auth/verify-email',post(null,{token:verification.token}))).status,200);
  const forgot=await request('/api/auth/forgot-password',post(null,{email:'ha.demo@example.com'}));assert.equal(forgot.status,200);assert(!JSON.stringify(forgot.body).includes('"token"'));
  const reset=store.db.prepare('SELECT token FROM mail_outbox WHERE email=? AND kind=?').get('ha.demo@example.com','reset');
  assert.equal((await request('/api/auth/reset-password',post(null,{token:reset.token,password:'NewPassword@123'}))).status,200);
  assert.equal((await request('/api/bootstrap',{cookie:registered.cookie})).status,401);
  assert.equal((await request('/api/auth/reset-password',post(null,{token:reset.token,password:'OtherPassword@123'}))).status,400);
  await login('ha.demo@example.com','NewPassword@123');
  assert.equal((await request('/api/rooms',{...post(owner,{}),origin:'https://attacker.example'})).status,403);
  assert.equal((await request('/api/auth/login',{...post(null,{email:'chu@trozy.vn',password:'Trozy@2026'}),origin:'null'})).status,403);
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
  const bootstrap=(await request('/api/bootstrap',{cookie:tenant})).body;assert.equal(bootstrap.user.notificationPreferences.invoices,false);assert(bootstrap.data.notifications.every(notice=>notice.kind!=='invoice'));
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
  assert(authMail({...record,kind:'reset'},env).text.includes('action=reset'));
});

test('identity numbers encrypted at rest, persistent and recoverable from full backup',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'trozy-test-'));const path=join(directory,'db.sqlite');
  try{
    const app=createApp({dbPath:path,seed:true});
    app.store.put('tenants',{...app.store.get('tenants','tenant_01'),identityNumber:'012345678901'});
    const raw=app.store.db.prepare('SELECT data FROM records WHERE collection=? AND id=?').get('tenants','tenant_01').data;assert(!raw.includes('012345678901'));assert(raw.includes('enc:'));app.store.close();
    const reopened=createApp({dbPath:path,seed:true});assert.equal(reopened.store.get('tenants','tenant_01').identityNumber,'012345678901');assert.equal(reopened.store.list('properties').length,3);reopened.store.close();
    const destination=join(directory,'backup');
    await promisify(execFile)(process.execPath,['src/backend/backup.mjs',destination],{env:{...process.env,TROZY_DB_PATH:path}});
    const restored=createApp({dbPath:join(destination,'trozy.sqlite'),seed:false});assert.equal(restored.store.get('tenants','tenant_01').identityNumber,'012345678901');assert.equal(restored.store.list('properties').length,3);restored.store.close();
  }finally{rmSync(directory,{recursive:true,force:true});}
});
