import {execFile} from 'node:child_process';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {projectDirectory,projectRoot} from '../shared/project-paths.mjs';
import {rasterMimeFromBytes} from '../shared/raster-image.mjs';
import {fail,getRecord} from './domain.mjs';

const fold=text=>String(text).normalize('NFD').replace(/\p{M}/gu,'').replace(/đ/gi,'d').toLowerCase().trim();
export function contractTarget(store,user,input){
  if(user.role!=='landlord')fail(403,'Chỉ chủ trọ được nhập từ hợp đồng giấy.');
  if(!['contracts','tenants'].includes(input.collection))fail(400,'Chọn biểu mẫu hồ sơ hoặc hợp đồng nháp.');
  const room=getRecord(store,user,'rooms',input.roomId);
  if(input.id){
    const record=getRecord(store,user,input.collection,input.id);
    if(record.roomId!==room.id||input.collection==='contracts'&&record.status!=='draft')fail(409,'Hồ sơ hoặc hợp đồng nháp không khớp với phòng đang nhập.');
  }
  return room;
}
export function contractImage(input){
  if(input.source!=='paper-contract'||/cccd|cmnd|can[\s_-]*cuoc|chung[\s_-]*minh|identity[\s_-]*card/.test(fold(input.fileName)))fail(400,'Chỉ nhận ảnh hợp đồng giấy. CCCD nhập tay.');
  if(typeof input.image!=='string'||!input.image.length||input.image.length>7*1024*1024)fail(413,'Ảnh hợp đồng tối đa 5 MB.');
  const bytes=Buffer.from(input.image,'base64');
  if(bytes.length>5*1024*1024)fail(413,'Ảnh hợp đồng tối đa 5 MB.');
  if(!['image/jpeg','image/png','image/webp'].includes(rasterMimeFromBytes(bytes)))fail(415,'Chọn ảnh JPG, PNG hoặc WebP đọc được.');
  return bytes;
}
export async function readPaperContract(bytes){
  const parent=projectDirectory(join(projectRoot,'.runtime','tmp'));
  if(!parent)fail(503,'OCR hợp đồng chưa sẵn sàng.');
  await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'paper-contract-'));
  try{
    const python=join(projectRoot,'.runtime','meter-digits','visionstate-yolo','python',process.platform==='win32'?'python.exe':'bin/python3');
    const env={...process.env,TMP:dir,TEMP:dir,TMPDIR:dir,HOME:dir,USERPROFILE:dir,LOCALAPPDATA:dir,APPDATA:dir,XDG_CACHE_HOME:dir,HF_HOME:dir,MPLCONFIGDIR:dir,PYTHONDONTWRITEBYTECODE:'1',PYTHONNOUSERSITE:'1',HF_HUB_OFFLINE:'1',PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK:'True',OMP_NUM_THREADS:'2',OPENBLAS_NUM_THREADS:'2'};
    delete env.TROZY_USE_TRAIN_GPU;delete env.TROZY_TRAIN_GPU_SITE;
    const output=await new Promise((resolve,reject)=>{
      const child=execFile(python,['-X','utf8','-I','-B',join(projectRoot,'src','ai','paper_contract_ocr.py')],{windowsHide:true,env,cwd:projectRoot,timeout:90000,maxBuffer:2*1024*1024},(error,stdout)=>error?reject(error):resolve(stdout));
      child.stdin.on('error',()=>{});child.stdin.end(bytes);
    });
    const result=JSON.parse(output);
    if(result.error==='image')fail(422,'Không đọc được ảnh hợp đồng. Hãy chọn ảnh rõ hơn.');
    if(!Array.isArray(result.lines))fail(503,'OCR hợp đồng chưa sẵn sàng. Bạn có thể nhập tay.');
    return result.lines;
  }catch(error){if(error.status)throw error;fail(503,'OCR hợp đồng chưa sẵn sàng. Bạn có thể nhập tay.');}
  finally{if(dirname(dir)===parent&&projectDirectory(dir)===dir)await rm(dir,{recursive:true,force:true,maxRetries:3});}
}
const labels={name:/^(?:ben thue(?: phong)?(?: \(ben b\))?|nguoi thue(?: phong)?|ho ten (?:ben|nguoi) thue|tenant(?: name)?)$/,rent:/^(?:gia thue(?: phong)?(?: hang thang)?|tien thue(?: phong)?(?: moi thang)?|monthly rent|rent)$/,deposit:/^(?:tien (?:dat )?coc|deposit)$/,startDate:/^(?:ngay bat dau(?: thue)?|tu ngay|start date)$/,endDate:/^(?:ngay ket thuc|den ngay|end date)$/,birthDate:/^(?:ngay sinh (?:ben|nguoi) thue|tenant date of birth)$/,email:/^(?:email (?:ben|nguoi) thue|tenant email)$/,phone:/^(?:(?:so )?dien thoai (?:ben|nguoi) thue|tenant phone)$/,room:/^(?:phong(?: so)?|ma phong|room)$/};
function typedValue(key,value){
  if(['rent','deposit'].includes(key)){
    const m=fold(value).match(/^(\d{1,3}(?:[., ]\d{3})+|\d+)\s*(?:vnd|dong|d|₫)?(?:\s*\/\s*thang)?$/iu);
    return m?m[1].replace(/[., ]/g,''):'';
  }
  if(key.endsWith('Date')){
    const m=value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    const date=m?[m[3],m[2].padStart(2,'0'),m[1].padStart(2,'0')].join('-'):value;
    return /^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date?date:'';
  }
  return value;
}
export function proposedFields(store,room,collection,lines){
  const values={};
  for(const line of lines){
    const match=line.match(/^([^:：]{2,64})\s*[:：]\s*(.{1,150})$/u);
    if(!match)continue;
    const key=Object.keys(labels).find(k=>labels[k].test(fold(match[1])));if(!key)continue;
    const value=typedValue(key,match[2].trim());if(!value)continue;
    if(Object.hasOwn(values,key)&&values[key]!==value)values[key]='';else values[key]=value;
  }
  if(collection==='contracts'){
    if(values.room&&fold(values.room)===fold(room.code))values.roomId=room.id;
    const matches=values.name?store.list('tenants',room.ownerId).filter(t=>t.roomId===room.id&&fold(t.name)===fold(values.name)):[];
    if(matches.length===1)values.tenantId=matches[0].id;
  }
  const permitted=collection==='contracts'?['roomId','tenantId','rent','deposit','startDate','endDate']:['name','birthDate','phone','email'];
  return Object.fromEntries(permitted.filter(key=>values[key]).map(key=>[key,values[key]]));
}
