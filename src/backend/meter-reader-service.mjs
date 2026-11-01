/** Owner-guided mechanical-meter proposals. Private evidence never writes a reading. */
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {id,now} from './db.mjs';
import {audit,fail} from './domain.mjs';
import {rasterMimeFromBytes} from '../shared/raster-image.mjs';
import {meterReaderStatus,runMeterReader} from '../ai/meter-reader.mjs';
import {confirmedMeterProfile,meterEngine,meterModel,validMeterLayout} from './meter-profile.mjs';

const must=(condition,message,status=400)=>{if(!condition)fail(status,message);};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const only=(value,keys)=>must(object(value)&&Object.keys(value).every(key=>keys.includes(key)),'Dữ liệu đọc công tơ chứa trường không hợp lệ.');
const stringId=value=>typeof value==='string'&&value.length>0&&value.length<=80;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const unit=utility=>utility==='electric'?'kWh':'m3';
const probability=value=>Number.isFinite(value)&&value>=0&&value<=1;
const MAX_IMAGE_BYTES=5*1024*1024,MAX_PIXELS=12_000_000,PROPOSAL_TTL_MS=30*60*1000;

export function initializeMeterReader(store){
 store.db.exec(`CREATE TABLE IF NOT EXISTS meter_reader_proposals(
 id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 submission_id TEXT NOT NULL,file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
 submission_version INTEGER NOT NULL,file_hash TEXT NOT NULL,result TEXT NOT NULL CHECK(json_valid(result)),
 created_at TEXT NOT NULL,expires_at INTEGER NOT NULL,used_at TEXT);
 CREATE INDEX IF NOT EXISTS meter_reader_proposal_owner ON meter_reader_proposals(owner_id,submission_id,created_at DESC);`);
}

function owner(user){must(user?.role==='landlord','Chỉ chủ nhà được đọc và xác minh ảnh công tơ.',403);}
function validCorners(value){
 must(Array.isArray(value)&&value.length===4&&value.every(point=>Array.isArray(point)&&point.length===2&&point.every(n=>Number.isFinite(n)&&n>=0&&n<=1)),'Chọn bốn góc của hàng số trong ảnh.');
 const cross=value.map((a,i)=>{const b=value[(i+1)%4],c=value[(i+2)%4];return (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);});
 must(cross.every(n=>n>1e-7),'Bốn góc cần tạo một vùng lồi, theo thứ tự trên trái, trên phải, dưới phải, dưới trái.');
 return value.map(point=>[...point]);
}
function config(input){
 const {digits,decimals}=input;
 must(Number.isSafeInteger(digits)&&digits>=1&&digits<=12&&Number.isSafeInteger(decimals)&&decimals>=0&&decimals<=4&&decimals<digits&&digits-decimals<=9,'Cấu hình từ 1 đến 12 bánh số, tối đa 4 số lẻ và 9 số nguyên.');
 must(input.regionConfirmed===true,'Hãy kiểm tra và xác nhận vùng chứa đầy đủ hàng số trước khi đọc.');
 return {digits,decimals,corners:validCorners(input.corners)};
}
function warnings(value){
 must(Array.isArray(value)&&value.length<=12&&value.every(row=>typeof row==='string'&&row.length<=1000),'Thông báo của bộ đọc không hợp lệ.',502);
 return value;
}
function observationInsideConfiguration(observation,configuration){
 const center=observation.corners.reduce((point,corner)=>[point[0]+corner[0]/4,point[1]+corner[1]/4],[0,0]);
 return configuration.corners.every((point,index)=>{
  const next=configuration.corners[(index+1)%4];
  return (next[0]-point[0])*(center[1]-point[1])-(next[1]-point[1])*(center[0]-point[0])>=-1e-7;
 });
}
function polygonArea(points){return Math.abs(points.reduce((area,point,index)=>{const next=points[(index+1)%points.length];return area+point[0]*next[1]-next[0]*point[1];},0))/2;}
function polygonIntersection(subject,clip){
 let points=subject.map(point=>[...point]);
 for(let edge=0;edge<clip.length&&points.length;edge++){
  const a=clip[edge],b=clip[(edge+1)%clip.length],side=point=>(b[0]-a[0])*(point[1]-a[1])-(b[1]-a[1])*(point[0]-a[0]),output=[];
  let previous=points.at(-1),previousSide=side(previous);
  for(const point of points){
   const currentSide=side(point),previousInside=previousSide>=-1e-10,currentInside=currentSide>=-1e-10;
   if(previousInside!==currentInside){const t=previousSide/(previousSide-currentSide);output.push([previous[0]+t*(point[0]-previous[0]),previous[1]+t*(point[1]-previous[1])]);}
   if(currentInside)output.push(point);previous=point;previousSide=currentSide;
  }
  points=output;
 }
 return points;
}
function validateResult(result,configuration,utility,dimensions,expectedScope='owner-region'){
 must(object(result)&&['ready','needs_review','retake'].includes(result.status)&&probability(result.confidence)&&result.width===dimensions.width&&result.height===dimensions.height,'Kết quả bộ đọc ảnh không hợp lệ.',502);
 must(result.engine===meterEngine(utility)&&result.model===meterModel(utility),'Kết quả không thuộc bộ đọc đã chọn cho loại công tơ này.',502);
 const resultWarnings=warnings(result.warnings||[]);
 const quality=result.quality,checks=quality?.checks,metrics=quality?.metrics;
 const checkKeys=['resolution','exposure','contrast','sharpness'];
 must(object(quality)&&typeof quality.canRead==='boolean'&&object(checks)&&checkKeys.every(key=>typeof checks[key]==='boolean')&&object(metrics)&&['width','height'].every(key=>Number.isSafeInteger(metrics[key])&&metrics[key]>0&&metrics[key]<=8000)&&['cellWidth','meanLuma','contrast','edgeEnergy'].every(key=>Number.isFinite(metrics[key])&&metrics[key]>=0)&&metrics.meanLuma<=255&&metrics.contrast<=255,'Bằng chứng chất lượng ảnh không hợp lệ.',502);
 const cells=result.cells||[];
 let ocrEvidence;
 if(utility==='electric'){
  must(Array.isArray(cells)&&cells.length===0,'PaddleOCR không được tạo bằng chứng giả cho từng bánh số.',502);
  ocrEvidence=validateOCREvidence(result,configuration,expectedScope);
 }else must(Array.isArray(cells)&&cells.length<=configuration.digits&&cells.every((cell,index)=>object(cell)&&cell.index===index&&Number.isFinite(cell.position)&&cell.position>=0&&cell.position<=9.9&&probability(cell.confidence)&&Array.isArray(cell.alternatives)&&cell.alternatives.length<=5&&cell.alternatives.every(alternative=>object(alternative)&&Number.isFinite(alternative.position)&&alternative.position>=0&&alternative.position<=9.9&&probability(alternative.confidence))),'Bằng chứng bánh số không hợp lệ.',502);
 let reading=null;
 if(result.status==='ready'){
  const value=result.reading,integerCount=configuration.digits-configuration.decimals;
  must(object(value)&&typeof value.digits==='string'&&new RegExp(`^\\d{${configuration.digits}}$`).test(value.digits)&&result.confidence>=.7,'Chưa có đầy đủ bằng chứng rõ cho từng bánh số.',502);
  must(quality.canRead&&checkKeys.every(key=>checks[key]),'Ảnh chưa đủ rõ để đề xuất.',502);
  if(utility==='water')must(cells.length===configuration.digits&&cells.every(cell=>cell.confidence>=.7)&&Math.abs(Math.min(...cells.map(cell=>cell.confidence))-result.confidence)<1e-6,'Một bánh số chưa đủ rõ để đề xuất.',502);
  const integerDigits=value.digits.slice(0,integerCount),fractionalDigits=value.digits.slice(integerCount);
  const displayText=integerDigits+(configuration.decimals?'.'+fractionalDigits:'');
  must(value.integerDigits===integerDigits&&value.fractionalDigits===fractionalDigits&&value.displayText===displayText&&value.integerValue===Number(integerDigits)&&value.unit===unit(utility),'Đề xuất không khớp cấu hình số bánh và phần thập phân.',502);
  reading={digits:value.digits,displayText,integerDigits,fractionalDigits,integerValue:Number(integerDigits),unit:unit(utility)};
 }else must(result.reading===null||result.reading===undefined,'Ảnh chưa rõ không được trả đề xuất chỉ số.',502);
 return {status:result.status,reading,confidence:result.confidence,warnings:resultWarnings,model:meterModel(utility),engine:meterEngine(utility),quality:{canRead:quality.canRead,checks:Object.fromEntries(checkKeys.map(key=>[key,checks[key]])),metrics:{width:metrics.width,height:metrics.height,cellWidth:metrics.cellWidth,meanLuma:metrics.meanLuma,contrast:metrics.contrast,edgeEnergy:metrics.edgeEnergy}},cells:cells.map(cell=>({index:cell.index,position:cell.position,confidence:cell.confidence,alternatives:cell.alternatives.map(alternative=>({position:alternative.position,confidence:alternative.confidence}))})),...(ocrEvidence?{ocrEvidence}:{})};
}

function validateOCREvidence(result,configuration,expectedScope){
 const evidence=result.ocrEvidence;
 must(object(evidence)&&evidence.scope===expectedScope&&Array.isArray(evidence.observations)&&evidence.observations.length<=32&&Array.isArray(evidence.selectedObservationIndices)&&evidence.selectedObservationIndices.length<=2&&typeof evidence.agreement==='boolean','Bằng chứng OCR hoặc phạm vi đọc không hợp lệ.',502);
 const observations=evidence.observations.map(row=>{
  must(object(row)&&typeof row.text==='string'&&row.text.length>0&&row.text.length<=96&&probability(row.confidence)&&['region','full','crop'].includes(row.pass),'Quan sát OCR không hợp lệ.',502);
  let corners;try{corners=validCorners(row.corners);}catch{fail(502,'Vùng quan sát OCR không hợp lệ.');}
  return {text:row.text,confidence:row.confidence,corners,pass:row.pass};
 });
 const selected=evidence.selectedObservationIndices;
 must(new Set(selected).size===selected.length&&selected.every(index=>Number.isSafeInteger(index)&&index>=0&&index<observations.length),'Tham chiếu quan sát OCR không hợp lệ.',502);
 if(result.status==='ready'){
  const passes=selected.map(index=>observations[index].pass),firstPass=expectedScope==='owner-region'?'region':'full';
  must(evidence.agreement&&selected.length===2&&passes.includes(firstPass)&&passes.includes('crop'),'Cần hai lần đọc cùng phạm vi ảnh hoặc vùng số khớp nhau.',502);
  must(selected.every(index=>observationInsideConfiguration(observations[index],configuration)),'Hai quan sát OCR phải nằm trong vùng chỉ số đang đọc.',502);
  const polygons=selected.map(index=>observations[index].corners),areas=polygons.map(polygonArea);
  must(polygons.every((polygon,index)=>polygonArea(polygonIntersection(polygon,configuration.corners))>=.5*areas[index]-1e-9)&&polygonArea(polygonIntersection(polygons[0],polygons[1]))>=.5*Math.min(...areas)-1e-9,'Hai quan sát OCR phải cùng bao phủ vùng chữ số đã chọn.',502);
  const integerCount=configuration.digits-configuration.decimals,pattern=new RegExp(configuration.decimals?`^(?:[0-9]{${configuration.digits}}|[0-9]{${integerCount}}\\.[0-9]{${configuration.decimals}})$`:`^[0-9]{${configuration.digits}}$`);
  const texts=selected.map(index=>observations[index].text.replace(/\s/g,''));
  must(texts.every(text=>pattern.test(text)&&text.replace('.','')===result.reading?.digits),'Hai quan sát OCR phải giữ nguyên toàn bộ chữ số và vị trí phần lẻ đã cấu hình.',502);
  must(selected.every(index=>observations[index].confidence>=.85)&&Math.abs(Math.min(...selected.map(index=>observations[index].confidence))-result.confidence)<1e-6,'Độ tin cậy của hai quan sát OCR chưa đủ hoặc không khớp.',502);
 }
 return {observations,selectedObservationIndices:[...selected],agreement:evidence.agreement,scope:expectedScope};
}

/** Called inside the existing atomic landlord-review transaction. */
export function validateReaderProposalForReview(store,user,row,input,selectedFileId){
 if(input.proposalId===undefined)return null;
 must(stringId(input.proposalId),'Mã đề xuất công tơ không hợp lệ.');
 const record=store.db.prepare('SELECT * FROM meter_reader_proposals WHERE id=? AND owner_id=? AND submission_id=?').get(input.proposalId,user.id,row.id);
 must(record&&!record.used_at&&record.expires_at>Date.now()&&record.submission_version===row.version&&record.file_id===selectedFileId,'Đề xuất đã hết hạn hoặc không còn khớp ảnh/phiên bản đang xem. Hãy đọc lại ảnh.',409);
 const file=store.db.prepare('SELECT bytes FROM files WHERE id=? AND owner_id=?').get(selectedFileId,user.id);
 must(file&&hash(file.bytes)===record.file_hash,'Ảnh nguồn của đề xuất đã thay đổi. Hãy đọc lại ảnh.',409);
 const proposal=JSON.parse(record.result);
 must(proposal.engine===meterEngine(row.utility)&&proposal.model===meterModel(row.utility),'Bộ đọc công tơ đã thay đổi. Hãy đọc lại ảnh.',409);
 if(row.utility==='electric')try{validateOCREvidence(proposal,proposal.config,proposal.source==='automatic'?'automatic':'owner-region');}catch{fail(409,'Bằng chứng hoặc phạm vi OCR không còn hợp lệ. Hãy đọc lại ảnh.');}
 if(proposal.profileVersion!==undefined&&proposal.profileVersion!==null){
  const profile=confirmedMeterProfile(store,user.id,row.roomId,row.utility);
  must(profile?.version===proposal.profileVersion&&profile.digits===proposal.config?.digits&&profile.decimals===proposal.config?.decimals,'Cấu hình công tơ đã thay đổi. Hãy đọc lại ảnh.',409);
 }
 must(proposal.status==='ready'&&proposal.reading&&proposal.reading.integerValue===input.value&&proposal.reading.unit===unit(row.utility),'Chỉ số đã sửa khác đề xuất; hãy xác minh như chỉ số nhập tay.');
 if(proposal.config.decimals>0)must(input.fractionalChecked===true,'Hãy đối chiếu phần lẻ và xác nhận chỉ ghi phần nguyên vào kỳ này.');
 store.db.prepare('UPDATE meter_reader_proposals SET used_at=? WHERE id=?').run(now(),record.id);
 return proposal;
}

export function createMeterReaderService(store,options={}){
 initializeMeterReader(store);
 const run=options.run||runMeterReader,status=options.status||meterReaderStatus;
 function scope(user,key,fileId,version,{image=false}={}){
  owner(user);must(stringId(key)&&stringId(fileId),'Ảnh hoặc bộ gửi không hợp lệ.');
  const row=store.get('meterSubmissions',key);
  must(row&&row.ownerId===user.id,'Không tìm thấy bộ ảnh thuộc quyền quản lý.',404);
  if(!image){
   must(Number.isSafeInteger(version)&&version>=1,'Phiên bản bộ ảnh không hợp lệ.');
   must(row.status==='pending'&&row.version===version,'Bộ ảnh đã được xử lý hoặc thay đổi; hãy tải lại dữ liệu.',409);
   const current=store.list('readings',user.id).find(reading=>reading.roomId===row.roomId&&reading.period===row.period);
   must(!current?.confirmed&&!store.list('invoices',user.id).some(invoice=>invoice.roomId===row.roomId&&invoice.period===row.period&&invoice.status!=='cancelled'),'Kỳ này đã chốt hoặc đã có hóa đơn; không nhận đề xuất mới.',409);
   if(row.source!=='owner'){
    const tenant=store.get('tenants',row.tenantId);
    must(tenant?.status==='active'&&tenant.roomId===row.roomId&&store.list('contracts',user.id).some(contract=>contract.tenantId===row.tenantId&&contract.roomId===row.roomId&&contract.status==='active'&&row.period>=contract.startDate.slice(0,7)&&row.period<=contract.endDate.slice(0,7)),'Lượt thuê đã thay đổi; hãy kiểm tra dữ liệu trước khi đọc ảnh.',409);
   }
  }
  must((row.photos||[]).some(photo=>photo.fileId===fileId),'Ảnh không thuộc bộ gửi đang xem.',403);
  const file=store.db.prepare('SELECT * FROM files WHERE id=? AND owner_id=?').get(fileId,user.id);
  must(file&&file.property_id===row.propertyId&&(!file.room_id||file.room_id===row.roomId)&&(!file.tenant_id||file.tenant_id===row.tenantId),'Ảnh không thuộc quyền hoặc phòng đang xem.',403);
  return {row,file,fileHash:hash(file.bytes)};
 }
 async function normalize(file){
  const bytes=Buffer.from(file.bytes);
  must(bytes.length>0&&bytes.length<=MAX_IMAGE_BYTES,'Ảnh để đọc công tơ tối đa 5 MB.',413);
  must(rasterMimeFromBytes(bytes),'Chỉ đọc ảnh công tơ PNG, JPEG hoặc WebP.');
  try{
   const image=sharp(bytes,{limitInputPixels:MAX_PIXELS,animated:false,failOn:'error'}),metadata=await image.metadata();
   must(['png','jpeg','webp'].includes(metadata.format)&&(!metadata.pages||metadata.pages===1)&&metadata.width>0&&metadata.height>0&&metadata.width<=8000&&metadata.height<=8000&&metadata.width*metadata.height<=MAX_PIXELS,'Ảnh cần là ảnh tĩnh không quá 12 triệu pixel và 8000 pixel mỗi cạnh.');
   const normalized=await image.rotate().flatten({background:'#ffffff'}).removeAlpha().toColourspace('srgb').png().toBuffer({resolveWithObject:true});
   must(normalized.data.length<=40*1024*1024,'Ảnh giải mã vượt giới hạn bộ đọc.',413);
   return {bytes:normalized.data,width:normalized.info.width,height:normalized.info.height};
  }catch(error){if(error.status)throw error;fail(400,'Ảnh bị hỏng hoặc không thể giải mã an toàn. Vui lòng chọn ảnh khác.');}
 }
 async function preview(user,key,fileId){const scoped=scope(user,key,fileId,undefined,{image:true});return normalize(scoped.file);}
 async function locate(user,key,input,{signal}={}){
  owner(user);only(input,['fileId','version','digits','decimals']);
  must((input.digits===undefined&&input.decimals===undefined)||validMeterLayout(input.digits,input.decimals),'Số chữ số và phần lẻ để tìm vùng chưa hợp lệ.');
  const scoped=scope(user,key,input.fileId,input.version),decoded=await normalize(scoped.file);
  const profile=input.digits!==undefined?{digits:input.digits,decimals:input.decimals}:confirmedMeterProfile(store,user.id,scoped.row.roomId,scoped.row.utility);
  const result=await run({bytes:decoded.bytes,mime:'image/png',mode:'locate',utility:scoped.row.utility,...(profile?{profile:{digits:profile.digits,decimals:profile.decimals}}:{})},{signal});
  must(!signal?.aborted,'Yêu cầu tìm vùng đã được hủy.',499);
  const current=scope(user,key,input.fileId,input.version);must(current.fileHash===scoped.fileHash,'Ảnh đã thay đổi trong lúc tìm vùng.',409);
  must(object(result)&&['selected','no_window','ambiguous_window','invalid_window'].includes(result.status)&&result.width===decoded.width&&result.height===decoded.height&&Array.isArray(result.candidates)&&result.candidates.length<=20,'Kết quả tìm vùng công tơ không hợp lệ.',502);
  const candidates=result.candidates.map(candidate=>{must(object(candidate)&&probability(candidate.confidence),'Vùng tìm được không hợp lệ.',502);let corners;try{corners=validCorners(candidate.corners);}catch{fail(502,'Bộ định vị trả vùng ảnh không hợp lệ.');}return {corners,confidence:candidate.confidence};});
  return {width:decoded.width,height:decoded.height,status:result.status,candidates,warnings:warnings(result.warnings||[])};
 }
 async function read(user,key,input,{signal}={}){
  owner(user);only(input,['fileId','version','corners','digits','decimals','regionConfirmed']);const configuration=config(input),scoped=scope(user,key,input.fileId,input.version),decoded=await normalize(scoped.file);
  const result=await run({bytes:decoded.bytes,mime:'image/png',mode:'read',...configuration,utility:scoped.row.utility},{signal});
  must(!signal?.aborted,'Yêu cầu đọc ảnh đã được hủy.',499);
  const accepted=validateResult(result,configuration,scoped.row.utility,decoded);
  return store.transaction(()=>{
   const current=scope(user,key,input.fileId,input.version);must(current.fileHash===scoped.fileHash,'Ảnh đã thay đổi trong lúc đọc.',409);
   const created=now(),expires=Date.now()+PROPOSAL_TTL_MS;
   const proposal={...accepted,id:id('meter_prop'),fileId:input.fileId,submissionVersion:input.version,createdAt:created,expiresAt:new Date(expires).toISOString(),config:configuration,requiresConfirmation:true};
   store.db.prepare('INSERT INTO meter_reader_proposals(id,owner_id,submission_id,file_id,submission_version,file_hash,result,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)').run(proposal.id,user.id,key,input.fileId,input.version,scoped.fileHash,JSON.stringify(proposal),created,expires);
   audit(store,user,'meter-read-proposal','meterSubmissions',current.row,`${proposal.id}; ${proposal.status}; chỉ đề xuất, chưa đổi chỉ số`);
   return {proposal};
  });
 }
 async function automatic(user,key,input,profile,{signal,guard=()=>{},onPersist=()=>{}}={}){
  const scoped=scope(user,key,input.fileId,input.version),decoded=await normalize(scoped.file);
  const result=await run({bytes:decoded.bytes,mime:'image/png',mode:'auto',utility:scoped.row.utility,profile:{digits:profile.digits,decimals:profile.decimals}},{signal});
  must(!signal?.aborted,'Yêu cầu đọc ảnh đã được hủy.',499);
  must(object(result)&&['ready','needs_review','retake','needs_setup'].includes(result.status)&&result.width===decoded.width&&result.height===decoded.height&&probability(result.confidence)&&result.engine===meterEngine(scoped.row.utility)&&result.model===meterModel(scoped.row.utility),'Kết quả đọc tự động không hợp lệ.',502);
  must(result.configNeedsConfirmation===false&&['confirmed',null].includes(result.profileSource),'Nguồn cấu hình tự động không hợp lệ.',502);
  if(scoped.row.utility==='electric'&&result.status!=='ready')validateOCREvidence(result,profile,'automatic');
  const resultWarnings=warnings(result.warnings||[]);
  let configuration=null,accepted=null;
  if(result.config!==null&&result.config!==undefined){
   must(object(result.config)&&result.config.digits===profile.digits&&result.config.decimals===profile.decimals,'Cấu hình tự động không khớp công tơ đã xác nhận.',502);
   try{configuration=config({...result.config,regionConfirmed:true});}catch{fail(502,'Vùng số tự động không hợp lệ.');}
  }
  if(result.status==='ready')must(configuration&&result.profileSource==='confirmed','Chưa đủ bằng chứng vùng số và cấu hình để đề xuất.',502);
  if(configuration&&result.quality&&result.status!=='needs_setup')accepted=validateResult(result,configuration,scoped.row.utility,decoded,'automatic');
  else must(result.status!=='ready'&&(result.reading===null||result.reading===undefined)&&Array.isArray(result.cells)&&result.cells.length===0,'Kết quả chưa rõ không được chứa chỉ số.',502);
  return store.transaction(()=>{
   guard();
   const current=scope(user,key,input.fileId,input.version),latest=confirmedMeterProfile(store,user.id,current.row.roomId,current.row.utility);
   must(current.fileHash===scoped.fileHash&&latest?.version===profile.version&&latest.digits===profile.digits&&latest.decimals===profile.decimals,'Ảnh hoặc cấu hình đã thay đổi trong lúc đọc tự động.',409);
   let proposal=null;
   if(accepted){
    const created=now(),expires=Date.now()+PROPOSAL_TTL_MS;
    proposal={...accepted,id:id('meter_prop'),fileId:input.fileId,submissionVersion:input.version,createdAt:created,expiresAt:new Date(expires).toISOString(),config:configuration,requiresConfirmation:true,profileSource:'confirmed',profileVersion:profile.version,configNeedsConfirmation:false,source:'automatic'};
    store.db.prepare('INSERT INTO meter_reader_proposals(id,owner_id,submission_id,file_id,submission_version,file_hash,result,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)').run(proposal.id,user.id,key,input.fileId,input.version,scoped.fileHash,JSON.stringify(proposal),created,expires);
    audit(store,user,'meter-auto-proposal','meterSubmissions',current.row,`${proposal.id}; ${proposal.status}; chỉ đề xuất, chưa đổi chỉ số`);
   }
   const outcome={status:result.status,proposal,reason:resultWarnings.join(' ')|| (result.status==='ready'?'Đã có chỉ số đề xuất. Hãy đối chiếu ảnh trước khi xác minh.':'Chưa đủ bằng chứng để đọc tự động. Hãy kiểm tra ảnh hoặc dùng chọn vùng thủ công.')};
   onPersist(outcome,current.row);return outcome;
  });
 }
 return {status:async(user,utility)=>{owner(user);must(utility===undefined||['electric','water'].includes(utility),'Loại công tơ không hợp lệ.');return status(utility);},preview,locate,read,automatic,scope};
}
