import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import sharp from 'sharp';
import {createMeterReader,meterReaderStatus,runMeterReader} from '../src/ai/meter-reader.mjs';

const png=await sharp({create:{width:100,height:50,channels:3,background:'#888'}}).png().toBuffer();
const request={mode:'read',bytes:png,mime:'image/png',digits:3,decimals:0,utility:'water',corners:[[.1,.1],[.9,.1],[.9,.9],[.1,.9]]};
const projectTemp=()=>{try{return readdirSync(new URL('../.runtime/tmp',import.meta.url)).filter(name=>name.startsWith('meter-reader-')).sort();}catch{return [];}};

test('meter bridge rejects paths/unsupported bytes/config before spawning and disables gracefully',async t=>{
 let called=false;const reader=createMeterReader({spawnImpl:()=>{called=true;throw Error('must not spawn');}});
 for(const override of [{bytes:Buffer.from('file:///secret')},{mime:'image/jpeg'},{digits:13},{digits:10,decimals:0},{decimals:3},{corners:[[0,0],[1,0],[1,Infinity],[0,1]]}])await assert.rejects(reader.run({...request,...override}),error=>error.status===400||error.status===415);
 assert.equal(called,false);
 for(const profile of [{digits:6,decimals:1,corners:[]},{digits:6,decimals:1,reading:'123456'},{digits:true,decimals:0},{digits:12,decimals:0}])await assert.rejects(reader.run({mode:'auto',bytes:png,mime:'image/png',utility:'electric',profile}),error=>error.status===400);
 assert.equal(called,false);
 const prior=process.env.TROZY_METER_READER_ENABLED;t.after(()=>{if(prior===undefined)delete process.env.TROZY_METER_READER_ENABLED;else process.env.TROZY_METER_READER_ENABLED=prior;});
 process.env.TROZY_METER_READER_ENABLED='false';assert.equal(meterReaderStatus().available,false);
 await assert.rejects(runMeterReader(request),error=>error.status===503);
});

test('automatic worker uses only confirmed layout and fresh geometry, preserves zeros and resolves a half turn',{
 skip:!meterReaderStatus().automaticAvailable||!existsSync(new URL('../.runtime/datasets/meter/water-blue.jpg',import.meta.url)),
 timeout:90000,
},async()=>{
 const blank=await runMeterReader({mode:'auto',bytes:png,mime:'image/png',utility:'water'});
 assert.equal(blank.status,'needs_setup');assert.equal(blank.reading,null);assert.equal(blank.config,null);
 const manifest=JSON.parse(readFileSync(new URL('../docs/test/fixtures/visionstate-yolo-samples.json',import.meta.url),'utf8'));
 const sample=manifest.samples.find(row=>row.id==='water-blue');
 const photo=readFileSync(new URL('../'+sample.file,import.meta.url));
 for(const angle of [0,180]){
  const bytes=await sharp(photo).rotate(angle).flatten({background:'#fff'}).toColourspace('srgb').png().toBuffer();
  // No sample.manualRegion or reference digits enter this inference request.
  const result=await runMeterReader({mode:'auto',bytes,mime:'image/png',utility:'water',profile:{digits:8,decimals:3}});
  assert.equal(result.status,'ready',JSON.stringify({angle,status:result.status,warnings:result.warnings}));
  assert.equal(result.reading.displayText,'00001.056');assert.equal(result.reading.digits,'00001056');
  assert.equal(result.profileSource,'confirmed');assert.equal(result.configNeedsConfirmation,false);
  assert.equal(result.config.digits,8);assert.equal(result.config.decimals,3);assert.equal(result.config.corners.length,4);
  assert.equal(result.quality.canRead,true);assert.equal(result.cells.length,8);
 }
});

test('meter bridge bounds concurrency, kills timed-out workers and removes only its own temp',{skip:!meterReaderStatus().readerAvailable},async()=>{
 const before=projectTemp();
 const reader=createMeterReader({timeoutMs:80,spawnImpl:(_exe,_args,options)=>spawn(process.execPath,['-e','process.stdin.resume(); setInterval(()=>{},1000)'],options)});
 const first=reader.run(request);
 await assert.rejects(reader.run(request),error=>error.status===429);
 await assert.rejects(first,error=>error.status===504);
 assert.deepEqual(projectTemp(),before);
 // The released slot must work again after a timeout, rather than remain busy.
 await assert.rejects(reader.run(request),error=>error.status===504);
 assert.deepEqual(projectTemp(),before);
});

test('meter bridge rejects oversized/malformed worker output and honors cancellation',{skip:!meterReaderStatus().readerAvailable},async()=>{
 for(const script of ['process.stdin.resume();process.stdin.on("end",()=>process.stdout.write("bad-json"))','process.stdin.resume();process.stdin.on("end",()=>process.stdout.write("x".repeat(300000)))']){
  const reader=createMeterReader({spawnImpl:(_exe,_args,options)=>spawn(process.execPath,['-e',script],options)});
  await assert.rejects(reader.run(request),error=>error.status===503);
 }
 const reader=createMeterReader({spawnImpl:(_exe,_args,options)=>spawn(process.execPath,['-e','process.stdin.resume();setInterval(()=>{},1000)'],options)});
 const controller=new AbortController(),pending=reader.run(request,{signal:controller.signal});controller.abort();
 await assert.rejects(pending,error=>error.status===499);
});

test('water keeps wheels-v2 on a real locked crop and refuses blank pixels',{
 skip:!meterReaderStatus('water').readerAvailable||!existsSync(new URL('../.runtime/datasets/meter/water-blue.jpg',import.meta.url)),
 timeout:60000,
},async()=>{
 const manifest=JSON.parse(readFileSync(new URL('../docs/test/fixtures/visionstate-yolo-samples.json',import.meta.url),'utf8'));
 const sample=manifest.samples.find(row=>row.id==='water-blue');
 const bytes=await sharp(readFileSync(new URL('../'+sample.file,import.meta.url))).rotate().flatten({background:'#fff'}).toColourspace('srgb').png().toBuffer();
 const corners=sample.manualRegion.corners.map(([x,y])=>[x/sample.sourceSize.width,y/sample.sourceSize.height]);
 const result=await runMeterReader({mode:'read',bytes,mime:'image/png',utility:'water',digits:8,decimals:3,corners});
 assert.equal(result.status,'ready');assert.equal(result.engine,'visionstate');assert.equal(result.reading.digits,'00001056');assert.equal(result.reading.integerValue,1);assert.equal(result.reading.displayText,'00001.056');assert.equal(result.quality.canRead,true);assert.equal(result.cells.length,8);
 const blank=await sharp({create:{width:1280,height:1707,channels:3,background:'#888'}}).png().toBuffer();
 const refused=await runMeterReader({mode:'read',bytes:blank,mime:'image/png',utility:'water',digits:8,decimals:3,corners});
 assert.equal(refused.status,'retake');assert.equal(refused.reading,null);assert.equal(refused.quality.canRead,false);
});

test('electric dispatches to official PaddleOCR and preserves complete OCR observations',{
 skip:!meterReaderStatus('electric').automaticAvailable||!existsSync(new URL('../.runtime/datasets/meter/electric-clear.jpg',import.meta.url)),
 timeout:90000,
},async()=>{
 const synthetic=await sharp(readFileSync(new URL('./fixtures/electric-paddle-synthetic.svg',import.meta.url))).png().toBuffer();
 const automatic=await runMeterReader({mode:'auto',bytes:synthetic,mime:'image/png',utility:'electric',profile:{digits:6,decimals:1}});
 assert.equal(automatic.engine,'paddleocr');assert.equal(automatic.model,'paddleocr-ppocrv6');
 assert.equal(automatic.status,'ready');assert.equal(automatic.reading.displayText,'01234.5');assert.deepEqual(automatic.cells,[]);
 assert.equal(automatic.ocrEvidence.scope,'automatic');assert.deepEqual(automatic.ocrEvidence.observations.map(row=>row.pass),['full','crop']);
 const manifest=JSON.parse(readFileSync(new URL('../docs/test/fixtures/visionstate-yolo-samples.json',import.meta.url),'utf8'));
 const sample=manifest.samples.find(row=>row.id==='electric-clear');
 const bytes=await sharp(readFileSync(new URL('../'+sample.file,import.meta.url))).rotate().flatten({background:'#fff'}).toColourspace('srgb').png().toBuffer();
 const manual=await runMeterReader({mode:'read',bytes,mime:'image/png',utility:'electric',digits:6,decimals:1,corners:sample.manualRegion.corners.map(([x,y])=>[x/sample.sourceSize.width,y/sample.sourceSize.height])});
 assert.equal(manual.status,'ready');assert.equal(manual.reading.displayText,'00766.4');assert.equal(manual.reading.digits,'007664');
 assert.equal(manual.ocrEvidence.scope,'owner-region');assert.deepEqual(manual.ocrEvidence.observations.map(row=>row.pass),['region','crop']);
 assert.deepEqual(manual.cells,[]);assert(manual.ocrEvidence.observations.every(row=>row.confidence>=.85));
});
