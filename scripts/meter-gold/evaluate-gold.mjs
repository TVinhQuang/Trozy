/**
 * Evaluate the production meter reader on real, human-labeled photos.
 *
 * The val split is for choosing models/thresholds. The test split is scored
 * only with final=true, is logged every time, and must never drive tuning.
 */
import {appendFileSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {aggregate,classify,latencyStats,strictClassify,usable} from './gold-lib.mjs';

export const MIN_TEST_ITEMS=30;

export async function evaluateGold({manifest,root,split,final=false,mode='profiled',reader,now=()=>new Date()}){
  if(!['val','test'].includes(split))throw new Error('Chỉ đánh giá trên tập val hoặc test; tập train không dùng để đo.');
  if(split==='test'&&!final)throw new Error('Tập test chỉ chạy với --final khi chốt mô hình. Dùng --split val để chọn/chỉnh mô hình.');
  if(!['profiled','zero-setup'].includes(mode))throw new Error('Chế độ đánh giá phải là profiled hoặc zero-setup.');
  const records=[],skipped={no_layout:0},digests={},engines={},latencies=[];
  for(const item of manifest.items.filter(row=>row.split===split&&usable(row))){
    if(mode==='profiled'&&(item.digits===null||item.decimals===null)){skipped.no_layout++;continue;}
    const bytes=readFileSync(join(root,item.file));
    const started=performance.now();
    let result;
    try{result=await reader({bytes,utility:item.utility,digits:mode==='profiled'?item.digits:null,decimals:mode==='profiled'?item.decimals:null,mode});}
    catch(error){result={status:'error',reading:null,error:String(error.message||error).slice(0,200)};}
    const elapsedMs=Math.round((performance.now()-started)*10)/10;
    latencies.push(elapsedMs);
    if(result?.modelDigest)digests[item.utility]=result.modelDigest;
    if(result?.engine)engines[result.engine]=(engines[result.engine]||0)+1;
    records.push({id:item.id,utility:item.utility,hard:item.hard,label:item.label,...(item.digitsText?{digitsText:item.digitsText}:{}),status:result?.status??'error',engine:result?.engine??null,reading:result?.reading?.integerValue??null,displayText:result?.reading?.displayText??null,latencyMs:elapsedMs,outcome:classify(result,item.label),strictOutcome:strictClassify(result,item)});
  }
  const strictRecords=records.filter(row=>typeof row.digitsText==='string');
  const report={createdAt:now().toISOString(),split,mode,final,modelDigests:digests,engines,latencyMs:latencyStats(latencies),skipped,
    overall:aggregate(records.map(row=>row.outcome)),
    ...(strictRecords.length?{strictOverall:aggregate(strictRecords.map(row=>row.strictOutcome))}:{}),
    byUtility:Object.fromEntries(['electric','water'].map(utility=>[utility,aggregate(records.filter(row=>row.utility===utility).map(row=>row.outcome))])),
    hardOnly:aggregate(records.filter(row=>row.hard).map(row=>row.outcome)),
    warnings:[],records};
  if(records.length<MIN_TEST_ITEMS)report.warnings.push(`Chỉ có ${records.length} ảnh đã gán nhãn trong tập ${split}; khoảng tin cậy 95% còn rất rộng, chưa nên kết luận.`);
  return report;
}

export function persistReport(root,report){
  const dir=join(root,'runs');
  mkdirSync(dir,{recursive:true});
  const stamp=report.createdAt.replace(/[:.]/g,'-');
  const path=join(dir,`${report.split}-${stamp}.json`);
  writeFileSync(path,JSON.stringify(report,null,2)+'\n');
  if(report.final)appendFileSync(join(dir,'final-log.jsonl'),JSON.stringify({createdAt:report.createdAt,mode:report.mode||'profiled',modelDigests:report.modelDigests,n:report.overall.n,correct:report.overall.correct,wrong_ready:report.overall.wrong_ready,abstain:report.overall.abstain})+'\n');
  return path;
}

export function formatReport(report){
  const pct=value=>value===null?'—':(value*100).toFixed(1)+'%';
  const ci=range=>`[${pct(range.low)}–${pct(range.high)}]`;
  const line=(name,agg)=>`${name.padEnd(9)} n=${String(agg.n).padStart(3)}  đúng ${pct(agg.correct_rate)} ${ci(agg.correct_ci95)}  ready ${pct(agg.ready_rate)}  ready-sai ${pct(agg.wrong_ready_rate)} ${ci(agg.wrong_ready_ci95)}  chính xác khi ready ${pct(agg.precision_when_ready)}`;
  const lines=[`Tập ${report.split} · chế độ ${report.mode||'profiled'}${report.final?' (FINAL)':''}`,line('Tất cả',report.overall),line('Điện',report.byUtility.electric),line('Nước',report.byUtility.water),line('Ca khó',report.hardOnly)];
  if(report.strictOverall)lines.push(line('Full-str',report.strictOverall));
  if(report.latencyMs?.count)lines.push(`Độ trễ    p50=${report.latencyMs.p50}ms  p95=${report.latencyMs.p95}ms  max=${report.latencyMs.max}ms`);
  if(report.engines&&Object.keys(report.engines).length)lines.push(`Engine    ${Object.entries(report.engines).map(([k,v])=>`${k}=${v}`).join(' · ')}`);
  return [...lines,...report.warnings.map(text=>'! '+text)].join('\n');
}
