import {createHash} from 'node:crypto';
import {canReadFile,prepareUpload} from '../backend/files.mjs';
import {fail,ownerId} from '../backend/domain.mjs';
import {id,now} from '../backend/model.mjs';
import {rasterMimeFromBytes} from '../shared/raster-image.mjs';
import {meterPhotoExpiry} from '../shared/file-policy.mjs';

export async function uploadFile(env,store,user,input,rawBytes) {
  const {bytes,name,type,propertyId,roomId,tenantId}=prepareUpload(store,user,input,rawBytes);
  const purpose=input.purpose??'attachment';
  if(!['meter','attachment'].includes(purpose)) fail(400,'Mục đích tải tệp không hợp lệ.');
  const raster=rasterMimeFromBytes(bytes);
  if((type.startsWith('image/')||purpose==='meter')&&!raster) fail(400,'Tệp không phải ảnh JPEG, PNG hoặc WebP.');
  if(purpose==='meter'&&(!type.startsWith('image/')||!roomId)) fail(400,'Chọn phòng trước khi tải ảnh công tơ.');
  const key=id('file'), created=now();
  const expires=purpose==='meter'?meterPhotoExpiry(created):null;
  // Reserve quota atomically before writing KV. An interrupted upload is
  // invisible and is cleaned up by scheduled maintenance.
  const inserted=await env.DB.prepare(`INSERT INTO files(id,owner_id,uploader_id,property_id,tenant_id,room_id,
    name,type,raster_type,content_hash,size,purpose,created_at,expires_at,state)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending' WHERE
    (SELECT COALESCE(SUM(size),0) FROM files WHERE expires_at IS NULL OR expires_at>?) + ? <= 1000000000`)
    .bind(key,ownerId(user)||user.id,user.id,propertyId,tenantId,roomId,name,type,raster,
      createHash('sha256').update(bytes).digest('hex'),bytes.length,purpose,created,expires,Math.floor(Date.now()/1000),bytes.length).run();
  if(!inserted.meta.changes) fail(507,'Kho tệp miễn phí đã đầy.');
  await env.FILES.put(key,bytes,expires?{expiration:expires}:undefined);
  await store.commit([env.DB.prepare("UPDATE files SET state='ready' WHERE id=? AND state='pending'").bind(key)]);
  return {id:key,name,type,size:bytes.length,...(expires?{expiresAt:new Date(expires*1000).toISOString()}:{})};
}

export async function downloadFile(env,store,user,key,inline) {
  const file=await env.DB.prepare("SELECT * FROM files WHERE id=? AND owner_id=? AND state='ready'").bind(key,ownerId(user)||user.id).first();
  const allowed=canReadFile(store,user,file);
  if(file) await env.DB.prepare('INSERT INTO access_events(id,ownerId,propertyId,actorId,actorName,createdAt,resource,recordId,action,outcome) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(id('access'),file.owner_id,file.property_id,user.id,user.name,now(),'files',key,'download',allowed?'success':'denied').run();
  if(!allowed) fail(404,'Không tìm thấy tệp thuộc quyền truy cập.');
  if(file.expires_at && file.expires_at<=Date.now()/1000) fail(410,'Ảnh công tơ đã hết thời hạn lưu một tháng.');
  const bytes=await env.FILES.get(key,'stream');
  if(!bytes) fail(503,'Ảnh đang đồng bộ. Vui lòng thử lại sau.');
  return new Response(bytes,{headers:{
    'Content-Type':file.type,'Content-Length':String(file.size),'Cache-Control':'private, no-store',
    'Content-Disposition':(inline&&file.raster_type?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(file.name),
    'X-Content-Type-Options':'nosniff',
  }});
}

export async function cleanInterruptedUploads(env) {
  const cutoff=new Date(Date.now()-3600000).toISOString();
  const pending=await env.DB.prepare("SELECT id FROM files WHERE state='pending' AND created_at<? LIMIT 4").bind(cutoff).all();
  for(const file of pending.results) {
    await env.FILES.delete(file.id);
    await env.DB.prepare("DELETE FROM files WHERE id=? AND state='pending'").bind(file.id).run();
  }
  const time=Date.now();
  await env.DB.batch(['sessions','request_limits','auth_tokens'].map(table=>env.DB.prepare('DELETE FROM '+table+' WHERE expires_at<=?').bind(time)));
}
