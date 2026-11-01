import {COLLECTIONS,id,now,today} from './db.mjs';
import {tenantMeterReceipt,ownerMeterSubmission} from './meter-visibility.mjs';

export class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
export const fail=(status,message)=>{throw new HttpError(status,message);};
const must=(condition,message,status=400)=>{if(!condition)fail(status,message);};
const fields={
  properties:'name address contact phone floors rules archived',
  rooms:'propertyId code floor area capacity price status amenities description imageFileId imageFileIds',
  tenants:'propertyId roomId name email phone identityNumber moveInDate moveOutDate status members',
  contracts:'propertyId roomId tenantId startDate endDate rent deposit terms status version',
  readings:'propertyId roomId period electricOld electricNew waterOld waterNew confirmed photoFileId electricPhotoFileId waterPhotoFileId',
  services:'propertyId name rate unit active',
  invoices:'propertyId roomId tenantId period dueDate rent electricOld electricNew waterOld waterNew electricRate waterRate serviceFee serviceItems adjustment note status',
  transactions:'propertyId type category amount date description roomId',
  issues:'propertyId roomId tenantId title category priority description estimatedDate photoFileId assetId',
  assets:'propertyId roomId name code status purchaseDate warrantyDate price note imageFileId',
  handovers:'propertyId roomId tenantId contractId type date electricReading waterReading condition assets note photoFileId',
  notifications:'propertyId roomId roomIds tenantId title body kind',
  tickets:'propertyId roomId tenantId title category body fileId',
  documents:'propertyId roomId tenantId name category version content fileId visibility isTemplate',
  vehicles:'propertyId roomId tenantId plate type parkingSpot fee status',
  amenities:'propertyId name description capacity active',
  bookings:'propertyId amenityId tenantId date startTime endTime',
  settings:'propertyId electricRate waterRate billingDay bankName bankAccount bankOwner bankBin invoiceNote notificationDays anomalyThreshold'
};
const required={properties:'name address',rooms:'propertyId code area capacity price',tenants:'propertyId name',contracts:'propertyId roomId tenantId startDate endDate rent deposit',readings:'propertyId roomId period electricOld electricNew waterOld waterNew',services:'propertyId name rate unit',invoices:'roomId period',transactions:'propertyId type category amount date',issues:'roomId title category description',assets:'propertyId roomId name code',handovers:'roomId tenantId contractId type date condition',notifications:'propertyId title body',tickets:'roomId title body',documents:'propertyId name category visibility',vehicles:'roomId tenantId plate type',amenities:'propertyId name capacity',bookings:'amenityId date startTime endTime',settings:'propertyId electricRate waterRate billingDay'};
const defaults={properties:{floors:1,rules:'',archived:false},rooms:{floor:1,status:'vacant',amenities:'',description:''},tenants:{status:'active',members:''},contracts:{status:'draft',version:1,terms:''},readings:{confirmed:false},services:{active:true,unit:'room'},invoices:{status:'draft',adjustment:0,serviceFee:0,note:''},transactions:{type:'expense',description:''},issues:{status:'new',priority:'normal',cost:0},assets:{status:'good',price:0,note:''},handovers:{status:'draft',electricReading:0,waterReading:0,assets:'',note:''},notifications:{kind:'general',readBy:[]},tickets:{status:'open',messages:[],category:'Khác'},documents:{version:1,visibility:'landlord',content:''},vehicles:{status:'active',fee:0,parkingSpot:''},amenities:{active:true,capacity:1},bookings:{status:'confirmed'},settings:{electricRate:3500,waterRate:15000,billingDay:5,notificationDays:3,anomalyThreshold:50,bankName:'',bankAccount:'',bankOwner:'',bankBin:'',invoiceNote:''}};
const numeric=new Set('floor floors area capacity price rent deposit electricOld electricNew waterOld waterNew rate amount cost electricReading waterReading fee version electricRate waterRate billingDay notificationDays anomalyThreshold serviceFee adjustment'.split(' '));
const booleans=new Set(['active','archived','confirmed','isTemplate']);
const enumFields={
  rooms:{status:['vacant','occupied','maintenance','handover','archived']},tenants:{status:['active','left']},contracts:{status:['draft','active','ended']},services:{unit:['room','person','usage']},invoices:{status:['draft','issued','cancelled']},transactions:{type:['income','expense']},issues:{priority:['low','normal','urgent']},assets:{status:['good','repair','broken','retired']},handovers:{type:['move_in','move_out']},notifications:{kind:['general','invoice','contract','maintenance']},documents:{category:['contract','receipt','rules','other'],visibility:['all','tenant','landlord']},vehicles:{status:['active','inactive']}
};
const tenantCreate=new Set(['issues','tickets','vehicles','bookings']);
const tenantUpdate=new Set(['vehicles']);
const immutable=new Set(['payments','credits','deposits','audits','meterSubmissions','meterProfiles']);
export function creditAccounts(store,owner){
  const payments=store.list('payments',owner),accounts=[];
  for(const receipt of payments){
    if((receipt.kind||'receipt')!=='receipt'||!(receipt.creditAmount>0))continue;
    const balance=receipt.creditAmount+payments.filter(entry=>entry.creditSourceId===receipt.id).reduce((sum,entry)=>sum+(entry.creditAmount||0),0);
    accounts.push({id:receipt.id,ownerId:receipt.ownerId,propertyId:receipt.propertyId,roomId:receipt.roomId,tenantId:receipt.tenantId,invoiceId:receipt.invoiceId,amount:receipt.creditAmount,balance,createdAt:receipt.createdAt,date:receipt.date});
  }
  return accounts;
}
const appliedAmount=payment=>payment.appliedAmount??((payment.kind||'receipt')==='receipt'?payment.amount:0);
function invoiceInput(existing,input){
  const merged={...existing,...input};
  if(Object.hasOwn(input,'serviceFee')&&!Object.hasOwn(input,'serviceItems'))delete merged.serviceItems;
  return merged;
}
function checkPaymentIdentity(store,invoice){
  const allocated=store.list('payments',invoice.ownerId).filter(payment=>payment.invoiceId===invoice.id).reduce((sum,payment)=>sum+appliedAmount(payment),0);
  must(Number.isSafeInteger(invoice.paid)&&invoice.paid>=0&&invoice.paid<=invoice.total&&allocated===invoice.paid,'Sổ thanh toán và hóa đơn không khớp. Vui lòng kiểm tra dữ liệu trước khi tiếp tục.',409);
}
function assertCredits(store,owner){
  must(creditAccounts(store,owner).every(credit=>Number.isSafeInteger(credit.balance)&&credit.balance>=0&&credit.balance<=credit.amount),'Sổ tiền trả dư không hợp lệ.',409);
}
export function ownerId(user){return user.role==='landlord'?user.id:user.landlord_id;}
export function tenantFor(store,user){return user.tenant_id?store.get('tenants',user.tenant_id):null;}
export function visible(store,user,collection,row){
  if(!row||row.ownerId!==ownerId(user))return false;
  if(collection==='notifications'){
    if(row.recipientUserId&&row.recipientUserId!==user.id)return false;
    const key=({invoice:'invoices',contract:'contracts'})[row.kind]||row.kind||'general';
    if(JSON.parse(user.notification_preferences||'{}')[key]===false&&row.createdBy!==user.id)return false;
  }
  if(user.role==='landlord')return true;
  const tenant=tenantFor(store,user);if(!tenant)return false;
  const property=row.propertyId===tenant.propertyId,own=row.tenantId===tenant.id,room=row.roomId===tenant.roomId;
  const contracts=store.list('contracts',ownerId(user)).filter(contract=>contract.tenantId===tenant.id);
  const current=tenant.status==='active'&&contracts.some(contract=>contract.roomId===tenant.roomId&&(contract.status==='active'||contract.status==='ended'&&store.get('rooms',tenant.roomId)?.status==='handover'));
  switch(collection){
    case 'properties':return current&&row.id===tenant.propertyId;
    case 'rooms':return current&&row.id===tenant.roomId;
    case 'tenants':return row.id===tenant.id;
    case 'invoices':return own&&row.status!=='draft';
    case 'readings':return row.confirmed===true&&property&&contracts.some(contract=>{const end=[contract.endDate,contract.endedAt?.slice(0,10),tenant.moveOutDate].filter(Boolean).sort()[0];return contract.roomId===row.roomId&&row.period>=contract.startDate.slice(0,7)&&row.period<=end.slice(0,7);});
    case 'meterSubmissions':return own;
    case 'meterProfiles':return false;
    case 'assets':return current&&property&&room;
    case 'services':case 'amenities':case 'settings':return current&&property;
    case 'notifications':return property&&(own||current&&!row.tenantId&&(row.roomIds?.length?row.roomIds.includes(tenant.roomId):!row.roomId||room));
    case 'documents':return property&&row.visibility!=='landlord'&&(own||current&&!row.tenantId&&(!row.roomId||room));
    case 'transactions':case 'audits':return false;
    default:return own;
  }
}
export function dataFor(store,user){
  const credits=creditAccounts(store,ownerId(user));
  return Object.fromEntries(COLLECTIONS.map(collection=>[collection,(collection==='credits'?credits:store.list(collection,ownerId(user))).filter(row=>visible(store,user,collection,row)).map(row=>{
    const result={...row};delete result.ownerId;
    if(collection==='tenants'){
      result.creditBalance=credits.filter(credit=>credit.tenantId===row.id).reduce((sum,credit)=>sum+credit.balance,0);
      if(user.role==='tenant'){delete result.inviteCode;delete result.inviteExpiresAt;result.identityNumber=result.identityNumber?`••••${result.identityNumber.slice(-4)}`:'';}
      else if(result.identityNumber)result.identityNumber=`••••${result.identityNumber.slice(-4)}`;
    }
    if(user.role==='tenant'&&collection==='notifications')result.readBy=(result.readBy||[]).filter(value=>value===user.id);
    if(user.role==='tenant'&&collection==='documents')delete result.versions;
    if(collection==='meterSubmissions')return user.role==='tenant'?tenantMeterReceipt(row):ownerMeterSubmission(row);
    return result;
  })]));
}
export function getRecord(store,user,collection,key){const row=store.get(collection,key);must(visible(store,user,collection,row),'Không tìm thấy dữ liệu hoặc bạn không có quyền truy cập.',404);return row;}
export function audit(store,user,action,collection,row,detail=''){
  store.put('audits',{id:id('audit'),ownerId:ownerId(user),propertyId:row?.propertyId||(collection==='properties'?row?.id:undefined),actorId:user.id,actorName:user.name,action,collection,recordId:row?.id,detail});
}
function reference(store,user,collection,key){must(typeof key==='string'&&key,'Thiếu dữ liệu liên kết.');const row=store.get(collection,key);must(row&&row.ownerId===ownerId(user),'Dữ liệu liên kết không hợp lệ hoặc không thuộc quyền quản lý.',403);return row;}
function number(value,label,{min=0,integer=true}={}){const n=Number(value);must(value!==''&&value!==null&&value!==undefined&&Number.isFinite(n)&&(!integer||Number.isSafeInteger(n))&&n>=min&&n<=1e12,`${label} phải là ${integer?'số nguyên':'số'} hợp lệ${min>=0?' không âm':''}.`);return n;}
function date(value,label){must(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value,`${label} không hợp lệ.`);return value;}
function period(value){must(typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value),'Kỳ hóa đơn phải có định dạng YYYY-MM.');return value;}
function text(value,label,min=1,max=1000){must(typeof value==='string'&&value.trim().length>=min&&value.trim().length<=max,`${label} cần từ ${min} đến ${max} ký tự.`);return value.trim();}
function checkFile(store,user,key,scope={}){
  if(!key)return;const row=store.db.prepare('SELECT * FROM files WHERE id=?').get(key);
  must(row&&row.owner_id===ownerId(user)&&(user.role==='landlord'||row.uploader_id===user.id),'Tệp đính kèm không hợp lệ hoặc không thuộc quyền của bạn.',403);
  if(row.property_id&&scope.propertyId)must(row.property_id===scope.propertyId,'Tệp đính kèm thuộc cơ sở khác.',403);
  if(row.tenant_id)must(row.tenant_id===scope.tenantId,'Tệp đính kèm riêng không thể chia sẻ sang hồ sơ khác.',403);
}
function normalize(store,user,collection,input,existing){
  must(fields[collection],'Không thể thay đổi trực tiếp loại dữ liệu này.',403);
  let row={...(existing||defaults[collection]||{})};
  for(const key of fields[collection].split(' '))if(Object.hasOwn(input,key)){
    if(key==='serviceItems'){must(Array.isArray(input[key])&&input[key].length<=100,'Danh sách dịch vụ không hợp lệ.');row[key]=structuredClone(input[key]);}
    else if(key==='imageFileIds'){must(Array.isArray(input[key])&&input[key].length<=6&&input[key].every(value=>typeof value==='string'),'Thư viện phòng tối đa 6 ảnh.');row[key]=[...new Set(input[key])];row.imageFileId=row[key][0]||'';}
    else if(key==='roomIds'){must(Array.isArray(input[key])&&input[key].length<=200&&input[key].every(value=>typeof value==='string'),'Danh sách phòng nhận thông báo không hợp lệ.');row[key]=[...new Set(input[key])];}
    else if(numeric.has(key))row[key]=number(input[key],key,{min:key==='adjustment'?-1e12:0,integer:key!=='area'});
    else if(booleans.has(key))row[key]=input[key]===true||input[key]==='true'||input[key]===1;
    else {must(typeof input[key]==='string'||input[key]===null,`Trường ${key} phải là văn bản.`);row[key]=input[key]===null?'':input[key].trim();must(row[key].length<=20000,`Trường ${key} quá dài.`);}
  }
  row.id=existing?.id||id(collection.slice(0,3));row.ownerId=ownerId(user);
  if(user.role==='tenant'){
    const tenant=tenantFor(store,user);must(tenant&&tenant.status==='active','Tài khoản chưa được liên kết với lượt thuê đang hoạt động.',403);
    row.propertyId=tenant.propertyId;row.roomId=tenant.roomId;row.tenantId=tenant.id;
    if(collection==='vehicles'){row.fee=existing?.fee||0;row.parkingSpot=existing?.parkingSpot||'';}
  }
  for(const key of (required[collection]||'').split(' ').filter(Boolean))must(row[key]!==undefined&&row[key]!==null&&row[key]!=='',`Vui lòng nhập ${key}.`);
  if(collection!=='properties'){
    if(row.roomId){const room=reference(store,user,'rooms',row.roomId);must(!row.propertyId||room.propertyId===row.propertyId,'Phòng không thuộc cơ sở đã chọn.');row.propertyId=room.propertyId;}
    if(row.tenantId){const tenant=reference(store,user,'tenants',row.tenantId);must(!row.propertyId||tenant.propertyId===row.propertyId,'Người thuê không thuộc cơ sở đã chọn.');if(row.roomId&&collection!=='contracts')must(tenant.roomId===row.roomId||existing?.roomId===row.roomId,'Người thuê không thuộc phòng đã chọn.');row.propertyId=tenant.propertyId;}
    if(row.propertyId){const property=reference(store,user,'properties',row.propertyId);must(!property.archived||existing,'Cơ sở đã lưu trữ không nhận dữ liệu mới.');}
    if(row.roomIds?.length)for(const roomId of row.roomIds){const room=reference(store,user,'rooms',roomId);must(room.propertyId===row.propertyId,'Các phòng nhận thông báo phải thuộc cùng cơ sở.');if(row.tenantId)must(reference(store,user,'tenants',row.tenantId).roomId===roomId||row.roomIds.includes(reference(store,user,'tenants',row.tenantId).roomId),'Người thuê không thuộc phạm vi thông báo.');}
  }
  for(const [key,values]of Object.entries(enumFields[collection]||{}))must(values.includes(row[key]),`Giá trị ${key} không hợp lệ.`);
  for(const key of ['startDate','endDate','moveInDate','moveOutDate','dueDate','date','purchaseDate','warrantyDate','estimatedDate'])if(row[key])date(row[key],key);
  if(row.period)period(row.period);
  for(const key of ['fileId','photoFileId','imageFileId','electricPhotoFileId','waterPhotoFileId'])checkFile(store,user,row[key],row);
  for(const key of ['electricPhotoFileId','waterPhotoFileId'])if(row[key])must(store.db.prepare('SELECT type FROM files WHERE id=?').get(row[key])?.type.startsWith('image/'),'Minh chứng công tơ phải là tệp ảnh.');
  for(const fileId of row.imageFileIds||[]){checkFile(store,user,fileId,row);must(store.db.prepare('SELECT type FROM files WHERE id=?').get(fileId)?.type.startsWith('image/'),'Thư viện phòng chỉ nhận tệp ảnh.');}
  switch(collection){
    case 'properties':text(row.name,'Tên cơ sở',2,150);text(row.address,'Địa chỉ',3,500);break;
    case 'rooms':{
      must(/^[\p{L}\p{N}_-]{1,20}$/u.test(row.code),'Mã phòng gồm 1–20 chữ, số, dấu gạch, không có khoảng trắng.');must(row.area>0&&row.capacity>=1&&row.capacity<=30,'Diện tích phải lớn hơn 0; sức chứa từ 1 đến 30.');
      const duplicate=store.list('rooms',row.ownerId).find(r=>r.propertyId===row.propertyId&&r.code.toLowerCase()===row.code.toLowerCase()&&r.id!==row.id);must(!duplicate,'Mã phòng đã tồn tại trong cơ sở này.',409);
      if(existing){must(existing.propertyId===row.propertyId,'Không thể chuyển phòng sang cơ sở khác.');if(['occupied','handover'].includes(existing.status))must(row.status===existing.status,'Hãy hoàn tất hợp đồng và bàn giao trước khi thay đổi trạng thái phòng.');else must(['vacant','maintenance','archived'].includes(row.status),'Trạng thái đang thuê được cập nhật từ hợp đồng.');}
      else must(['vacant','maintenance'].includes(row.status),'Phòng mới chỉ có thể ở trạng thái trống hoặc bảo trì.');break;
    }
    case 'tenants':{
      text(row.name,'Tên người thuê',2,150);if(row.email)must(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email),'Email không hợp lệ.');
      if(existing&&existing.roomId!==row.roomId)must(!store.list('contracts',row.ownerId).some(c=>c.tenantId===row.id&&c.status==='active'),'Người thuê đang có hợp đồng; cần kết thúc lượt thuê trước khi chuyển phòng.');
      if(existing&&row.status==='left'&&existing.status!=='left')must(!store.list('contracts',row.ownerId).some(c=>c.tenantId===row.id&&c.status==='active')&&store.get('rooms',existing.roomId)?.status!=='handover','Hãy hoàn tất hợp đồng, quyết toán và bàn giao trước khi đánh dấu đã chuyển đi.');
      if(row.identityNumber?.startsWith('••••'))row.identityNumber=existing?.identityNumber||'';break;
    }
    case 'contracts':
      must(row.startDate<=row.endDate,'Ngày kết thúc phải sau ngày bắt đầu.');
      if(existing)must(row.status===existing.status,'Dùng thao tác hợp đồng để thay đổi trạng thái.');else must(row.status==='draft','Hợp đồng mới phải ở trạng thái nháp.');
      if(existing?.status==='active')must(['roomId','tenantId','startDate','endDate','rent','deposit'].every(key=>row[key]===existing[key]),'Hợp đồng đang hiệu lực chỉ thay đổi qua gia hạn hoặc kết thúc hợp đồng.');
      break;
    case 'readings':{
      must(row.electricNew>=row.electricOld&&row.waterNew>=row.waterOld,'Chỉ số mới không được nhỏ hơn chỉ số cũ.');
      if(existing)must(!store.list('invoices',row.ownerId).some(i=>i.roomId===row.roomId&&i.period===row.period&&i.status==='issued'),'Chỉ số đã dùng trong hóa đơn phát hành; hãy hủy hóa đơn theo quy trình điều chỉnh trước.',409);
      const previous=store.list('readings',row.ownerId).filter(r=>r.roomId===row.roomId&&r.period<row.period&&r.confirmed).sort((a,b)=>b.period.localeCompare(a.period))[0];
      if(previous)must(row.electricOld===previous.electricNew&&row.waterOld===previous.waterNew,'Chỉ số cũ phải khớp chỉ số chốt kỳ trước.');
      must(!store.list('readings',row.ownerId).some(r=>r.id!==row.id&&r.roomId===row.roomId&&r.period===row.period),'Phòng đã có chỉ số trong kỳ này.',409);break;
    }
    case 'invoices':must(!existing||existing.status==='draft','Hóa đơn đã phát hành không thể sửa trực tiếp.');must(row.status==='draft','Dùng thao tác phát hành/hủy hóa đơn.');break;
    case 'transactions':must(!existing?.source,'Bản ghi tự động từ nghiệp vụ không thể sửa trực tiếp.');must(row.amount>0,'Số tiền phải lớn hơn 0.');break;
    case 'issues':text(row.title,'Tiêu đề',3,150);text(row.description,'Mô tả sự cố',10,5000);must(!existing||existing.status==='new','Yêu cầu đang xử lý cần cập nhật bằng luồng trạng thái.');if(row.assetId){const asset=reference(store,user,'assets',row.assetId);must(asset.roomId===row.roomId,'Thiết bị không thuộc phòng báo sự cố.');}break;
    case 'assets':must(!store.list('assets',row.ownerId).some(a=>a.id!==row.id&&a.propertyId===row.propertyId&&a.code.toLowerCase()===row.code.toLowerCase()),'Mã tài sản đã tồn tại.',409);break;
    case 'handovers':{
      const contract=reference(store,user,'contracts',row.contractId);must(contract.roomId===row.roomId&&contract.tenantId===row.tenantId,'Hợp đồng không khớp phòng/người thuê.');must(!existing||existing.status==='draft','Biên bản đã xác nhận không thể sửa.');break;
    }
    case 'documents':
      if(row.visibility==='tenant')must(row.tenantId||row.roomId,'Tài liệu riêng cần chọn phòng hoặc người thuê.');
      if(existing){row.version=(existing.version||1)+1;row.versions=[...(existing.versions||[]),{version:existing.version,content:existing.content,fileId:existing.fileId,isTemplate:existing.isTemplate,updatedAt:existing.updatedAt}];}break;
    case 'vehicles':must(!store.list('vehicles',row.ownerId).some(v=>v.id!==row.id&&v.status==='active'&&row.status==='active'&&v.propertyId===row.propertyId&&v.plate.replaceAll(/\W/g,'').toLowerCase()===row.plate.replaceAll(/\W/g,'').toLowerCase()),'Biển số xe đã được đăng ký tại cơ sở.',409);break;
    case 'amenities':must(row.capacity>=1&&row.capacity<=100,'Sức chứa tiện ích từ 1 đến 100.');break;
    case 'bookings':{
      const amenity=reference(store,user,'amenities',row.amenityId);must(amenity.active,'Tiện ích tạm ngừng nhận đăng ký.');must(!row.propertyId||row.propertyId===amenity.propertyId,'Tiện ích không thuộc cơ sở.');row.propertyId=amenity.propertyId;
      if(user.role==='landlord')must(row.tenantId,'Vui lòng chọn người thuê đăng ký tiện ích.');
      must(/^([01]\d|2[0-3]):[0-5]\d$/.test(row.startTime)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(row.endTime)&&row.startTime<row.endTime,'Khoảng thời gian đăng ký không hợp lệ.');
      const overlap=store.list('bookings',row.ownerId).filter(b=>b.id!==row.id&&b.amenityId===row.amenityId&&b.date===row.date&&b.status==='confirmed'&&b.startTime<row.endTime&&b.endTime>row.startTime);
      must(overlap.length<amenity.capacity,'Tiện ích đã đủ lượt đăng ký trong thời gian này.',409);break;
    }
    case 'settings':must(row.billingDay>=1&&row.billingDay<=28,'Ngày thu tiền từ 1 đến 28.');must(row.notificationDays<=30,'Số ngày nhắc trước tối đa 30.');break;
  }
  return row;
}
export function createRecord(store,user,collection,input){
  must(COLLECTIONS.includes(collection),'Không tìm thấy loại dữ liệu.',404);
  must(!immutable.has(collection),'Dùng thao tác nghiệp vụ để tạo bản ghi này.',403);
  must(user.role==='landlord'||tenantCreate.has(collection),'Bạn không có quyền tạo dữ liệu này.',403);
  const row=normalize(store,user,collection,input);
  if(collection==='tickets')row.messages=[{id:id('msg'),authorId:user.id,authorName:user.name,body:row.body,createdAt:now(),...(row.fileId?{fileId:row.fileId}:{})}];
  if(collection==='notifications')row.createdBy=user.id;
  if(collection==='invoices')Object.assign(row,calculateInvoice(store,user,input),{status:'draft',paid:0,version:1});
  const saved=store.put(collection,row);audit(store,user,'create',collection,saved);
  if(collection==='properties')store.put('settings',{id:id('set'),ownerId:user.id,propertyId:saved.id,...defaults.settings});
  return saved;
}
export function updateRecord(store,user,collection,key,input){
  const existing=getRecord(store,user,collection,key);
  must(!immutable.has(collection),'Không thể sửa bản ghi nghiệp vụ đã ghi nhận.',403);
  must(user.role==='landlord'||tenantUpdate.has(collection),'Bạn không có quyền chỉnh sửa dữ liệu này.',403);
  const row=normalize(store,user,collection,input,existing);
  if(collection==='invoices')Object.assign(row,calculateInvoice(store,user,invoiceInput(existing,input)),{status:'draft',paid:0});
  if(collection==='properties'&&row.archived&&!existing.archived)must(!store.list('contracts',user.id).some(c=>c.propertyId===key&&c.status==='active'),'Cần kết thúc các hợp đồng trước khi lưu trữ cơ sở.');
  const saved=store.put(collection,row);audit(store,user,'update',collection,saved);return saved;
}
export function deleteRecord(store,user,collection,key){
  const row=getRecord(store,user,collection,key);must(user.role==='landlord'||collection==='vehicles','Bạn không có quyền xóa dữ liệu này.',403);
  must(!['contracts','invoices','payments','deposits','readings','meterSubmissions','meterProfiles','audits','settings','handovers'].includes(collection),'Bản ghi có lịch sử nghiệp vụ cần được giữ lại.',403);
  must(!row.source,'Bản ghi tự động không thể xóa trực tiếp.',403);
  if(collection==='properties'){
    must(!store.list('rooms',user.id).some(r=>r.propertyId===key),'Cơ sở có phòng; hãy dùng thao tác lưu trữ.');
    const linked=COLLECTIONS.filter(name=>!['properties','settings','audits'].includes(name)).some(name=>store.list(name,user.id).some(record=>record.propertyId===key));
    const file=store.db.prepare('SELECT 1 FROM files WHERE owner_id=? AND property_id=? LIMIT 1').get(user.id,key);
    must(!linked&&!file,'Cơ sở có dữ liệu hoặc lịch sử liên quan; hãy dùng thao tác lưu trữ.');
    // A new empty property creates only settings and audit metadata. Remove its
    // configuration with the property, while retaining the audit trail.
    for(const setting of store.list('settings',user.id).filter(record=>record.propertyId===key))store.remove('settings',setting.id);
  }
  if(collection==='rooms'){must(!store.list('contracts',user.id).some(r=>r.roomId===key),'Phòng có lịch sử hợp đồng; hãy chuyển sang ngừng sử dụng.');}
  if(collection==='tenants'){must(!row.userId&&!store.list('contracts',user.id).some(r=>r.tenantId===key),'Người thuê có tài khoản/hợp đồng; hãy giữ hồ sơ và cập nhật trạng thái.');}
  if(collection==='amenities')must(!store.list('bookings',ownerId(user)).some(b=>b.amenityId===key&&b.status==='confirmed'),'Tiện ích đang có lịch đăng ký; hãy tạm ngừng sử dụng.');
  store.remove(collection,key);audit(store,user,'delete',collection,row);return {ok:true};
}
function notify(store,user,row,title,body,kind='general'){
  return store.put('notifications',{id:id('not'),ownerId:ownerId(user),propertyId:row.propertyId,roomId:row.roomId,tenantId:row.tenantId,title,body,kind,readBy:[]});
}
function heldDeposit(store,user,contractId){return store.list('deposits',ownerId(user)).filter(d=>d.contractId===contractId).reduce((sum,d)=>sum+(d.type==='receipt'?d.amount:-d.amount),0);}
function outstanding(store,user,contract){return store.list('invoices',ownerId(user)).filter(i=>i.status==='issued'&&i.roomId===contract.roomId&&i.tenantId===contract.tenantId).reduce((sum,i)=>sum+Math.max(0,i.total-i.paid),0);}
function completeCheckout(store,user,contract){
  must(!store.list('contracts',ownerId(user)).some(other=>other.id!==contract.id&&other.roomId===contract.roomId&&other.status==='active'),'Phòng đã có lượt thuê khác; không thể hoàn tất lại biên bản cũ.',409);
  must(outstanding(store,user,contract)===0,'Còn hóa đơn chưa thu đủ; cần quyết toán công nợ trước khi kết thúc.');
  must(heldDeposit(store,user,contract.id)===0,'Cần ghi nhận hoàn/khấu trừ hết tiền cọc trước khi kết thúc.');
  must(creditAccounts(store,ownerId(user)).filter(credit=>credit.tenantId===contract.tenantId).reduce((sum,credit)=>sum+credit.balance,0)===0,'Cần hoàn hoặc phân bổ hết tiền trả dư của người thuê trước khi hoàn tất bàn giao.');
  const saved=store.put('contracts',{...contract,status:'ended',endedAt:now()});
  const room=reference(store,user,'rooms',contract.roomId);store.put('rooms',{...room,status:'vacant'});
  const tenant=reference(store,user,'tenants',contract.tenantId);store.put('tenants',{...tenant,status:'left',moveOutDate:today()});
  return saved;
}
function endContract(store,user,contract){
  const saved=store.put('contracts',{...contract,status:'ended',endedAt:now()});
  const room=reference(store,user,'rooms',contract.roomId);store.put('rooms',{...room,status:'handover'});
  return saved;
}
function activateContract(store,user,contract){
  must(contract.status==='draft','Chỉ hợp đồng nháp mới có thể kích hoạt.');
  const room=reference(store,user,'rooms',contract.roomId);must(!['maintenance','archived','handover'].includes(room.status),'Phòng đang bảo trì, chờ bàn giao hoặc ngừng sử dụng.');
  const current=store.list('contracts',ownerId(user)).some(c=>c.id!==contract.id&&c.roomId===contract.roomId&&c.status==='active');
  must(!current,'Phòng đã có hợp đồng đang hiệu lực. Hợp đồng tương lai cần giữ nháp đến khi lượt thuê hiện tại hoàn tất bàn giao.',409);
  const tenant=reference(store,user,'tenants',contract.tenantId);
  must(!store.list('contracts',ownerId(user)).some(c=>c.id!==contract.id&&c.tenantId===contract.tenantId&&c.status==='active'),'Người thuê đang có hợp đồng khác.',409);
  store.put('rooms',{...room,status:'occupied'});store.put('tenants',{...tenant,roomId:room.id,status:'active',moveInDate:contract.startDate});
  return store.put('contracts',{...contract,status:'active',activatedAt:now()});
}
function invoiceServices(store,user,input,room,tenant){
  const active=store.list('services',user.id).filter(service=>service.propertyId===room.propertyId&&service.active);
  const occupants=1+(tenant.members||'').split(/[,;\n]/).filter(value=>value.trim()).length;
  let list;
  if(Object.hasOwn(input,'serviceItems')){
    must(Array.isArray(input.serviceItems)&&input.serviceItems.length<=100,'Danh sách dịch vụ không hợp lệ.');list=[...input.serviceItems];
    const included=new Set(list.map(item=>item?.serviceId));
    list.push(...store.list('vehicles',user.id).filter(vehicle=>vehicle.tenantId===tenant.id&&vehicle.roomId===room.id&&vehicle.status==='active'&&vehicle.fee>0&&!included.has('vehicle:'+vehicle.id)).map(vehicle=>({serviceId:'vehicle:'+vehicle.id,name:'Gửi xe '+vehicle.plate,quantity:1,rate:vehicle.fee,unit:'vehicle'})));
  }else if(input.serviceFee!==undefined){
    const rate=number(input.serviceFee,'Phí dịch vụ');list=rate?[{name:'Dịch vụ',quantity:1,rate}]:[];
  }else{
    list=active.map(service=>({serviceId:service.id,name:service.name,quantity:service.unit==='person'?occupants:service.unit==='usage'?0:1,rate:service.rate,unit:service.unit}));
    list.push(...store.list('vehicles',user.id).filter(vehicle=>vehicle.tenantId===tenant.id&&vehicle.roomId===room.id&&vehicle.status==='active'&&vehicle.fee>0).map(vehicle=>({serviceId:'vehicle:'+vehicle.id,name:'Gửi xe '+vehicle.plate,quantity:1,rate:vehicle.fee,unit:'vehicle'})));
  }
  const seen=new Set();
  return list.map(item=>{
    must(item&&typeof item==='object'&&!Array.isArray(item),'Dòng dịch vụ không hợp lệ.');
    const serviceId=typeof item.serviceId==='string'?item.serviceId:'';
    if(serviceId){
      if(serviceId.startsWith('vehicle:')){const vehicle=reference(store,user,'vehicles',serviceId.slice(8));must(vehicle.roomId===room.id&&vehicle.tenantId===tenant.id,'Phương tiện không thuộc lượt thuê tính phí.');}
      else{const service=reference(store,user,'services',serviceId);must(service.propertyId===room.propertyId,'Dịch vụ không thuộc cơ sở.');}
    }
    const name=text(item.name,'Tên dịch vụ',1,200),quantity=number(item.quantity??1,'Số lượng dịch vụ',{integer:false}),rate=number(item.rate,'Đơn giá dịch vụ');
    must(quantity<=1000000,'Số lượng dịch vụ vượt giới hạn.');
    const key=serviceId||name.toLocaleLowerCase('vi');must(!seen.has(key),'Một dịch vụ hoặc phương tiện chỉ được tính một lần trong hóa đơn.');seen.add(key);
    const amount=Math.round(quantity*rate);must(Number.isSafeInteger(amount)&&amount<=1e12,'Thành tiền dịch vụ vượt giới hạn.');
    return {serviceId:serviceId||undefined,name,quantity,rate,amount,unit:typeof item.unit==='string'?item.unit.slice(0,30):undefined};
  });
}
export function calculateInvoice(store,user,input){
  must(user.role==='landlord','Chỉ chủ trọ được lập hóa đơn.',403);
  const room=reference(store,user,'rooms',input.roomId);const billPeriod=period(input.period);
  const monthStart=`${billPeriod}-01`,monthEnd=`${billPeriod}-31`;
  const contract=store.list('contracts',user.id).filter(c=>c.roomId===room.id&&['active','ended'].includes(c.status)&&(!input.contractId||input.contractId===c.id)&&(!input.tenantId||input.tenantId===c.tenantId)&&c.startDate<=monthEnd&&(c.status==='ended'?[c.endDate,c.endedAt?.slice(0,10)].filter(Boolean).sort()[0]:c.endDate)>=monthStart).sort((a,b)=>Number(b.status==='active')-Number(a.status==='active'))[0];
  must(contract,'Phòng chưa có hợp đồng phù hợp với kỳ hóa đơn.');
  const config=store.list('settings',user.id).find(s=>s.propertyId===room.propertyId)||defaults.settings;
  const reading=store.list('readings',user.id).find(r=>r.roomId===room.id&&r.period===billPeriod);
  const previous=store.list('readings',user.id).filter(r=>r.roomId===room.id&&r.period<billPeriod&&r.confirmed).sort((a,b)=>b.period.localeCompare(a.period))[0];
  const tenant=reference(store,user,'tenants',contract.tenantId);
  const serviceItems=invoiceServices(store,user,input,room,tenant);
  const values={roomId:room.id,propertyId:room.propertyId,tenantId:contract.tenantId,contractId:contract.id,period:billPeriod,dueDate:input.dueDate||`${billPeriod}-${String(config.billingDay||5).padStart(2,'0')}`,rent:input.rent??contract.rent,electricOld:input.electricOld??reading?.electricOld??previous?.electricNew??0,electricNew:input.electricNew??reading?.electricNew??previous?.electricNew??0,waterOld:input.waterOld??reading?.waterOld??previous?.waterNew??0,waterNew:input.waterNew??reading?.waterNew??previous?.waterNew??0,electricRate:input.electricRate??config.electricRate,waterRate:input.waterRate??config.waterRate,serviceItems,serviceFee:serviceItems.reduce((sum,item)=>sum+item.amount,0),adjustment:input.adjustment??0,note:typeof input.note==='string'?input.note.slice(0,2000):''};
  date(values.dueDate,'Hạn thanh toán');for(const key of ['rent','electricOld','electricNew','waterOld','waterNew','electricRate','waterRate','serviceFee','adjustment'])values[key]=number(values[key],key,{min:key==='adjustment'?-1e12:0});
  must(values.electricNew>=values.electricOld&&values.waterNew>=values.waterOld,'Chỉ số mới không được nhỏ hơn chỉ số cũ.');
  if(previous)must(values.electricOld===previous.electricNew&&values.waterOld===previous.waterNew,'Chỉ số cũ phải khớp chỉ số chốt kỳ trước.');
  const items=[{name:'Tiền phòng',quantity:1,rate:values.rent,amount:values.rent},{name:'Điện',quantity:values.electricNew-values.electricOld,rate:values.electricRate,amount:(values.electricNew-values.electricOld)*values.electricRate},{name:'Nước',quantity:values.waterNew-values.waterOld,rate:values.waterRate,amount:(values.waterNew-values.waterOld)*values.waterRate},...serviceItems];
  if(values.adjustment)items.push({name:'Điều chỉnh',quantity:1,rate:values.adjustment,amount:values.adjustment});
  const total=items.reduce((sum,item)=>sum+item.amount,0);must(Number.isSafeInteger(total)&&total>=0&&total<=1e12,'Tổng hóa đơn phải là số tiền không âm hợp lệ.');
  return {...values,items,total,paid:0};
}
export function performAction(store,user,name,input){
  const ownerActions=['contract-activate','contract-renew','contract-end','invoice-preview','invoice-draft','invoice-issue','invoice-adjust','invoice-cancel','payment-record','payment-refund','payment-apply-credit','credit-refund','credit-apply','deposit-record','invite-tenant'];
  if(ownerActions.includes(name))must(user.role==='landlord','Chỉ chủ trọ được thực hiện thao tác này.',403);
  let row,saved;
  switch(name){
    case 'contract-activate':row=getRecord(store,user,'contracts',input.id);saved=activateContract(store,user,row);audit(store,user,name,'contracts',saved);return saved;
    case 'contract-renew':{
      row=getRecord(store,user,'contracts',input.id);must(row.status==='active','Chỉ gia hạn hợp đồng đang hiệu lực.');date(input.endDate,'Ngày kết thúc');must(input.endDate>row.endDate,'Ngày gia hạn phải sau ngày kết thúc hiện tại.');
      must(!store.list('contracts',user.id).some(c=>c.id!==row.id&&c.roomId===row.roomId&&c.status==='active'&&c.startDate<=input.endDate&&c.endDate>=row.startDate),'Khoảng gia hạn chồng lấn hợp đồng khác.',409);
      saved=store.put('contracts',{...row,endDate:input.endDate,rent:input.rent===undefined?row.rent:number(input.rent,'Giá thuê'),version:row.version+1,acceptedAt:null,versions:[...(row.versions||[]),{version:row.version,endDate:row.endDate,rent:row.rent,acceptedAt:row.acceptedAt,updatedAt:now()}]});audit(store,user,name,'contracts',saved);notify(store,user,saved,'Hợp đồng đã được gia hạn',`Thời hạn mới đến ${input.endDate}.`,'contract');return saved;
    }
    case 'contract-end':row=getRecord(store,user,'contracts',input.id);must(row.status==='active','Hợp đồng không ở trạng thái đang hiệu lực.');saved=endContract(store,user,row);audit(store,user,name,'contracts',saved);return saved;
    case 'contract-accept':row=getRecord(store,user,'contracts',input.id);must(user.role==='tenant','Người thuê xác nhận đã đọc hợp đồng.',403);must(row.status==='active','Hợp đồng chưa có hiệu lực.');saved=store.put('contracts',{...row,acceptedAt:now()});audit(store,user,name,'contracts',saved,'Xác nhận đã đọc trên web; không thay thế chữ ký số.');return saved;
    case 'invoice-preview':return calculateInvoice(store,user,input);
    case 'invoice-draft':return input.id?updateRecord(store,user,'invoices',input.id,{...input,status:'draft'}):createRecord(store,user,'invoices',{...input,status:'draft'});
    case 'invoice-issue':{
      const draft=input.id?getRecord(store,user,'invoices',input.id):null;if(draft)must(draft.status==='draft','Hóa đơn đã phát hành.');
      const calculated=calculateInvoice(store,user,draft?invoiceInput(draft,input):input);
      must(!store.list('invoices',user.id).some(i=>i.id!==draft?.id&&i.roomId===calculated.roomId&&i.period===calculated.period&&i.status!=='cancelled'),'Phòng đã có hóa đơn trong kỳ này.',409);
      saved=store.put('invoices',{...draft,...calculated,id:draft?.id||id('HD'),ownerId:user.id,status:'issued',issuedAt:now(),paid:0,version:draft?.version||1});
      const existing=store.list('readings',user.id).find(r=>r.roomId===saved.roomId&&r.period===saved.period);
      store.put('readings',{...existing,id:existing?.id||id('read'),ownerId:user.id,propertyId:saved.propertyId,roomId:saved.roomId,period:saved.period,electricOld:saved.electricOld,electricNew:saved.electricNew,waterOld:saved.waterOld,waterNew:saved.waterNew,confirmed:true});
      audit(store,user,name,'invoices',saved);notify(store,user,saved,`Hóa đơn kỳ ${saved.period}`,`Hóa đơn ${saved.id} đã phát hành. Hạn thanh toán ${saved.dueDate}.`,'invoice');return saved;
    }
    case 'invoice-adjust':{
      row=getRecord(store,user,'invoices',input.id);must(row.status==='issued','Chỉ điều chỉnh hóa đơn đã phát hành.');checkPaymentIdentity(store,row);const reason=text(input.reason,'Lý do điều chỉnh',5,2000);
      must(!input.roomId||input.roomId===row.roomId,'Không chuyển hóa đơn sang phòng khác.');must(!input.period||input.period===row.period,'Không chuyển hóa đơn sang kỳ khác.');
      const calculated=calculateInvoice(store,user,invoiceInput(row,input));must(calculated.tenantId===row.tenantId,'Không chuyển hóa đơn sang người thuê khác.');
      must(calculated.total>=row.paid,'Tổng điều chỉnh nhỏ hơn số tiền đã thu. Hãy ghi nhận hoàn tiền hóa đơn trước rồi điều chỉnh.');
      const meterFields=['electricOld','electricNew','waterOld','waterNew'];
      const changedMeter=meterFields.some(key=>calculated[key]!==row[key]);
      if(changedMeter)must(!store.list('readings',user.id).some(reading=>reading.roomId===row.roomId&&reading.period>row.period&&reading.confirmed),'Kỳ sau đã chốt chỉ số; không thể thay đổi chỉ số của kỳ trước. Hãy ghi khoản điều chỉnh bằng tiền.');
      const snapshot=Object.fromEntries(['period','dueDate','rent','electricOld','electricNew','waterOld','waterNew','electricRate','waterRate','serviceItems','serviceFee','adjustment','note','items','total','paid','version'].map(key=>[key,row[key]]));
      const version=(row.version||1)+1;
      saved=store.put('invoices',{...row,...calculated,paid:row.paid,version,adjustedAt:now(),adjustmentReason:reason,versions:[...(row.versions||[]),{...snapshot,version:row.version||1,reason,changedBy:user.name,changedAt:now()}],adjustmentHistory:[...(row.adjustmentHistory||[]),{version,reason,oldTotal:row.total,newTotal:calculated.total,actorId:user.id,actorName:user.name,createdAt:now()}]});
      if(changedMeter){const reading=store.list('readings',user.id).find(item=>item.roomId===row.roomId&&item.period===row.period);if(reading)store.put('readings',{...reading,...Object.fromEntries(meterFields.map(key=>[key,calculated[key]])),confirmed:true});}
      checkPaymentIdentity(store,saved);audit(store,user,name,'invoices',saved,reason);notify(store,user,saved,'Hóa đơn đã được điều chỉnh','Hóa đơn '+saved.id+' phiên bản '+version+'. Lý do: '+reason,'invoice');return saved;
    }
    case 'invoice-cancel':{
      row=getRecord(store,user,'invoices',input.id);must(row.status!=='cancelled','Hóa đơn đã hủy.');must(row.paid===0,'Hóa đơn đã thu tiền không thể hủy.');const reason=text(input.reason,'Lý do hủy',5,1000);saved=store.put('invoices',{...row,status:'cancelled',cancelReason:reason,cancelledAt:now()});audit(store,user,name,'invoices',saved,reason);return saved;
    }
    case 'payment-record':{
      row=getRecord(store,user,'invoices',input.invoiceId);must(row.status==='issued','Chỉ ghi thu hóa đơn đã phát hành.');checkPaymentIdentity(store,row);const amount=number(input.amount,'Số tiền',{min:1});must(['cash','transfer'].includes(input.method),'Phương thức thanh toán không hợp lệ.');date(input.date||today(),'Ngày thu');
      const allocated=Math.min(amount,row.total-row.paid),creditAmount=amount-allocated;
      saved=store.put('payments',{id:id('pay'),ownerId:user.id,propertyId:row.propertyId,roomId:row.roomId,tenantId:row.tenantId,invoiceId:row.id,kind:'receipt',amount,appliedAmount:allocated,creditAmount,method:input.method,date:input.date||today(),note:String(input.note||'').slice(0,2000)});
      const invoice=store.put('invoices',{...row,paid:row.paid+allocated});store.put('transactions',{id:id('txn'),ownerId:user.id,propertyId:row.propertyId,roomId:row.roomId,type:'income',category:creditAmount?'Thu tiền thuê và nhận trước':'Tiền thuê và dịch vụ',amount,date:saved.date,description:`Thu hóa đơn ${row.id}${creditAmount?' (gồm tiền trả dư)':''}`,source:'payment',sourceId:saved.id});checkPaymentIdentity(store,invoice);assertCredits(store,user.id);
      audit(store,user,name,'payments',saved);notify(store,user,row,'Đã ghi nhận thanh toán',`Chủ trọ đã xác nhận nhận ${amount.toLocaleString('vi-VN')}đ cho hóa đơn ${row.id}.`,'invoice');return saved;
    }
    case 'payment-apply-credit':case 'credit-apply':{
      row=getRecord(store,user,'invoices',input.invoiceId);must(row.status==='issued','Chỉ phân bổ vào hóa đơn đã phát hành.');checkPaymentIdentity(store,row);
      const amount=number(input.amount,'Số tiền phân bổ',{min:1});must(amount<=row.total-row.paid,'Số tiền phân bổ vượt số còn phải thu.');
      const source=input.creditId,credits=creditAccounts(store,user.id).filter(credit=>credit.tenantId===row.tenantId&&credit.balance>0&&(!source||credit.id===source));
      must(credits.reduce((sum,credit)=>sum+credit.balance,0)>=amount,'Số dư tiền trả dư không đủ hoặc không thuộc người thuê này.');
      date(input.date||today(),'Ngày phân bổ');let remaining=amount;const entries=[];
      for(const credit of credits){if(!remaining)break;const part=Math.min(remaining,credit.balance);remaining-=part;
        const entry=store.put('payments',{id:id('pay'),ownerId:user.id,propertyId:row.propertyId,roomId:row.roomId,tenantId:row.tenantId,invoiceId:row.id,kind:'credit_apply',creditSourceId:credit.id,amount:part,appliedAmount:part,creditAmount:-part,method:'credit',date:input.date||today(),note:String(input.note||'Phân bổ tiền trả dư').slice(0,2000)});
        entries.push(entry);audit(store,user,name,'payments',entry);
      }
      saved=store.put('invoices',{...row,paid:row.paid+amount});checkPaymentIdentity(store,saved);assertCredits(store,user.id);
      notify(store,user,row,'Đã phân bổ tiền trả dư','Đã dùng '+amount.toLocaleString('vi-VN')+'đ từ số dư trả trước cho hóa đơn '+row.id+'.','invoice');return {invoice:saved,entries,amount};
    }
    case 'payment-refund':case 'credit-refund':{
      const amount=number(input.amount,'Số tiền hoàn',{min:1}),method=input.method||'transfer';must(['cash','transfer'].includes(method),'Phương thức hoàn tiền không hợp lệ.');date(input.date||today(),'Ngày hoàn');const note=text(input.note||input.reason,'Lý do hoàn tiền',3,2000),entries=[];
      if(input.invoiceId){
        row=getRecord(store,user,'invoices',input.invoiceId);must(row.status==='issued','Hóa đơn không ở trạng thái phát hành.');checkPaymentIdentity(store,row);must(amount<=row.paid,'Số tiền hoàn vượt số tiền đã phân bổ vào hóa đơn.');
        const entry=store.put('payments',{id:id('pay'),ownerId:user.id,propertyId:row.propertyId,roomId:row.roomId,tenantId:row.tenantId,invoiceId:row.id,kind:'refund',refundSource:'invoice',amount,appliedAmount:-amount,creditAmount:0,method,date:input.date||today(),note});entries.push(entry);
        saved=store.put('invoices',{...row,paid:row.paid-amount});checkPaymentIdentity(store,saved);
      }else{
        const source=input.creditId||input.id;let credits=creditAccounts(store,user.id).filter(credit=>credit.balance>0&&(!source||credit.id===source)&&(!input.tenantId||credit.tenantId===input.tenantId));
        must(source||input.tenantId,'Chọn số dư hoặc người thuê cần hoàn tiền.');must(credits.reduce((sum,credit)=>sum+credit.balance,0)>=amount,'Số tiền hoàn vượt số dư trả trước của người thuê.');
        let remaining=amount;for(const credit of credits){if(!remaining)break;const part=Math.min(remaining,credit.balance);remaining-=part;
          const entry=store.put('payments',{id:id('pay'),ownerId:user.id,propertyId:credit.propertyId,roomId:credit.roomId,tenantId:credit.tenantId,kind:'refund',refundSource:'credit',creditSourceId:credit.id,amount:part,appliedAmount:0,creditAmount:-part,method,date:input.date||today(),note});entries.push(entry);
        }
      }
      for(const entry of entries){store.put('transactions',{id:id('txn'),ownerId:user.id,propertyId:entry.propertyId,roomId:entry.roomId,type:'expense',category:'Hoàn tiền thanh toán',amount:entry.amount,date:entry.date,description:entry.note,source:'payment_refund',sourceId:entry.id});audit(store,user,name,'payments',entry);}
      assertCredits(store,user.id);return {invoice:saved,entries,amount};
    }
    case 'deposit-record':{
      row=getRecord(store,user,'contracts',input.contractId);must(['receipt','deduction','refund'].includes(input.type),'Loại giao dịch cọc không hợp lệ.');if(input.type==='receipt')must(['active','draft'].includes(row.status),'Lượt thuê đã kết thúc; không nhận thêm cọc.');const amount=number(input.amount,'Số tiền',{min:1});const balance=heldDeposit(store,user,row.id);
      if(input.type!=='receipt')must(amount<=balance,'Số tiền vượt số cọc đang giữ.');else must(balance+amount<=row.deposit,'Tiền cọc nhận vượt tiền cọc trong hợp đồng.');date(input.date||today(),'Ngày giao dịch');if(input.type==='deduction')text(input.note,'Lý do khấu trừ',5,2000);
      saved=store.put('deposits',{id:id('dep'),ownerId:user.id,propertyId:row.propertyId,roomId:row.roomId,tenantId:row.tenantId,contractId:row.id,type:input.type,amount,date:input.date||today(),note:String(input.note||'').slice(0,2000)});
      if(input.type==='deduction')store.put('transactions',{id:id('txn'),ownerId:user.id,propertyId:row.propertyId,roomId:row.roomId,type:'income',category:'Khấu trừ tiền cọc',amount,date:saved.date,description:saved.note,source:'deposit',sourceId:saved.id});
      audit(store,user,name,'deposits',saved);return saved;
    }
    case 'issue-transition':{
      row=getRecord(store,user,'issues',input.id);const allowed=user.role==='landlord'?{new:['progress'],progress:['resolved'],resolved:['progress']}:{resolved:['closed']};must(allowed[row.status]?.includes(input.status),'Không được chuyển sang trạng thái này.',403);
      const extra={};if(input.estimatedDate){date(input.estimatedDate,'Ngày dự kiến sửa');extra.estimatedDate=input.estimatedDate;}if(input.status==='resolved'){extra.resolution=text(input.resolution||'Đã xử lý sự cố.','Kết quả xử lý',3,3000);extra.cost=number(input.cost??row.cost??0,'Chi phí');if(input.resolutionFileId){checkFile(store,user,input.resolutionFileId,row);extra.resolutionFileId=input.resolutionFileId;}}
      if(input.status==='resolved'&&row.expenseId)must(extra.cost===row.cost,'Chi phí sửa chữa đã được ghi sổ và không thể thay đổi. Hãy ghi khoản chi bổ sung riêng trong Sổ thu chi.');
      if(input.status==='closed'){if(input.rating!==undefined)extra.rating=number(input.rating,'Đánh giá',{min:1});must(!extra.rating||extra.rating<=5,'Đánh giá từ 1 đến 5.');}
      saved=store.put('issues',{...row,...extra,status:input.status,history:[...(row.history||[]),{status:input.status,actorId:user.id,at:now(),resolution:extra.resolution}]});
      if(input.status==='resolved'&&extra.cost>0&&!row.expenseId){const transaction=store.put('transactions',{id:id('txn'),ownerId:ownerId(user),propertyId:row.propertyId,roomId:row.roomId,type:'expense',category:'Bảo trì',amount:extra.cost,date:today(),description:`Sửa chữa: ${row.title}`,source:'issue',sourceId:row.id});saved=store.put('issues',{...saved,expenseId:transaction.id});}
      audit(store,user,name,'issues',saved);notify(store,user,saved,'Cập nhật yêu cầu sửa chữa',`Yêu cầu “${row.title}” đã được cập nhật.`,'maintenance');return saved;
    }
    case 'handover-confirm':{
      row=getRecord(store,user,'handovers',input.id);must(!row.completedAt,'Biên bản đã hoàn tất.',409);saved={...row};
      if(user.role==='tenant'){must(!row.tenantAcceptedAt,'Bạn đã xác nhận biên bản này.',409);must(row.status==='confirmed','Chủ trọ cần xác nhận biên bản trước.');saved.tenantAcceptedAt=now();}else{must(row.status==='draft'&&!row.landlordConfirmedAt,'Biên bản đã được chủ trọ xác nhận.');saved.status='confirmed';saved.landlordConfirmedAt=now();}
      if(saved.type==='move_out'&&saved.landlordConfirmedAt&&saved.tenantAcceptedAt){const contract=reference(store,user,'contracts',row.contractId);completeCheckout(store,user,contract);saved.completedAt=now();}
      saved=store.put('handovers',saved);audit(store,user,name,'handovers',saved);return saved;
    }
    case 'notification-read':row=getRecord(store,user,'notifications',input.id);saved=store.put('notifications',{...row,readBy:[...new Set([...(row.readBy||[]),user.id])]});return saved;
    case 'ticket-reply':{
      row=getRecord(store,user,'tickets',input.id);const body=text(input.body,'Nội dung phản hồi',1,5000);checkFile(store,user,input.fileId,row);
      saved=store.put('tickets',{...row,messages:[...(row.messages||[]),{id:id('msg'),authorId:user.id,authorName:user.name,body,createdAt:now(),...(input.fileId?{fileId:input.fileId}:{})}]});audit(store,user,name,'tickets',saved);return saved;
    }
    case 'ticket-transition':row=getRecord(store,user,'tickets',input.id);must(['open','progress','resolved'].includes(input.status),'Trạng thái không hợp lệ.');must(user.role==='landlord'||(row.status==='resolved'&&input.status==='open'),'Bạn chỉ được mở lại yêu cầu đã giải quyết.',403);saved=store.put('tickets',{...row,status:input.status});audit(store,user,name,'tickets',saved);return saved;
    case 'invite-tenant':{
      row=getRecord(store,user,'tenants',input.id);must(!row.userId,'Hồ sơ đã liên kết với tài khoản.');const inviteCode=id('INV').slice(4).toUpperCase();saved=store.put('tenants',{...row,inviteCode,inviteExpiresAt:Date.now()+7*86400000});audit(store,user,name,'tenants',saved);return {inviteCode,expiresAt:saved.inviteExpiresAt};
    }
    case 'booking-cancel':row=getRecord(store,user,'bookings',input.id);must(row.status==='confirmed','Lượt đăng ký đã hủy.');saved=store.put('bookings',{...row,status:'cancelled'});audit(store,user,name,'bookings',saved);return saved;
    default:fail(404,'Không tìm thấy thao tác nghiệp vụ.');
  }
}
export function generateReminders(store,user){
  const owner=ownerId(user),currentDate=today(),midnight=Date.parse(currentDate+'T00:00:00Z');
  const settings=store.list('settings',owner);
  const allowed=row=>user.role==='landlord'||row.tenantId===user.tenant_id;
  const notice=(key,row,title,body,kind,phase)=>{
    const existing=store.get('notifications',key);
    if(existing?.phase===phase&&existing?.body===body&&existing?.title===title)return;
    store.put('notifications',{...existing,id:key,ownerId:owner,propertyId:row.propertyId,roomId:row.roomId,tenantId:row.tenantId,title,body,kind,phase,automatic:true,readBy:existing?.phase===phase?existing.readBy:[]});
  };
  for(const invoice of store.list('invoices',owner).filter(allowed)){
    const key='rem_invoice_'+invoice.id,days=settings.find(s=>s.propertyId===invoice.propertyId)?.notificationDays??3;
    if(invoice.status!=='issued'||invoice.paid>=invoice.total){if(store.get('notifications',key))store.remove('notifications',key);continue;}
    const daysUntil=Math.round((Date.parse(invoice.dueDate+'T00:00:00Z')-midnight)/86400000);
    if(daysUntil>days)continue;
    const overdue=daysUntil<0;
    notice(key,invoice,overdue?'Hóa đơn đã quá hạn thanh toán':'Hóa đơn sắp đến hạn','Hóa đơn '+invoice.id+' kỳ '+invoice.period+' còn '+(invoice.total-invoice.paid).toLocaleString('vi-VN')+'đ. Hạn thanh toán: '+invoice.dueDate+'.','invoice',overdue?'overdue':'upcoming');
  }
  for(const contract of store.list('contracts',owner).filter(allowed)){
    const key='rem_contract_'+contract.id,days=settings.find(s=>s.propertyId===contract.propertyId)?.notificationDays??3;
    const daysUntil=Math.round((Date.parse(contract.endDate+'T00:00:00Z')-midnight)/86400000);
    if(contract.status!=='active'||daysUntil>days){if(store.get('notifications',key))store.remove('notifications',key);continue;}
    notice(key,contract,daysUntil<0?'Hợp đồng đã đến ngày kết thúc':'Hợp đồng sắp kết thúc','Hợp đồng kết thúc ngày '+contract.endDate+'. Vui lòng trao đổi về gia hạn hoặc kế hoạch bàn giao.','contract',contract.endDate+':'+(daysUntil<0?'expired':'upcoming'));
  }
}
export function importRecords(store,user,collection,rows){
  must(user.role==='landlord','Chỉ chủ trọ được nhập dữ liệu.',403);must(['rooms','tenants'].includes(collection),'Chỉ hỗ trợ nhập phòng hoặc người thuê.');must(Array.isArray(rows)&&rows.length>0&&rows.length<=1000,'Tệp nhập cần từ 1 đến 1.000 dòng.');
  const saved=[];for(let i=0;i<rows.length;i++){try{saved.push(createRecord(store,user,collection,rows[i]));}catch(error){throw new HttpError(error.status||400,`Dòng ${i+1}: ${error.message}`);}}return {count:saved.length,records:saved};
}
