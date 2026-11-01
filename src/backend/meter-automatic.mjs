/** Durable private photo jobs. Only a landlord's review can commit a meter reading. */
import {createHash} from 'node:crypto';
import {id,now} from './db.mjs';
import {audit,fail,visible} from './domain.mjs';
import {confirmedMeterProfile,meterProfileDTO,validMeterLayout,meterEngine,meterModel} from './meter-profile.mjs';
import {assertMeterSubmissionBaseline} from './meter-submissions.mjs';

const must=(condition,message,status=400)=>{if(!condition)fail(status,message);};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const only=(input,keys)=>must(object(input)&&Object.keys(input).every(key=>keys.includes(key)),'Dữ liệu đọc tự động chứa trường không hợp lệ.');
const stringId=value=>typeof value==='string'&&value.length>0&&value.length<=80;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const owner=user=>must(user?.role==='landlord','Chỉ chủ nhà được xem hoặc cấu hình đọc tự động.',403);
const REASONS={needs_setup:'Cần xác nhận một lần số bánh số và số chữ số phần lẻ của công tơ cơ.',queued:'Ảnh đang chờ đọc tự động.',processing:'Đang tìm vùng số và đọc từng bánh số.',unavailable:'Bộ đọc tự động chưa sẵn sàng. Bạn có thể thử lại hoặc chọn vùng thủ công.',stale:'Ảnh, bộ gửi hoặc cấu hình đã thay đổi. Hãy tải lại và thử lại.',expired:'Đề xuất đã hết hạn. Hãy đọc tự động lại trước khi xác minh.'};

export function initializeMeterAutomatic(store){
 store.db.exec(`CREATE TABLE IF NOT EXISTS meter_reader_jobs(
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 submission_id TEXT NOT NULL,file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
 submission_version INTEGER NOT NULL,file_hash TEXT NOT NULL,profile_version INTEGER,
 status TEXT NOT NULL CHECK(status IN ('queued','processing','ready','needs_setup','needs_review','retake','unavailable')),
 attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT,lease_until INTEGER,proposal_id TEXT,reason TEXT NOT NULL,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(submission_id,file_id));
 CREATE INDEX IF NOT EXISTS meter_reader_jobs_due ON meter_reader_jobs(status,next_attempt_at,lease_until);
 CREATE INDEX IF NOT EXISTS meter_reader_jobs_owner ON meter_reader_jobs(owner_id,submission_id);`);
 const columns=store.db.prepare('PRAGMA table_info(meter_reader_jobs)').all();
 if(!columns.some(column=>column.name==='engine'))store.db.exec("ALTER TABLE meter_reader_jobs ADD COLUMN engine TEXT NOT NULL DEFAULT ''");
}

export function createMeterAutomaticService(store,reader,options={}){
 initializeMeterAutomatic(store);
 const leaseMs=options.leaseMs??180_000,retryMs=options.retryMs??5_000,maxAttempts=options.maxAttempts??3;
 let closed=false,timer=null,active=null,running=null;
 const rawProfile=(ownerId,roomId,utility)=>store.list('meterProfiles',ownerId).find(row=>row.roomId===roomId&&row.utility===utility);
 function profileScope(user,roomId,utility){
  owner(user);must(stringId(roomId)&&['electric','water'].includes(utility),'Chọn phòng và công tơ điện hoặc nước.');
  const room=store.get('rooms',roomId);must(visible(store,user,'rooms',room),'Phòng không thuộc quyền quản lý.',403);
  must(!store.get('properties',room.propertyId)?.archived,'Cơ sở đã lưu trữ không nhận cấu hình công tơ mới.',409);return room;
 }
 function getProfile(user,roomId,utility){profileScope(user,roomId,utility);return {profile:meterProfileDTO(confirmedMeterProfile(store,user.id,roomId,utility))};}
 function queueRow(row,fileId,{replace=false}={}){
  const file=store.db.prepare('SELECT * FROM files WHERE id=? AND owner_id=?').get(fileId,row.ownerId);
  must(file&&(row.photos||[]).some(photo=>photo.fileId===fileId),'Ảnh không thuộc bộ gửi.',403);
  const existing=store.db.prepare('SELECT * FROM meter_reader_jobs WHERE submission_id=? AND file_id=?').get(row.id,fileId);
  const profile=confirmedMeterProfile(store,row.ownerId,row.roomId,row.utility),fileHash=hash(file.bytes);
  if(!replace&&existing&&existing.engine===meterEngine(row.utility)&&existing.submission_version===row.version&&existing.file_hash===fileHash&&existing.profile_version===(profile?.version??null))return;
  const state=profile?'queued':'needs_setup',time=now();
  store.db.prepare(`INSERT INTO meter_reader_jobs(id,owner_id,submission_id,file_id,submission_version,file_hash,profile_version,status,reason,created_at,updated_at,engine)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(submission_id,file_id) DO UPDATE SET
   id=excluded.id,owner_id=excluded.owner_id,submission_version=excluded.submission_version,file_hash=excluded.file_hash,profile_version=excluded.profile_version,
   status=excluded.status,engine=excluded.engine,attempts=0,next_attempt_at=0,lease_token=NULL,lease_until=NULL,proposal_id=NULL,reason=excluded.reason,created_at=excluded.created_at,updated_at=excluded.updated_at`)
   .run(id('meter_job'),row.ownerId,row.id,fileId,row.version,fileHash,profile?.version??null,state,REASONS[state],time,time,meterEngine(row.utility));
 }
 /** Runs inside the submission transaction; deferred wake cannot run before its commit. */
 function enqueueCreated(row){
  must(!closed,'Bộ đọc tự động đang dừng.',503);
  must(row?.status==='pending','Bộ ảnh không còn chờ xác minh.',409);
  for(const photo of row.photos||[])queueRow(row,photo.fileId);wake();
 }
 /** Explicit internal enqueue; startup resumes job records and never scans old photos. */
 function enqueue(key){
  store.transaction(()=>enqueueCreated(store.get('meterSubmissions',key)));
 }
 function saveProfile(user,input){
  owner(user);only(input,['roomId','utility','digits','decimals','meterType','confirmed','version']);
  const room=profileScope(user,input.roomId,input.utility);
  must(input.meterType==='mechanical'&&input.confirmed===true&&validMeterLayout(input.digits,input.decimals),'Xác nhận công tơ cơ, từ 1–12 bánh số, tối đa 4 số lẻ và 9 số nguyên.');
  must(input.version===undefined||(Number.isSafeInteger(input.version)&&input.version>=1),'Phiên bản cấu hình không hợp lệ.');
  const profile=store.transaction(()=>{
   const previous=confirmedMeterProfile(store,user.id,room.id,input.utility),old=rawProfile(user.id,room.id,input.utility);
   if(previous)must(input.version===previous.version,'Cấu hình đã thay đổi. Hãy tải lại trước khi lưu.',409);
   else must(input.version===undefined,'Cấu hình này chưa được xác nhận trong bộ đọc hiện tại.',409);
   if(previous&&previous.digits===input.digits&&previous.decimals===input.decimals)return previous;
   const saved=store.put('meterProfiles',{id:old?.id||id('meter_profile'),ownerId:user.id,propertyId:room.propertyId,roomId:room.id,utility:input.utility,digits:input.digits,decimals:input.decimals,meterType:'mechanical',confirmed:true,reader:'meter-reader-v3',version:(previous?.version||0)+1,confirmedBy:user.id,confirmedAt:now(),...(old?.createdAt?{createdAt:old.createdAt}:{})});
   // Replacing the job ID invalidates an older worker's lease and any cached proposal.
   for(const row of store.list('meterSubmissions',user.id).filter(row=>row.status==='pending'&&row.roomId===room.id&&row.utility===input.utility))for(const photo of row.photos||[])queueRow(row,photo.fileId,{replace:true});
   audit(store,user,'meter-profile-confirm','meterProfiles',saved,'Chủ nhà xác nhận số bánh số và phần lẻ của công tơ cơ.');return saved;
  });
  if(active&&active.row.roomId===room.id&&active.row.utility===input.utility&&active.profileVersion!==profile.version)active.controller.abort();
  wake();return {profile:meterProfileDTO(profile)};
 }
 function scoped(user,key,fileId,version){
  owner(user);must(stringId(key),'Mã bộ ảnh không hợp lệ.');
  const row=store.get('meterSubmissions',key);must(row?.ownerId===user.id,'Không tìm thấy bộ ảnh thuộc quyền quản lý.',404);
  fileId=fileId||row.selectedFileId||row.photos?.[0]?.fileId;
  reader.scope(user,key,fileId,version??row.version,{image:version===undefined});
  return {row,fileId};
 }
 function get(user,key,fileId){
  const scopedRow=scoped(user,key,fileId),{row}=scopedRow;fileId=scopedRow.fileId;
  const profile=confirmedMeterProfile(store,user.id,row.roomId,row.utility);
  const job=store.db.prepare('SELECT * FROM meter_reader_jobs WHERE owner_id=? AND submission_id=? AND file_id=?').get(user.id,key,fileId);
  let state=job?.status|| (profile?'unavailable':'needs_setup'),reason=job?.reason|| (profile?'Ảnh này chưa có tác vụ tự động. Hãy bấm thử lại.':REASONS.needs_setup),proposal=null;
  if(job){
   const file=store.db.prepare('SELECT bytes FROM files WHERE id=? AND owner_id=?').get(fileId,user.id);
   if(job.engine!==meterEngine(row.utility)||row.status!=='pending'||job.submission_version!==row.version||job.profile_version!==(profile?.version??null)||!file||hash(file.bytes)!==job.file_hash){state='needs_review';reason=REASONS.stale;}
   else if(job.proposal_id){
    const record=store.db.prepare('SELECT * FROM meter_reader_proposals WHERE id=? AND owner_id=? AND submission_id=?').get(job.proposal_id,user.id,key);
    if(record&&!record.used_at&&record.expires_at>Date.now()&&record.submission_version===row.version&&record.file_id===fileId&&record.file_hash===job.file_hash){
     const candidate=JSON.parse(record.result);if(candidate.engine===meterEngine(row.utility)&&candidate.model===meterModel(row.utility)&&(row.utility!=='electric'||candidate.ocrEvidence?.scope==='automatic'))proposal=candidate;else{state='needs_review';reason=REASONS.stale;}
    }
    else{state='needs_review';reason=REASONS.expired;}
   }
  }
  if(row.status==='pending')try{reader.scope(user,key,fileId,row.version);assertMeterSubmissionBaseline(store,row);}catch(error){if(![403,404,409].includes(error.status))throw error;state='needs_review';reason=REASONS.stale;proposal=null;}
  return {status:state,proposal,reason,profile:meterProfileDTO(profile),fileId,submissionVersion:row.version};
 }
 function retry(user,key,input){
  owner(user);only(input,['fileId','version']);must(stringId(input.fileId)&&Number.isSafeInteger(input.version),'Chọn ảnh và phiên bản bộ gửi hợp lệ.');
  const {row,fileId}=scoped(user,key,input.fileId,input.version);
  const job=store.db.prepare('SELECT * FROM meter_reader_jobs WHERE submission_id=? AND file_id=?').get(key,fileId);
  if(job&&job.engine===meterEngine(row.utility)&&['queued','processing'].includes(job.status)&&job.submission_version===row.version)return get(user,key,fileId);
  store.transaction(()=>queueRow(row,fileId,{replace:true}));wake();return get(user,key,fileId);
 }
 function revision(user){owner(user);return store.db.prepare('SELECT id,status,proposal_id,updated_at FROM meter_reader_jobs WHERE owner_id=? ORDER BY submission_id,file_id').all(user.id);}
 function guard(job,token){
  const current=store.db.prepare('SELECT id FROM meter_reader_jobs WHERE id=? AND status=? AND lease_token=? AND lease_until>?').get(job.id,'processing',token,Date.now());
  must(current&&!closed,'Tác vụ tự động đã bị thay thế hoặc dừng.',409);
  const row=store.get('meterSubmissions',job.submission_id);must(row?.status==='pending'&&row.version===job.submission_version,'Bộ ảnh đã thay đổi.',409);assertMeterSubmissionBaseline(store,row);
 }
 function finish(job,token,outcome,row){
  guard(job,token);
  store.db.prepare('UPDATE meter_reader_jobs SET status=?,reason=?,proposal_id=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?').run(outcome.status,outcome.reason,outcome.proposal?.id||null,now(),job.id,token);
  if(outcome.status==='ready')store.put('notifications',{id:id('not'),ownerId:row.ownerId,propertyId:row.propertyId,roomId:row.roomId,recipientUserId:row.ownerId,meterSubmissionId:row.id,title:`Đã có chỉ số ${row.utility==='electric'?'điện':'nước'} đề xuất kỳ ${row.period}`,body:'Bộ đọc tự động đã hoàn tất. Hãy mở ảnh gốc và xác nhận chỉ số trước khi lưu.',kind:'general',readBy:[]});
 }
 async function processJob(job,token,controller){
  try{
   const user=store.db.prepare('SELECT * FROM users WHERE id=?').get(job.owner_id),scopedRow=reader.scope(user,job.submission_id,job.file_id,job.submission_version),profile=confirmedMeterProfile(store,job.owner_id,scopedRow.row.roomId,scopedRow.row.utility);
   must(profile&&job.engine===meterEngine(scopedRow.row.utility)&&scopedRow.fileHash===job.file_hash&&profile.version===job.profile_version,'Ảnh, bộ đọc hoặc cấu hình đã thay đổi.',409);
   assertMeterSubmissionBaseline(store,scopedRow.row);active.row=scopedRow.row;active.profileVersion=profile.version;
   await reader.automatic(user,job.submission_id,{fileId:job.file_id,version:job.submission_version},profile,{signal:controller.signal,guard:()=>guard(job,token),onPersist:(outcome,row)=>finish(job,token,outcome,row)});
  }catch(error){
   const current=store.db.prepare('SELECT * FROM meter_reader_jobs WHERE id=? AND lease_token=?').get(job.id,token);if(!current)return;
   const shutdown=closed&&controller.signal.aborted,busy=error.status===429,transient=![400,403,404,409,413,422].includes(error.status);
   // A shared worker occupied by a manual read has not attempted this image yet.
   const attempts=shutdown||busy?Math.max(0,current.attempts-1):current.attempts,again=shutdown||busy||(transient&&attempts<maxAttempts);
   const state=again?'queued':([400,413,422].includes(error.status)?'retake':[403,404,409].includes(error.status)?'needs_review':'unavailable');
   store.db.prepare('UPDATE meter_reader_jobs SET status=?,attempts=?,next_attempt_at=?,reason=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?').run(state,attempts,Date.now()+(shutdown?0:retryMs*Math.max(1,attempts)),REASONS[state]||REASONS.stale,now(),job.id,token);
  }
 }
 function wake(){
  if(closed||running)return;
  if(timer){clearTimeout(timer);timer=null;}
  timer=setTimeout(()=>{timer=null;void drain();},0);timer.unref?.();
 }
 async function drain(){
  if(closed||running)return;
  const time=Date.now();
  const candidate=store.db.prepare("SELECT * FROM meter_reader_jobs WHERE (status='queued' AND next_attempt_at<=?) OR (status='processing' AND lease_until<=?) ORDER BY created_at,file_id LIMIT 1").get(time,time);
  if(!candidate){
   const next=store.db.prepare("SELECT MIN(CASE WHEN status='queued' THEN next_attempt_at ELSE lease_until END) AS due FROM meter_reader_jobs WHERE status IN ('queued','processing')").get();
   if(next?.due!==null&&next?.due!==undefined){timer=setTimeout(()=>{timer=null;void drain();},Math.max(10,Math.min(60_000,next.due-Date.now())));timer.unref?.();}return;
  }
  if(candidate.attempts>=maxAttempts){
   store.db.prepare("UPDATE meter_reader_jobs SET status='unavailable',lease_token=NULL,lease_until=NULL,reason=?,updated_at=? WHERE id=? AND ((status='queued' AND next_attempt_at<=?) OR (status='processing' AND lease_until<=?))").run(REASONS.unavailable,now(),candidate.id,time,time);wake();return;
  }
  const token=id('meter_lease'),claim=store.db.prepare("UPDATE meter_reader_jobs SET status='processing',attempts=attempts+1,lease_token=?,lease_until=?,reason=?,updated_at=? WHERE id=? AND ((status='queued' AND next_attempt_at<=?) OR (status='processing' AND lease_until<=?))").run(token,time+leaseMs,REASONS.processing,now(),candidate.id,time,time);
  if(!claim.changes){wake();return;}
  const controller=new AbortController();active={controller,row:{}};
  running=processJob(candidate,token,controller);
  try{await running;}finally{running=null;active=null;if(!closed)wake();}
 }
 async function close(){closed=true;if(timer)clearTimeout(timer);timer=null;active?.controller.abort();if(running)await running;}
 // Resume only explicit jobs already persisted by this automatic reader.
 if(store.db.prepare("SELECT 1 FROM meter_reader_jobs WHERE status IN ('queued','processing') LIMIT 1").get())wake();
 return {enqueue,enqueueCreated,get,retry,getProfile,saveProfile,revision,close};
}
