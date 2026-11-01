import {id,now,COLLECTIONS,safeUser} from './db.mjs';
import {dataFor,fail,ownerId} from './domain.mjs';
import {runExtension,extensionCapabilities} from './extensions.mjs';
import {getOllamaStatus} from '../ai/ollama.mjs';
import {analyzeUtilities} from '../ai/anomalies.mjs';
import {createHash} from 'node:crypto';

const featureNames=['B01','B02','B03','B04'];
const sourcePages={properties:'properties',rooms:'rooms',tenants:'tenants',contracts:'contracts',readings:'readings',services:'services',invoices:'invoices',payments:'payments',credits:'payments',deposits:'deposits',transactions:'transactions',issues:'issues',assets:'assets',handovers:'handovers',notifications:'notifications',tickets:'tickets',documents:'documents',vehicles:'vehicles',amenities:'amenities',bookings:'amenities',settings:'settings'};
const isObject=value=>value&&typeof value==='object'&&!Array.isArray(value);
const requireText=(value,label,max,min=1)=>{if(typeof value!=='string'||value.trim().length<min||value.length>max)fail(400,`${label} cần từ ${min} đến ${max} ký tự.`);return value.trim();};
const period=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const alertFingerprint=alert=>createHash('sha256').update(JSON.stringify([alert.currentUsage,alert.baseline,alert.threshold,alert.readingId,alert.history])).digest('hex');

export function initializeAI(store){
 store.db.exec(`CREATE TABLE IF NOT EXISTS ai_history(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,feature TEXT NOT NULL,input TEXT NOT NULL,result TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS ai_history_user ON ai_history(user_id,created_at DESC);
 CREATE TABLE IF NOT EXISTS ai_alert_reviews(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,alert_id TEXT NOT NULL,status TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL,PRIMARY KEY(user_id,alert_id));`);
 if(!store.db.prepare('PRAGMA table_info(ai_alert_reviews)').all().some(column=>column.name==='fingerprint'))store.db.exec('ALTER TABLE ai_alert_reviews ADD COLUMN fingerprint TEXT');
}

function scopeInput(store,user,name,value){
 if(!isObject(value))fail(400,'Đầu vào tính năng cần là JSON hợp lệ.');
 const input=structuredClone(value),original=dataFor(store,user);
 const refs={propertyId:'properties',roomId:'rooms',tenantId:'tenants',invoiceId:'invoices',documentId:'documents',issueId:'issues',assetId:'assets'};
 for(const [key,collection] of Object.entries(refs))if(input[key]!==undefined&&input[key]!==null&&input[key]!==''){
  if(typeof input[key]!=='string'||!original[collection].some(row=>row.id===input[key]))fail(403,'Dữ liệu được chọn không thuộc phạm vi truy cập của bạn.');
 }
 if(input.period!==undefined&&!period(input.period))fail(400,'Kỳ phân tích cần có dạng YYYY-MM.');
 if(input.roomId&&input.propertyId&&original.rooms.find(row=>row.id===input.roomId)?.propertyId!==input.propertyId)fail(400,'Phòng không thuộc cơ sở được chọn.');
 if(input.assetId&&input.roomId&&original.assets.find(row=>row.id===input.assetId)?.roomId!==input.roomId)fail(400,'Tài sản không thuộc phòng được chọn.');
 const data=Object.fromEntries(COLLECTIONS.map(collection=>[collection,original[collection].filter(row=>{
  if(input.propertyId&&(collection==='properties'?row.id!==input.propertyId:row.propertyId&&row.propertyId!==input.propertyId))return false;
  if(input.roomId&&collection==='rooms'&&row.id!==input.roomId)return false;
  if(input.roomId&&row.roomId&&row.roomId!==input.roomId)return false;
  return true;
 })]));
 if(name==='B01'){
  input.question=requireText(input.question,'Câu hỏi',2000);
  if(input.history!==undefined){if(!Array.isArray(input.history)||input.history.length>8)fail(400,'Chỉ gửi tối đa 8 lượt hội thoại gần nhất.');input.history=input.history.map(entry=>{if(!isObject(entry)||!['user','assistant'].includes(entry.role))fail(400,'Lịch sử hội thoại không hợp lệ.');return {role:entry.role,content:requireText(entry.content,'Nội dung hội thoại',2000)};});}
 }
 if(name==='B04'){
  input.description=requireText(input.description,'Mô tả sự cố',2000,10);
  if(input.title!==undefined&&input.title!=='')input.title=requireText(input.title,'Tiêu đề',150);
 }
 return {data,input};
}

function validateResult(name,result,data){
 if(!isObject(result)||result.feature!==name||JSON.stringify(result).length>300000)fail(502,'Kết quả hỗ trợ không hợp lệ. Vui lòng thử lại.');
 if(name==='B01'){
  if(typeof result.answer!=='string'||result.answer.length>20000||!Array.isArray(result.sources))fail(502,'Câu trả lời trợ lý không hợp lệ.');
  const sourceKeys=new Set();result.sources=result.sources.filter(source=>isObject(source)&&Object.hasOwn(data,source.collection)&&Array.isArray(data[source.collection])&&data[source.collection].some(row=>row.id===source.id)&&!sourceKeys.has(`${source.collection}:${source.id}`)&&sourceKeys.add(`${source.collection}:${source.id}`)).map(source=>({collection:source.collection,id:source.id,label:String(source.label||source.id).slice(0,200),page:sourcePages[source.collection]||'dashboard',...(source.excerpt?{excerpt:String(source.excerpt).slice(0,1000)}:{})})).slice(0,30);
  if(result.draft){const draft=result.draft;if(!isObject(draft)||typeof draft.title!=='string'||typeof draft.body!=='string'||draft.title.length>150||draft.body.length>5000)delete result.draft;else draft.roomIds=(Array.isArray(draft.roomIds)?draft.roomIds:[]).filter(key=>data.rooms.some(room=>room.id===key));}
 }
 if(name==='B04'){
  if(!['Điện','Nước','Thiết bị','Kết cấu','Khác'].includes(result.category)||!['low','normal','urgent'].includes(result.priority)||!Number.isFinite(result.confidence))fail(502,'Gợi ý phân loại không hợp lệ.');
  result.requiresConfirmation=true;
 }
 return result;
}

export function attachReviews(store,user,result){
 const reviews=store.db.prepare('SELECT alert_id,status,note,fingerprint FROM ai_alert_reviews WHERE user_id=?').all(user.id);
 return {...result,alerts:result.alerts.map(alert=>{const review=reviews.find(item=>item.alert_id===alert.id&&item.fingerprint===alertFingerprint(alert));return {...alert,reviewed:review?.status==='reviewed',reviewNote:review?.note||''};})};
}

export function syncUtilityNotifications(store,user){
 const ownerUser=user.role==='landlord'?user:store.db.prepare("SELECT * FROM users WHERE id=? AND role='landlord'").get(ownerId(user));
 if(!ownerUser)return;
 // Generate from the owner's complete history. A tenant's shorter authorized
 // history must never erase an alert already produced for the same room.
 const data=dataFor(store,ownerUser),result=analyzeUtilities({data,input:{}}),allowedRooms=new Set(data.rooms.map(room=>room.id));
 const owner=ownerId(user),existing=store.list('notifications',owner).filter(row=>row.source==='utility-ai'&&allowedRooms.has(row.roomId));
 const current=new Set(result.alerts.map(alert=>alert.id));
 for(const row of existing)if(!current.has(row.sourceKey))store.remove('notifications',row.id);
 for(const alert of result.alerts){
  const previous=existing.find(row=>row.sourceKey===alert.id),body=`${alert.explanation}\n${alert.recommendation}`;
  if(previous?.body===body)continue;
  store.put('notifications',{id:previous?.id||id('not'),ownerId:owner,propertyId:alert.propertyId,roomId:alert.roomId,title:`Kiểm tra ${alert.utility==='electric'?'điện':'nước'} phòng ${alert.roomCode} · ${alert.period}`,body,kind:'general',readBy:[],source:'utility-ai',sourceKey:alert.id,createdAt:previous?.createdAt||now()});
 }
}

export function createAIService(store){
 initializeAI(store);let languageActive=0;
 return {
  async status(){return {...await getOllamaStatus(),features:extensionCapabilities()};},
  history(user,feature){
   if(feature&&!featureNames.includes(feature))fail(400,'Tính năng lịch sử không hợp lệ.');
   if(feature==='B03')return {entries:[]};
   const rows=feature?store.db.prepare('SELECT * FROM ai_history WHERE user_id=? AND feature=? ORDER BY created_at DESC,rowid DESC LIMIT 40').all(user.id,feature):store.db.prepare("SELECT * FROM ai_history WHERE user_id=? AND feature!='B03' ORDER BY created_at DESC,rowid DESC LIMIT 40").all(user.id);
   return {entries:rows.reverse().map(row=>({id:row.id,feature:row.feature,createdAt:row.created_at,input:JSON.parse(row.input),result:JSON.parse(row.result)}))};
  },
  clearHistory(user){store.db.prepare('DELETE FROM ai_history WHERE user_id=?').run(user.id);return {ok:true};},
  review(user,key,input){if(!isObject(input)||!['reviewed','open'].includes(input.status))fail(400,'Trạng thái kiểm tra không hợp lệ.');const scoped=scopeInput(store,user,'B02',input),result=analyzeUtilities(scoped),alert=result.alerts.find(row=>row.id===key);if(!alert)fail(404,'Cảnh báo không còn tồn tại hoặc không thuộc phạm vi của bạn.');const note=typeof input.note==='string'?input.note.trim().slice(0,1000):'';store.db.prepare('INSERT INTO ai_alert_reviews(user_id,alert_id,status,note,updated_at,fingerprint) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,alert_id) DO UPDATE SET status=excluded.status,note=excluded.note,updated_at=excluded.updated_at,fingerprint=excluded.fingerprint').run(user.id,key,input.status,note,now(),alertFingerprint(alert));return {id:key,status:input.status,note};},
  async run(user,name,value){
   if(name==='B03')fail(410,'Tính năng OCR/Vision đã được gỡ. Chủ nhà xem ảnh và nhập chỉ số thủ công.');
   if(!featureNames.includes(name))return runExtension(name,{user:safeUser(user),data:dataFor(store,user),input:value});
   const {input,data}=scopeInput(store,user,name,value);
   const language=['B01','B04'].includes(name);
   if(language&&languageActive>=2)fail(429,'Trợ lý đang xử lý yêu cầu khác. Vui lòng thử lại sau ít giây.');
   if(language)languageActive++;
   let result;
   try{result=validateResult(name,await runExtension(name,{user:safeUser(user),data,input}),data);}finally{if(language)languageActive--;}
   if(name==='B02')return attachReviews(store,user,result);
   const historyInput={...input};delete historyInput.history;
   store.transaction(()=>{
    store.db.prepare('INSERT INTO ai_history(id,user_id,feature,input,result,created_at) VALUES(?,?,?,?,?,?)').run(id('ai'),user.id,name,JSON.stringify(historyInput),JSON.stringify(result),now());
    store.db.prepare('DELETE FROM ai_history WHERE user_id=? AND id NOT IN(SELECT id FROM ai_history WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 200)').run(user.id,user.id);
   });
   return result;
  }
 };
}
