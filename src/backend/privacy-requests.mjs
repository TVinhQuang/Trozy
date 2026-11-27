import {audit,creditAccounts,fail,ownerId,roomMembers} from './domain.mjs';
import {hashToken,id,now,today} from './model.mjs';
import {contactFields,privacyFields,privacyStatuses} from '../shared/privacy-policy.mjs';

const open=row=>row.status==='pending'||row.status==='reviewed';
const check=(condition,status,message)=>{if(!condition)fail(status,message);};
function selection(fields){
  check(Array.isArray(fields)&&fields.length>0&&fields.length<=Object.keys(privacyFields).length&&fields.every(f=>typeof f==='string'&&Object.hasOwn(privacyFields,f)),400,'Chọn phạm vi dữ liệu hợp lệ.');
  return [...new Set(fields)];
}
export function publicPrivacyRequest(row,role,includePreview=false){
  const {fingerprint,review,...result}=row;
  if(!includePreview)delete result.previewId;
  if(role==='tenant')delete result.verifiedBy;
  return result;
}
function subject(store,row){
  const tenant=store.get('tenants',row.tenantId);
  if(tenant?.ownerId!==row.ownerId||tenant.propertyId!==row.propertyId)return {};
  const person=row.personId===tenant.id?tenant:roomMembers(tenant).find(m=>m.id===row.personId);
  return {tenant,person};
}
function notify(store,row,recipient,title,body){
  store.put('notifications',{id:id('notice'),ownerId:row.ownerId,propertyId:row.propertyId,tenantId:row.tenantId,
    recipientUserId:recipient,kind:'general',privacyRequestId:row.id,title,body,readBy:[]});
}
function submit(store,user,input){
  const online=user.role==='tenant';
  if(online)check(user.landlord_id&&user.tenant_id&&(!input.tenantId||input.tenantId===user.tenant_id)&&
    (!input.personId||input.personId===user.tenant_id)&&(!input.source||input.source==='linked'),403,'Chỉ gửi cho hồ sơ của chính bạn.');
  const tenant=store.get('tenants',online?user.tenant_id:input.tenantId);
  check(tenant&&tenant.ownerId===ownerId(user)&&(!online||tenant.userId===user.id),403,'Hồ sơ chưa liên kết hoặc ngoài quyền xử lý.');
  check(online?(!input.propertyId||input.propertyId===tenant.propertyId):input.propertyId===tenant.propertyId,403,'Hồ sơ không thuộc cơ sở đã chọn.');
  const source=online?'linked':input.source,personId=online?tenant.id:input.personId||tenant.id;
  check(online||['external','delegate'].includes(source),400,'Chọn nguồn yêu cầu trực tiếp hoặc ủy quyền.');
  const person=personId===tenant.id?tenant:roomMembers(tenant).find(m=>m.id===personId);
  check(person,404,'Không tìm thấy người trong hồ sơ.');
  const requesterName=online?user.name:String(input.requesterName||'').trim();
  check(requesterName&&requesterName.length<=150,400,'Điền tên người yêu cầu (tối đa 150 ký tự).');
  const fields=selection(input.fields);
  const prior=store.list('privacyRequests',tenant.ownerId).find(r=>open(r)&&r.tenantId===tenant.id&&r.personId===personId&&r.propertyId===tenant.propertyId&&r.requestedBy===user.id&&r.source===source&&r.requesterName===requesterName&&[...r.fields].sort().join() === [...fields].sort().join());
  if(prior)return publicPrivacyRequest(prior,user.role);
  const row=store.put('privacyRequests',{id:id('privacy'),ownerId:tenant.ownerId,propertyId:tenant.propertyId,tenantId:tenant.id,personId,
    subjectName:person.name,source,requesterName,requestedBy:user.id,fields,status:'pending'});
  audit(store,user,'privacy-submit','privacyRequests',row);
  if(online)notify(store,row,row.ownerId,'Yêu cầu xóa dữ liệu mới','Mở Cài đặt → Dữ liệu để kiểm tra yêu cầu '+row.id+'.');
  return publicPrivacyRequest(row,user.role);
}
function reviewInput(row,input){
  check(row.source==='linked'||input.identityChecked===true,400,'Cần xác minh danh tính bằng đối chiếu trực tiếp.');
  check(row.source!=='delegate'||input.authorityChecked===true,400,'Cần kiểm tra căn cứ ủy quyền.');
  check(typeof input.settled==='boolean'&&Array.isArray(input.neededFields)&&input.neededFields.every(f=>contactFields.includes(f)&&row.fields.includes(f)),400,'Kiểm tra tình trạng tất toán và các trường còn cần cho yêu cầu đang xử lý.');
  return {identityChecked:row.source==='linked'||input.identityChecked===true,authorityChecked:row.source==='delegate',settled:input.settled,neededFields:[...new Set(input.neededFields)]};
}
function financialHold(store,row){
  const own=collection=>store.list(collection,row.ownerId).filter(item=>item.tenantId===row.personId);
  if(own('contracts').some(c=>['active','terminating','scheduled'].includes(c.status)))return 'Còn hợp đồng đang hoặc sắp hiệu lực.';
  if(own('invoices').some(i=>i.status==='draft'||i.status==='issued'&&i.paid!==i.total)||
     own('payments').some(p=>p.status==='pending')||creditAccounts(store,row.ownerId).some(c=>c.tenantId===row.personId&&c.balance!==0))return 'Hóa đơn hoặc khoản thanh toán còn phải đối soát.';
  const deposits=new Map();
  for(const item of own('deposits'))deposits.set(item.contractId,(deposits.get(item.contractId)||0)+(item.type==='receipt'?item.amount:-item.amount));
  if([...deposits.values()].some(v=>v!==0)||own('depositSettlements').some(s=>!['refunded','cancelled','rejected'].includes(s.status))||
     own('charges').some(c=>!c.invoiceId&&c.status!=='cancelled'))return 'Còn tiền cọc, khoản phí hoặc quyết toán cần xử lý.';
  return '';
}
function evaluate(store,row,review,nonce){
  const {tenant,person}=subject(store,row);
  let hold='';
  if(!person||row.source==='linked'&&tenant.userId!==row.requestedBy)hold='Hồ sơ hoặc liên kết tài khoản đã thay đổi.';
  else if((person.occupantStatus||person.status)!=='left'||!person.moveOutDate||person.moveOutDate>today())hold='Chưa xác nhận người này đã rời phòng.';
  else hold=financialHold(store,row)||(!review.settled?'Chưa xác nhận đã tất toán.':'');
  const decisions=row.fields.map(field=>{
    let reason;
    if(!contactFields.includes(field))reason=field==='other'?'Chưa có quy tắc cho phép xóa.':field==='loginEmail'?'Tài khoản đăng nhập được quản lý riêng.':'Chứng từ, minh chứng và nhật ký được giữ để đối chiếu.';
    else reason=hold||(review.neededFields.includes(field)?'Thông tin còn cần cho yêu cầu đang xử lý.':!person[field]?'Trường này đã trống.':'');
    return {field,eligible:!reason,reason:reason||'Đã rời phòng, đã tất toán và trường này có thể xóa.'};
  });
  // Invalidate a preview if another operation changes the selected contacts or
  // opens/updates a case since the landlord assessed whether it needs them.
  const cases=['tickets','issues'].flatMap(c=>store.list(c,row.ownerId).filter(r=>[row.personId,row.tenantId].includes(r.tenantId)&&
    (c==='tickets'?['open','progress'].includes(r.status):!['rejected','closed'].includes(r.status))).map(r=>[r.id,r.updatedAt,r.status])).sort();
  const fingerprint=hashToken(JSON.stringify([nonce,decisions,cases,row.fields.filter(f=>contactFields.includes(f)).map(f=>person?.[f]||'')]));
  return {decisions,fingerprint};
}
function finish(store,user,row,status,extra={}){
  const saved=store.put('privacyRequests',{...row,review:null,fingerprint:null,status,finishedAt:now(),finishedBy:user.id,...extra});
  audit(store,user,'privacy-'+status,'privacyRequests',saved,privacyStatuses[status]+' · '+(saved.deletedFields||[]).map(f=>privacyFields[f]).join(', '));
  const message=privacyStatuses[status]+'. Mã yêu cầu '+row.id+'.';
  notify(store,saved,row.ownerId,'Kết quả xử lý yêu cầu dữ liệu',message);
  if(row.source==='linked')notify(store,saved,row.requestedBy,'Kết quả yêu cầu dữ liệu của bạn',message+' Xem chi tiết trong Tài khoản.');
  return publicPrivacyRequest(saved,user.role);
}
export function privacyAction(store,user,action,input){
  if(action==='submit')return submit(store,user,input);
  if(action!=='cancel')check(user.role==='landlord',403,'Chỉ chủ trọ được xử lý yêu cầu.');
  const row=store.get('privacyRequests',input.id);
  check(row&&row.ownerId===ownerId(user)&&(user.role==='landlord'||row.source==='linked'&&row.requestedBy===user.id&&row.tenantId===user.tenant_id),404,'Không tìm thấy yêu cầu.');
  if(action==='delivered'){
    check(row.source!=='linked'&&!open(row),409,'Chỉ ghi nhận sau khi trả kết quả cho người yêu cầu bên ngoài.');
    if(row.deliveredAt)return publicPrivacyRequest(row,user.role);
    const saved=store.put('privacyRequests',{...row,deliveredAt:now(),deliveredBy:user.id});audit(store,user,'privacy-delivered','privacyRequests',saved);
    return publicPrivacyRequest(saved,user.role);
  }
  if(action==='confirm'&&!open(row)&&row.previewId&&row.previewId===input.previewId&&input.confirmed===true&&
     JSON.stringify(input.fields)===JSON.stringify(row.deletedFields))return publicPrivacyRequest(row,user.role);
  check(open(row),409,'Yêu cầu đã kết thúc.');
  if(action==='cancel')return finish(store,user,row,'cancelled',{decisions:[],previewId:null});
  if(action==='reject'){
    check(['identity','authority','scope'].includes(input.reason),400,'Chọn lý do từ chối.');
    return finish(store,user,row,'rejected',{reason:input.reason,decisions:[],previewId:null});
  }
  if(action==='preview'){
    const review=reviewInput(row,input),previewId=id('review');
    const result=evaluate(store,row,review,previewId);
    const saved=store.put('privacyRequests',{...row,...result,review,previewId,status:'reviewed',verifiedBy:user.id,verifiedAt:now(),identityMethod:row.source==='linked'?'linked':'direct',authorityChecked:review.authorityChecked});
    audit(store,user,'privacy-preview','privacyRequests',saved);
    return publicPrivacyRequest(saved,user.role,true);
  }
  check(action==='confirm',404,'Không tìm thấy thao tác.');
  check(row.status==='reviewed'&&row.previewId===input.previewId,409,'Cần xem trước lại yêu cầu.');
  check(input.confirmed===true,400,'Cần xác nhận tường minh phạm vi xử lý.');
  const {decisions,fingerprint}=evaluate(store,row,row.review,row.previewId);
  check(fingerprint===row.fingerprint,409,'Dữ liệu đã đổi. Hãy xem trước lại và xác nhận phạm vi mới.');
  const fields=decisions.filter(d=>d.eligible).map(d=>d.field);
  check(JSON.stringify(input.fields)===JSON.stringify(fields),409,'Phạm vi xác nhận phải khớp các mục đủ điều kiện đã xem trước.');
  if(fields.length){
    const {tenant}=subject(store,row),cleared=Object.fromEntries(fields.map(f=>[f,'']));
    const change=row.personId===tenant.id?cleared:{memberProfiles:roomMembers(tenant).map(m=>m.id===row.personId?{...m,...cleared}:m)};
    store.put('tenants',{...tenant,...change});
  }
  return finish(store,user,row,fields.length===row.fields.length?'complete':fields.length?'partial':'retained',{decisions,deletedFields:fields});
}
