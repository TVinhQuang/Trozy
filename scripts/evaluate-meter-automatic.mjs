/** Reused exploratory photos are regression evidence, never an accuracy benchmark. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {meterReaderStatus,runMeterReader} from '../src/ai/meter-reader.mjs';

assert.equal(meterReaderStatus().automaticAvailable,true,'Use installed project-local models; no downloads here.');
const manifest=JSON.parse(await readFile(new URL('../docs/test/fixtures/visionstate-yolo-samples.json',import.meta.url),'utf8'));
const paths=['src/ai/meter-reader.mjs','src/ai/meter_reader_worker.py','src/ai/meter_wheels.py','src/ai/meter_geometry.py','src/ai/meter_row_geometry.py','scripts/evaluate-meter-automatic.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(await readFile(new URL('../'+path,import.meta.url))).digest('hex')])));
const sourcesAtStart=await hashes();
const report={createdAt:new Date().toISOString(),policy:'Reused exploratory photos and agent visual annotations, not a held-out accuracy benchmark. Layout counts are explicit fixture configuration. No reference values or manual coordinates enter automatic inference.',samples:[],controls:[]};
for(const sample of manifest.samples){
 const source=await readFile(new URL('../'+sample.file,import.meta.url));
 assert.equal(createHash('sha256').update(source).digest('hex'),sample.sha256);
 const bytes=await sharp(source).rotate().flatten({background:'#fff'}).toColourspace('srgb').png().toBuffer();
 const profile={digits:sample.digits,decimals:sample.decimals};
 const result=await runMeterReader({mode:'auto',bytes,mime:'image/png',utility:sample.utility,profile});
 report.samples.push({id:sample.id,sourceSha256:sample.sha256,profile,result,reference:{exactDigits:sample.reference.exactDigits,integerDigits:sample.reference.integerDigits,userVerified:false},exactMatch:result.reading&&sample.reference.exactDigits?result.reading.digits===sample.reference.exactDigits:null,integerPrefixMatch:result.reading?result.reading.integerDigits===sample.reference.integerDigits:null});
 console.log(`${sample.id}: ${result.status}${result.reading?' '+result.reading.displayText:''}`);
}
const blue=manifest.samples.find(row=>row.id==='water-blue');
for(const kind of ['blank','blur']){
 const bytes=kind==='blank'?await sharp({create:{width:1280,height:1707,channels:3,background:'#888'}}).png().toBuffer():await sharp(await readFile(new URL('../'+blue.file,import.meta.url))).rotate().blur(30).png().toBuffer();
 const result=await runMeterReader({mode:'auto',bytes,mime:'image/png',utility:'water',profile:{digits:8,decimals:3}});
 assert.equal(result.reading,null,`${kind} control must not produce a reading`);
 report.controls.push({kind,result});console.log(`${kind}: ${result.status}`);
}
report.sourceSha256=await hashes();assert.deepEqual(report.sourceSha256,sourcesAtStart,'Sources changed during evaluation.');
const output=process.argv[2];
if(output){assert(/^docs[\\/]test[\\/][A-Za-z0-9_.-]+\.json$/.test(output));await writeFile(output,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({samples:report.samples.map(({id,result,exactMatch,integerPrefixMatch})=>({id,status:result.status,reading:result.reading,exactMatch,integerPrefixMatch})),controls:report.controls.map(({kind,result})=>({kind,status:result.status}))},null,2));
