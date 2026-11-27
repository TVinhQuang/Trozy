import {meterPhotoExpiry} from '../shared/file-policy.mjs';
import {prepareUpload,canReadFile} from './files.mjs';
import {queueReminderSql,reminderMailId,acceptsNotice,preferenceKeys} from '../shared/notification-preferences.mjs';
import {occupancyAction,applyDueTransfers} from './occupancy.mjs';
import {createServer as httpCreateServer} from 'node:http';
import {randomBytes,randomInt,createHmac,createHash} from 'node:crypto';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadEnvFile} from 'node:process';
import {openStore,createUser,safeUser,passwordMatches,passwordHash,hashToken,id,now,COLLECTIONS} from './db.mjs';
import {contractTarget,contractImage,readPaperContract,proposedFields} from './paper-contract.mjs';
import {recordAccess,readAccessLog} from './access-log.mjs';
import {seedDemo} from './seed.mjs';
import {HttpError,fail,publicTenant,dataFor,createRecord,updateRecord,deleteRecord,performAction,previewImport,importRecords,generatePeriodInvoices,generateReminders,audit,ownerId,tenantFor,visible} from './domain.mjs';
import {extensionCapabilities} from './extensions.mjs';
import {smtpConfigured,deliverAuthMail,deliverNotificationMail} from './mail.mjs';
import {registerDefaultExtensions} from '../ai/register.mjs';
import {createAIService,syncUtilityNotifications} from './ai-service.mjs';
import {rasterMimeFromBytes} from '../shared/raster-image.mjs';
import {createMeterSubmissionService} from './meter-submissions.mjs';
import {createMeterReaderService} from './meter-reader-service.mjs';
import {createMeterAutomaticService} from './meter-automatic.mjs';
import {prepareProjectRuntime} from '../../scripts/project-runtime.mjs';

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2'};
const COOKIE='trozy_session';
if(existsSync('.env'))loadEnvFile('.env');
registerDefaultExtensions();
const cleanEmail=value=>String(value||'').trim().toLowerCase();
function validateEmail(email){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)fail(400,'Địa chỉ email không hợp lệ.');}
function validatePassword(password){if(typeof password!=='string'||password.length<8||password.length>128)fail(400,'Mật khẩu cần từ 8 đến 128 ký tự.');}
function tokenFromCookie(req){try{return (req.headers.cookie||'').split(';').map(part=>part.trim()).find(part=>part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1)||'';}catch{return '';}}
async function readJson(req){
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>8*1024*1024)fail(413,'Dữ liệu vượt dung lượng cho phép (8 MB).');chunks.push(chunk);}
  if(!size)return {};
  if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))fail(415,'Yêu cầu cần sử dụng JSON.');
  try{const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!result||Array.isArray(result)||typeof result!=='object')throw Error();return result;}catch{fail(400,'Dữ liệu JSON không hợp lệ.');}
}
export function createApp(options={}){
  const exportKey=randomBytes(32);
  const store=openStore(options.dbPath??process.env.TROZY_DB_PATH??'data/trozy.sqlite');
  const seed=options.seed??!['0','false'].includes(String(process.env.TROZY_SEED_DEMO).toLowerCase());if(seed)seedDemo(store);
  const ai=createAIService(store);
  const meterReader=createMeterReaderService(store,options.meterReader);
  const meterAutomatic=createMeterAutomaticService(store,meterReader,options.meterAutomatic);
  const meter=createMeterSubmissionService(store,{onCreated:row=>meterAutomatic.enqueueCreated(row),onReviewed:(user,row,proposal)=>meterAutomatic.rememberVerifiedLayout(user,row,proposal)});
  const secureCookies=options.secureCookies??['1','true'].includes(String(process.env.TROZY_SECURE_COOKIES).toLowerCase());
  const dist=resolve(options.distPath||'dist');
  const limiter=new Map();
  function limit(key,max=8,minutes=15){const time=Date.now();const value=limiter.get(key);if(!value||value.until<=time){limiter.set(key,{count:1,until:time+minutes*60000});return;}if(value.count>=max)fail(429,'Bạn đã thử quá nhiều lần. Vui lòng đợi 15 phút rồi thử lại.');value.count++;if(limiter.size>10000)for(const [key,value]of limiter)if(value.until<=time)limiter.delete(key);}
  function userFor(req){const token=tokenFromCookie(req);if(!token)return null;const row=store.db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?').get(hashToken(token),Date.now());return row||null;}
  function requireUser(req){const user=userFor(req);if(!user?.verified)fail(401,'Vui lòng đăng nhập để tiếp tục.');return user;}
  function cookie(res,userId){const token=randomBytes(32).toString('hex');const expires=Date.now()+7*86400000;store.db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hashToken(token),userId,expires);res.setHeader('Set-Cookie',`${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secureCookies?'; Secure':''}`);}
  function outbox(user,kind,email=user.email){
    const reset=kind==='reset',token=reset?String(randomInt(100000,1000000)):randomBytes(32).toString('hex');
    const digest=reset?hashToken(user.id+':reset:'+email+':'+token):hashToken(token);
    store.db.prepare('DELETE FROM auth_tokens WHERE user_id=? AND kind=?').run(user.id,kind);
    if(reset)store.db.prepare("DELETE FROM auth_tokens WHERE user_id=? AND kind='reset-grant'").run(user.id);
    store.db.prepare('INSERT INTO auth_tokens(token_hash,user_id,kind,expires_at,target_email) VALUES(?,?,?,?,?)').run(digest,user.id,kind,Date.now()+(reset?600000:86400000),email);
    const record={id:id('mail'),email,kind,token};
    store.db.prepare('INSERT INTO mail_outbox(id,email,kind,token,created_at) VALUES(?,?,?,?,?)').run(record.id,email,kind,token,now());
    if(smtpConfigured())setImmediate(()=>{void deliverAuthMail(store,record);});
  }
  function notificationRecipients(notification){
    const people=new Map();
    const add=(account,tenantId)=>{if(!account)return;let preferences={};try{preferences=JSON.parse(account.notification_preferences||'{}')}catch{};if(!acceptsNotice(preferences,notification,'email'))return;people.set(account.id,{id:account.id,email:account.email});};
    if(notification.recipientUserId){add(store.db.prepare('SELECT id,email,notification_preferences FROM users WHERE id=?').get(notification.recipientUserId));return [...people.values()];}
    const tenants=store.list('tenants',notification.ownerId).filter(tenant=>tenant.status==='active'&&tenant.userId&&tenant.propertyId===notification.propertyId);
    let targets=tenants;
    if(notification.tenantId){const target=store.get('tenants',notification.tenantId);targets=target?.ownerId===notification.ownerId&&target.userId?[target]:[];}
    else if(notification.roomId)targets=tenants.filter(tenant=>tenant.roomId===notification.roomId);
    else if(Array.isArray(notification.roomIds)&&notification.roomIds.length)targets=tenants.filter(tenant=>notification.roomIds.includes(tenant.roomId));
    if(notification.scope==='all'||notification.automatic){
      add(store.db.prepare('SELECT id,email,notification_preferences FROM users WHERE id=?').get(notification.ownerId));
      if(notification.scope==='all')targets=tenants;
    }
    for(const tenant of targets)add(store.db.prepare("SELECT id,email,notification_preferences FROM users WHERE id=? AND role='tenant' AND verified=1 AND tenant_id=? AND landlord_id=?").get(tenant.userId,tenant.id,notification.ownerId));
    return [...people.values()];
  }
  function queueNotificationEmails(notification,recipients){
    let queued=0;
    for(const recipient of recipients||[]){if(!recipient?.email||recipient.enabled===false)continue;const uid=recipient.userId||recipient.id;
      const phase=notification.automatic&&notification.phase;
      const sql=phase?queueReminderSql:"INSERT OR IGNORE INTO notification_mail_outbox(id,notification_id,owner_id,user_id,email,status,created_at) VALUES(?,?,?,?,?,'queued',?)";
      const result=store.db.prepare(sql).run(phase?reminderMailId(notification,uid):id('nmail'),notification.id,notification.ownerId,uid,recipient.email,now());queued+=Number(result.changes||0);}
    return queued;
  }
  async function dispatchNotificationEmails(){
    if(!smtpConfigured())return;
    const retryLimit=Math.max(1,Math.min(5,Number(process.env.TROZY_NOTIFICATION_RETRIES||3)));
    const queue=store.db.prepare("SELECT * FROM notification_mail_outbox WHERE status IN ('queued','failed') AND attempts<? ORDER BY created_at LIMIT 40").all(retryLimit);
    for(const item of queue){
      const notification=store.get('notifications',item.notification_id);if(!notification){store.db.prepare("UPDATE notification_mail_outbox SET status='skipped',last_error='NOTIFICATION_NOT_FOUND' WHERE id=?").run(item.id);continue;}
      const recipient=notificationRecipients(notification).find(person=>person.id===item.user_id&&person.email===item.email);
      if(!recipient||notification.automatic&&notification.phase&&item.id!==reminderMailId(notification,item.user_id)){store.db.prepare("UPDATE notification_mail_outbox SET status='skipped' WHERE id=?").run(item.id);continue;}
      let file; if(notification.fileId){const saved=store.db.prepare('SELECT name,type,bytes FROM files WHERE id=? AND owner_id=?').get(notification.fileId,notification.ownerId);if(saved)file={name:saved.name,type:saved.type,bytes:Buffer.from(saved.bytes)};}
      await deliverNotificationMail(store,item,notification,{file});
    }
  }
  let closing=false;
  let notificationDispatch=Promise.resolve();
  const scheduleNotificationDispatch=()=>{
    if(closing)return;
    notificationDispatch=notificationDispatch.then(()=>dispatchNotificationEmails()).catch(error=>{console.error('[Trozy notification mail]',error);});
  };
  function runReminderCycle(){
    if(closing)return;
    try{
      store.db.prepare("UPDATE files SET bytes=zeroblob(0) WHERE purpose='meter' AND expires_at<=unixepoch() AND length(bytes)>0").run();
      const landlords=store.db.prepare("SELECT * FROM users WHERE role='landlord'").all();
      for(const landlord of landlords){applyDueTransfers(store,landlord);store.transaction(()=>{
        generateReminders(store,landlord);
        const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'});
        for(const cfg of store.list('settings',landlord.id)){
          if(cfg.billingDay===Number(day.slice(-2))&&!store.get('properties',cfg.propertyId)?.archived)generatePeriodInvoices(store,landlord,{propertyId:cfg.propertyId,period:day.slice(0,7)});
        }
      });}
      const automatic=store.db.prepare("SELECT id,owner_id,data FROM records WHERE collection='notifications' AND json_extract(data,'$.automatic')=1 ORDER BY rowid DESC").all();
      for(const item of automatic){const notification=JSON.parse(item.data);queueNotificationEmails({...notification,id:item.id,ownerId:item.owner_id},notificationRecipients({...notification,id:item.id,ownerId:item.owner_id}));}
      scheduleNotificationDispatch();
    }catch(error){if(!closing)console.error('[Trozy reminders]',error);}
  }
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const issueClassifications=new Map();
  async function classifySavedIssue(user,issue){
    if(issueClassifications.has(issue.id))return issueClassifications.get(issue.id);
    const classify=async()=>{
      let proposal;
      try{proposal=await ai.run(user,'B04',{title:issue.title,description:issue.description,roomId:issue.roomId,assetId:issue.assetId||undefined});}
      catch{/* Manual review remains available when no proposal can be produced. */}
      return store.transaction(()=>{
        const latest=store.get('issues',issue.id);
        if(!latest)return issue;
        if(latest.description!==issue.description||latest.title!==issue.title||latest.assetId!==issue.assetId)return latest;
        const attempt={at:now(),status:proposal?'available':'failed',proposal};
        const saved=store.put('issues',{...latest,classificationAttempt:attempt.status,classificationProposal:proposal||latest.classificationProposal,classificationHistory:[...(latest.classificationHistory||[]),attempt]});
        const notice=store.get('notifications','issue_notice_'+issue.id);
        if(notice){
          const updated=store.put('notifications',{...notice,body:issue.title+' · '+(proposal?'Gợi ý: '+proposal.category:'Cần phân loại thủ công')});
          queueNotificationEmails(updated,notificationRecipients(updated));
        }
        return saved;
      });
    };
    const work=classify().finally(()=>issueClassifications.delete(issue.id));
    issueClassifications.set(issue.id,work);return work;
  }
  function mutationOrigin(req){
    if(['GET','HEAD','OPTIONS'].includes(req.method))return;
    if(req.headers['sec-fetch-site']==='cross-site')fail(403,'Yêu cầu phải được gửi từ ứng dụng Trozy.');
    const origin=req.headers.origin;
    if(origin){let hostname;try{hostname=new URL(origin).host;}catch{fail(403,'Nguồn yêu cầu không hợp lệ.');}
      const allowed=(process.env.TROZY_ALLOWED_ORIGINS||'').split(',').filter(Boolean);
      if(process.env.NODE_ENV!=='production')allowed.push('http://127.0.0.1:5173','http://localhost:5173');
      if(hostname!==req.headers.host&&!allowed.includes(origin))fail(403,'Nguồn yêu cầu không được phép.');
    }
  }
  function writeFile(user,input){
    const {name,type,bytes,propertyId,tenantId,roomId}=prepareUpload(store,user,input);
    const purpose=input.purpose??null,created=now();
    if(purpose!==null&&!['meter','attachment'].includes(purpose))fail(400,'Mục đích tải tệp không hợp lệ.');
    if(purpose==='meter'&&(!roomId||!type.startsWith('image/')||!rasterMimeFromBytes(bytes)))fail(400,'Chọn phòng và ảnh công tơ hợp lệ.');
    const expires=purpose==='meter'?meterPhotoExpiry(created):null;
    const key=id('file');
    store.db.prepare('INSERT INTO files(id,owner_id,uploader_id,property_id,tenant_id,room_id,name,type,bytes,created_at,purpose,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(key,ownerId(user),user.id,propertyId,tenantId,roomId,name,type,bytes,created,purpose,expires);
    return {id:key,name,type,size:bytes.length,...(expires?{expiresAt:new Date(expires*1000).toISOString()}:{})};
  }
  async function handler(req,res){
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob: https://img.vietqr.io; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    try{
      const url=new URL(req.url,'http://localhost');let path;
      try{path=decodeURIComponent(url.pathname);if(path.includes('\0'))fail(400,'Đường dẫn không hợp lệ.');}
      catch{fail(400,'Đường dẫn không hợp lệ.');}
      mutationOrigin(req);
      if(path==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,version:'0.1.0',database:'sqlite'});
      if(path==='/api/auth/login'&&req.method==='POST'){
        const input=await readJson(req);const email=cleanEmail(input.email);limit(`login:${req.socket.remoteAddress}:${email}`);
        const user=store.db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE').get(email);
        // A dummy scrypt also runs for unknown emails to reduce timing-based account discovery.
        const matches=user?passwordMatches(String(input.password||''),user.password_hash):passwordMatches(String(input.password||''),'00000000000000000000000000000000:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000');
        if(!user||!matches)fail(401,'Email hoặc mật khẩu không đúng.');if(!user.verified)fail(403,'Hãy xác thực email trước khi đăng nhập. Bạn có thể yêu cầu gửi lại thư.');cookie(res,user.id);return json(res,200,{user:safeUser(user)});
      }
      if(path==='/api/auth/register'&&req.method==='POST'){
        const input=await readJson(req);limit(`register:${req.socket.remoteAddress}`,15);const email=cleanEmail(input.email);validateEmail(email);validatePassword(input.password);const name=String(input.name||'').trim();if(name.length<2||name.length>150)fail(400,'Họ tên cần từ 2 đến 150 ký tự.');if(!['landlord','tenant'].includes(input.role))fail(400,'Vai trò đăng ký không hợp lệ.');
        const result=store.transaction(()=>{
          if(store.db.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').get(email))fail(409,'Email đã được sử dụng.');
          if(input.consent!==true&&input.consent!=='on')fail(400,'Cần đồng ý xử lý dữ liệu trước khi đăng ký.');
          const phone=String(input.phone||'').trim();if(!phone||phone.length>30)fail(400,'Vui lòng nhập số điện thoại hợp lệ.');
          const code=String(input.inviteCode||'').trim().toUpperCase();
          if(input.role==='tenant'&&code){
            const tenant=store.list('tenants').find(row=>row.inviteCode===code&&!row.userId&&row.inviteExpiresAt>Date.now());
            if(!tenant||tenant.email&&tenant.email.toLowerCase()!==email)fail(400,'Mã liên kết không còn hợp lệ hoặc email chưa khớp hồ sơ.');
          }
          const user=createUser(store,{name,email,password:input.password,role:input.role,phone});
          store.db.prepare('UPDATE users SET consented_at=?,pending_invite=? WHERE id=?').run(now(),input.role==='tenant'&&code?code:null,user.id);
          outbox(user,'verify');return user;
        });return json(res,201,{user:safeUser(result),delivery:smtpConfigured()?'smtp':'local-outbox',message:smtpConfigured()?'Đăng ký thành công. Vui lòng kiểm tra email xác thực.':'Đăng ký thành công. Thư xác thực được lưu vào hộp thư phát triển cục bộ.'});
      }
      if(path==='/api/auth/logout'&&req.method==='POST'){
        const input=await readJson(req);
        if(input.allDevices===true)store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(requireUser(req).id);
        else {const token=tokenFromCookie(req);if(token)store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));}res.setHeader('Set-Cookie',`${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureCookies?'; Secure':''}`);return json(res,200,{ok:true});
      }
      if(path==='/api/auth/forgot-password'&&req.method==='POST'){
        const input=await readJson(req);const email=cleanEmail(input.email);limit(`forgot:${req.socket.remoteAddress}`,6);validateEmail(email);const user=store.db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE').get(email);if(user?.verified)store.transaction(()=>outbox(user,'reset'));return json(res,200,{message:smtpConfigured()?'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu sẽ được gửi đến email của bạn.':'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được tạo trong hộp thư phát triển cục bộ.',delivery:smtpConfigured()?'smtp':'local-outbox'});
      }
      if(path==='/api/auth/verify-reset-otp'&&req.method==='POST'){
        const input=await readJson(req),email=cleanEmail(input.email);
        limit('otp:'+req.socket.remoteAddress,40);
        const grant=store.transaction(()=>{
          const row=store.db.prepare("SELECT t.* FROM auth_tokens t JOIN users u ON u.id=t.user_id WHERE u.email=? AND u.verified=1 AND t.target_email=u.email AND t.kind='reset' AND t.expires_at>?").get(email,Date.now());
          if(!row)return null;
          if(row.token_hash!==hashToken(row.user_id+':reset:'+email+':'+String(input.otp))){
            if(row.attempts>=4)store.db.prepare('DELETE FROM auth_tokens WHERE token_hash=?').run(row.token_hash);
            else store.db.prepare('UPDATE auth_tokens SET attempts=attempts+1 WHERE token_hash=?').run(row.token_hash);
            return null;
          }
          store.db.prepare('DELETE FROM auth_tokens WHERE token_hash=?').run(row.token_hash);
          const token=randomBytes(32).toString('hex');
          store.db.prepare("INSERT INTO auth_tokens(token_hash,user_id,kind,expires_at,target_email) VALUES(?,?,'reset-grant',?,?)").run(hashToken(token),row.user_id,Date.now()+600000,email);
          return token;
        });
        if(!grant)fail(400,'Mã OTP không hợp lệ hoặc đã hết hạn.');return json(res,200,{resetToken:grant});
      }
      if(path==='/api/auth/reset-password'&&req.method==='POST'){
        const input=await readJson(req);limit('reset:'+req.socket.remoteAddress,15);validatePassword(input.password);
        if(input.confirmation!==input.password)fail(400,'Xác nhận mật khẩu chưa khớp.');
        store.transaction(()=>{
          const token=store.db.prepare("SELECT t.user_id FROM auth_tokens t JOIN users u ON u.id=t.user_id WHERE token_hash=? AND kind='reset-grant' AND expires_at>? AND u.verified=1 AND u.email=t.target_email").get(hashToken(String(input.token||'')),Date.now());
          if(!token)fail(400,'Phiên đặt lại mật khẩu đã hết hạn. Hãy xác minh OTP mới.');
          store.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash(input.password),token.user_id);
          store.db.prepare("DELETE FROM auth_tokens WHERE user_id=? AND kind IN ('reset','reset-grant')").run(token.user_id);
          store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(token.user_id);
        });return json(res,200,{ok:true});
      }
      if(path==='/api/auth/verify-email'&&req.method==='POST'){
        const input=await readJson(req);limit('verify:'+req.socket.remoteAddress,20);
        store.transaction(()=>{
          const token=store.db.prepare("SELECT t.*,u.email,u.pending_email,u.tenant_id,u.pending_invite FROM auth_tokens t JOIN users u ON u.id=t.user_id WHERE token_hash=? AND kind IN ('verify','change-email') AND expires_at>?").get(hashToken(String(input.token||'')),Date.now());
          if(!token)fail(400,'Mã xác thực không hợp lệ hoặc hết hạn.');
          if(token.kind==='change-email'){
            if(!token.target_email||token.target_email!==token.pending_email)fail(400,'Yêu cầu đổi email đã thay đổi.');
            store.db.prepare('UPDATE users SET email=?,verified=1,pending_email=NULL WHERE id=?').run(token.target_email,token.user_id);
            const tenant=token.tenant_id&&store.get('tenants',token.tenant_id);
            if(tenant)store.put('tenants',{...tenant,email:token.target_email});
            store.db.prepare('DELETE FROM auth_tokens WHERE user_id=?').run(token.user_id);
          }else{
            if(token.target_email&&token.target_email!==token.email)fail(400,'Địa chỉ xác thực đã thay đổi.');
            if(token.pending_invite){
              const tenant=store.list('tenants').find(row=>row.inviteCode===token.pending_invite&&!row.userId&&row.inviteExpiresAt>Date.now()&&(!row.email||row.email.toLowerCase()===token.email));
              if(tenant){
                store.db.prepare('UPDATE users SET tenant_id=?,landlord_id=? WHERE id=?').run(tenant.id,tenant.ownerId,token.user_id);
                store.put('tenants',{...tenant,userId:token.user_id,email:token.email,inviteCode:null,inviteExpiresAt:null});
              }
              store.db.prepare('UPDATE users SET pending_invite=NULL WHERE id=?').run(token.user_id);
            }
            store.db.prepare('UPDATE users SET verified=1 WHERE id=?').run(token.user_id);
            store.db.prepare('DELETE FROM auth_tokens WHERE token_hash=?').run(token.token_hash);
          }
        });return json(res,200,{ok:true});
      }
      if(path==='/api/auth/resend-registration'&&req.method==='POST'){
        const input=await readJson(req),email=cleanEmail(input.email);validateEmail(email);limit('resend-registration:'+req.socket.remoteAddress,6);
        const user=store.db.prepare('SELECT * FROM users WHERE email=? AND verified=0').get(email);
        if(user)store.transaction(()=>outbox(user,'verify'));
        return json(res,200,{message:'Nếu tài khoản đang chờ xác thực, bạn sẽ nhận được thư mới.'});
      }
      if(path.startsWith('/api/')){
        const user=requireUser(req);
        if(path==='/api/auth/link-tenant'&&req.method==='POST'){
          const input=await readJson(req);limit('link:'+user.id,8);
          if(user.role!=='tenant'||user.tenant_id)fail(409,'Tài khoản không ở trạng thái chờ liên kết.');
          store.transaction(()=>{
            const code=String(input.inviteCode||'').trim().toUpperCase();
            const tenant=code&&store.list('tenants').find(row=>row.inviteCode===code&&!row.userId&&row.inviteExpiresAt>Date.now()&&(!row.email||row.email.toLowerCase()===user.email));
            if(!tenant)fail(400,'Mã mời hết hạn hoặc không khớp hồ sơ.');
            const result=store.db.prepare('UPDATE users SET tenant_id=?,landlord_id=? WHERE id=? AND tenant_id IS NULL').run(tenant.id,tenant.ownerId,user.id);
            if(result.changes!==1)fail(409,'Tài khoản đã được liên kết.');
            store.put('tenants',{...tenant,userId:user.id,email:user.email,inviteCode:null,inviteExpiresAt:null});
          });return json(res,200,{ok:true});
        }
        const logMatch=path.match(/^\/api\/access-log(?:\/([^/]+))?$/);
        if(logMatch&&req.method==='GET')return json(res,200,readAccessLog(store,user,url.searchParams,logMatch[1]));
        if(path==='/api/auth/me'&&req.method==='GET')return json(res,200,{user:safeUser(user)});
        if(path==='/api/bootstrap'&&req.method==='GET'){applyDueTransfers(store,user);store.transaction(()=>{generateReminders(store,user);syncUtilityNotifications(store,user);});return json(res,200,{user:safeUser(user),data:dataFor(store,user),capabilities:extensionCapabilities()});}
        if(path==='/api/ai/status'&&req.method==='GET')return json(res,200,await ai.status());
        if(path==='/api/ai/history'&&req.method==='GET')return json(res,200,ai.history(user,url.searchParams.get('feature')));
        if(path==='/api/ai/history/clear'&&req.method==='POST'){await readJson(req);return json(res,200,ai.clearHistory(user));}
        const alertReviewMatch=path.match(/^\/api\/ai\/alerts\/([^/]+)\/review$/);
        if(alertReviewMatch&&req.method==='POST'){const input=await readJson(req);return json(res,200,ai.review(user,alertReviewMatch[1],input));}
        if(path==='/api/auth/profile'&&req.method==='PATCH'){
          const input=await readJson(req);const name=String(input.name??user.name).trim(),phone=String(input.phone??user.phone??'').trim();if(name.length<2||name.length>150||phone.length>30)fail(400,'Họ tên hoặc số điện thoại không hợp lệ.');
          const avatarFileId=Object.hasOwn(input,'avatarFileId')?input.avatarFileId||null:user.avatar_file_id;
          if(avatarFileId){const file=store.db.prepare('SELECT * FROM files WHERE id=?').get(avatarFileId);if(!file||file.uploader_id!==user.id||!file.type.startsWith('image/'))fail(403,'Ảnh đại diện cần là tệp ảnh do chính bạn tải lên.');}
          const preferences={...safeUser(user).notificationPreferences};
          if(Object.hasOwn(input,'notificationPreferences')){
            const value=input.notificationPreferences;if(!value||Array.isArray(value)||typeof value!=='object')fail(400,'Tùy chọn thông báo không hợp lệ.');
            for(const [key,enabled]of Object.entries(value)){if(!preferenceKeys.includes(key)||typeof enabled!=='boolean')fail(400,'Tùy chọn thông báo cần là giá trị bật/tắt hợp lệ.');preferences[key]=enabled;}
          }
          store.transaction(()=>{
            if(input.cancelEmailChange||Object.hasOwn(input,'email')){
              const target=input.cancelEmailChange?user.email:cleanEmail(input.email);validateEmail(target);
              if(target!==user.email&&store.db.prepare('SELECT id FROM users WHERE email=? AND id!=?').get(target,user.id))fail(409,'Địa chỉ email đã được sử dụng.');
              if(target!==user.pending_email||input.resendEmailChange===true&&target!==user.email){
                store.db.prepare("DELETE FROM auth_tokens WHERE user_id=? AND kind='change-email'").run(user.id);
                store.db.prepare('UPDATE users SET pending_email=? WHERE id=?').run(target===user.email?null:target,user.id);
                if(target!==user.email){limit('email-change:'+user.id,8);outbox(user,'change-email',target);}
              }
            }
            store.db.prepare('UPDATE users SET name=?,phone=?,avatar_file_id=?,notification_preferences=? WHERE id=?').run(name,phone,avatarFileId,JSON.stringify(preferences),user.id);if(user.tenant_id){const tenant=store.get('tenants',user.tenant_id);if(tenant)store.put('tenants',{...tenant,name,phone});}audit(store,user,'profile','users',{id:user.id});});return json(res,200,{user:safeUser(store.db.prepare('SELECT * FROM users WHERE id=?').get(user.id))});
        }
        if(path==='/api/auth/change-password'&&req.method==='POST'){
          const input=await readJson(req);validatePassword(input.password);if(input.confirmation!==input.password)fail(400,'Xác nhận mật khẩu chưa khớp.');limit(`change:${user.id}`,10);if(!passwordMatches(String(input.currentPassword||''),user.password_hash))fail(400,'Mật khẩu hiện tại không đúng.');store.transaction(()=>{store.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash(input.password),user.id);store.db.prepare("DELETE FROM auth_tokens WHERE user_id=? AND kind IN ('reset','reset-grant')").run(user.id);store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);audit(store,user,'change-password','users',{id:user.id});});cookie(res,user.id);return json(res,200,{ok:true});
        }
        if(path==='/api/auth/resend-verification'&&req.method==='POST'){
          await readJson(req);limit(`resend:${user.id}`,3);if(user.verified)return json(res,200,{ok:true});store.transaction(()=>outbox(user,'verify'));return json(res,200,{ok:true,delivery:smtpConfigured()?'smtp':'local-outbox'});
        }
        if((path==='/api/export/preview'||path==='/api/export/download')&&req.method==='POST'){
          const input=await readJson(req),property=store.get('properties',String(input.propertyId||''));
          const scope={ownerId:property?.ownerId,propertyId:property?.id},download=path.endsWith('/download');
          try{
            if(user.role!=='landlord')fail(403,'Chỉ chủ trọ được xuất dữ liệu cơ sở.');
            if(!property||property.ownerId!==user.id)fail(404,'Không tìm thấy cơ sở.');
            if(!['backup','export'].includes(input.operation)||!Array.isArray(input.collections)||!input.collections.length||input.collections.some(c=>!COLLECTIONS.includes(c)))fail(400,'Chọn nghiệp vụ và loại dữ liệu hợp lệ.');
            const collections=[...new Set(input.collections)].sort(),scoped=dataFor(store,user);
            const data=Object.fromEntries(collections.map(c=>[c,scoped[c].filter(r=>(c==='properties'?r.id:r.propertyId)===property.id).map(r=>{
              if(c!=='tenants')return r;
              const {inviteCode,inviteExpiresAt,...profile}=r;return profile;
            }).sort((a,b)=>a.id.localeCompare(b.id))]));
            const revision=createHmac('sha256',exportKey).update(JSON.stringify([user.id,property.id,input.operation,data])).digest('hex');
            if(!download)return json(res,200,{propertyId:property.id,operation:input.operation,revision,counts:Object.fromEntries(collections.map(c=>[c,data[c].length]))});
            if(input.revision!==revision)fail(409,'Phạm vi hoặc dữ liệu đã thay đổi. Vui lòng xem trước lại.');
            audit(store,user,input.operation,'data',{id:property.id,propertyId:property.id},collections.join(', '));
            recordAccess(store,user,scope,'data',property.id,'download','success');
            return json(res,200,{format:'trozy-backup-v1',operation:input.operation,propertyId:property.id,exportedAt:now(),data});
          }catch(error){recordAccess(store,user,scope,'data',property?.ownerId===user.id?property.id:'',download?'download':'view',[403,404].includes(error.status)?'denied':'failed');throw error;}
        }
        if(path==='/api/export'&&req.method==='GET'){
          if(user.role==='landlord')fail(400,'Chọn cơ sở và xem trước dữ liệu xuất.');
          audit(store,user,'export','data',{id:user.id});return json(res,200,{format:'trozy-backup-v1',exportedAt:now(),user:safeUser(user),data:dataFor(store,user)});
        }
        const occupancy=path.match(/^\/api\/occupancy\/(preview|confirm|list|cancel|stay)$/);
        if(occupancy&&req.method==='POST'){const input=await readJson(req);return json(res,200,store.transaction(()=>occupancyAction(store,user,occupancy[1],input)));}
        if((path==='/api/paper-contract/extract'||path==='/api/paper-contract/confirm')&&req.method==='POST'){
          const input=await readJson(req),room=contractTarget(store,user,input);
          if(path.endsWith('/confirm'))return json(res,200,{ok:true});
          limit('paper-ocr:'+user.id,12,1);
          const lines=await (options.readPaperContract||readPaperContract)(contractImage(input));
          contractTarget(store,user,input);
          const fields=proposedFields(store,room,input.collection,lines);
          if(!Object.keys(fields).length)fail(422,'Chưa đọc được trường có nhãn rõ trên hợp đồng. Chọn ảnh rõ hơn hoặc nhập tay.');
          return json(res,200,{fields});
        }
        if(path==='/api/import/preview'&&req.method==='POST'){const input=await readJson(req);return json(res,200,store.transaction(()=>previewImport(store,user,input)));}
        if(path==='/api/import'&&req.method==='POST'){const input=await readJson(req);const result=store.transaction(()=>{
          if(input.propertyId&&(!Array.isArray(input.rows)||input.rows.some(row=>row.propertyId!==input.propertyId)))fail(400,'Phạm vi nhập khác với cơ sở đã chọn.');
          return importRecords(store,user,input.collection,input.rows);
        });return json(res,200,result);}
        if(path==='/api/files'&&req.method==='POST'){const input=await readJson(req);return json(res,201,store.transaction(()=>writeFile(user,input)));}
        if(path==='/api/meter/reader/status'&&req.method==='GET')return json(res,200,await meterReader.status(user,url.searchParams.get('utility')||undefined));
        if(path==='/api/meter/profile'&&req.method==='GET')return json(res,200,meterAutomatic.getProfile(user,url.searchParams.get('roomId'),url.searchParams.get('utility')));
        if(path==='/api/meter/profile'&&req.method==='PUT'){
          limit(`meter-profile:${user.id}`,12,1);return json(res,200,meterAutomatic.saveProfile(user,await readJson(req)));
        }
        const meterAuto=path.match(/^\/api\/meter\/submissions\/([^/]+)\/automatic(?:\/(retry))?$/);
        if(meterAuto&&req.method==='GET'&&!meterAuto[2])return json(res,200,meterAutomatic.get(user,meterAuto[1],url.searchParams.get('fileId')||undefined));
        if(meterAuto&&req.method==='POST'&&meterAuto[2]==='retry'){
          limit(`meter-auto-retry:${user.id}`,12,1);return json(res,202,meterAutomatic.retry(user,meterAuto[1],await readJson(req)));
        }
        const meterImage=path.match(/^\/api\/meter\/submissions\/([^/]+)\/image\/([^/]+)$/);
        if(meterImage&&req.method==='GET'){
          const image=await meterReader.preview(user,meterImage[1],meterImage[2]);
          res.writeHead(200,{'Content-Type':'image/png','Content-Length':image.bytes.length,'Cache-Control':'private, no-store'});return res.end(image.bytes);
        }
        const meterRecognition=path.match(/^\/api\/meter\/submissions\/([^/]+)\/(locate|read)$/);
        if(meterRecognition&&req.method==='POST'){
          limit(`meter-reader:${user.id}`,12,1);
          const cancellation=new AbortController(),cancel=()=>{if(!res.writableEnded)cancellation.abort();};
          res.once('close',cancel);
          try{const input=await readJson(req);return json(res,200,await meterReader[meterRecognition[2]](user,meterRecognition[1],input,{signal:cancellation.signal}));}
          finally{res.off('close',cancel);}
        }
        if(path==='/api/meter/submissions'&&req.method==='GET')return json(res,200,{records:dataFor(store,user).meterSubmissions});
        if(path==='/api/meter/updates'&&req.method==='GET'){
          if(user.role!=='landlord')fail(403,'Chỉ chủ nhà nhận cập nhật bộ ảnh công tơ.');
          const states=store.db.prepare("SELECT id,json_extract(data,'$.status') AS status,json_extract(data,'$.version') AS version,json_extract(data,'$.updatedAt') AS updatedAt FROM records WHERE collection='meterSubmissions' AND owner_id=? ORDER BY rowid").all(user.id).map(row=>[row.id,row.status,row.version,row.updatedAt]);
          return json(res,200,{revision:createHash('sha256').update(JSON.stringify([states,meterAutomatic.revision(user)])).digest('hex')});
        }
        if(path==='/api/meter/submissions'&&req.method==='POST'){
          limit(`meter-send:${user.id}`,8,1);
          return json(res,202,meter.submitPhotos(user,await readJson(req)));
        }
        if(path==='/api/meter/owner-evidence'&&req.method==='POST'){
          limit(`meter-owner-send:${user.id}`,8,1);
          return json(res,201,meter.submitOwnerEvidence(user,await readJson(req)));
        }
        const meterReview=path.match(/^\/api\/meter\/submissions\/([^/]+)\/review$/);
        if(meterReview&&req.method==='POST'){
          const input=await readJson(req);return json(res,200,meter.review(user,meterReview[1],input));
        }
        const fileMatch=path.match(/^\/api\/files\/([^/]+)$/);
        if(fileMatch&&req.method==='GET'){
          const file=store.db.prepare('SELECT * FROM files WHERE id=?').get(fileMatch[1]);const allowed=canReadFile(store,user,file);
          recordAccess(store,user,file&&{ownerId:file.owner_id,propertyId:file.property_id},'files',fileMatch[1],'download',allowed?'success':'denied');
          if(!allowed)fail(404,'Không tìm thấy tệp hoặc bạn không có quyền truy cập.');
          if(file.expires_at&&file.expires_at<=Date.now()/1000)fail(410,'Ảnh công tơ đã hết thời hạn lưu một tháng.');
          const type=file.type.startsWith('image/')?(rasterMimeFromBytes(file.bytes)||file.type):file.type;
          const disposition=url.searchParams.get('inline')==='1'&&type.startsWith('image/')?'inline':'attachment';res.writeHead(200,{'Content-Type':type,'Content-Length':file.bytes.byteLength,'Content-Disposition':`${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'private, no-store'});return res.end(Buffer.from(file.bytes));
        }
        const extensionMatch=path.match(/^\/api\/extensions\/(B0[1-5])$/);
        if(extensionMatch&&req.method==='POST'){
          const name=extensionMatch[1];limit(`ai:${user.id}:${name}`,40,1);
          const input=await readJson(req);const value=await ai.run(user,name,input);return json(res,200,{result:value});
        }
        const actionMatch=path.match(/^\/api\/actions\/([a-z-]+)$/);
        if(actionMatch&&req.method==='POST'){
          const input=await readJson(req),before=new Set(store.list('notifications',ownerId(user)).map(row=>row.id));
          const result=store.transaction(()=>performAction(store,user,actionMatch[1],input));
          const created=store.list('notifications',ownerId(user)).filter(row=>!before.has(row.id));
          for(const notification of created)queueNotificationEmails(notification,notificationRecipients(notification));
          if(created.length)setImmediate(scheduleNotificationDispatch);
          if(actionMatch[1]==='notification-send')return json(res,200,{notification:result.notification,emailQueued:result.emailRecipients?.filter(item=>item.enabled&&item.email).length||0,emailDelivery:smtpConfigured()?'queued':'awaiting_smtp_configuration'});
          return json(res,200,result);
        }
        const pdfFile=path.match(/^\/api\/(contracts|invoices|payments)\/([^/]+)\/pdf$/);
        if(pdfFile&&req.method==='GET'){
          const {contractPdf,invoicePdf,receiptPdf}=await import('./business-pdf.mjs');
          const [,collection,key]=pdfFile,record=store.get(collection,key);
          let pdf;
          try{pdf=collection==='contracts'?await contractPdf(store,user,key,url.searchParams.get('version')):await (collection==='payments'?receiptPdf:invoicePdf)(store,user,key);}
          catch(error){recordAccess(store,user,record,collection,key,'download',error.status===404?'denied':'failed');throw error;}
          recordAccess(store,user,record,collection,key,'download','success');
          const prefix=collection==='contracts'?'Hop-dong':collection==='payments'?'Bien-nhan':'Hoa-don',disposition=url.searchParams.has('preview')?'inline':'attachment';
          res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':disposition+'; filename="'+prefix+'-'+encodeURIComponent(key)+'-v'+pdf.version+'.pdf"','Cache-Control':'private, no-store'});
          return res.end(pdf.bytes);
        }
        if(path==='/api/issues'&&req.method==='POST'){
          const input=await readJson(req);
          const issue=store.transaction(()=>createRecord(store,user,'issues',input));
          const saved=issue.classificationAttempt?issue:await classifySavedIssue(user,issue);
          scheduleNotificationDispatch();return json(res,201,saved);
        }
        if(path==='/api/issues/retry-classification'&&req.method==='POST'){
          const input=await readJson(req),issue=store.get('issues',input.id);
          if(user.role!=='landlord'||!visible(store,user,'issues',issue))fail(403,'Không có quyền phân loại phiếu này.');
          const saved=await classifySavedIssue(user,issue);scheduleNotificationDispatch();return json(res,200,saved);
        }
        const collectionMatch=path.match(/^\/api\/(privacyRequests|[a-z]+)(?:\/([^/]+))?$/);
        if(collectionMatch&&COLLECTIONS.includes(collectionMatch[1])){
          const [,collection,key]=collectionMatch;
          if(req.method==='GET'){const scoped=dataFor(store,user)[collection];if(key){const row=scoped.find(row=>row.id===key&&(collection!=='audits'||!url.searchParams.get('propertyId')||row.propertyId===url.searchParams.get('propertyId')));recordAccess(store,user,store.get(collection,key),collection,key,'view',row?'success':'denied');if(!row)fail(404,'Không tìm thấy dữ liệu.');return json(res,200,row);}return json(res,200,{records:scoped});}
          if(req.method==='POST'&&!key){const input=await readJson(req);const record=store.transaction(()=>createRecord(store,user,collection,input));return json(res,201,collection==='tenants'?publicTenant(record,user.role):record);}
          if(req.method==='PATCH'&&key){const input=await readJson(req);const record=store.transaction(()=>updateRecord(store,user,collection,key,input));return json(res,200,collection==='tenants'?publicTenant(record,user.role):record);}
          if(req.method==='DELETE'&&key){await readJson(req);return json(res,200,store.transaction(()=>deleteRecord(store,user,collection,key)));}
        }
        fail(404,'Không tìm thấy API.');
      }
      if(!['GET','HEAD'].includes(req.method))fail(405,'Phương thức không được hỗ trợ.');
      const requested=resolve(dist,`.${path}`);if(requested!==dist&&!requested.startsWith(dist+sep))fail(403,'Đường dẫn không hợp lệ.');
      let file=requested;if(!existsSync(file)||!statSync(file).isFile()){
        if(extname(path)&&!path.endsWith('.html'))fail(404,'Không tìm thấy tài nguyên.');file=resolve(dist,'index.html');
      }
      if(!existsSync(file))return json(res,200,{message:'Trozy API đang chạy. Dùng npm run dev để mở giao diện hoặc npm run build rồi npm start.',frontend:'http://127.0.0.1:5173'});
      const bytes=readFileSync(file);res.writeHead(200,{'Content-Type':MIME[extname(file)]||'application/octet-stream','Cache-Control':file.includes(`${sep}assets${sep}`)?'public, max-age=31536000, immutable':'no-cache'});return res.end(req.method==='HEAD'?undefined:bytes);
    }catch(error){
      if(res.headersSent){res.destroy();return;}
      const status=error.status||(String(error.code||'').startsWith('ERR_SQLITE_CONSTRAINT')||String(error.message||'').includes('UNIQUE constraint')?409:500);
      if(status===500)console.error('[Trozy API]',error);
      json(res,status,{error:status===500?'Có lỗi xử lý dữ liệu. Vui lòng thử lại.':status===409&&!(error instanceof HttpError)?'Dữ liệu bị trùng hoặc vi phạm ràng buộc.':error.message});
    }
  }
  const server=httpCreateServer(handler);server.requestTimeout=30000;server.headersTimeout=15000;
  const reminderTimer=setInterval(runReminderCycle,24*60*60*1000);reminderTimer.unref?.();
  const initialReminder=setImmediate(runReminderCycle);
  let closePromise;
  return {server,store,handler,meterAutomatic,close:()=>{
    if(closePromise)return closePromise;
    // Stop new connections before closing the queue. An in-flight submission either
    // commits with its durable jobs or rolls back through the creation hook.
    closing=true;clearInterval(reminderTimer);clearImmediate(initialReminder);
    const serverStopped=new Promise((resolve,reject)=>server.close(error=>error&&error.code!=='ERR_SERVER_NOT_RUNNING'?reject(error):resolve()));
    closePromise=Promise.allSettled([serverStopped,meterAutomatic.close(),notificationDispatch]).then(results=>{store.close();const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;});
    return closePromise;
  }};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  prepareProjectRuntime();
  const app=createApp();const port=Number(process.env.PORT||3001),host=process.env.HOST||'127.0.0.1';
  app.server.listen(port,host,()=>console.log(`Trozy đang chạy tại http://${host}:${port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void app.close().then(()=>{process.exit(0);},()=>process.exit(1));});
}
