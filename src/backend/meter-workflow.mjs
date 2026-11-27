/** Tenant photos remain immutable; readings change only after landlord review. */
import {createHash} from 'node:crypto';
import {id,now} from './model.mjs';
import {audit,fail,ownerId,tenantFor,visible} from './domain.mjs';
import {tenantMeterReceipt,ownerMeterSubmission} from './meter-visibility.mjs';
import {rasterMimeFromBytes} from '../shared/raster-image.mjs';
import {meterConsumption} from '../shared/meter-consumption.mjs';
import {MAX_FILE_BYTES} from '../shared/file-policy.mjs';

const must=(condition,message,status=400)=>{if(!condition)fail(status,message);};
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const period=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const stringId=value=>typeof value==='string'&&value.length>0&&value.length<=80;
const cleanNote=(value,required=false)=>{must(value===undefined||typeof value==='string','Ghi chú phải là văn bản.');const note=(value||'').trim();must(note.length<=1000&&(!required||note.length>=10),'Ghi chú cần từ 10 đến 1000 ký tự khi xác minh thủ công hoặc yêu cầu chụp lại.');return note;};
const only=(value,keys)=>must(object(value)&&Object.keys(value).every(key=>keys.includes(key)),'Dữ liệu chứa trường không được phép.');
const hash=value=>createHash('sha256').update(value).digest('hex');
const fileExpiry=file=>file.expires_at?{expiresAt:new Date(file.expires_at*1000).toISOString()}:{};
const utilityKey=utility=>utility==='electric'?'electricNew':'waterNew';
const oldKey=utility=>utility==='electric'?'electricOld':'waterOld';
const safeReading=value=>Number.isSafeInteger(value)&&value>=0&&value<=999999999;
function parseGuideBox(value){
  if(value===undefined||value===null)return null;
  only(value,['left','top','width','height']);
  const {left,top,width,height}=value;
  must([left,top,width,height].every(n=>typeof n==='number'&&Number.isFinite(n))&&left>=0&&left<1&&top>=0&&top<1&&width>=.08&&width<=1&&height>=.04&&height<=1&&left+width<=1.001&&top+height<=1.001,'Khung căn vùng số trên ảnh không hợp lệ.');
  return {left:Number(left.toFixed(4)),top:Number(top.toFixed(4)),width:Number(width.toFixed(4)),height:Number(height.toFixed(4))};
}

function roomScope(store,user,input){
  must(object(input)&&stringId(input.roomId)&&period(input.period)&&['electric','water'].includes(input.utility),'Chọn phòng, kỳ YYYY-MM và công tơ điện hoặc nước.');
  const room=store.get('rooms',input.roomId);
  must(visible(store,user,'rooms',room),'Phòng không thuộc quyền truy cập.',403);
  must(!store.get('properties',room.propertyId)?.archived,'Cơ sở đã lưu trữ không nhận ảnh công tơ mới.',409);
  must(user.role==='tenant','Luồng gửi ảnh này dành cho người thuê; chủ nhà dùng bước xem xét.',403);
  const tenant=tenantFor(store,user);
  must(tenant?.status==='active'&&tenant.roomId===room.id&&tenant.propertyId===room.propertyId,'Tài khoản không thuộc lượt thuê đang hoạt động của phòng.',403);
  const contract=store.list('contracts',ownerId(user)).find(row=>row.tenantId===tenant.id&&row.roomId===room.id&&row.status==='active'&&input.period>=row.startDate.slice(0,7)&&input.period<=row.endDate.slice(0,7));
  must(contract,'Kỳ ghi chỉ số không thuộc hợp đồng đang hoạt động.',403);
  return {room,tenant,owner:ownerId(user)};
}

function baseline(store,owner,roomId,targetPeriod){
  const readings=store.list('readings',owner).filter(row=>row.roomId===roomId);
  const previous=readings.filter(row=>row.confirmed&&row.period<targetPeriod).sort((a,b)=>b.period.localeCompare(a.period))[0];
  const current=readings.find(row=>row.period===targetPeriod);
  const handover=store.list('handovers',owner).filter(row=>row.roomId===roomId&&row.type==='move_in'&&row.status==='confirmed'&&row.date.slice(0,7)<=targetPeriod).sort((a,b)=>b.date.localeCompare(a.date))[0];
  const meters=store.list('meters',owner).filter(m=>m.roomId===roomId&&m.replacementPeriod===targetPeriod);
  const meterBreakdown=['electric','water'].flatMap(utility=>{
    const installed=meters.filter(m=>m.utility===utility).sort((a,b)=>(b.replacementSegments?.length||0)-(a.replacementSegments?.length||0))[0];
    return installed?.replacementSegments || (current?.meterBreakdown||[]).filter(s=>s.utility===utility);
  });
  const opening=utility=>meterBreakdown.filter(s=>s.utility===utility).at(-1)?.newOpening
    ??previous?.[utility+'New']??current?.[utility+'Old']??handover?.[utility+'Reading']??0;
  const electricOld=opening('electric'),waterOld=opening('water');
  const fingerprint=[previous?.id??null,previous?.period??null,electricOld,waterOld];
  if(meterBreakdown.length)fingerprint.push(meterBreakdown.map(s=>[s.utility,s.oldMeterId,s.oldOpening,s.oldClosing,s.newMeterId,s.newOpening]));
  return {previous,current,handover,electricOld,waterOld,meterBreakdown,previousFingerprint:hash(JSON.stringify(fingerprint))};
}

/** Preview follows integer billing precision and never treats an absent baseline as zero. */
export function meterSubmissionUsage(store,row,proposal){
 if(!proposal?.reading||proposal.status!=='ready')return null;
 const base=baseline(store,row.ownerId,row.roomId,row.period),proposedValue=proposal.reading.integerValue;
 const prior=base.previous?.[utilityKey(row.utility)],handover=base.handover?.[row.utility==='electric'?'electricReading':'waterReading'];
 const installed=base.meterBreakdown.filter(s=>s.utility===row.utility).at(-1);
 const previousValue=installed?installed.newOpening:safeReading(prior)?prior:safeReading(handover)&&handover===base[oldKey(row.utility)]?handover:null;
 const baselineSource=previousValue===null?null:installed?'replacement':safeReading(prior)?'previous-reading':'handover';
 return {status:previousValue===null?'missing_baseline':proposedValue<previousValue?'decreased':'available',previousValue,proposedValue,
  consumption:previousValue===null||proposedValue<previousValue?null:meterConsumption({meterBreakdown:base.meterBreakdown,[oldKey(row.utility)]:previousValue,[utilityKey(row.utility)]:proposedValue},row.utility),unit:row.utility==='electric'?'kWh':'m3',baselineSource};
}

function assertOpenPeriod(store,owner,roomId,targetPeriod,current){
  must(!current?.confirmed,'Kỳ này đã chốt chỉ số. Hãy sử dụng quy trình điều chỉnh hiện có.',409);
  must(!store.list('invoices',owner).some(row=>row.roomId===roomId&&row.period===targetPeriod&&row.status!=='cancelled'),'Kỳ này đã có hóa đơn; cần xử lý hóa đơn trước khi xác minh ảnh mới.',409);
  must(!store.list('readings',owner).some(row=>row.roomId===roomId&&row.period>targetPeriod&&row.confirmed),'Kỳ sau đã chốt chỉ số; không thể thay đổi kỳ trước.',409);
}

/** Automatic results are useful only while the submission's original baseline is current. */
export function assertMeterSubmissionBaseline(store,row){
 const base=baseline(store,row.ownerId,row.roomId,row.period);
 assertOpenPeriod(store,row.ownerId,row.roomId,row.period,base.current);
 const target=base.current?.[utilityKey(row.utility)]??base[oldKey(row.utility)];
 must(row.previousFingerprint===base.previousFingerprint&&row.targetBaseline===target,'Chỉ số hoặc kỳ trước đã thay đổi. Hãy tải lại bộ ảnh để xác minh.',409);
}

export function meterWorkflow(store,{onCreated=()=>{},onReviewed=()=>{},validateReaderProposalForReview}){
  function authorizePhotos(user,value){
    only(value,['roomId','period','utility','photos','note']);
    const {room,tenant,owner}=roomScope(store,user,value);
    must(Array.isArray(value.photos)&&value.photos.length>=1&&value.photos.length<=3,'Gửi từ 1 đến 3 ảnh công tơ.');
    const items=value.photos.map(photo=>{
      only(photo,['fileId','guideBox']);must(stringId(photo.fileId),'Chọn ảnh đã tải lên.');
      const guideBox=parseGuideBox(photo.guideBox);
      const file=store.fileInfo(photo.fileId);
      must(file&&file.owner_id===owner&&file.property_id===room.propertyId&&file.room_id===room.id&&file.uploader_id===user.id&&file.tenant_id===tenant.id,'Ảnh chưa được gắn đúng phòng hoặc không thuộc quyền của bạn. Hãy tải lại ảnh cho phòng này.',403);
      must(['image/png','image/jpeg','image/webp'].includes((file.raster_type ?? rasterMimeFromBytes(file.bytes))),'Chọn ảnh công tơ PNG, JPEG hoặc WebP.');
      must(file.purpose==null||file.purpose==='meter','Hãy tải ảnh bằng chức năng ảnh công tơ.');
      return {file,guideBox};
    });
    const files=items.map(item=>item.file);
    must(new Set(files.map(file=>file.id)).size===files.length&&new Set(files.map(file=>(file.content_hash ?? hash(file.bytes)))).size===files.length,'Các ảnh trùng nội dung; hãy giữ một ảnh hoặc chụp thêm ảnh khác.');
    const base=baseline(store,owner,room.id,value.period);assertOpenPeriod(store,owner,room.id,value.period,base.current);
    must(!store.list('meterSubmissions',owner).some(row=>row.roomId===room.id&&row.period===value.period&&row.utility===value.utility&&['processing','pending','approved'].includes(row.status)),'Đã có bộ ảnh đang chờ xác minh hoặc đã được duyệt trong kỳ này.',409);
    return {files,input:{roomId:room.id,period:value.period,utility:value.utility,photos:items.map(({file,guideBox})=>({fileId:file.id,...fileExpiry(file),...(guideBox?{guideBox}:{})})),note:cleanNote(value.note)},tenant,base};
  }
  function submitPhotos(user,value){
    return store.transaction(()=>{
      const {input,base,tenant}=authorizePhotos(user,value);
      const photos=input.photos.map(photo=>({...photo,createdAt:now()}));
      const submission=store.put('meterSubmissions',{id:id('meter_sub'),ownerId:ownerId(user),propertyId:tenant.propertyId,roomId:input.roomId,tenantId:tenant.id,submittedBy:user.id,submittedByName:user.name,period:input.period,utility:input.utility,photos,selectedFileId:photos[0].fileId,status:'pending',version:1,targetBaseline:base.current?.[utilityKey(input.utility)]??base[oldKey(input.utility)],previousFingerprint:base.previousFingerprint,note:input.note});
      store.put('notifications',{id:id('not'),ownerId:submission.ownerId,propertyId:submission.propertyId,roomId:submission.roomId,recipientUserId:submission.ownerId,meterSubmissionId:submission.id,title:`Ảnh công tơ ${input.utility==='electric'?'điện':'nước'} kỳ ${input.period} cần xác minh`,body:'Người thuê đã gửi ảnh công tơ. Vui lòng mở ảnh gốc, nhập chỉ số và xác minh.',kind:'general',readBy:[]});
      audit(store,user,'meter-photo-submit','meterSubmissions',submission,`${photos.length} ảnh ${input.utility} kỳ ${input.period}; chờ chủ nhà xác minh`);
      onCreated(submission);
      return tenantMeterReceipt(submission);
    });
  }
  function submitOwnerEvidence(user,value){
    must(user.role==='landlord','Chỉ chủ nhà được tạo bộ ảnh để đọc và xác minh.',403);
    only(value,['roomId','period','utility','photos','note']);
    must(stringId(value.roomId)&&period(value.period)&&['electric','water'].includes(value.utility),'Chọn phòng, kỳ YYYY-MM và công tơ điện hoặc nước.');
    return store.transaction(()=>{
      const room=store.get('rooms',value.roomId);
      must(visible(store,user,'rooms',room),'Phòng không thuộc quyền quản lý.',403);
      must(!store.get('properties',room.propertyId)?.archived,'Cơ sở đã lưu trữ không nhận ảnh công tơ mới.',409);
      must(Array.isArray(value.photos)&&value.photos.length>=1&&value.photos.length<=3,'Chọn từ 1 đến 3 ảnh công tơ.');
      const items=value.photos.map(photo=>{
        only(photo,['fileId','guideBox']);must(stringId(photo.fileId),'Chọn ảnh đã tải lên.');
        const guideBox=parseGuideBox(photo.guideBox);
        const file=store.fileInfo(photo.fileId);
        must(file&&file.owner_id===user.id&&file.uploader_id===user.id&&file.property_id===room.propertyId&&file.room_id===room.id&&!file.tenant_id,'Ảnh cần do chính bạn tải lên cho đúng phòng và không gắn hồ sơ người thuê.',403);
        must((file.size ?? file.bytes.length)<=MAX_FILE_BYTES,'Ảnh để đọc công tơ tối đa 5 MiB.',413);
        must(['image/png','image/jpeg','image/webp'].includes((file.raster_type ?? rasterMimeFromBytes(file.bytes))),'Chọn ảnh PNG, JPEG hoặc WebP.');
        must(file.purpose==null||file.purpose==='meter','Hãy tải ảnh bằng chức năng ảnh công tơ.');return {file,guideBox};
      });
      const files=items.map(item=>item.file);
      must(new Set(files.map(file=>file.id)).size===files.length&&new Set(files.map(file=>(file.content_hash ?? hash(file.bytes)))).size===files.length,'Các ảnh trùng nội dung; hãy giữ một ảnh hoặc chọn ảnh khác.');
      const base=baseline(store,user.id,room.id,value.period);assertOpenPeriod(store,user.id,room.id,value.period,base.current);
      must(!store.list('meterSubmissions',user.id).some(row=>row.roomId===room.id&&row.period===value.period&&row.utility===value.utility&&['processing','pending','approved'].includes(row.status)),'Đã có bộ ảnh đang chờ xác minh hoặc đã duyệt cho công tơ trong kỳ này.',409);
      const photos=items.map(({file,guideBox})=>({fileId:file.id,createdAt:now(),...fileExpiry(file),...(guideBox?{guideBox}:{})}));
      const submission=store.put('meterSubmissions',{id:id('meter_sub'),ownerId:user.id,propertyId:room.propertyId,roomId:room.id,tenantId:null,source:'owner',submittedBy:user.id,submittedByName:user.name,period:value.period,utility:value.utility,photos,selectedFileId:photos[0].fileId,status:'pending',version:1,targetBaseline:base.current?.[utilityKey(value.utility)]??base[oldKey(value.utility)],previousFingerprint:base.previousFingerprint,note:cleanNote(value.note)});
      audit(store,user,'meter-owner-evidence','meterSubmissions',submission,`${photos.length} ảnh ${value.utility} kỳ ${value.period}; chờ xác minh`);
      onCreated(submission);
      return ownerMeterSubmission(submission);
    });
  }
  function review(user,key,value){
    must(user.role==='landlord','Chỉ chủ nhà có quyền xác minh chỉ số.',403);
    only(value,['decision','version','value','note','imageChecked','selectedFileId','readingUpdatedAt','proposalId','fractionalChecked']);
    must(value.fractionalChecked===undefined||typeof value.fractionalChecked==='boolean','Xác nhận phần lẻ không hợp lệ.');
    must(['approve','reject'].includes(value.decision)&&Number.isSafeInteger(value.version),'Quyết định hoặc phiên bản xác minh không hợp lệ.');
    return store.transaction(()=>{
      const row=store.get('meterSubmissions',key);
      must(row&&row.ownerId===user.id,'Không tìm thấy bộ ảnh thuộc quyền quản lý.',404);
      must(row.status==='pending'&&row.version===value.version,'Bộ ảnh đã được xử lý hoặc thay đổi; hãy tải lại dữ liệu.',409);
      const note=cleanNote(value.note,true);
      if(value.decision==='reject'){
        const saved=store.put('meterSubmissions',{...row,status:'rejected',version:row.version+1,reviewedBy:user.id,reviewedAt:now(),reviewNote:note});
        audit(store,user,'meter-reject','meterSubmissions',saved,note);
        return {submission:ownerMeterSubmission(saved),reading:null};
      }
      must(value.imageChecked===true,'Hãy đối chiếu ảnh công tơ trước khi xác minh.');
      must(safeReading(value.value),'Chỉ số xác minh phải là số nguyên không âm, tối đa 999999999.');
      must(value.selectedFileId===undefined||stringId(value.selectedFileId),'Ảnh được chọn không hợp lệ.');
      const selectedFileId=value.selectedFileId||row.selectedFileId||row.photos.find(photo=>photo.analysisId===row.selectedAnalysisId)?.fileId||row.photos[0]?.fileId;
      const photo=row.photos.find(photo=>photo.fileId===selectedFileId);must(photo,'Ảnh được chọn không thuộc bộ ảnh đang xem.');
      must(store.fileInfo(selectedFileId),'Ảnh công tơ đã hết hạn hoặc không còn khả dụng.',410);
      const proposal=validateReaderProposalForReview(store,user,row,value,selectedFileId);
      if(row.source!=='owner'){
        const tenant=store.get('tenants',row.tenantId);
        must(tenant?.status==='active'&&tenant.roomId===row.roomId&&store.list('contracts',row.ownerId).some(contract=>contract.tenantId===row.tenantId&&contract.roomId===row.roomId&&contract.status==='active'&&row.period>=contract.startDate.slice(0,7)&&row.period<=contract.endDate.slice(0,7)),'Lượt thuê đã thay đổi. Hãy kiểm tra lại ảnh và dữ liệu theo quy trình chỉ số thủ công.',409);
      }
      const base=baseline(store,row.ownerId,row.roomId,row.period);assertOpenPeriod(store,row.ownerId,row.roomId,row.period,base.current);
      const keyNew=utilityKey(row.utility),keyOld=oldKey(row.utility),target=base.current?.[keyNew]??base[keyOld];
      must(row.previousFingerprint===base.previousFingerprint&&row.targetBaseline===target,'Chỉ số của công tơ hoặc kỳ trước đã thay đổi. Yêu cầu người thuê gửi lại ảnh.',409);
      if(value.readingUpdatedAt!==undefined)must(value.readingUpdatedAt===(base.current?.updatedAt||null),'Bản ghi chỉ số đã thay đổi; hãy tải lại dữ liệu.',409);
      must(value.value>=base[keyOld],'Chỉ số mới không được nhỏ hơn chỉ số chốt kỳ trước.');
      const checked=new Set(base.current?.reviewedUtilities||[]);checked.add(row.utility);
      const reading=store.put('readings',{...base.current,id:base.current?.id||id('read'),ownerId:user.id,propertyId:row.propertyId,roomId:row.roomId,period:row.period,meterBreakdown:base.meterBreakdown,electricOld:base.electricOld,waterOld:base.waterOld,electricNew:base.current?.electricNew??base.electricOld,waterNew:base.current?.waterNew??base.waterOld,[keyNew]:value.value,[row.utility==='electric'?'electricPhotoFileId':'waterPhotoFileId']:photo.fileId,reviewedUtilities:[...checked].sort(),meterSubmissionIds:{...(base.current?.meterSubmissionIds||{}),[row.utility]:row.id},confirmed:checked.has('electric')&&checked.has('water')});
      const saved=store.put('meterSubmissions',{...row,status:'approved',version:row.version+1,selectedFileId:photo.fileId,reviewedBy:user.id,reviewedAt:now(),reviewNote:note,verifiedValue:value.value,verificationSource:proposal?(proposal.engine==='gemini-vision'?'gemini-vision-and-human':proposal.engine==='paddleocr'?'paddleocr-and-human':'wheel-reader-and-human'):'manual',...(proposal?{readerProposalId:proposal.id}:{}),readingId:reading.id});
      audit(store,user,'meter-approve','meterSubmissions',saved,`${row.utility}: ${value.value}; ${proposal?(proposal.engine==='gemini-vision'?`đề xuất Gemini Vision (${proposal.model||''}) + đối chiếu ảnh`:proposal.engine==='paddleocr'?'đề xuất PaddleOCR + đối chiếu ảnh':'đề xuất Wheel Reader + đối chiếu ảnh'):'nhập tay'}; ${note}`);
      audit(store,user,'meter-reading-verify','readings',reading,`Ảnh ${photo.fileId}; bộ gửi ${row.id}`);
      onReviewed(user,saved,proposal);
      return {submission:ownerMeterSubmission(saved),reading};
    });
  }
  return {authorizePhotos,submitPhotos,submitOwnerEvidence,review};
}
