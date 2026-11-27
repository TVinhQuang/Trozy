import {createHash} from 'node:crypto';
import {id,now,today} from './model.mjs';
import {applyDueContracts,audit,contractSnapshot,fail,getRecord,roomMembers} from './domain.mjs';

function check(value,message,status=409){if(!value)fail(status,message);}
function owner(user){check(user.role==='landlord','Chỉ chủ trọ được ghi nhận lưu trú.',403);}
function calendarDate(value){
  check(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value,'Ngày hiệu lực không hợp lệ.',400);
  return value;
}
function group(row){return [...(row.occupantStatus==='left'?[]:[{id:row.id,name:row.name,representative:true}]),...roomMembers(row).filter(m=>m.status!=='left'&&m.status!=='pending').map(m=>({id:m.id,name:m.name}))];}
function linkedDocs(store,user,tenant,room){
  return store.list('documents',user.id).filter(d=>d.visibility!=='landlord'&&(d.tenantId===tenant.id||!d.tenantId&&d.roomId===room.id)).map(d=>({id:d.id,name:d.name,version:d.version||1}));
}
function arrangement(c){return {id:c.id,version:c.version||1,tenantId:c.tenantId,roomId:c.roomId,startDate:c.startDate,endDate:c.endDate,rent:c.rent,deposit:c.deposit,terms:c.terms||''};}
function preview(store,user,input,scheduled=false){
  owner(user);
  const tenant=getRecord(store,user,'tenants',input.tenantId);
  const from=getRecord(store,user,'rooms',tenant.roomId),to=getRecord(store,user,'rooms',input.roomId);
  const contract=store.list('contracts',user.id).find(c=>c.status==='active'&&c.tenantId===tenant.id&&c.roomId===from.id);
  const date=calendarDate(input.date);
  check(from.id!==to.id&&to.status==='vacant'&&!store.get('properties',to.propertyId)?.archived,'Phòng đích phải là phòng trống đang sử dụng.');
  check(tenant.status==='active'&&contract,'Cần lượt thuê và hợp đồng đang hiệu lực.');
  check(date>=contract.startDate&&date>=String(tenant.moveInDate||contract.startDate)&&date<=contract.endDate&&(scheduled||date>=today()),'Ngày chuyển nằm ngoài khoảng cho phép.');
  const people=group(tenant),ids=input.people;
  check(Array.isArray(ids)&&ids.length>0&&new Set(ids).size===ids.length&&ids.every(key=>people.some(p=>p.id===key)),'Chọn người đang ở trong lượt thuê này.',400);
  check(people.some(p=>p.id===tenant.id),'Cần xác nhận người đại diện đang ở trước khi chuyển nhóm.');
  const moving=people.filter(p=>ids.includes(p.id)),staying=people.filter(p=>!ids.includes(p.id));
  check(moving.length<=to.capacity&&staying.length<=from.capacity,'Số người vượt sức chứa của phòng.');
  check(!store.list('tenants',user.id).some(t=>t.id!==tenant.id&&t.status==='active'&&t.roomId===to.id)&&!store.list('contracts',user.id).some(c=>c.roomId===to.id&&(['active','terminating'].includes(c.status)||c.status==='scheduled'&&c.startDate<=contract.endDate&&c.endDate>=date)),'Phòng đích đã có lượt thuê khác.');
  const repMoves=ids.includes(tenant.id),otherRoom=repMoves?from:to;
  let otherContract=null;
  if(staying.length){
    const otherGroup=repMoves?staying:moving;
    otherContract=input.otherContractId&&getRecord(store,user,'contracts',input.otherContractId);
    check(otherContract?.status==='draft'&&otherContract.roomId===otherRoom.id&&otherGroup.some(m=>m.id===otherContract.tenantId)&&otherContract.startDate===date&&otherContract.endDate>=date,'Cần hợp đồng nháp cho nhóm tách, đúng đại diện, phòng và ngày bắt đầu.');
    check(!store.get('tenants',otherContract.tenantId),'Người đại diện nhóm tách đã có hồ sơ độc lập. Hãy đối chiếu lại.');
  }
  const terms=typeof input.terms==='string'?input.terms.trim():'';
  check(terms.length>=3&&terms.length<=2000,'Nhập nội dung phụ lục chuyển phòng đã thống nhất.',400);
  const docs=linkedDocs(store,user,tenant,from),info={tenantId:tenant.id,linkedAccount:!!tenant.userId,source:{id:from.id,code:from.code,propertyId:from.propertyId,status:staying.length?'occupied':'vacant'},destination:{id:to.id,code:to.code,propertyId:to.propertyId,status:'occupied'},moving,staying,date,terms,contract:arrangement(contract),otherContract:otherContract?arrangement(otherContract):null,documents:docs};
  return {...info,revision:createHash('sha256').update(JSON.stringify(info)).digest('hex')};
}
function apply(store,user,record,view){
  const source=getRecord(store,user,'tenants',record.tenantId),contract=getRecord(store,user,'contracts',view.contract.id);
  const oldRoom=getRecord(store,user,'rooms',view.source.id),newRoom=getRecord(store,user,'rooms',view.destination.id);
  const repMoves=view.moving.some(p=>p.id===source.id),primaryRoom=repMoves?newRoom:oldRoom,splitRoom=repMoves?oldRoom:newRoom;
  const movingIds=new Set(view.moving.map(p=>p.id)),members=roomMembers(source),primaryMembers=members.filter(m=>['left','pending'].includes(m.status)||movingIds.has(m.id)===repMoves);
  const timestamp=now(),info={id:record.id,fromRoomId:oldRoom.id,fromPropertyId:oldRoom.propertyId,toRoomId:newRoom.id,toPropertyId:newRoom.propertyId,effectiveDate:view.date,people:view.moving,documentIds:view.documents.map(d=>d.id),contractId:contract.id,version:(contract.version||1)+1,actorId:user.id,at:timestamp};
  const roomStart=contract.currentRoomFrom||contract.startDate;
  const periods=[...(contract.roomPeriods||[])];
  if(repMoves)periods.push({roomId:oldRoom.id,propertyId:oldRoom.propertyId,from:roomStart,until:view.date,version:contract.version||1});
  const newProperty=store.get('properties',primaryRoom.propertyId);
  store.put('contracts',{...contract,roomId:primaryRoom.id,roomCode:primaryRoom.code,propertyId:primaryRoom.propertyId,propertyName:newProperty.name,address:newProperty.address,
    currentRoomFrom:repMoves?view.date:roomStart,roomPeriods:periods,version:info.version,terms:contract.terms+'\n'+view.terms,versions:[...(contract.versions||[]),contractSnapshot(store,contract)],acceptedAt:null,acceptedBy:null,acceptedVersion:null});
  store.put('tenants',{...source,memberProfiles:primaryMembers,members:primaryMembers.filter(m=>!['left','pending'].includes(m.status)).map(m=>m.name).join('\n'),propertyId:primaryRoom.propertyId,roomId:primaryRoom.id,moveInDate:repMoves?view.date:source.moveInDate,occupancyHistory:[...(source.occupancyHistory||[]),info]});
  if(view.otherContract){
    const draft=getRecord(store,user,'contracts',view.otherContract.id),rep=members.find(m=>m.id===draft.tenantId),splitMembers=members.filter(m=>!['left','pending'].includes(m.status)&&m.id!==rep.id&&movingIds.has(m.id)!==repMoves);
    store.put('tenants',{...rep,id:rep.id,ownerId:user.id,roomId:splitRoom.id,propertyId:splitRoom.propertyId,status:'active',moveInDate:view.date,memberProfiles:splitMembers,members:splitMembers.map(m=>m.name).join('\n'),occupancyHistory:[{...info,documentIds:[]} ]});
    store.put('contracts',{...draft,...contractSnapshot(store,draft),status:'active',activatedAt:timestamp,currentRoomFrom:view.date});
  }
  store.put('rooms',{...oldRoom,status:view.source.status==='vacant'&&oldRoom.maintenanceDuringStay?'maintenance':view.source.status,maintenanceDuringStay:view.source.status==='occupied'&&!!oldRoom.maintenanceDuringStay});store.put('rooms',{...newRoom,status:'occupied'});
  const result=store.put('occupancyTransfers',{...record,status:'completed',completedAt:timestamp,history:info});
  audit(store,user,'occupancy-transfer','tenants',source,oldRoom.code+' → '+newRoom.code);
  store.put('notifications',{id:id('not'),ownerId:user.id,propertyId:primaryRoom.propertyId,roomId:primaryRoom.id,tenantId:source.id,kind:'contract',title:'Đã ghi nhận chuyển phòng',body:'Từ phòng '+oldRoom.code+' sang phòng '+newRoom.code+' ngày '+view.date,readBy:[]});
  return result;
}
function changeOccupant(store,user,input){
  const tenant=getRecord(store,user,'tenants',input.tenantId),room=getRecord(store,user,'rooms',tenant.roomId);
  const contract=store.list('contracts',user.id).find(c=>c.tenantId===tenant.id&&c.roomId===room.id&&['active','terminating'].includes(c.status));
  check(contract,'Cần hợp đồng hợp lệ của phòng.');
  const members=roomMembers(tenant),isRep=input.personId===tenant.id,person=isRep?tenant:members.find(m=>m.id===input.personId);
  check(person,'Người được chọn không thuộc hồ sơ.',404);
  const date=calendarDate(input.date),wasActive=isRep?tenant.status==='active'&&tenant.occupantStatus!=='left':(person.status||tenant.status)==='active';
  const entering=input.direction==='in';check(entering||input.direction==='out','Chọn chuyển vào hoặc chuyển ra.',400);
  check(date<=today()&&date>=contract.startDate&&date<=contract.endDate&&date>=(person.moveInDate||contract.startDate)&&(!entering||!person.moveOutDate||date>=person.moveOutDate),'Ngày lưu trú không phù hợp với lịch sử hoặc hợp đồng.');
  check(entering?!wasActive:wasActive,'Trạng thái hiện tại không phù hợp với thao tác.');
  if(entering){check(!room.maintenanceDuringStay,'Phòng đang bảo trì, chưa thể nhận thêm người.');check(contract.status==='active','Hợp đồng đang chấm dứt.');check(group(tenant).length<room.capacity,'Phòng đã đủ người.');}
  const event={id:id('stay'),direction:input.direction,personId:person.id,personName:person.name,roomId:room.id,contractId:contract.id,effectiveDate:date,actorId:user.id,at:now()};
  const changes=entering?{moveInDate:date,moveOutDate:null}:{moveOutDate:date},status=entering?'active':'left';
  const roster=isRep?members:members.map(m=>m.id===person.id?{...m,...changes,status}:m);
  const saved=store.put('tenants',{...tenant,...(isRep?{...changes,occupantStatus:status}:{}),memberProfiles:roster,members:roster.filter(m=>(m.status||tenant.status)==='active').map(m=>m.name).join('\n'),occupancyHistory:[...(tenant.occupancyHistory||[]),event]});
  audit(store,user,entering?'occupancy-in':'occupancy-out','tenants',saved,person.name+' · '+date);
  return {event,empty:group(saved).length===0};
}
export function occupancyAction(store,user,step,input){
  owner(user);
  if(step==='stay')return changeOccupant(store,user,input);
  if(step==='list'){getRecord(store,user,'tenants',input.tenantId);return {records:store.list('occupancyTransfers',user.id).filter(r=>r.tenantId===input.tenantId)};}
  if(step==='cancel'){
    const row=getRecord(store,user,'occupancyTransfers',input.id);
    check(row.status==='scheduled','Chỉ hủy lịch chuyển chưa thực hiện.');
    const result=store.put('occupancyTransfers',{...row,status:'cancelled',cancelledAt:now()});audit(store,user,'cancel-transfer','tenants',{id:row.tenantId,propertyId:row.propertyId});return result;
  }
  if(step==='preview')return preview(store,user,input);
  check(step==='confirm','Không tìm thấy thao tác.',404);
  const view=preview(store,user,input);
  check(input.revision===view.revision,'Dữ liệu đã thay đổi. Hãy xem trước lại.');
  check(!store.list('occupancyTransfers',user.id).some(r=>r.status==='scheduled'&&(r.tenantId===view.tenantId||r.input.roomId===view.destination.id)),'Đã có lịch chuyển đang chờ cho lượt thuê hoặc phòng này.');
  const record={id:id('transfer'),ownerId:user.id,propertyId:view.source.propertyId,tenantId:view.tenantId,confirmedBy:user.id,confirmedAt:now(),revision:view.revision,date:view.date,input:{tenantId:view.tenantId,roomId:view.destination.id,date:view.date,people:view.moving.map(p=>p.id),terms:view.terms,otherContractId:view.otherContract?.id||''}};
  if(view.date>today()){const saved=store.put('occupancyTransfers',{...record,status:'scheduled'});audit(store,user,'schedule-transfer','tenants',{id:view.tenantId,propertyId:record.propertyId});return saved;}
  return apply(store,user,record,view);
}
export function applyDueTransfers(store,user){
  const ownerId=user.role==='landlord'?user.id:user.landlord_id;if(!ownerId)return;
  applyDueContracts(store,user);
  const records=store.list('occupancyTransfers',ownerId).filter(r=>r.status==='scheduled'&&r.date<=today());
  if(!records.length)return;
  const landlord=store.account(ownerId);
  for(const row of records){
    try{store.transaction(()=>{const current=store.get('occupancyTransfers',row.id);if(current.status!=='scheduled')return;
      const view=preview(store,landlord,current.input,true);check(view.revision===current.revision,'Cần kiểm tra lại thông tin chuyển phòng.');apply(store,landlord,current,view);});}
    catch(error){store.transaction(()=>{store.put('occupancyTransfers',{...row,status:'review',reason:error.message});store.put('notifications',{id:id('not'),ownerId,propertyId:row.propertyId,recipientUserId:ownerId,kind:'contract',title:'Lịch chuyển phòng cần đối chiếu lại',body:error.message,readBy:[]});});}
  }
}
