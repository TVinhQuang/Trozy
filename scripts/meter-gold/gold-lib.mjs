/**
 * Real-photo "gold set" for Vietnamese electricity/water meters.
 *
 * Everything lives under data/ (git-ignored, project-local). Images are
 * re-encoded without EXIF/GPS and named by content hash. The train/val/test
 * split is a pure function of the *physical meter group*, so photos of one
 * meter taken in different months can never straddle train and test.
 */
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import sharp from 'sharp';
import {projectRoot} from '../../src/shared/project-paths.mjs';

export const GOLD_VERSION=1;
export const UTILITIES=['electric','water'];
export const SPLITS=['train','val','test'];
export const LABEL_SOURCES=['owner-verified','human-typed','human-confirmed-suggestion'];
export const MAX_SIDE=2000;
const SPLIT_SALT='trozy-gold-split-v1';

export const goldRoot=()=>resolve(process.env.TROZY_GOLD_DIR||join(projectRoot,'data/meter-gold'));
export const imagesDir=root=>join(root,'images');
export const manifestPath=root=>join(root,'manifest.json');

const sha256=value=>createHash('sha256').update(value).digest('hex');

/** 20% test, 20% val, 60% train; stable forever for a given group key. */
export function splitOf(group){
  const bucket=parseInt(sha256(`${SPLIT_SALT}:${group}`).slice(0,8),16)%10;
  return bucket<2?'test':bucket<4?'val':'train';
}

/** Hash a physical meter so no room/owner identifier is ever written to disk. */
export function meterGroup(ownerId,roomId,utility){
  return 'm_'+sha256(`${SPLIT_SALT}:meter:${ownerId}:${roomId}:${utility}`).slice(0,16);
}

export const validLayout=(digits,decimals)=>Number.isSafeInteger(digits)&&digits>=1&&digits<=12&&Number.isSafeInteger(decimals)&&decimals>=0&&decimals<=4&&decimals<digits&&digits-decimals<=9;

/** Drop all metadata, apply EXIF orientation to the pixels and bound the size. */
export async function sanitizeImage(bytes){
  const out=await sharp(bytes,{limitInputPixels:60_000_000}).rotate().flatten({background:'#ffffff'})
    .resize({width:MAX_SIDE,height:MAX_SIDE,fit:'inside',withoutEnlargement:true})
    .toColourspace('srgb').jpeg({quality:92}).toBuffer();
  return out;
}

export function emptyManifest(){return {version:GOLD_VERSION,consent:null,items:[]};}

export function loadManifest(root=goldRoot()){
  const path=manifestPath(root);
  if(!existsSync(path))return emptyManifest();
  const manifest=JSON.parse(readFileSync(path,'utf8'));
  validateManifest(manifest);
  return manifest;
}

export function saveManifest(manifest,root=goldRoot()){
  validateManifest(manifest);
  mkdirSync(root,{recursive:true});
  const path=manifestPath(root),temp=path+'.tmp';
  writeFileSync(temp,JSON.stringify(manifest,null,2)+'\n');
  renameSync(temp,path);
}

export function validateManifest(manifest){
  if(!manifest||manifest.version!==GOLD_VERSION||!Array.isArray(manifest.items))throw new Error('Manifest không hợp lệ.');
  const seen=new Set();
  for(const item of manifest.items){
    if(!/^[0-9a-f]{16}$/.test(item.id)||seen.has(item.id))throw new Error(`Mã ảnh không hợp lệ hoặc trùng: ${item.id}`);
    seen.add(item.id);
    if(!UTILITIES.includes(item.utility))throw new Error(`Loại công tơ không hợp lệ: ${item.id}`);
    if(item.digits!==null&&!validLayout(item.digits,item.decimals))throw new Error(`Số bánh số/phần lẻ không hợp lệ: ${item.id}`);
    if(item.split!==splitOf(item.group))throw new Error(`Phân chia train/val/test không khớp nhóm: ${item.id}`);
    if(item.label!==null&&(!Number.isSafeInteger(item.label)||item.label<0))throw new Error(`Nhãn không hợp lệ: ${item.id}`);
    if(item.label!==null&&!LABEL_SOURCES.includes(item.labelSource))throw new Error(`Nguồn nhãn không hợp lệ: ${item.id}`);
    if(item.digitsText!==undefined&&item.digitsText!==null&&(typeof item.digitsText!=='string'||!/^[0-9]{1,12}(?:\.[0-9]{1,4})?$/.test(item.digitsText)))throw new Error(`Chuỗi chữ số đầy đủ không hợp lệ: ${item.id}`);
  }
}

/**
 * Add one photo. Returns 'added' or 'duplicate'. A same-group duplicate is
 * ignored; the image bytes are written only after validation succeeds.
 */
export async function addImage(manifest,root,{bytes,utility,group,source,digits=null,decimals=null,label=null,digitsText=null,labelSource=null,hard=false,readerAtExport=null,now=()=>new Date().toISOString()}){
  if(!UTILITIES.includes(utility))throw new Error('Loại công tơ phải là electric hoặc water.');
  const clean=await sanitizeImage(bytes),id=sha256(clean).slice(0,16);
  if(manifest.items.some(item=>item.id===id))return {status:'duplicate',id};
  const key=group||id;
  const item={id,file:`images/${id}.jpg`,utility,group:key,split:splitOf(key),source,digits,decimals,label,...(digitsText!==null?{digitsText}:{}),labelSource:label===null?null:labelSource,hard:!!hard,excluded:false,readerAtExport,addedAt:now(),labeledAt:label===null?null:now()};
  const next={...manifest,items:[...manifest.items,item]};
  validateManifest(next);
  mkdirSync(imagesDir(root),{recursive:true});
  writeFileSync(join(root,item.file),clean);
  manifest.items.push(item);
  return {status:'added',id,item};
}

export function wilson(successes,total,z=1.96){
  if(!total)return {low:0,high:1};
  const p=successes/total,z2=z*z,denominator=1+z2/total;
  const center=(p+z2/(2*total))/denominator;
  const margin=z*Math.sqrt((p*(1-p)+z2/(4*total))/total)/denominator;
  return {low:Math.max(0,center-margin),high:Math.min(1,center+margin)};
}

/** Items usable for scoring/training: typed label, not marked unreadable. */
export const usable=item=>item.label!==null&&!item.excluded;

/** Count items per split/utility/label state; used by the stats command. */
export function summarize(manifest){
  const table={};
  for(const item of manifest.items){
    const key=`${item.utility}/${item.split}`;
    const row=table[key]??={total:0,labeled:0,unlabeled:0,excluded:0,hard:0,groups:new Set()};
    row.total++;row.groups.add(item.group);
    if(item.excluded)row.excluded++;
    else if(item.label!==null)row.labeled++;
    else row.unlabeled++;
    if(item.hard)row.hard++;
  }
  return Object.fromEntries(Object.entries(table).map(([key,row])=>[key,{total:row.total,labeled:row.labeled,unlabeled:row.unlabeled,excluded:row.excluded,hard:row.hard,meters:row.groups.size}]));
}

/**
 * Score one reader outcome against a typed integer label.
 * A wrong "ready" proposal is the dangerous case and is counted separately.
 */
export function classify(result,label){
  if(result?.status==='ready'&&result.reading&&Number.isSafeInteger(result.reading.integerValue))
    return result.reading.integerValue===label?'correct':'wrong_ready';
  return 'abstain';
}

/** Strict full-string match (leading zeros + decimal boundary) when digitsText is labeled. */
export function strictClassify(result,item){
  if(typeof item?.digitsText!=='string'||!item.digitsText)return classify(result,item?.label);
  if(result?.status!=='ready'||!result.reading)return 'abstain';
  const expected=item.digitsText.replace(/\s+/g,'');
  const observed=expected.includes('.')?String(result.reading.displayText??''):String(result.reading.digits??result.reading.displayText??'').replace('.','');
  return observed===expected?'correct':'wrong_ready';
}

export function latencyStats(values){
  const sorted=values.filter(v=>Number.isFinite(v)&&v>=0).sort((a,b)=>a-b);
  if(!sorted.length)return {count:0,p50:null,p95:null,max:null,mean:null};
  const at=q=>sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(sorted.length*q)-1))];
  const round=v=>Math.round(v*10)/10;
  return {count:sorted.length,p50:round(at(.5)),p95:round(at(.95)),max:round(sorted.at(-1)),mean:round(sorted.reduce((a,b)=>a+b,0)/sorted.length)};
}

export function aggregate(outcomes){
  const total=outcomes.length,count=name=>outcomes.filter(value=>value===name).length;
  const correct=count('correct'),wrong=count('wrong_ready'),abstain=count('abstain'),ready=correct+wrong;
  return {n:total,correct,wrong_ready:wrong,abstain,
    correct_rate:total?correct/total:null,correct_ci95:wilson(correct,total),
    ready_rate:total?ready/total:null,
    wrong_ready_rate:total?wrong/total:null,wrong_ready_ci95:wilson(wrong,total),
    precision_when_ready:ready?correct/ready:null};
}
