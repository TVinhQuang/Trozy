// Opt-in real local model checks. Uses only isolated synthetic seed data.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createApp} from '../src/backend/server.mjs';
import {safeUser} from '../src/backend/db.mjs';
import {dataFor} from '../src/backend/domain.mjs';
import {getOllamaStatus} from '../src/ai/ollama.mjs';
import {answerQuestion} from '../src/ai/copilot.mjs';
import {classifyMaintenance} from '../src/ai/maintenance.mjs';

process.env.TROZY_AI_ENABLED='true';
const status=await getOllamaStatus();
if(!status.available||!status.modelInstalled)throw new Error(status.message);
const app=createApp({dbPath:':memory:',seed:true});
const ownerRow=app.store.db.prepare('SELECT * FROM users WHERE id=?').get('owner_demo');
const tenantRow=app.store.db.prepare('SELECT * FROM users WHERE id=?').get('user_tenant');
const owner=safeUser(ownerRow),tenant=safeUser(tenantRow),ownerData=dataFor(app.store,ownerRow),tenantData=dataFor(app.store,tenantRow);
const hash=()=>createHash('sha256').update(JSON.stringify(['invoices','payments','contracts','deposits','readings','issues','notifications'].map(name=>app.store.list(name)))).digest('hex');
const before=hash(),entries=[];
const currency=value=>new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(value);
async function check(name,input,run,validate,expectedEngine='ollama'){
 const start=performance.now();const result=await run();const entry={name,input,expectedEngine,elapsedMs:Math.round(performance.now()-start),result,passed:false};entries.push(entry);
 assert.equal(result.engine,expectedEngine,`${name}: did not use required engine (${JSON.stringify(result.warnings)})`);validate(result);entry.passed=true;console.log(`PASS ${name} (${entry.elapsedMs}ms, ${result.engine})`);
}
let failed;
try{
 const question='Phòng nào còn nợ tháng 10/2026?';
 await check('B01 actual model + exact debt',{question},()=>answerQuestion({user:owner,data:ownerData,input:{question}}),result=>{
  const expected=ownerData.invoices.filter(row=>row.status==='issued'&&row.period==='2026-10').reduce((total,row)=>total+Math.max(0,row.total-row.paid),0);
  assert(result.answer.includes(currency(expected)));assert(result.sources.length);assert(result.sources.every(source=>ownerData[source.collection]?.some(row=>row.id===source.id)));
 });
 const invoiceQuestion='Giải thích hóa đơn của tôi';
 await check('B01 tenant invoice explanation',{question:invoiceQuestion,invoiceId:'HD-10-101'},()=>answerQuestion({user:tenant,data:tenantData,input:{question:invoiceQuestion,invoiceId:'HD-10-101'}}),result=>{assert(result.answer.includes('3.500.000'));assert(result.answer.includes('kWh'));assert(result.sources.every(source=>source.id==='HD-10-101'));assert(!result.answer.includes('Trần Thu Hà'));});
 const faq='Mình cần báo chủ nhà bao lâu trước khi dọn đi?';
 await check('B01 semantic document FAQ',{question:faq},()=>answerQuestion({user:tenant,data:tenantData,input:{question:faq}}),result=>{assert(result.answer.includes('30'));assert(result.sources.length);assert(result.sources.every(source=>tenantData[source.collection]?.some(row=>row.id===source.id)));});
 const appliance={roomId:'room_101',assetId:'asset_0',description:'Máy lạnh phòng 101 bị chảy nước và không mát, không có khói hay mùi khét.'};
 await check('B04 actual appliance classification',appliance,()=>classifyMaintenance({user:tenant,data:tenantData,input:appliance}),result=>{assert.equal(result.category,'Thiết bị');assert.equal(result.priority,'normal');assert.equal(result.requiresConfirmation,true);});
 const hazard={roomId:'room_101',description:'Ổ cắm trong phòng có tia lửa, bốc khói và mùi khét rõ rệt.'};
 await check('B04 hazard floor preserved',hazard,()=>classifyMaintenance({user:tenant,data:tenantData,input:hazard}),result=>{assert.equal(result.category,'Điện');assert.equal(result.priority,'urgent');assert(result.safetyAdvice.length);assert.equal(result.requiresConfirmation,true);});
 const denied='Phòng 102 còn nợ gì?';
 await check('B01 tenant scope denied locally',{question:denied},()=>answerQuestion({user:tenant,data:tenantData,input:{question:denied}}),result=>{assert.equal(result.sources.length,0);assert(!result.answer.includes('Trần Thu Hà'));},'local');
 const announcement='Soạn thông báo cắt nước ngày 29/10 từ 9h đến 11h để bảo trì đường ống.';
 await check('B01 custom announcement preserves explicit schedule',{question:announcement},()=>answerQuestion({user:owner,data:ownerData,input:{question:announcement}}),result=>{assert(result.draft);assert(result.draft.body.includes('29/10'));assert(/9/.test(result.draft.body)&&/11/.test(result.draft.body));assert(result.answer.includes('chưa được gửi'));});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${app.server.address().port}/api`;
 const login=await fetch(`${base}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'chu@trozy.vn',password:'Trozy@2026'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 await check('B01 authenticated HTTP round-trip + persisted history',{question},async()=>{const response=await fetch(`${base}/extensions/B01`,{method:'POST',headers:{'Content-Type':'application/json',cookie},body:JSON.stringify({question})});assert.equal(response.status,200);return (await response.json()).result;},result=>assert(result.sources.length));
 const persisted=await fetch(`${base}/ai/history?feature=B01`,{headers:{cookie}}).then(response=>response.json());assert(persisted.entries.some(entry=>entry.input.question===question&&entry.result.engine==='ollama'));
 const otherLogin=await fetch(`${base}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'thue@trozy.vn',password:'Trozy@2026'})});const tenantCookie=otherLogin.headers.get('set-cookie').split(';')[0];
 const isolated=await fetch(`${base}/ai/history?feature=B01`,{headers:{cookie:tenantCookie}}).then(response=>response.json());assert.equal(isolated.entries.length,0);
 assert.equal(hash(),before,'Read-only AI calls changed business records.');
}catch(error){failed=error;console.error(error.message);}
finally{
 const evidence={recordedAt:new Date().toISOString(),provider:'ollama',model:status.model,syntheticDataOnly:true,businessRecordsUnchanged:hash()===before,passed:!failed,checks:entries};
 mkdirSync('docs/test',{recursive:true});writeFileSync('docs/test/AI-LIVE-EXAMPLES.json',JSON.stringify(evidence,null,2)+'\n');if(app.server.listening)await app.close();else app.store.close();
}
if(failed)throw failed;
console.log(`PASS ${entries.length} checks using local ${status.model}; no business data changed.`);
