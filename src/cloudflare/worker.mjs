import {mailConfigured,queueNotification,queueAutomaticReminders,deliverQueuedNotifications} from './mail.mjs';
import {createHmac} from 'node:crypto';
import {audit,createRecord,dataFor,deleteRecord,fail,generatePeriodInvoices,generateReminders,getRecord,importRecords,ownerId,performAction,previewImport,publicTenant,updateRecord} from '../backend/domain.mjs';
import {COLLECTIONS,hashToken,id,now,safeUser,today} from '../backend/model.mjs';
import {applyDueTransfers,occupancyAction} from '../backend/occupancy.mjs';
import {meterWorkflow} from '../backend/meter-workflow.mjs';
import {accessLogQuery} from '../backend/access-log.mjs';
import {classifyMaintenance} from '../ai/maintenance-engine.mjs';
import {workerGemini} from '../ai/llm.mjs';
import {contractTarget,contractExcerpt,readPaperContract,proposedFields} from '../backend/paper-contract.mjs';
import {answerQuestion} from '../ai/copilot-engine.mjs';
import {analyzeUtilities} from '../ai/anomalies.mjs';
import {scopeInput,validateResult,syncUtilityNotifications,alertFingerprint} from '../backend/ai-scope.mjs';
import {contractDocument,invoiceDocument,receiptDocument} from '../backend/business-documents.mjs';
import {authRoute,limit,processLandlordSignups,sessionUser} from './auth.mjs';
import {openOwnerStore} from './store.mjs';
import {cleanInterruptedUploads,downloadFile,uploadFile} from './files.mjs';

const capabilities={B01:true,B02:true,B03:false,B04:true,B05:false,meterReader:false,browserPdf:true,binaryUpload:true};
const manual='Bản cloud dùng ảnh gốc để chủ trọ đối chiếu và nhập chỉ số thủ công.';
const json=(value,status=200,headers={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});

async function readBytes(request,maxBytes) {
  if(!request.body)fail(400,'Yêu cầu thiếu dữ liệu.');
  const reader=request.body.getReader(),chunks=[];
  let size=0;
  while(true){
    const {done,value}=await reader.read(); if(done) break;
    size+=value.byteLength;
    if(size>maxBytes){await reader.cancel();fail(413,'Dữ liệu vượt dung lượng cho phép.');}
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
async function requestBody(request) {
  if(['GET','HEAD'].includes(request.method)||!request.body) return {};
  if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) fail(415,'Yêu cầu cần sử dụng JSON.');
  const bytes=await readBytes(request,8*1024*1024);
  if(!bytes.length) return {};
  try {const body=JSON.parse(bytes.toString('utf8'));if(body&&typeof body==='object'&&!Array.isArray(body)) return body;} catch {}
  fail(400,'Dữ liệu JSON không hợp lệ.');
}
function access(env,user,row,resource,key,action,outcome) {
  return env.DB.prepare('INSERT INTO access_events(id,ownerId,propertyId,actorId,actorName,createdAt,resource,recordId,action,outcome) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(id('access'),ownerId(user)||user.id,row?.ownerId===ownerId(user)?row.propertyId||null:null,user.id,user.name,now(),resource,key,action,outcome);
}
function exportData(env,store,user,input,download) {
  if(user.role!=='landlord') fail(403,'Chỉ chủ trọ được xuất dữ liệu cơ sở.');
  const property=getRecord(store,user,'properties',input.propertyId),scoped=dataFor(store,user);
  if(!['backup','export'].includes(input.operation)||!input.collections?.length||!Array.isArray(input.collections)||input.collections.some(key=>!COLLECTIONS.includes(key))) fail(400,'Chọn loại dữ liệu cần xuất.');
  const data=Object.fromEntries([...new Set(input.collections)].sort().map(c=>[c,scoped[c].filter(r=>(c==='properties'?r.id:r.propertyId)===property.id).map(r=>{
    if(c!=='tenants') return r;
    const {inviteCode,inviteExpiresAt,...profile}=r;return profile;
  }).sort((a,b)=>a.id.localeCompare(b.id))]));
  const revision=createHmac('sha256',env.TROZY_DATA_KEY).update(JSON.stringify([user.id,property.id,input.operation,data])).digest('hex');
  if(!download) return {revision,operation:input.operation,propertyId:property.id,counts:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length]))};
  if(input.revision!==revision) fail(409,'Dữ liệu đã thay đổi. Vui lòng xem trước lại.');
  audit(store,user,input.operation,'data',{id:property.id,propertyId:property.id},input.collections.join(', '));
  return {format:'trozy-backup-v1',exportedAt:now(),propertyId:property.id,operation:input.operation,data};
}

async function api(request,env,url,path) {
  const method=request.method;
  if(method==='GET'&&path==='/health') {
    await env.DB.prepare('SELECT version FROM owner_revisions LIMIT 1').first();
    return json({ok:true,database:'d1',files:'kv',landlordSignup:true,mailAvailable:mailConfigured(env)});
  }
  if(!['GET','HEAD'].includes(method)){
    const origin=request.headers.get('Origin');
    if(request.headers.get('Sec-Fetch-Site')==='cross-site'||(origin&&origin!==url.origin)) fail(403,'Nguồn yêu cầu không hợp lệ.');
  }
  const user=await sessionUser(env,request);
  if(!user&&!path.startsWith('/auth/')) fail(401,'Vui lòng đăng nhập.');
  const rawUpload=method==='POST'&&path==='/files'&&request.headers.get('Content-Type')==='application/octet-stream';
  let input;
  if(rawUpload){
    try {input=JSON.parse(decodeURIComponent(request.headers.get('X-Trozy-Upload')||''));}
    catch {fail(400,'Thông tin tệp không hợp lệ.');}
    if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'Thông tin tệp không hợp lệ.');
  }else input=await requestBody(request);
  if(path.startsWith('/auth/')) return authRoute(env,request,path,input,user,json);
  if(path==='/meter/updates'&&method==='GET'){
    if(user.role!=='landlord') fail(403,'Chỉ chủ nhà nhận cập nhật bộ ảnh.');
    const row=await env.DB.prepare('SELECT version FROM owner_revisions WHERE owner_id=?').bind(user.id).first();
    return json({revision:hashToken(user.id+':'+(row?.version??0))});
  }
  if(path==='/ai/status'&&method==='GET')return json(workerGemini(env).getStatus());
  let store=await openOwnerStore(env,user,{includeFiles:!['GET','HEAD'].includes(method)&&path!=='/files'});
  let result,status=200; const extra=[];
  const post=method==='POST';
  if(path==='/bootstrap'&&method==='GET'){
    applyDueTransfers(store,user); generateReminders(store,user);syncUtilityNotifications(store,user);
    result={user:safeUser(user),data:dataFor(store,user),capabilities};
  } else if(path==='/files'&&post) {
    await limit(env,'files:'+user.id,30);
    return json(await uploadFile(env,store,user,input,rawUpload?await readBytes(request,5*1024*1024):undefined),201);
  } else if(/^\/files\/[^/]+$/.test(path)&&method==='GET') {
    return downloadFile(env,store,user,path.slice(7),url.searchParams.get('inline')==='1');
  } else if(path.startsWith('/meter/')) {
    const workflow=meterWorkflow(store,{validateReaderProposalForReview(_store,_user,_row,body){
      if(body.proposalId!==undefined) fail(409,'Đề xuất OCR không khả dụng trên bản cloud.');return null;
    }});
    const parts=path.split('/'), key=parts[3],action=parts[4];
    if(path==='/meter/submissions'&&method==='GET') result={records:dataFor(store,user).meterSubmissions};
    else if(post&&['/meter/submissions','/meter/owner-evidence'].includes(path)){
      await limit(env,'meter:'+user.id,8);
      const sent=path.endsWith('owner-evidence')?workflow.submitOwnerEvidence(user,input):workflow.submitPhotos(user,input);
      result=sent;status=path.endsWith('owner-evidence')?201:202;
    }else if(parts[2]==='submissions'&&key&&action==='review'&&post) result=workflow.review(user,key,input);
    else if(path==='/meter/reader/status'&&method==='GET'){
      if(user.role!=='landlord') fail(403,'Chỉ chủ trọ đọc công tơ.');
      result={available:false,locatorAvailable:false,message:manual,reason:manual};
    }else if(parts[2]==='submissions'&&key&&['image','automatic'].includes(action)&&method==='GET'){
      if(user.role!=='landlord') fail(403,'Chỉ chủ trọ đối chiếu ảnh.');
      const row=getRecord(store,user,'meterSubmissions',key);
      const file=parts[5]||url.searchParams.get('fileId')||row.selectedFileId;
      if(!row.photos.some(p=>p.fileId===file)) fail(404,'Ảnh không thuộc bộ gửi.');
      if(action==='image') return downloadFile(env,store,user,file,true);
      result={status:'unavailable',proposal:null,profile:null,fileId:file,submissionVersion:row.version,reason:manual};
    }else fail(503,manual);
  } else if(path.startsWith('/occupancy/')&&post){
    result=occupancyAction(store,user,path.slice(11),input);
  } else if(path==='/import/preview'&&post) result=previewImport(store,user,input);
  else if(path==='/import'&&post){
    if(input.propertyId&&(!Array.isArray(input.rows)||input.rows.some(r=>r.propertyId!==input.propertyId))) fail(400,'Phạm vi nhập không khớp.');
    result=importRecords(store,user,input.collection,input.rows);
  } else if(path==='/export'&&method==='GET'){
    if(user.role==='landlord') fail(400,'Chọn cơ sở và xem trước dữ liệu xuất.');
    result={format:'trozy-backup-v1',exportedAt:now(),user:safeUser(user),data:dataFor(store,user)};
  } else if(['/export/preview','/export/download'].includes(path)&&post){
    result=exportData(env,store,user,input,path.endsWith('/download'));
    extra.push(access(env,user,store.get('properties',input.propertyId),'data',input.propertyId,path.endsWith('/download')?'download':'view','success'));
  } else if(/^\/access-log(?:\/[^/]+)?$/.test(path)&&method==='GET'){
    const key=path.split('/')[2],{sql,args}=accessLogQuery(store,user,url.searchParams,key);
    const rows=(await env.DB.prepare(sql).bind(...args).all()).results;
    if(key&&!rows.length) fail(404,'Không tìm thấy sự kiện.');result=key?rows[0]:{records:rows};
  } else if(/^\/(contracts|invoices|payments)\/[^/]+\/pdf$/.test(path)&&method==='GET'){
    const [,collection,key]=path.split('/');
    const document=collection==='contracts'?contractDocument(store,user,key,url.searchParams.get('version')):(collection==='payments'?receiptDocument:invoiceDocument)(store,user,key);
    if(url.searchParams.get('definition')==='1'){
      await access(env,user,store.get(collection,key),collection,key,'download','success').run();
      return json({definition:document.definition,filename:collection+'-'+key+'-v'+document.version+'.pdf'});
    }
    const {renderDocument}=await import('./pdf.mjs');
    const bytes=await renderDocument(document.definition);
    await access(env,user,store.get(collection,key),collection,key,'download','success').run();
    return new Response(bytes,{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store',
      'Content-Disposition':(url.searchParams.has('preview')?'inline':'attachment')+'; filename="'+collection+'-'+encodeURIComponent(key)+'-v'+document.version+'.pdf"'}});
  } else if(post&&['/paper-contract/extract','/paper-contract/confirm'].includes(path)){
    contractTarget(store,user,input);
    if(path.endsWith('/confirm'))return json({ok:true});
    const excerpt=contractExcerpt(input);
    await limit(env,'paper-ocr:'+user.id,12);
    const lines=await readPaperContract(excerpt,input.collection,workerGemini(env));
    const fresh=await openOwnerStore(env,user);
    const room=contractTarget(fresh,user,input);
    const fields=proposedFields(fresh,room,input.collection,lines);
    if(!Object.keys(fields).length)fail(422,'Chưa đọc được trường có nhãn rõ trên hợp đồng. Chọn ảnh rõ hơn hoặc nhập tay.');
    return json({fields});
  } else if(path==='/ai/history'&&method==='GET'){
    const history=store.list('aiHistory').filter(row=>row.userId===user.id&&(!url.searchParams.get('feature')||row.feature===url.searchParams.get('feature'))).reverse().slice(0,40);
    result={entries:history.reverse().map(({id,feature,input,result,createdAt})=>({id,feature,input,result,createdAt}))};
  } else if(path==='/ai/history/clear'&&post){
    for(const row of store.list('aiHistory').filter(row=>row.userId===user.id)) store.remove('aiHistory',row.id);
    result={ok:true};
  } else if(/^\/ai\/alerts\/[^/]+\/review$/.test(path)&&post){
    const key=path.split('/')[3];
    if(input.status==='dismissed'&&user.role!=='landlord')fail(403,'Chỉ chủ trọ được bác bỏ cảnh báo.');
    if(!['open','reviewed','dismissed'].includes(input.status))fail(400,'Trạng thái không hợp lệ.');
    const analysis=analyzeUtilities(scopeInput(store,user,'B02',input));
    const alert=analysis.alerts.find(a=>a.id===key);
    if(!alert)fail(404,'Cảnh báo không còn trong phạm vi truy cập.');
    const note=String(input.note||'').slice(0,1000);
    store.put('alertReviews',{id:hashToken(user.id+':'+key),ownerId:ownerId(user),fingerprint:alertFingerprint(alert),status:input.status,note});
    result={ok:true,id:key,status:input.status,reviewed:input.status==='reviewed',note};
  } else if(/^\/extensions\/B0[124]$/.test(path)&&post){
    const feature=path.slice(-3),options={user:safeUser(user),...scopeInput(store,user,feature,input)};
    const provider=feature==='B02'?null:workerGemini(env);
    if(provider)await limit(env,'ai:'+user.id,20);
    const raw=feature==='B01'?await answerQuestion(options,provider):feature==='B02'?analyzeUtilities(options):await classifyMaintenance(options,provider);
    if(provider)store=await openOwnerStore(env,user);
    const answer=validateResult(feature,raw,provider?scopeInput(store,user,feature,input).data:options.data);
    if(feature==='B02')for(const alert of answer.alerts){
      const review=store.get('alertReviews',hashToken(user.id+':'+alert.id));
      const matches=review?.fingerprint===alertFingerprint(alert);
      alert.reviewed=!!matches&&['reviewed','dismissed'].includes(review.status);alert.dismissed=!!matches&&review.status==='dismissed';alert.reviewNote=matches?review.note:'';
    }
    if(feature!=='B02'){
      const past=store.list('aiHistory').filter(row=>row.userId===user.id);
      for(const old of past.slice(0,Math.max(0,past.length-199)))store.remove('aiHistory',old.id);
      store.put('aiHistory',{id:id('ai'),ownerId:ownerId(user)||user.id,userId:user.id,feature,input:{...input,history:undefined},result:answer});
    }
    result={result:answer};
  } else if(path.startsWith('/actions/')&&post){
    result=performAction(store,user,path.slice(9),input);
    if(path==='/actions/notification-send'){
      const queue=mailConfigured(env)?queueNotification(env,result.notification,result.emailRecipients):[];
      extra.push(...queue);
      result={notification:result.notification,emailQueued:queue.length,emailDelivery:mailConfigured(env)?'queued':'awaiting_smtp_configuration'};
    }
  } else if(post&&(path==='/issues'||path==='/issues/retry-classification')){
    const retry=path.endsWith('retry-classification');
    if(retry&&user.role!=='landlord') fail(403,'Chỉ chủ trọ có quyền phân loại lại.');
    const issue=retry?getRecord(store,user,'issues',input.id):createRecord(store,user,'issues',input);
    if(issue.classificationAttempt&&!retry) result=issue;
    else {
      // Save the ticket and its notification before waiting for the external model.
      const previous=store.get('issues',issue.id);
      await store.commit();
      let provider=workerGemini(env);
      try{await limit(env,'ai:'+user.id,20);}catch(error){if(error.status!==429)throw error;provider=null;}
      let proposal;
      try{
        proposal=await classifyMaintenance({user,data:dataFor(store,user),input:{title:issue.title,description:issue.description,roomId:issue.roomId,assetId:issue.assetId}},provider);
      }catch(error){if(!error.status)throw error;}
      store=await openOwnerStore(env,user);
      const latest=getRecord(store,user,'issues',issue.id);
      const unchanged=['description','title','assetId','roomId','updatedAt'].every(key=>latest[key]===previous[key]);
      const attempt={at:now(),status:proposal?'available':'failed',proposal};
      result=unchanged?store.put('issues',{...latest,classificationAttempt:attempt.status,classificationProposal:proposal||latest.classificationProposal,
        classificationHistory:[...(latest.classificationHistory||[]),attempt]}):latest;
    }
    status=retry?200:201;
  } else {
    const match=/^\/([A-Za-z]+)(?:\/([^/]+))?$/.exec(path);
    if(!match||!COLLECTIONS.includes(match[1])) fail(404,'Chức năng chưa khả dụng trên bản cloud.');
    const [,collection,key]=match;
    if(method==='GET'){
      const rows=dataFor(store,user)[collection];result=key?rows.find(r=>r.id===key&&(collection!=='audits'||!url.searchParams.get('propertyId')||r.propertyId===url.searchParams.get('propertyId'))):{records:rows};
      if(!result) fail(404,'Không tìm thấy dữ liệu.');
      if(key) extra.push(access(env,user,store.get(collection,key),collection,key,'view','success'));
    }else if(post&&!key||method==='PATCH'&&key){
      const saved=post?createRecord(store,user,collection,input):updateRecord(store,user,collection,key,input);
      result=collection==='tenants'?publicTenant(saved,user.role):saved;
      status=post?201:200;
    }else if(method==='DELETE'&&key) result=deleteRecord(store,user,collection,key);
    else fail(405,'Phương thức không hợp lệ.');
  }
  if(post&&(path.startsWith('/meter/submissions/')||path.startsWith('/readings')||['/actions/reading-finalize','/actions/invoice-adjust'].includes(path))){
    extra.push(...queueAutomaticReminders(env,store,ownerId(user)));
  }
  try{await store.commit(extra);}
  catch(error){
    const replayable=['/actions/payment-report-transfer','/actions/payment-confirm-transfer'].includes(path)||path==='/actions/payment-record'&&input.requestId;
    if(error.status!==409||!replayable)throw error;
    const fresh=await openOwnerStore(env,user);
    result=performAction(fresh,user,path.slice(9),input);
    await fresh.commit();
  }
  return json(result,status);
}

export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/')&&url.pathname!=='/api') return env.ASSETS.fetch(request);
    try { return await api(request,env,url,decodeURIComponent(url.pathname.slice(4))); }
    catch(error) {
      if(error instanceof URIError) return json({error:'Đường dẫn không hợp lệ.'},400);
      if(error.status) return json({error:error.message},error.status);
      if(/UNIQUE constraint/.test(error.message)) return json({error:'Dữ liệu bị trùng.'},409);
      console.error('Trozy cloud request failed',request.method,url.pathname.split('/').slice(0,3).join('/'),error.name);
      return json({error:'Không thể xử lý yêu cầu.'},500);
    }
  },
  async scheduled(_event,env) {
    await processLandlordSignups(env);
    await cleanInterruptedUploads(env);
    await deliverQueuedNotifications(env);
    const cursor=await env.DB.prepare("SELECT cursor FROM scheduled_work WHERE name='owners'").first();
    const owners=(await env.DB.prepare("SELECT * FROM users WHERE role='landlord' AND id>? ORDER BY id LIMIT 4").bind(cursor?.cursor||'').all()).results;
    for(const user of owners){
      const store=await openOwnerStore(env,user,{includeFiles:false});applyDueTransfers(store,user);generateReminders(store,user);
      const date=today();
      for(const config of store.list('settings',user.id)){
        if(config.billingDay===Number(date.slice(-2))&&!store.get('properties',config.propertyId)?.archived)
          generatePeriodInvoices(store,user,{propertyId:config.propertyId,period:date.slice(0,7)});
      }
      await store.commit(queueAutomaticReminders(env,store,user.id));
    }
    await env.DB.prepare("INSERT INTO scheduled_work(name,cursor) VALUES('owners',?) ON CONFLICT(name) DO UPDATE SET cursor=excluded.cursor")
      .bind(owners.length===4?owners.at(-1).id:'').run();
  },
};
