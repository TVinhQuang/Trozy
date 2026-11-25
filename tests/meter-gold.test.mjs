import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {isAbsolute,join,relative,resolve} from 'node:path';
import {Readable} from 'node:stream';
import {after,before,test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import sharp from 'sharp';
import {projectRoot} from '../src/shared/project-paths.mjs';
import {addImage,aggregate,classify,emptyManifest,latencyStats,loadManifest,meterGroup,sanitizeImage,saveManifest,splitOf,strictClassify,summarize,validateManifest,wilson} from '../scripts/meter-gold/gold-lib.mjs';
import {exportVerified} from '../scripts/meter-gold/export-verified.mjs';
import {evaluateGold} from '../scripts/meter-gold/evaluate-gold.mjs';
import {createLabelHandler} from '../scripts/meter-gold/label-server.mjs';

const tmpBase=resolve(projectRoot,'tmp');
let work;
before(()=>{mkdirSync(tmpBase,{recursive:true});work=mkdtempSync(join(tmpBase,'meter-gold-test-'));});
after(()=>{
  const inside=relative(tmpBase,resolve(work));
  assert(inside&&!inside.startsWith('..')&&!isAbsolute(inside),'Refusing to delete outside tmp.');
  rmSync(work,{recursive:true,force:true});
});

let colour=0;
const photo=async(extra={})=>sharp({create:{width:96,height:64,channels:3,background:{r:(colour+=7)%256,g:(colour*3)%256,b:(colour*5)%256}}}).jpeg().toBuffer();
const groupIn=(wanted,prefix='g')=>{for(let index=0;;index++){const key=`${prefix}${index}`;if(splitOf(key)===wanted)return key;}};
const newRoot=name=>{const root=join(work,name);mkdirSync(root,{recursive:true});return root;};

test('split is deterministic, grouped and close to 60/20/20',()=>{
  assert.equal(splitOf('abc'),splitOf('abc'));
  const counts={train:0,val:0,test:0};
  for(let index=0;index<4000;index++)counts[splitOf('meter'+index)]++;
  assert(Math.abs(counts.test/4000-.2)<.03&&Math.abs(counts.val/4000-.2)<.03&&Math.abs(counts.train/4000-.6)<.03,JSON.stringify(counts));
});

test('meter group hash hides owner and room identifiers',()=>{
  const group=meterGroup('owner_secret','room_secret','water');
  assert(!group.includes('secret')&&/^m_[0-9a-f]{16}$/.test(group));
  assert.notEqual(group,meterGroup('owner_secret','room_secret','electric'));
});

test('sanitizing removes EXIF and applies orientation to pixels',async()=>{
  const raw=await sharp({create:{width:120,height:40,channels:3,background:'#336699'}}).jpeg().withMetadata({orientation:6,exif:{IFD0:{Copyright:'private-owner'}}}).toBuffer();
  assert((await sharp(raw).metadata()).exif,'fixture must carry EXIF');
  const clean=await sanitizeImage(raw);
  const meta=await sharp(clean).metadata();
  assert.equal(meta.exif,undefined);
  assert.equal(meta.orientation,undefined);
  assert.deepEqual([meta.width,meta.height],[40,120]);
  assert(!clean.includes(Buffer.from('private-owner')));
});

test('addImage dedupes by content and keeps a meter group in one split',async()=>{
  const root=newRoot('add'),manifest=emptyManifest(),group=groupIn('test');
  const first=await addImage(manifest,root,{bytes:await photo(),utility:'water',group,source:'folder-import'});
  const second=await addImage(manifest,root,{bytes:await photo(),utility:'water',group,source:'folder-import'});
  const dup=await addImage(manifest,root,{bytes:readFileSync(join(root,first.item.file)),utility:'water',group,source:'folder-import'});
  assert.equal(first.status,'added');assert.equal(dup.status,'duplicate');
  assert.equal(first.item.split,'test');assert.equal(second.item.split,'test');
  assert(existsSync(join(root,first.item.file)));
  saveManifest(manifest,root);
  assert.equal(loadManifest(root).items.length,2);
});

test('manifest validation rejects a tampered split or label',async()=>{
  const root=newRoot('tamper'),manifest=emptyManifest();
  const {item}=await addImage(manifest,root,{bytes:await photo(),utility:'electric',group:groupIn('train'),source:'folder-import'});
  validateManifest(manifest);
  assert.throws(()=>validateManifest({...manifest,items:[{...item,split:'test'}]}),/Phân chia/);
  assert.throws(()=>validateManifest({...manifest,items:[{...item,label:12.5,labelSource:'human-typed'}]}),/Nhãn/);
  assert.throws(()=>validateManifest({...manifest,items:[{...item,label:5,labelSource:'guess'}]}),/Nguồn nhãn/);
});

test('scoring separates correct, abstain and the dangerous wrong-ready case',()=>{
  const ready=value=>({status:'ready',reading:{integerValue:value}});
  assert.equal(classify(ready(766),766),'correct');
  assert.equal(classify(ready(765),766),'wrong_ready');
  assert.equal(classify({status:'needs_review',reading:null},766),'abstain');
  assert.equal(classify({status:'ready',reading:null},766),'abstain');
  const agg=aggregate(['correct','correct','wrong_ready','abstain']);
  assert.equal(agg.n,4);assert.equal(agg.correct_rate,.5);assert.equal(agg.wrong_ready_rate,.25);assert.equal(agg.ready_rate,.75);
  assert(Math.abs(agg.precision_when_ready-2/3)<1e-9);
  const ci=wilson(0,30);assert.equal(ci.low,0);assert(ci.high>.1&&ci.high<.14,'0/30 is still up to ~11% wrong');
});

function exportDatabase(){
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE records(collection TEXT,id TEXT,owner_id TEXT,property_id TEXT,tenant_id TEXT,data TEXT);
    CREATE TABLE files(id TEXT PRIMARY KEY,bytes BLOB);
    CREATE TABLE meter_reader_proposals(id TEXT PRIMARY KEY,result TEXT);`);
  return db;
}
const putRecord=(db,collection,data)=>db.prepare('INSERT INTO records(collection,id,owner_id,data) VALUES(?,?,?,?)').run(collection,data.id,data.ownerId||'o',JSON.stringify(data));

test('export keeps only approved items, flags hard cases and writes no identifiers',async()=>{
  const db=exportDatabase(),root=newRoot('export'),manifest=emptyManifest();
  const files={};for(const name of ['a','b','c','d','e']){files[name]=await photo();db.prepare('INSERT INTO files VALUES(?,?)').run('file_'+name,files[name]);}
  const sub=(id,fields)=>putRecord(db,'meterSubmissions',{id,ownerId:'owner_PRIVATE',roomId:'room_PRIVATE',tenantId:'tenant_PRIVATE',submittedByName:'Nguyen Van PRIVATE',status:'approved',utility:'electric',photos:[{fileId:'file_'+id}],selectedFileId:'file_'+id,verifiedValue:766,...fields});
  db.prepare('INSERT INTO meter_reader_proposals VALUES(?,?)').run('prop_ok',JSON.stringify({status:'ready',reading:{integerValue:766},config:{digits:6,decimals:1}}));
  db.prepare('INSERT INTO meter_reader_proposals VALUES(?,?)').run('prop_bad',JSON.stringify({status:'ready',reading:{integerValue:765},config:{digits:6,decimals:1}}));
  sub('a',{readerProposalId:'prop_ok'});                         // reader right -> not hard
  sub('b',{readerProposalId:'prop_bad'});                        // reader wrong -> hard
  sub('c',{});                                                   // manual, no proposal -> hard, layout from profile
  sub('d',{status:'rejected',verifiedValue:undefined});          // never verified -> skipped
  sub('e',{source:'owner',readerProposalId:'prop_ok'});          // owner evidence
  putRecord(db,'meterProfiles',{id:'p1',roomId:'room_PRIVATE',utility:'electric',digits:5,decimals:0,confirmed:true});
  const stats=await exportVerified(db,{root,manifest});
  assert.equal(stats.added,5-1);assert.equal(stats.skipped.not_verified,1);
  const byLabelHard=manifest.items.map(item=>item.hard);
  assert.deepEqual(byLabelHard.sort(),[false,false,true,true]);
  const text=JSON.stringify(manifest);
  assert(!/PRIVATE|owner_|room_|tenant_/.test(text),'no identifier may reach the manifest');
  const manual=manifest.items.find(item=>item.readerAtExport===null);
  assert.equal(manual.digits,5);assert.equal(manual.decimals,0);
  assert(manifest.items.every(item=>item.label===766&&item.labelSource==='owner-verified'));
  const again=await exportVerified(db,{root,manifest});
  assert.equal(again.added,0);assert.equal(again.duplicate,4);
  const ownerOnly=await exportVerified(db,{root:newRoot('export2'),manifest:emptyManifest(),source:'owner'});
  assert.equal(ownerOnly.added,1);
});

test('val is evaluated freely, test only with --final, wrong-ready is counted',async()=>{
  const root=newRoot('eval'),manifest=emptyManifest();
  const add=async(split,label,extra={})=>(await addImage(manifest,root,{bytes:await photo(),utility:'water',group:groupIn(split,'e'+colour+'_'),source:'folder-import',digits:5,decimals:0,label,labelSource:'human-typed',...extra})).item;
  const right=await add('val',100),wrong=await add('val',200),quiet=await add('val',300);
  await add('val',null);                                  // unlabeled -> ignored
  const gone=await add('val',400);gone.excluded=true;     // excluded -> ignored
  await add('val',500,{digits:null,decimals:null});       // no layout -> skipped
  await add('test',600);
  const answers=new Map([[100,{status:'ready',reading:{integerValue:100},modelDigest:'d'}],[200,{status:'ready',reading:{integerValue:201}}],[300,{status:'needs_review',reading:null}]]);
  const reader=async ({bytes})=>{const item=manifest.items.find(row=>readFileSync(join(root,row.file)).equals(bytes));return answers.get(item.label)??{status:'needs_review',reading:null};};
  const report=await evaluateGold({manifest,root,split:'val',reader});
  assert.equal(report.overall.n,3);assert.equal(report.overall.correct,1);assert.equal(report.overall.wrong_ready,1);assert.equal(report.overall.abstain,1);
  assert.equal(report.skipped.no_layout,1);assert(report.warnings.length>0);assert.equal(report.modelDigests.water,'d');
  await assert.rejects(()=>evaluateGold({manifest,root,split:'test',reader}),/--final/);
  await assert.rejects(()=>evaluateGold({manifest,root,split:'train',reader,final:true}),/val hoặc test/);
  assert.equal((await evaluateGold({manifest,root,split:'test',final:true,reader})).overall.n,1);
  assert([right,wrong,quiet].every(item=>item.split==='val'));
});

function fakeExchange(token,{method='GET',url='/',headers={},body}={}){
  const req=Object.assign(Readable.from(body===undefined?[]:[Buffer.from(typeof body==='string'?body:JSON.stringify(body))]),{method,url,headers:{host:'127.0.0.1:4000','x-gold-token':token,'content-type':'application/json',...headers}});
  const res={status:null,body:null,writeHead(status){this.status=status;},end(body){this.body=body;}};
  return {req,res};
}
const call=async(handler,token,options)=>{const {req,res}=fakeExchange(token,options);await handler(req,res);return {status:res.status,json:(()=>{try{return JSON.parse(res.body);}catch{return null;}})(),raw:res.body};};

test('label tool is token/host guarded, blind for val/test, and records provenance',async()=>{
  const root=newRoot('label'),manifest=emptyManifest(),token='t'.repeat(48);
  const train=(await addImage(manifest,root,{bytes:await photo(),utility:'water',group:groupIn('train','l'),source:'folder-import'})).item;
  const val=(await addImage(manifest,root,{bytes:await photo(),utility:'water',group:groupIn('val','l'),source:'folder-import'})).item;
  const junk=(await addImage(manifest,root,{bytes:await photo(),utility:'water',group:groupIn('train','m'),source:'folder-import'})).item;
  saveManifest(manifest,root);
  const handler=createLabelHandler({root,token,port:4000,suggest:async()=>({status:'ready',reading:{integerValue:77}})});
  const layout={utility:'water',digits:5,decimals:0};

  assert.equal((await call(handler,token,{headers:{host:'evil.example'}})).status,403);
  assert.equal((await call(handler,'x'.repeat(48),{url:'/api/queue'})).status,403);
  assert.equal((await call(handler,token,{url:'/'})).status,200);
  assert.equal((await call(handler,token,{url:'/img/../../etc/passwd'})).status,404);
  assert.equal((await call(handler,token,{url:'/api/queue'})).json.remaining,3);

  assert.equal((await call(handler,token,{method:'POST',url:'/api/suggest',body:{id:val.id,...layout}})).status,403);
  assert.equal((await call(handler,token,{method:'POST',url:'/api/label',body:{id:val.id,...layout,label:-1}})).status,400);
  assert.equal((await call(handler,token,{method:'POST',url:'/api/label',body:{id:val.id,...layout,label:123}})).json.labelSource,'human-typed');
  assert.equal((await call(handler,token,{method:'POST',url:'/api/label',body:{id:val.id,...layout,label:124}})).status,409,'a label is never overwritten');

  assert.equal((await call(handler,token,{method:'POST',url:'/api/suggest',body:{id:train.id,...layout}})).json.reading,77);
  assert.equal((await call(handler,token,{method:'POST',url:'/api/label',body:{id:train.id,...layout,label:77}})).json.labelSource,'human-confirmed-suggestion');
  assert.equal((await call(handler,token,{method:'POST',url:'/api/exclude',body:{id:junk.id}})).status,200);
  assert.equal((await call(handler,token,{method:'POST',url:'/api/label',body:'{not json'})).status,400);

  const saved=loadManifest(root);
  assert.equal(saved.items.find(item=>item.id===val.id).label,123);
  assert.equal(saved.items.find(item=>item.id===junk.id).excluded,true);
  assert.deepEqual(summarize(saved)['water/val'].labeled,1);
  assert.equal((await call(handler,token,{url:'/api/queue'})).json.remaining,0);
});

test('flywheel tracks strict full-string matches, zero-setup mode, latency and gemini-vision hard cases',async()=>{
  assert.equal(strictClassify({status:'ready',reading:{digits:'007664',displayText:'00766.4',integerValue:766}},{label:766,digitsText:'00766.4'}),'correct');
  assert.equal(strictClassify({status:'ready',reading:{digits:'07664',displayText:'0766.4',integerValue:766}},{label:766,digitsText:'00766.4'}),'wrong_ready');
  assert.equal(strictClassify({status:'needs_review',reading:null},{label:766,digitsText:'00766.4'}),'abstain');
  const stats=latencyStats([100,200,300,400,500]);
  assert.equal(stats.count,5);assert.equal(stats.p50,300);assert.equal(stats.p95,500);

  const root=newRoot('flywheel'),manifest=emptyManifest();
  await addImage(manifest,root,{bytes:await photo(),utility:'electric',group:groupIn('val','fw1_'),source:'verified-export',digits:null,decimals:null,label:766,digitsText:'00766.4',labelSource:'owner-verified'});
  const report=await evaluateGold({manifest,root,split:'val',mode:'zero-setup',reader:async({digits,decimals,mode})=>{
    assert.equal(mode,'zero-setup');assert.equal(digits,null);assert.equal(decimals,null);
    return {status:'ready',engine:'paddleocr',reading:{digits:'007664',displayText:'00766.4',integerValue:766}};
  }});
  assert.equal(report.mode,'zero-setup');assert.equal(report.overall.correct,1);assert.equal(report.strictOverall.correct,1);assert.equal(report.engines.paddleocr,1);assert.equal(report.latencyMs.count,1);

  // Exporting a gemini-vision-assisted verified reading marks it hard=true so local training prioritizes it.
  const db=exportDatabase(),expRoot=newRoot('flywheel-export'),expManifest=emptyManifest();
  const imgBytes=await photo();
  db.prepare('INSERT INTO files VALUES(?,?)').run('file_gv',imgBytes);
  db.prepare('INSERT INTO meter_reader_proposals VALUES(?,?)').run('prop_gv',JSON.stringify({status:'ready',engine:'gemini-vision',reading:{digits:'007664',displayText:'00766.4',integerValue:766},config:{digits:6,decimals:1}}));
  putRecord(db,'meterSubmissions',{id:'sub_gv',ownerId:'o1',roomId:'r1',tenantId:'t1',status:'approved',utility:'electric',photos:[{fileId:'file_gv'}],selectedFileId:'file_gv',verifiedValue:766,readerProposalId:'prop_gv'});
  const expStats=await exportVerified(db,{root:expRoot,manifest:expManifest});
  assert.equal(expStats.added,1);
  assert.equal(expManifest.items[0].hard,true);
  assert.equal(expManifest.items[0].digitsText,'00766.4');
  assert.equal(expManifest.items[0].readerAtExport.engine,'gemini-vision');
});
