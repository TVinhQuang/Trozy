/** Project-local CPU meter inference. No downloads or business/database access. */
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,statSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';
import {projectDirectory,projectRoot} from '../shared/project-paths.mjs';

const ROOT='.runtime/meter-digits/visionstate-yolo';
const WHEEL_HASH='5644705e1f0e684b30bf3c7a6cb23e7eb1ddda616cd16b5321423f45bf7fd8b6';
const YOLO_HASH='f2882a477bc12ecc5526cf73438d254945271c3e1b2b4214aa8e4deb637c3be9';
const PADDLE_ROOT='.runtime/paddleocr';
const DET_HASH='d73e0058b7a8086bbd57f3d10b8bcd4ff95363f67e06e2762b5e814fe9c9410e';
const REC_HASH='5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634';
const PADDLE_HASH=createHash('sha256').update(DET_HASH+':'+REC_HASH).digest('hex');
const PADDLE_CONFIG_HASHES={
 'PP-OCRv6_small_det_onnx_infer/inference.yml':'193f435274bf9f0b5f71a929bbfbcf148282df7e633b34e7c373e8f44741b516',
 'PP-OCRv6_small_det_onnx_infer/inference.json':'89240f689a4a77aad75ef55a8df0a15c8e1d4980a327d17e58f24bbadde5aeab',
 'PP-OCRv6_small_rec_onnx_infer/inference.yml':'ab078671bb49f06228eadccd34f1bb501e157f7a047095ffb943ba81512c77d1',
 'PP-OCRv6_small_rec_onnx_infer/inference.json':'f0bf53c853937a917affdd74467472167727f8ab0f0f7bded01c4a16c27e46e6',
};
const MAX_IMAGE=40*1024*1024,MAX_OUTPUT=192*1024;
const modelCache=new Map();

export class MeterReaderError extends Error{
 constructor(status,message){super(message);this.name='MeterReaderError';this.status=status;}
}
const unavailable=()=>new MeterReaderError(503,'Bộ đọc cục bộ chưa sẵn sàng. Bạn vẫn có thể xem ảnh và nhập tay.');
const path=value=>projectDirectory(value);
function modelReady(file,expected){
 try{
  const target=path(file);if(!target||!existsSync(target))return false;
  const stat=statSync(target),key=`${target}:${stat.size}:${stat.mtimeMs}`;
  if(!modelCache.has(key))modelCache.set(key,createHash('sha256').update(readFileSync(target)).digest('hex')===expected);
  return modelCache.get(key);
 }catch{return false;}
}
export function meterReaderStatus(utility='water'){
 const enabled=!['false','0'].includes(String(process.env.TROZY_METER_READER_ENABLED).toLowerCase());
 const executable=path(`${ROOT}/python/${process.platform==='win32'?'python.exe':'bin/python3'}`);
 const worker=path('src/ai/meter_reader_worker.py');
 const packages=path(`${ROOT}/python/Lib/site-packages`);
 const installed=name=>!!packages&&existsSync(join(packages,name,'__init__.py'));
 const common=enabled&&!!executable&&existsSync(executable)&&!!worker&&existsSync(worker)&&['numpy','PIL','cv2','onnxruntime'].every(installed);
 const electric=utility==='electric',paddlePackages=path(`${PADDLE_ROOT}/site-packages`);
 const paddle=!!(common&&paddlePackages&&['paddleocr','paddlex'].every(name=>existsSync(join(paddlePackages,name,'__init__.py')))&&modelReady(`${PADDLE_ROOT}/models/PP-OCRv6_small_det_onnx_infer/inference.onnx`,DET_HASH)&&modelReady(`${PADDLE_ROOT}/models/PP-OCRv6_small_rec_onnx_infer/inference.onnx`,REC_HASH)&&Object.entries(PADDLE_CONFIG_HASHES).every(([file,expected])=>modelReady(`${PADDLE_ROOT}/models/${file}`,expected)));
 const readerAvailable=electric?paddle:!!(common&&modelReady(`${ROOT}/models/wheels-v2.onnx`,WHEEL_HASH));
 const locatorAvailable=electric?paddle:!!(common&&['torch','ultralytics'].every(installed)&&modelReady(`${ROOT}/models/stage1_meter_window_digits.pt`,YOLO_HASH));
 return {available:readerAvailable,readerAvailable,locatorAvailable,automaticAvailable:readerAvailable&&locatorAvailable,engine:electric?'paddleocr':'visionstate',model:electric?'paddleocr-ppocrv6':'wheels-v2',mechanicalOnly:true,
  message:readerAvailable?(electric?'Bộ đọc ảnh điện PaddleOCR sẵn sàng.':'Bộ đọc ảnh nước YOLO + VisionState sẵn sàng.')+' Đối chiếu đề xuất với ảnh trước khi lưu.':'Bộ đọc cục bộ chưa sẵn sàng; bạn vẫn có thể nhập tay.'};
}

function validConfig(digits,decimals){return Number.isInteger(digits)&&digits>=1&&digits<=12&&Number.isInteger(decimals)&&decimals>=0&&decimals<=4&&decimals<digits&&digits-decimals<=9;}
function validCorners(value){return Array.isArray(value)&&value.length===4&&value.every(point=>Array.isArray(point)&&point.length===2&&point.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1));}
function validateInput(input){
 if(!input||!['read','locate','auto'].includes(input.mode)||!Buffer.isBuffer(input.bytes)||!input.bytes.length||input.bytes.length>MAX_IMAGE)throw new MeterReaderError(400,'Ảnh hoặc tác vụ đọc công tơ không hợp lệ.');
 if(input.mime!=='image/png'||!input.bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new MeterReaderError(415,'Bộ đọc cần ảnh PNG đã chuẩn hóa từ máy chủ.');
 if(input.mode==='read'){
  const {digits,decimals,corners}=input;
  if(!validConfig(digits,decimals)||!['electric','water'].includes(input.utility)||!validCorners(corners))throw new MeterReaderError(400,'Vùng số hoặc cấu hình công tơ không hợp lệ.');
 }
 if(input.mode==='auto'){
  const profile=input.profile;
  if(!['electric','water'].includes(input.utility)||(profile!==undefined&&profile!==null&&(!profile||typeof profile!=='object'||Array.isArray(profile)||Object.keys(profile).some(key=>!['digits','decimals'].includes(key))||!validConfig(profile.digits,profile.decimals))))throw new MeterReaderError(400,'Cấu hình đọc tự động không hợp lệ.');
 }
 if(input.mode==='locate'&&input.utility!==undefined&&!['electric','water'].includes(input.utility))throw new MeterReaderError(400,'Loại công tơ không hợp lệ.');
 if(input.mode==='locate'&&input.profile!=null&&!validConfig(input.profile.digits,input.profile.decimals))throw new MeterReaderError(400,'Cấu hình tìm vùng không hợp lệ.');
}
function checkedEnvelope(output,mode,utility){
 let envelope;try{envelope=JSON.parse(output);}catch{throw unavailable();}
 if(envelope?.ok!==true){if(envelope?.code==='invalid_image')throw new MeterReaderError(422,'Ảnh, vùng hàng số hoặc cấu hình chưa phù hợp. Chọn lại vùng hoặc nhập tay.');throw unavailable();}
 const result=envelope.result;
 const electric=utility==='electric',digest=electric?PADDLE_HASH:mode==='locate'?YOLO_HASH:WHEEL_HASH;
 if(!result||!Number.isInteger(result.width)||!Number.isInteger(result.height)||result.width<1||result.height<1||result.width>8000||result.height>8000||result.width*result.height>12000000||!Array.isArray(result.warnings)||result.warnings.length>12||result.warnings.some(value=>typeof value!=='string'||value.length>1000))throw unavailable();
 if(mode==='locate'){
  if(result.modelDigest!==digest||!['selected','no_window','ambiguous_window','invalid_window'].includes(result.status)||!Array.isArray(result.candidates)||result.candidates.length>8)throw unavailable();
 }else{
  if(result.modelDigest!==digest||result.engine!==(electric?'paddleocr':'visionstate')||result.model!==(electric?'paddleocr-ppocrv6':'wheels-v2')||!(mode==='auto'?['ready','needs_review','retake','needs_setup']:['ready','needs_review','retake']).includes(result.status)||!Number.isFinite(result.confidence)||result.confidence<0||result.confidence>1.0000001)throw unavailable();
  if(electric&&(!Array.isArray(result.cells)||result.cells.length!==0||!result.ocrEvidence||!Array.isArray(result.ocrEvidence.observations)||result.ocrEvidence.observations.length>32))throw unavailable();
  if(mode==='auto'){
   if(!['confirmed',null].includes(result.profileSource)||result.configNeedsConfirmation!==false||!Array.isArray(result.cells))throw unavailable();
   if(result.status==='ready'){
    const config=result.config;
    if(result.profileSource!=='confirmed'||!config||!validConfig(config.digits,config.decimals)||!validCorners(config.corners))throw unavailable();
   }else if(result.reading!==null)throw unavailable();
  }
 }
 return result;
}

/** Factory permits process-lifecycle tests without replacing API authorization. */
export function createMeterReader({spawnImpl=spawn,timeoutMs}={}){
 let active=false;
 async function run(input,{signal}={}){
  validateInput(input);
  if(signal?.aborted)throw new MeterReaderError(499,'Yêu cầu đọc ảnh đã được hủy.');
  const status=meterReaderStatus(input.utility);
  if(input.mode==='auto'?!status.automaticAvailable:input.mode==='read'?!status.readerAvailable:!status.locatorAvailable)throw unavailable();
  if(active)throw new MeterReaderError(429,'Bộ đọc đang xử lý ảnh khác. Vui lòng thử lại sau.');
  active=true;
  let directory;
  try{
   const parent=path('.runtime/tmp');if(!parent)throw unavailable();
   mkdirSync(parent,{recursive:true});directory=mkdtempSync(join(parent,'meter-reader-'));
   const runtime=path(ROOT),python=path(`${ROOT}/python/${process.platform==='win32'?'python.exe':'bin/python3'}`),worker=path('src/ai/meter_reader_worker.py');
   if(!runtime||!python||!worker)throw unavailable();
   const env={...process.env,TEMP:directory,TMP:directory,TMPDIR:directory,PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1',PYTHONUTF8:'1',
    YOLO_CONFIG_DIR:path('.cache/ultralytics-meter-reader'),MPLCONFIGDIR:path('.cache/meter-reader-matplotlib'),TORCH_HOME:join(runtime,'cache/torch'),
    HF_HOME:join(runtime,'cache/huggingface'),XDG_CACHE_HOME:path('.cache'),YOLO_AUTOINSTALL:'false',YOLO_OFFLINE:'true',OMP_NUM_THREADS:'2',OPENBLAS_NUM_THREADS:'2'};
   Object.assign(env,{TROZY_METER_ENGINE:input.utility==='electric'?'paddleocr':'visionstate',PADDLE_PDX_CACHE_HOME:path('.cache/paddlex'),PADDLEOCR_HOME:path(`${PADDLE_ROOT}/cache`),PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK:'True',HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',MODELSCOPE_CACHE:path('.cache/modelscope'),HOME:directory,USERPROFILE:directory,LOCALAPPDATA:directory,APPDATA:directory});
   delete env.PYTHONPATH;delete env.PYTHONHOME;
   const configured=Number(process.env.TROZY_METER_READER_TIMEOUT_MS||30000);
   const duration=timeoutMs??(Number.isFinite(configured)?Math.max(2000,Math.min(60000,configured)):30000);
   const request=JSON.stringify({protocol:1,mode:input.mode,image:input.bytes.toString('base64'),utility:input.utility??'water',...(input.mode==='read'?{corners:input.corners,digits:input.digits,decimals:input.decimals}:input.mode==='auto'||input.mode==='locate'?{profile:input.profile??null}:{})});
   return await new Promise((resolvePromise,rejectPromise)=>{
    let child,finished=false,size=0,output='',failure,killTimer;
    const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',abort);error?rejectPromise(error):resolvePromise(value);};
    const stop=error=>{failure=error;if(child&&!child.killed){child.kill();killTimer=setTimeout(()=>{try{child.kill('SIGKILL');}catch{}},500);killTimer.unref?.();}};
    const abort=()=>stop(new MeterReaderError(499,'Yêu cầu đọc ảnh đã được hủy.'));
    const timer=setTimeout(()=>stop(new MeterReaderError(504,'Đọc ảnh quá lâu. Hãy thử lại hoặc nhập tay.')),duration);timer.unref?.();
    try{child=spawnImpl(python,['-I','-B',worker],{cwd:projectRoot,env,stdio:['pipe','pipe','pipe'],windowsHide:true});}
    catch{finish(unavailable());return;}
    child.on('error',()=>finish(unavailable()));
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>MAX_OUTPUT){stop(unavailable());return;}output+=chunk.toString('utf8');});
    // Drain bounded diagnostics without logging file contents or exposing paths.
    child.stderr.on('data',()=>{});
    child.stdin.on('error',()=>{if(!failure)stop(unavailable());});
    child.on('close',code=>{if(failure){finish(failure);return;}if(code!==0){finish(unavailable());return;}try{finish(null,checkedEnvelope(output,input.mode,input.utility));}catch(error){finish(error);}});
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted){abort();return;}
    child.stdin.end(request);
   });
  }finally{
   // Only this call's mkdtemp directory; never remove runtime/model/source files.
   try{if(directory&&path(directory)===directory&&dirname(directory)===resolve(projectRoot,'.runtime/tmp')&&basename(directory).startsWith('meter-reader-'))await rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
   finally{active=false;}
  }
 }
 return {run,status:meterReaderStatus};
}
const reader=createMeterReader();
export const runMeterReader=reader.run;
