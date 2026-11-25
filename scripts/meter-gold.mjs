/**
 * Gold-set manager for real Vietnamese meter photos (data/meter-gold/, private).
 *
 *   node scripts/run-project.mjs scripts/meter-gold.mjs stats
 *   ... import <folder> --utility electric|water [--group NAME | --group-by-folder]
 *   ... export-verified --consent-confirmed [--source all|owner|tenant] [--db data/trozy.sqlite]
 *   ... label [--port 0]
 *   ... evaluate --split val            (choose/tune models here)
 *   ... evaluate --split test --final   (once, when freezing a model)
 */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {basename,extname,join,relative,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import sharp from 'sharp';
import {projectDirectory,projectRoot} from '../src/shared/project-paths.mjs';
import {addImage,goldRoot,loadManifest,meterGroup,saveManifest,summarize,UTILITIES} from './meter-gold/gold-lib.mjs';
import {exportVerified} from './meter-gold/export-verified.mjs';
import {evaluateGold,formatReport,persistReport} from './meter-gold/evaluate-gold.mjs';
import {startLabelServer} from './meter-gold/label-server.mjs';

const IMAGE_EXTENSIONS=new Set(['.jpg','.jpeg','.png','.webp']);

function parseArgs(argv){
  const positional=[],flags={};
  for(let index=0;index<argv.length;index++){
    const value=argv[index];
    if(value.startsWith('--')){
      const name=value.slice(2);
      const next=argv[index+1];
      if(next===undefined||next.startsWith('--'))flags[name]=true;else{flags[name]=next;index++;}
    }else positional.push(value);
  }
  return {positional,flags};
}

function listImages(folder){
  const found=[];
  for(const entry of readdirSync(folder,{withFileTypes:true})){
    const path=join(folder,entry.name);
    if(entry.isSymbolicLink())continue;
    if(entry.isDirectory())found.push(...listImages(path));
    else if(IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase()))found.push(path);
  }
  return found.sort();
}

/** Fixed sanity photos stay out of the gold set so they remain independent. */
function fixtureHashes(){
  try{
    const manifest=JSON.parse(readFileSync(join(projectRoot,'docs/test/fixtures/visionstate-yolo-samples.json'),'utf8'));
    return new Set(manifest.samples.map(sample=>sample.sha256));
  }catch{return new Set();}
}

async function reader({bytes,utility,digits,decimals,mode='profiled',fallback='off'}){
  const {runMeterReader,meterReaderStatus}=await import('../src/ai/meter-reader.mjs');
  const {geminiVisionEnabled,geminiVisionMeter}=await import('../src/ai/gemini.mjs');
  const normalized=await sharp(bytes).rotate().flatten({background:'#fff'}).toColourspace('srgb').png().toBuffer({resolveWithObject:true});
  const profile=mode==='zero-setup'||digits===null||decimals===null?null:{digits,decimals};
  let local=null;
  if(meterReaderStatus(utility).automaticAvailable){
    local=await runMeterReader({mode:'auto',bytes:normalized.data,mime:'image/png',utility,profile});
    if(local?.status==='ready'||fallback!=='gemini')return local;
  }else if(fallback!=='gemini'){
    throw new Error(`Runtime ${utility} cục bộ chưa sẵn sàng.`);
  }
  if(fallback==='gemini'&&geminiVisionEnabled()){
    const vision=await geminiVisionMeter({bytes:normalized.data,mime:'image/png',width:normalized.info.width,height:normalized.info.height,utility,profile});
    if(vision?.status==='ready'||!local)return vision;
  }
  return local;
}

async function geminiSuggestReader({bytes,utility,digits,decimals}){
  const {geminiVisionMeter,hasGeminiKeys}=await import('../src/ai/gemini.mjs');
  if(!hasGeminiKeys())return {status:'error',reading:null,error:'Chưa cấu hình GEMINI_API_KEY để gợi ý bằng Gemini.'};
  const normalized=await sharp(bytes).rotate().flatten({background:'#fff'}).toColourspace('srgb').png().toBuffer({resolveWithObject:true});
  const profile=Number.isSafeInteger(digits)&&Number.isSafeInteger(decimals)?{digits,decimals}:null;
  return geminiVisionMeter({bytes:normalized.data,mime:'image/png',width:normalized.info.width,height:normalized.info.height,utility,profile});
}

/**
 * Ollama Qwen3 vision suggest for the label tool.
 * Used when --suggest ollama is passed so that images the production reader
 * cannot handle (non-standard VN meters) can still get a draft suggestion.
 *
 * Returns the same shape as runMeterReader so the label UI can display it:
 *   { status: 'ready'|'needs_review'|'error', reading: { integerValue } | null }
 *
 * The suggestion is only shown for train-split items (label-server enforces this).
 */
async function ollamaReader({bytes,utility,digits}){
  // Resolve Ollama API endpoint from local-ai config
  let ollamaPort=11434;
  try{
    const {getOllamaPort}=await import('../scripts/local-ai.mjs').catch(()=>({}));
    if(typeof getOllamaPort==='function')ollamaPort=await getOllamaPort();
  }catch{/* use default */}
  const base64=bytes.toString('base64');
  const utilityLabel=utility==='water'?'đồng hồ nước (water meter)':'công tơ điện (electricity meter)';
  const prompt=`Đây là ảnh ${utilityLabel} Việt Nam. Hãy đọc ${digits} chữ số phần nguyên trên ô hiển thị số và chỉ trả lời bằng ${digits} chữ số đó, không có ký tự nào khác. Nếu không đọc được, trả lời "UNKNOWN".`;
  let raw;
  try{
    const res=await fetch(`http://127.0.0.1:${ollamaPort}/api/generate`,{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({model:'qwen3:4b-instruct',prompt,images:[base64],stream:false,options:{temperature:0.0}}),
      signal:AbortSignal.timeout(30_000),
    });
    if(!res.ok)throw new Error(`Ollama HTTP ${res.status}`);
    const json=await res.json();
    raw=(json.response||'').trim().replace(/<think>[\s\S]*?<\/think>/gi,'').trim();
  }catch(err){
    return {status:'error',reading:null,error:err.message};
  }
  const match=raw.replace(/\s+/g,'').match(/^(\d+)$/);
  if(!match)return {status:'needs_review',reading:null,rawResponse:raw};
  const intVal=parseInt(match[1],10);
  if(!Number.isFinite(intVal))return {status:'needs_review',reading:null,rawResponse:raw};
  return {status:'ready',reading:{integerValue:intVal},rawResponse:raw};
}

async function importFolder(positional,flags){
  const folder=positional[1];
  if(!folder||!UTILITIES.includes(flags.utility))throw new Error('Cú pháp: import <thư mục> --utility electric|water [--group NAME | --group-by-folder]');
  const source=resolve(folder);
  if(!statSync(source).isDirectory())throw new Error('Đường dẫn nhập phải là thư mục.');
  const root=goldRoot(),manifest=loadManifest(root),fixtures=fixtureHashes();
  const counts={added:0,duplicate:0,fixture:0,bad_image:0};
  for(const file of listImages(source)){
    const bytes=readFileSync(file);
    if(fixtures.has(createHash('sha256').update(bytes).digest('hex'))){counts.fixture++;continue;}
    const folderName=basename(resolve(file,'..'));
    const group=flags.group&&flags.group!==true?meterGroup('import',String(flags.group),flags.utility):flags['group-by-folder']?meterGroup('import',folderName,flags.utility):undefined;
    try{
      const result=await addImage(manifest,root,{bytes,utility:flags.utility,group,source:'folder-import'});
      counts[result.status==='added'?'added':'duplicate']++;
    }catch{counts.bad_image++;}
  }
  saveManifest(manifest,root);
  console.log(JSON.stringify({imported:counts,note:groupNote(flags)}));
}
const groupNote=flags=>flags.group||flags['group-by-folder']?null:'Mỗi ảnh được coi là một công tơ riêng. Nếu nhiều ảnh cùng một công tơ, dùng --group hoặc --group-by-folder để chúng không bị chia sang train và test.';

async function exportCommand(flags){
  if(flags['consent-confirmed']!==true)throw new Error('Cần --consent-confirmed: chủ nhà xác nhận đã được người thuê đồng ý dùng ảnh công tơ để cải thiện bộ đọc cục bộ. Ảnh chỉ lưu trong data/meter-gold, đã xóa EXIF và không kèm tên/phòng.');
  const databasePath=projectDirectory(flags.db&&flags.db!==true?flags.db:'data/trozy.sqlite');
  if(!databasePath)throw new Error('Cơ sở dữ liệu phải nằm trong thư mục dự án.');
  const database=new DatabaseSync(databasePath,{readOnly:true});
  try{
    const root=goldRoot(),manifest=loadManifest(root);
    manifest.consent={confirmedAt:new Date().toISOString(),scope:'local-training-only',via:'--consent-confirmed'};
    const stats=await exportVerified(database,{root,manifest,source:flags.source&&flags.source!==true?flags.source:'all'});
    saveManifest(manifest,root);
    console.log(JSON.stringify(stats));
  }finally{database.close();}
}

async function labelCommand(flags){
  const root=goldRoot();
  // --suggest gemini  → Gemini Vision with automatic free-model rotation (train split only).
  // --suggest ollama  → Qwen3 vision for VN meter images the production reader cannot handle.
  // --suggest reader  → (default) production Trozy reader.
  // All suggestions are only shown for train-split items; val/test are always blind.
  const useSuggest=String(flags.suggest||'reader').toLowerCase();
  const suggest=useSuggest==='gemini'?geminiSuggestReader:useSuggest==='ollama'?ollamaReader:reader;
  if(useSuggest==='gemini')console.log('Dùng Gemini Vision (xoay vòng model miễn phí) làm nguồn gợi ý (chỉ dành cho tập train).');
  else if(useSuggest==='ollama')console.log('Dùng Ollama Qwen3 làm nguồn gợi ý (chỉ dành cho tập train).');
  const {server,url}=await startLabelServer({root,suggest,port:Number(flags.port)||0});
  console.log(`Mở trang gán nhãn (chỉ máy này truy cập được):\n${url}\nNhấn Ctrl+C để dừng.`);
  process.on('SIGINT',()=>server.close(()=>process.exit(0)));
}

async function evaluateCommand(flags){
  const split=flags.split;
  const mode=flags.mode&&flags.mode!==true?String(flags.mode):'profiled';
  const fallback=flags.fallback&&flags.fallback!==true?String(flags.fallback):'off';
  const root=goldRoot(),manifest=loadManifest(root);
  const report=await evaluateGold({manifest,root,split,mode,final:flags.final===true,reader:args=>reader({...args,fallback})});
  const path=persistReport(root,report);
  console.log(formatReport(report));
  console.log(`Báo cáo: ${relative(projectRoot,path).replaceAll('\\','/')}`);
}

const {positional,flags}=parseArgs(process.argv.slice(2));
const command=positional[0];
try{
  if(command==='stats'){const manifest=loadManifest(goldRoot());console.log(JSON.stringify({consent:manifest.consent,summary:summarize(manifest)},null,2));}
  else if(command==='import')await importFolder(positional,flags);
  else if(command==='export-verified')await exportCommand(flags);
  else if(command==='label')await labelCommand(flags);
  else if(command==='evaluate')await evaluateCommand(flags);
  else{console.error('Lệnh: stats | import | export-verified | label | evaluate');process.exitCode=1;}
}catch(error){
  console.error('Lỗi:',error.message);
  process.exitCode=1;
}
