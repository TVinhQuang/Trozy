import {fail,ownerId} from './domain.mjs';
import {id,now} from './model.mjs';

export function recordAccess(store,user,row,resource,recordId,action,outcome){
  const owner=ownerId(user);
  if(!owner)return;
  const propertyId=row?.ownerId===owner?row.propertyId:null;
  store.db.prepare('INSERT INTO access_events(id,ownerId,propertyId,actorId,actorName,createdAt,resource,recordId,action,outcome) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(id('access'),owner,propertyId||null,user.id,user.name,now(),resource,recordId,action,outcome);
}
export function accessLogQuery(store,user,params,key){
  if(user.role!=='landlord')fail(403,'Chỉ chủ trọ được xem nhật ký truy cập.');
  const propertyId=params.get('propertyId'),from=params.get('from'),to=params.get('to');
  if(!propertyId||store.get('properties',propertyId)?.ownerId!==user.id)fail(403,'Vui lòng chọn cơ sở thuộc quyền quản lý.');
  for(const day of [from,to].filter(Boolean)){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)fail(400,'Ngày lọc không hợp lệ.');
  }
  if(from&&to&&from>to)fail(400,'Ngày kết thúc phải từ ngày bắt đầu.');
  const filters=['ownerId=?','propertyId=?'],args=[user.id,propertyId];
  for(const name of ['resource','actorId','action','outcome'])if(params.get(name)){filters.push(name+'=?');args.push(params.get(name));}
  if(from){filters.push('createdAt>=?');args.push(new Date(from+'T00:00:00+07:00').toISOString());}
  if(to){filters.push('createdAt<=?');args.push(new Date(to+'T23:59:59.999+07:00').toISOString());}
  if(key){filters.push('id=?');args.push(key);}
  return {sql:'SELECT id,propertyId,actorId,actorName,createdAt,resource,recordId,action,outcome FROM access_events WHERE '+filters.join(' AND ')+' ORDER BY createdAt DESC,rowid DESC',args};
}
export function readAccessLog(store,user,params,key){
  const {sql,args}=accessLogQuery(store,user,params,key);
  const records=store.db.prepare(sql).all(...args);
  if(key&&!records.length)fail(404,'Không tìm thấy sự kiện trong phạm vi đang xem.');
  return key?records[0]:{records};
}
