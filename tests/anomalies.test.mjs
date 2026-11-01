import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeUtilities} from '../src/ai/anomalies.mjs';

const days=period=>new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5,7)),0)).getUTCDate();
function history(usages,{roomId='room_a',propertyId='property_a'}={}){
 let electric=1000,water=200;
 return usages.map(([period,electricUsage,waterUsage=days(period)])=>{
  const row={id:`${roomId}_${period}`,propertyId,roomId,period,electricOld:electric,electricNew:electric+electricUsage,waterOld:water,waterNew:water+waterUsage,confirmed:true};
  electric=row.electricNew;water=row.waterNew;return row;
 });
}
function data(readings,threshold=50){return {rooms:[{id:'room_a',code:'A01',propertyId:'property_a'},{id:'room_b',code:'B01',propertyId:'property_b'}],readings,settings:[{id:'settings_a',propertyId:'property_a',anomalyThreshold:threshold},{id:'settings_b',propertyId:'property_b',anomalyThreshold:threshold}]};}
const stable=[['2026-01',62],['2026-02',56],['2026-03',62]];

test('B02 normalizes monthly lengths and uses median rather than an outlier-sensitive mean',()=>{
 const result=analyzeUtilities({data:data(history([...stable,['2026-04',120]]))});
 const alert=result.alerts.find(row=>row.utility==='electric');assert.equal(alert.baseline,60);assert.equal(alert.currentUsage,120);assert.equal(alert.changePercent,100);assert.equal(alert.kind,'spike');assert.equal(alert.severity,'warning');assert(alert.explanation.includes('số ngày'));assert.equal(result.alerts.filter(row=>row.utility==='water').length,0);
 const robust=analyzeUtilities({data:data(history([['2026-01',62],['2026-02',56],['2026-03',620],['2026-04',120]]))});
 assert.equal(robust.alerts.find(row=>row.utility==='electric').baseline,60);
});

test('B02 respects configurable percentage thresholds and absolute materiality',()=>{
 const rows=history([...stable,['2026-04',120]]);assert.equal(analyzeUtilities({data:data(rows,150)}).alerts.length,0);
 assert.equal(analyzeUtilities({data:data(rows,50)}).alerts.length,1);
 const tiny=history([['2026-01',31,1],['2026-02',28,1],['2026-03',31,1],['2026-04',40,2]]);
 assert.equal(analyzeUtilities({data:data(tiny,5)}).alerts.length,0,'A small absolute delta does not trigger on percentage alone.');
});

test('B02 insufficient-history summary counts rooms rather than each utility',()=>{
 const rows=[...history([['2026-01',62],['2026-02',200]]),...history([['2026-01',62]],{roomId:'room_b',propertyId:'property_b'})];
 const result=analyzeUtilities({data:data(rows)});assert.equal(result.summary.roomsAnalyzed,2);assert.equal(result.summary.insufficientHistory,2);assert.equal(result.alerts.length,0);
});

test('B02 zero baselines produce finite absolute alerts without fabricated percentages',()=>{
 const rows=history([['2026-01',0,0],['2026-02',0,0],['2026-03',0,0],['2026-04',80,3]]);
 const result=analyzeUtilities({data:data(rows)});assert.equal(result.alerts.length,2);
 for(const alert of result.alerts){assert.equal(alert.baseline,0);assert.equal(alert.changePercent,null);assert(Number.isFinite(alert.currentUsage));assert(alert.explanation.includes('nền 0'));assert.equal(alert.kind,'spike');}
 assert.equal(result.alerts.find(row=>row.utility==='electric').severity,'critical');
});

test('B02 detects material drops and invalid index/continuity but never rewrites source readings',()=>{
 const rows=history([...stable,['2026-04',0,0]]),before=JSON.stringify(rows);
 const result=analyzeUtilities({data:data(rows)});assert(result.alerts.every(row=>row.kind==='drop'));assert.equal(result.alerts.length,2);assert.equal(JSON.stringify(rows),before);
 const mismatch=structuredClone(rows);mismatch.at(-1).electricOld+=1;mismatch.at(-1).electricNew+=1;
 const invalid=analyzeUtilities({data:data(mismatch)}).alerts.find(row=>row.utility==='electric');assert.equal(invalid.kind,'invalid');assert.equal(invalid.severity,'critical');assert.equal(invalid.changePercent,null);
 const missing=structuredClone(rows);missing.at(-1).electricOld=null;assert.equal(analyzeUtilities({data:data(missing)}).alerts.find(row=>row.utility==='electric').kind,'invalid');
});

test('B02 ignores unconfirmed/future data and maintains property, room and requested-period scopes',()=>{
 const roomA=history([...stable,['2026-04',120],['2026-05',62]]);roomA.at(-1).confirmed=false;
 const roomB=history([...stable,['2026-04',240]],{roomId:'room_b',propertyId:'property_b'});
 const original=data([...roomA,...roomB]);const result=analyzeUtilities({data:original,input:{propertyId:'property_a'}});
 assert.equal(result.summary.roomsAnalyzed,1);assert.equal(result.summary.readingsAnalyzed,4);assert(result.alerts.every(row=>row.propertyId==='property_a'&&row.roomId==='room_a'&&row.period==='2026-04'));
 const past=analyzeUtilities({data:original,input:{roomId:'room_a',period:'2026-03'}});assert.equal(past.summary.readingsAnalyzed,3);assert.equal(past.alerts.length,0);
 const other=analyzeUtilities({data:original,input:{roomId:'unknown'}});assert.equal(other.summary.roomsAnalyzed,0);assert.equal(other.alerts.length,0);
});

test('B02 robust spread suppresses noisy baselines instead of treating every fluctuation as anomalous',()=>{
 const rows=history([['2026-01',31*.5],['2026-02',28*3],['2026-03',31*5.5],['2026-04',30*4.2]]);
 assert.equal(analyzeUtilities({data:data(rows,30)}).alerts.length,0);
});

test('B02 missing calendar periods do not pretend a multi-month accumulated meter span is one month',()=>{
 const rows=history([...stable,['2026-06',180,90]]);
 const result=analyzeUtilities({data:data(rows)});assert.equal(result.alerts.filter(row=>row.kind==='spike'||row.kind==='drop').length,0);
});
