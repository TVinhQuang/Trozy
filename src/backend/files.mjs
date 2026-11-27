import {dataFor,fail,ownerId,tenantFor,visible} from './domain.mjs';
import {rasterMimeFromBytes} from '../shared/raster-image.mjs';
import {MAX_FILE_BYTES} from '../shared/file-policy.mjs';

export function prepareUpload(store,user,input,rawBytes){
    const name=String(input.name||'').trim();if(!name||name.length>200||/[\r\n\x00]/.test(name))fail(400,'Tên tệp không hợp lệ.');
    const allowed=['image/jpeg','image/png','image/webp','application/pdf','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel'];
    if(!allowed.includes(input.type))fail(400,'Chỉ hỗ trợ ảnh PNG/JPEG/WebP, PDF, Word, Excel và văn bản.');
    if(!rawBytes&&(typeof input.data!=='string'||!input.data||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.data)))fail(400,'Dữ liệu tệp không hợp lệ.');
    const bytes=rawBytes??Buffer.from(input.data,'base64');if(bytes.length>MAX_FILE_BYTES)fail(413,'Tệp đính kèm tối đa 5 MB.');if(!bytes.length)fail(400,'Tệp không có nội dung.');
    const type=input.type.startsWith('image/')?(rasterMimeFromBytes(bytes)||input.type):input.type;
    let propertyId=input.propertyId||null,tenantId=input.tenantId||null,roomId=input.roomId||null;
    if(input.roomId){const room=store.get('rooms',input.roomId);if(!visible(store,user,'rooms',room))fail(403,'Phòng không thuộc quyền truy cập.');propertyId=room.propertyId;}
    if(user.role==='tenant'){const tenant=tenantFor(store,user);if(!tenant)fail(403,'Tài khoản chưa liên kết người thuê.');propertyId=tenant.propertyId;tenantId=tenant.id;roomId=tenant.roomId||null;}
    else{
      if(propertyId&&!visible(store,user,'properties',store.get('properties',propertyId)))fail(403,'Cơ sở không thuộc quyền truy cập.');
      if(tenantId){const tenant=store.get('tenants',tenantId);if(!visible(store,user,'tenants',tenant)||propertyId&&tenant.propertyId!==propertyId)fail(403,'Người thuê không thuộc phạm vi tệp.');propertyId=tenant.propertyId;}
    }
    return {name,type,bytes,propertyId,tenantId,roomId};
}

export function canReadFile(store,user,file){
    if(!file||file.owner_id!==ownerId(user))return false;if(user.role==='landlord'||file.uploader_id===user.id)return true;
    const scoped=dataFor(store,user);
    return Object.values(scoped).flat().some(row=>row.fileId===file.id||row.photoFileId===file.id||row.electricPhotoFileId===file.id||row.waterPhotoFileId===file.id||row.imageFileId===file.id||row.imageFileIds?.includes(file.id)||row.resolutionFileId===file.id||row.evidenceFileId===file.id||(row.damages||[]).some(item=>item.evidenceFileId===file.id)||(row.items||[]).some(item=>item.evidenceFileId===file.id)||(row.photos||[]).some(photo=>photo.fileId===file.id)||(row.messages||[]).some(message=>message.fileId===file.id));
  }
