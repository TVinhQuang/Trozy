import {scopeInput,validateResult,alertFingerprint,syncUtilityNotifications} from './ai-scope.mjs';
export {syncUtilityNotifications} from './ai-scope.mjs';
import {id,now,COLLECTIONS,safeUser} from './db.mjs';
import {dataFor,fail,ownerId} from './domain.mjs';
import {runExtension,extensionCapabilities} from './extensions.mjs';
import {getAiStatus} from '../ai/llm.mjs';
import {analyzeUtilities} from '../ai/anomalies.mjs';
import {createHash} from 'node:crypto';

const featureNames=['B01','B02','B03','B04'];
const isObject=value=>value&&typeof value==='object'&&!Array.isArray(value);
export function initializeAI(store){
 store.db.exec(`CREATE TABLE IF NOT EXISTS ai_history(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,feature TEXT NOT NULL,input TEXT NOT NULL,result TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS ai_history_user ON ai_history(user_id,created_at DESC);
 CREATE TABLE IF NOT EXISTS ai_alert_reviews(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,alert_id TEXT NOT NULL,status TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL,PRIMARY KEY(user_id,alert_id));`);
 if(!store.db.prepare('PRAGMA table_info(ai_alert_reviews)').all().some(column=>column.name==='fingerprint'))store.db.exec('ALTER TABLE ai_alert_reviews ADD COLUMN fingerprint TEXT');
}

export function attachReviews(store,user,result){
 const reviews=store.db.prepare('SELECT alert_id,status,note,fingerprint FROM ai_alert_reviews WHERE user_id=?').all(user.id);
 return {...result,alerts:result.alerts.map(alert=>{const review=reviews.find(item=>item.alert_id===alert.id&&item.fingerprint===alertFingerprint(alert));return {...alert,reviewed:['reviewed','dismissed'].includes(review?.status),dismissed:review?.status==='dismissed',reviewNote:review?.note||''};})};
}

export function createAIService(store){
 initializeAI(store);let languageActive=0;
 return {
  async status(){return {...await getAiStatus(),features:extensionCapabilities()};},
  history(user,feature){
   if(feature&&!featureNames.includes(feature))fail(400,'Tính năng lịch sử không hợp lệ.');
   if(feature==='B03')return {entries:[]};
   const rows=feature?store.db.prepare('SELECT * FROM ai_history WHERE user_id=? AND feature=? ORDER BY created_at DESC,rowid DESC LIMIT 40').all(user.id,feature):store.db.prepare("SELECT * FROM ai_history WHERE user_id=? AND feature!='B03' ORDER BY created_at DESC,rowid DESC LIMIT 40").all(user.id);
   return {entries:rows.reverse().map(row=>({id:row.id,feature:row.feature,createdAt:row.created_at,input:JSON.parse(row.input),result:JSON.parse(row.result)}))};
  },
  clearHistory(user){store.db.prepare('DELETE FROM ai_history WHERE user_id=?').run(user.id);return {ok:true};},
  review(user,key,input){if(input?.status==='dismissed'&&user.role!=='landlord')fail(403,'Chỉ chủ trọ được bác bỏ cảnh báo.');if(!isObject(input)||!['reviewed','open','dismissed'].includes(input.status))fail(400,'Trạng thái kiểm tra không hợp lệ.');const scoped=scopeInput(store,user,'B02',input),result=analyzeUtilities(scoped),alert=result.alerts.find(row=>row.id===key);if(!alert)fail(404,'Cảnh báo không còn tồn tại hoặc không thuộc phạm vi của bạn.');const note=typeof input.note==='string'?input.note.trim().slice(0,1000):'';store.db.prepare('INSERT INTO ai_alert_reviews(user_id,alert_id,status,note,updated_at,fingerprint) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,alert_id) DO UPDATE SET status=excluded.status,note=excluded.note,updated_at=excluded.updated_at,fingerprint=excluded.fingerprint').run(user.id,key,input.status,note,now(),alertFingerprint(alert));return {id:key,status:input.status,note};},
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
