import {invoiceLines} from '../shared/invoice-lines.mjs';
import {contractSnapshot,fail,getRecord} from './domain.mjs';

const vnd=value=>Number(value||0).toLocaleString('vi-VN')+' ₫';
export function contractDocument(store,user,key,requestedVersion){
  const contract=getRecord(store,user,'contracts',key);
  if(user.role==='tenant'&&contract.status==='draft')fail(404,'Không tìm thấy hợp đồng đã phát hành.');
  const version=requestedVersion===null?(contract.version||1):Number(requestedVersion);
  const current=contractSnapshot(store,contract);
  const historical=(contract.versions||[]).find(row=>row.version===version);
  if(version!==current.version&&!historical)fail(404,'Không tìm thấy phiên bản hợp đồng.');
  const row=historical?{...current,...historical}:current;
  const title='Hợp đồng thuê phòng';
  const content=[{text:title,fontSize:20,bold:true,color:'#233e72',margin:[0,0,0,15]},
    'Mã hợp đồng: '+key+' · Phiên bản '+version,
    'Cơ sở: '+(row.propertyName||'')+' · Phòng '+(row.roomCode||''),
    'Địa chỉ: '+(row.address||''),'Người thuê: '+(row.tenantName||''),
    ...(row.addenda?.length?['Phụ lục có hiệu lực từ '+row.addenda.at(-1).effectiveDate]:[]),
    'Thời hạn: '+row.startDate+' — '+row.endDate,'Tiền thuê mỗi tháng: '+vnd(row.rent),'Tiền cọc thỏa thuận: '+vnd(row.deposit),
    {text:'Điều khoản hợp đồng',bold:true,margin:[0,14,0,4]},row.terms||'',
    {text:row.acceptedAt?'Đã xác nhận qua tài khoản ngày '+new Date(row.acceptedAt).toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa xác nhận đã đọc',margin:[0,14,0,0]}];
  return {definition:{info:{title},pageSize:"A4",pageMargins:48,defaultStyle:{font:"Roboto",fontSize:11,lineHeight:1.35},content},version};
}

export function receiptDocument(store,user,id){
  const row=getRecord(store,user,'payments',id);
  if((row.kind||'receipt')!=='receipt'||['pending','rejected'].includes(row.status))fail(404,'Chưa có biên nhận thực thu.');
  const invoice=getRecord(store,user,'invoices',row.invoiceId);
  const title='Biên nhận thanh toán',version=1+(row.corrections?.length||0);
  const content=[{text:title,fontSize:20,bold:true},'Mã biên nhận: '+row.id+' · Phiên bản '+version,
    'Hóa đơn: '+invoice.id+' · Kỳ '+invoice.period,
    'Cơ sở: '+(store.get('properties',row.propertyId)?.name||'')+' · Phòng '+(store.get('rooms',row.roomId)?.code||''),
    'Người nộp: '+(store.get('tenants',row.tenantId)?.name||''),'Ngày thực nhận: '+row.date,
    'Hình thức: '+(row.method==='cash'?'Tiền mặt':'Chuyển khoản'),
    {text:'Số tiền thực nhận: '+vnd(row.amount),bold:true},'Phân bổ hóa đơn: '+vnd(row.appliedAmount??row.amount),
    'Tiền trả dư: '+vnd(row.creditAmount)];
  return {definition:{info:{title},pageSize:'A4',pageMargins:48,defaultStyle:{font:'Roboto',fontSize:11,lineHeight:1.35},content},version};
}

export function invoiceDocument(store,user,id){
  const row=getRecord(store,user,'invoices',id);
  const room=store.get('rooms',row.roomId),property=store.get('properties',row.propertyId),tenant=store.get('tenants',row.tenantId);
  const title='Hóa đơn tiền thuê',version=row.version||1;
  const body=[[{text:'Khoản tính',bold:true},'Số lượng','Đơn giá','Thành tiền']];
  for(const item of invoiceLines(row)){
    const label=[item.name,item.formula,item.notes].filter(Boolean).join('\n');
    body.push([label,String(item.quantity??1),vnd(item.rate),vnd(item.amount??(item.quantity??1)*(item.rate||0))]);
  }
  const content=[{text:title,fontSize:20,bold:true},row.id+' · Phiên bản '+version,
    'Cơ sở: '+(property?.name||'')+' · Phòng '+(room?.code||''),
    'Người thuê: '+(tenant?.name||''),'Kỳ: '+row.period+' · Hạn thanh toán: '+row.dueDate,
    'Trạng thái: '+({draft:'Bản nháp',issued:'Đã phát hành',cancelled:'Đã hủy'}[row.status]||row.status),
    {table:{headerRows:1,widths:['*','auto','auto','auto'],body},layout:'lightHorizontalLines',margin:[0,12,0,8]},
    {text:'Tổng cộng: '+vnd(row.total),bold:true},'Đã thanh toán: '+vnd(row.paid),'Còn phải trả: '+vnd(row.status==='cancelled'?0:Math.max(0,row.total-(row.paid||0)))];
  if(row.note)content.push(row.note);
  for(const change of row.adjustmentHistory||[])content.push('Điều chỉnh phiên bản '+change.version+': '+change.reason+' ('+vnd(change.oldTotal)+' → '+vnd(change.newTotal)+')');
  return {definition:{info:{title},pageSize:"A4",pageMargins:48,defaultStyle:{font:"Roboto",fontSize:11,lineHeight:1.35},content},version};
}
