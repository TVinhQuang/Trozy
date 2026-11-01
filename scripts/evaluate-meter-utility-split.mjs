/** Utility-specific model evidence on reused photos, never a billing benchmark. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {meterReaderStatus,runMeterReader} from '../src/ai/meter-reader.mjs';

for(const utility of ['electric','water'])assert.equal(meterReaderStatus(utility).automaticAvailable,true,`Prepare the local ${utility} runtime first; this check never downloads.`);
const manifest=JSON.parse(await readFile(new URL('../docs/test/fixtures/visionstate-yolo-samples.json',import.meta.url),'utf8'));
const paths=['src/ai/meter-reader.mjs','src/ai/meter_reader_worker.py','src/ai/meter_paddle.py','src/ai/meter_wheels.py','src/ai/meter_geometry.py','src/ai/meter_row_geometry.py','scripts/evaluate-meter-utility-split.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(await readFile(new URL('../'+path,import.meta.url))).digest('hex')])));
const initial=await hashes();
const report={createdAt:new Date().toISOString(),policy:'Reused photos with locked provisional agent annotations. Not user-verified billing values or a held-out benchmark. Layout counts are explicit fixture configuration. Automatic requests contain no manual coordinates or reference values; manual requests use the previously locked corners.',samples:[],controls:[]};
for(const sample of manifest.samples){
 const source=await readFile(new URL('../'+sample.file,import.meta.url));
 assert.equal(createHash('sha256').update(source).digest('hex'),sample.sha256);
 const bytes=await sharp(source).rotate().flatten({background:'#fff'}).toColourspace('srgb').png().toBuffer();
 const profile={digits:sample.digits,decimals:sample.decimals};
 const automatic=await runMeterReader({mode:'auto',bytes,mime:'image/png',utility:sample.utility,profile});
 const corners=sample.manualRegion.corners.map(([x,y])=>[x/sample.sourceSize.width,y/sample.sourceSize.height]);
 const manual=await runMeterReader({mode:'read',bytes,mime:'image/png',utility:sample.utility,...profile,corners});
 report.samples.push({id:sample.id,utility:sample.utility,sourceSha256:sample.sha256,profile,automatic,manual,reference:sample.reference,automaticExactMatch:automatic.reading&&sample.reference.exactDigits?automatic.reading.digits===sample.reference.exactDigits:null,manualExactMatch:manual.reading&&sample.reference.exactDigits?manual.reading.digits===sample.reference.exactDigits:null});
 console.log(JSON.stringify({id:sample.id,engine:automatic.engine,automatic:automatic.status,automaticReading:automatic.reading?.displayText??null,manual:manual.status,manualReading:manual.reading?.displayText??null}));
}
for(const utility of ['electric','water']){
 const bytes=await sharp({create:{width:1000,height:500,channels:3,background:'#888'}}).png().toBuffer();
 const result=await runMeterReader({mode:'auto',bytes,mime:'image/png',utility,profile:utility==='electric'?{digits:6,decimals:1}:{digits:8,decimals:3}});
 assert.equal(result.reading,null,'Blank images cannot become numeric zero');report.controls.push({kind:'blank',utility,result});
}
const synthetic=await sharp(await readFile(new URL('../tests/fixtures/electric-paddle-synthetic.svg',import.meta.url))).png().toBuffer();
const syntheticResult=await runMeterReader({mode:'auto',bytes:synthetic,mime:'image/png',utility:'electric',profile:{digits:6,decimals:1}});
assert.equal(syntheticResult.status,'ready');assert.equal(syntheticResult.reading.digits,'012345');
report.controls.push({kind:'synthetic-technical-only',utility:'electric',sourcePngSha256:createHash('sha256').update(synthetic).digest('hex'),result:syntheticResult});
const serialSvg='<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500"><rect width="1000" height="500" fill="white"/><text x="100" y="180" font-size="90" font-family="Arial">123456</text><text x="100" y="300" font-size="50" font-family="Arial">Serial number 220 V 50 Hz</text></svg>';
const serial=await sharp(Buffer.from(serialSvg)).png().toBuffer();
const serialResult=await runMeterReader({mode:'auto',bytes:serial,mime:'image/png',utility:'electric',profile:{digits:6,decimals:1}});
assert.equal(serialResult.reading,null);report.controls.push({kind:'serial-only',utility:'electric',result:serialResult});
report.sourceSha256=await hashes();assert.deepEqual(report.sourceSha256,initial,'Source changed during evaluation.');
const output=process.argv[2];if(output){assert(/^docs[\\/]test[\\/][A-Za-z0-9_.-]+\.json$/.test(output));await writeFile(output,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({samples:report.samples.length,controls:report.controls.map(({kind,utility,result})=>({kind,utility,status:result.status}))}));
