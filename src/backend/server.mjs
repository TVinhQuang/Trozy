import {createServer as httpCreateServer} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadEnvFile} from 'node:process';
import {openStore,createUser,safeUser,passwordMatches,passwordHash,hashToken,id,now,COLLECTIONS} from './db.mjs';
import {seedDemo} from './seed.mjs';
import {HttpError,fail,dataFor,createRecord,updateRecord,deleteRecord,performAction,importRecords,generateReminders,audit,ownerId,tenantFor,visible} from './domain.mjs';
import {extensionCapabilities} from './extensions.mjs';
import {smtpConfigured,deliverAuthMail} from './mail.mjs';
import {registerDefaultExtensions} from '../ai/register.mjs';
import {createAIService,syncUtilityNotifications} from './ai-service.mjs';
import {rasterMimeFromBytes} from '../shared/raster-image.mjs';
import {createMeterSubmissionService} from './meter-submissions.mjs';
import {createMeterReaderService} from './meter-reader-service.mjs';
import {createMeterAutomaticService} from './meter-automatic.mjs';
import {prepareProjectRuntime} from '../../scripts/project-runtime.mjs';

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2'};
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
  const store=openStore(options.dbPath??process.env.TROZY_DB_PATH??'data/trozy.sqlite');
  const seed=options.seed??!['0','false'].includes(String(process.env.TROZY_SEED_DEMO).toLowerCase());if(seed)seedDemo(store);
  const ai=createAIService(store);
  const meterReader=createMeterReaderService(store,options.meterReader);
  const meterAutomatic=createMeterAutomaticService(store,meterReader,options.meterAutomatic);
  const meter=createMeterSubmissionService(store,{onCreated:row=>meterAutomatic.enqueueCreated(row)});
  const secureCookies=options.secureCookies??['1','true'].includes(String(process.env.TROZY_SECURE_COOKIES).toLowerCase());
  const dist=resolve(options.distPath||'dist');
  const limiter=new Map();
  function limit(key,max=8,minutes=15){const time=Date.now();const value=limiter.get(key);if(!value||value.until<=time){limiter.set(key,{count:1,until:time+minutes*60000});return;}if(value.count>=max)fail(429,'Bạn đã thử quá nhiều lần. Vui lòng đợi 15 phút rồi thử lại.');value.count++;if(limiter.size>10000)for(const [key,value]of limiter)if(value.until<=time)limiter.delete(key);}
  function userFor(req){const token=tokenFromCookie(req);if(!token)return null;const row=store.db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?').get(hashToken(token),Date.now());return row||null;}
  function requireUser(req){const user=userFor(req);if(!user)fail(401,'Vui lòng đăng nhập để tiếp tục.');return user;}
  function cookie(res,userId){const token=randomBytes(32).toString('hex');const expires=Date.now()+7*86400000;store.db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hashToken(token),userId,expires);res.setHeader('Set-Cookie',`${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secureCookies?'; Secure':''}`);}
  function outbox(user,kind){
    const token=randomBytes(32).toString('hex');store.db.prepare('DELETE FROM auth_tokens WHERE user_id=? AND kind=?').run(user.id,kind);
    store.db.prepare('INSERT INTO auth_tokens(token_hash,user_id,kind,expires_at) VALUES(?,?,?,?)').run(hashToken(token),user.id,kind,Date.now()+(kind==='reset'?3600000:86400000));
    const record={id:id('mail'),email:user.email,kind,token};
    store.db.prepare('INSERT INTO mail_outbox(id,email,kind,token,created_at) VALUES(?,?,?,?,?)').run(record.id,user.email,kind,token,now());
    if(smtpConfigured())setImmediate(()=>{void deliverAuthMail(store,record);});
  }
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
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
    const name=String(input.name||'').trim();if(!name||name.length>200||/[\r\n\x00]/.test(name))fail(400,'Tên tệp không hợp lệ.');
    const allowed=['image/jpeg','image/png','image/webp','application/pdf','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel'];
    if(!allowed.includes(input.type))fail(400,'Chỉ hỗ trợ ảnh PNG/JPEG/WebP, PDF, Word, Excel và văn bản.');
    if(typeof input.data!=='string'||!input.data||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.data))fail(400,'Dữ liệu tệp không hợp lệ.');
    const bytes=Buffer.from(input.data,'base64');if(bytes.length>5*1024*1024)fail(413,'Tệp đính kèm tối đa 5 MB.');if(!bytes.length)fail(400,'Tệp không có nội dung.');
    const type=input.type.startsWith('image/')?(rasterMimeFromBytes(bytes)||input.type):input.type;
    let propertyId=input.propertyId||null,tenantId=input.tenantId||null,roomId=input.roomId||null;
    if(input.roomId){const room=store.get('rooms',input.roomId);if(!visible(store,user,'rooms',room))fail(403,'Phòng không thuộc quyền truy cập.');propertyId=room.propertyId;}
    if(user.role==='tenant'){const tenant=tenantFor(store,user);if(!tenant)fail(403,'Tài khoản chưa liên kết người thuê.');propertyId=tenant.propertyId;tenantId=tenant.id;roomId=tenant.roomId||null;}
    else{
      if(propertyId&&!visible(store,user,'properties',store.get('properties',propertyId)))fail(403,'Cơ sở không thuộc quyền truy cập.');
      if(tenantId){const tenant=store.get('tenants',tenantId);if(!visible(store,user,'tenants',tenant)||propertyId&&tenant.propertyId!==propertyId)fail(403,'Người thuê không thuộc phạm vi tệp.');propertyId=tenant.propertyId;}
    }
    const key=id('file');store.db.prepare('INSERT INTO files(id,owner_id,uploader_id,property_id,tenant_id,room_id,name,type,bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(key,ownerId(user),user.id,propertyId,tenantId,roomId,name,type,bytes,now());
    return {id:key,name,type,size:bytes.length};
  }
  function canReadFile(user,file){
    if(!file||file.owner_id!==ownerId(user))return false;if(user.role==='landlord'||file.uploader_id===user.id)return true;
    const scoped=dataFor(store,user);
    return Object.values(scoped).flat().some(row=>row.fileId===file.id||row.photoFileId===file.id||row.electricPhotoFileId===file.id||row.waterPhotoFileId===file.id||row.imageFileId===file.id||row.imageFileIds?.includes(file.id)||row.resolutionFileId===file.id||(row.photos||[]).some(photo=>photo.fileId===file.id)||(row.messages||[]).some(message=>message.fileId===file.id));
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
        if(!user||!matches)fail(401,'Email hoặc mật khẩu không đúng.');cookie(res,user.id);return json(res,200,{user:safeUser(user)});
      }
      if(path==='/api/auth/register'&&req.method==='POST'){
        const input=await readJson(req);limit(`register:${req.socket.remoteAddress}`,15);const email=cleanEmail(input.email);validateEmail(email);validatePassword(input.password);const name=String(input.name||'').trim();if(name.length<2||name.length>150)fail(400,'Họ tên cần từ 2 đến 150 ký tự.');if(!['landlord','tenant'].includes(input.role))fail(400,'Vai trò đăng ký không hợp lệ.');
        const result=store.transaction(()=>{
          if(store.db.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').get(email))fail(409,'Email đã được sử dụng.');
          let tenant=null;if(input.role==='tenant'){
            const code=String(input.inviteCode||'').trim().toUpperCase();tenant=store.list('tenants').find(row=>row.inviteCode===code&&!row.userId&&row.inviteExpiresAt>Date.now());
            if(!code||!tenant)fail(400,'Mã liên kết người thuê không hợp lệ hoặc đã hết hạn.');if(tenant.email&&tenant.email.toLowerCase()!==email)fail(400,'Email đăng ký cần khớp email trong hồ sơ được mời.');
          }
          const user=createUser(store,{name,email,password:input.password,role:input.role,tenantId:tenant?.id,landlordId:tenant?.ownerId});
          if(tenant)store.put('tenants',{...tenant,name:user.name,email:user.email,userId:user.id,inviteCode:null,inviteExpiresAt:null});
          outbox(user,'verify');return user;
        });cookie(res,result.id);return json(res,201,{user:safeUser(result),delivery:smtpConfigured()?'smtp':'local-outbox',message:smtpConfigured()?'Đăng ký thành công. Vui lòng kiểm tra email xác thực.':'Đăng ký thành công. Thư xác thực được lưu vào hộp thư phát triển cục bộ.'});
      }
      if(path==='/api/auth/logout'&&req.method==='POST'){
        await readJson(req);const token=tokenFromCookie(req);if(token)store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));res.setHeader('Set-Cookie',`${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureCookies?'; Secure':''}`);return json(res,200,{ok:true});
      }
      if(path==='/api/auth/forgot-password'&&req.method==='POST'){
        const input=await readJson(req);const email=cleanEmail(input.email);limit(`forgot:${req.socket.remoteAddress}`,6);validateEmail(email);const user=store.db.prepare('SELECT * FROM users WHERE email=? COLLATE NOCASE').get(email);if(user)store.transaction(()=>outbox(user,'reset'));return json(res,200,{message:smtpConfigured()?'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu sẽ được gửi đến email của bạn.':'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được tạo trong hộp thư phát triển cục bộ.',delivery:smtpConfigured()?'smtp':'local-outbox'});
      }
      if(path==='/api/auth/reset-password'&&req.method==='POST'){
        const input=await readJson(req);limit(`reset:${req.socket.remoteAddress}`,15);validatePassword(input.password);const result=store.transaction(()=>{
          const token=store.db.prepare('SELECT * FROM auth_tokens WHERE token_hash=? AND kind=? AND expires_at>?').get(hashToken(String(input.token||'')),'reset',Date.now());if(!token)fail(400,'Liên kết đặt lại mật khẩu không hợp lệ hoặc hết hạn.');
          store.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash(input.password),token.user_id);store.db.prepare('DELETE FROM auth_tokens WHERE user_id=? AND kind=?').run(token.user_id,'reset');store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(token.user_id);return {ok:true};
        });return json(res,200,result);
      }
      if(path==='/api/auth/verify-email'&&req.method==='POST'){
        const input=await readJson(req);limit(`verify:${req.socket.remoteAddress}`,20);const result=store.transaction(()=>{const token=store.db.prepare('SELECT * FROM auth_tokens WHERE token_hash=? AND kind=? AND expires_at>?').get(hashToken(String(input.token||'')),'verify',Date.now());if(!token)fail(400,'Mã xác thực không hợp lệ hoặc hết hạn.');store.db.prepare('UPDATE users SET verified=1 WHERE id=?').run(token.user_id);store.db.prepare('DELETE FROM auth_tokens WHERE token_hash=?').run(token.token_hash);return {ok:true};});return json(res,200,result);
      }
      if(path.startsWith('/api/')){
        const user=requireUser(req);
        if(path==='/api/auth/me'&&req.method==='GET')return json(res,200,{user:safeUser(user)});
        if(path==='/api/bootstrap'&&req.method==='GET'){store.transaction(()=>{generateReminders(store,user);syncUtilityNotifications(store,user);});return json(res,200,{user:safeUser(user),data:dataFor(store,user),capabilities:extensionCapabilities()});}
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
            for(const [key,enabled]of Object.entries(value)){if(!['invoices','contracts','maintenance','general'].includes(key)||typeof enabled!=='boolean')fail(400,'Tùy chọn thông báo cần là giá trị bật/tắt hợp lệ.');preferences[key]=enabled;}
          }
          store.transaction(()=>{store.db.prepare('UPDATE users SET name=?,phone=?,avatar_file_id=?,notification_preferences=? WHERE id=?').run(name,phone,avatarFileId,JSON.stringify(preferences),user.id);if(user.tenant_id){const tenant=store.get('tenants',user.tenant_id);if(tenant)store.put('tenants',{...tenant,name,phone});}audit(store,user,'profile','users',{id:user.id});});return json(res,200,{user:safeUser(store.db.prepare('SELECT * FROM users WHERE id=?').get(user.id))});
        }
        if(path==='/api/auth/change-password'&&req.method==='POST'){
          const input=await readJson(req);validatePassword(input.password);limit(`change:${user.id}`,10);if(!passwordMatches(String(input.currentPassword||''),user.password_hash))fail(400,'Mật khẩu hiện tại không đúng.');store.transaction(()=>{store.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash(input.password),user.id);store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);audit(store,user,'change-password','users',{id:user.id});});cookie(res,user.id);return json(res,200,{ok:true});
        }
        if(path==='/api/auth/resend-verification'&&req.method==='POST'){
          await readJson(req);limit(`resend:${user.id}`,3);if(user.verified)return json(res,200,{ok:true});store.transaction(()=>outbox(user,'verify'));return json(res,200,{ok:true,delivery:smtpConfigured()?'smtp':'local-outbox'});
        }
        if(path==='/api/export'&&req.method==='GET'){audit(store,user,'export','data',{id:user.id});return json(res,200,{format:'trozy-backup-v1',exportedAt:now(),user:safeUser(user),data:dataFor(store,user)});}
        if(path==='/api/import'&&req.method==='POST'){const input=await readJson(req);const result=store.transaction(()=>importRecords(store,user,input.collection,input.rows));return json(res,200,result);}
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
          const file=store.db.prepare('SELECT * FROM files WHERE id=?').get(fileMatch[1]);if(!canReadFile(user,file))fail(404,'Không tìm thấy tệp hoặc bạn không có quyền truy cập.');
          const type=file.type.startsWith('image/')?(rasterMimeFromBytes(file.bytes)||file.type):file.type;
          const disposition=url.searchParams.get('inline')==='1'&&type.startsWith('image/')?'inline':'attachment';res.writeHead(200,{'Content-Type':type,'Content-Length':file.bytes.byteLength,'Content-Disposition':`${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'private, no-store'});return res.end(Buffer.from(file.bytes));
        }
        const extensionMatch=path.match(/^\/api\/extensions\/(B0[1-5])$/);
        if(extensionMatch&&req.method==='POST'){
          const name=extensionMatch[1];limit(`ai:${user.id}:${name}`,40,1);
          const input=await readJson(req);const value=await ai.run(user,name,input);return json(res,200,{result:value});
        }
        const actionMatch=path.match(/^\/api\/actions\/([a-z-]+)$/);
        if(actionMatch&&req.method==='POST'){const input=await readJson(req);const result=store.transaction(()=>performAction(store,user,actionMatch[1],input));return json(res,200,result);}
        const collectionMatch=path.match(/^\/api\/([a-z]+)(?:\/([^/]+))?$/);
        if(collectionMatch&&COLLECTIONS.includes(collectionMatch[1])){
          const [,collection,key]=collectionMatch;
          if(req.method==='GET'){const scoped=dataFor(store,user)[collection];if(key){const row=scoped.find(row=>row.id===key);if(!row)fail(404,'Không tìm thấy dữ liệu.');return json(res,200,row);}return json(res,200,{records:scoped});}
          if(req.method==='POST'&&!key){const input=await readJson(req);return json(res,201,store.transaction(()=>createRecord(store,user,collection,input)));}
          if(req.method==='PATCH'&&key){const input=await readJson(req);return json(res,200,store.transaction(()=>updateRecord(store,user,collection,key,input)));}
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
  let closePromise;
  return {server,store,handler,meterAutomatic,close:()=>{
    if(closePromise)return closePromise;
    // Stop new connections before closing the queue. An in-flight submission either
    // commits with its durable jobs or rolls back through the creation hook.
    const serverStopped=new Promise((resolve,reject)=>server.close(error=>error&&error.code!=='ERR_SERVER_NOT_RUNNING'?reject(error):resolve()));
    closePromise=Promise.allSettled([serverStopped,meterAutomatic.close()]).then(results=>{store.close();const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;});
    return closePromise;
  }};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  prepareProjectRuntime();
  const app=createApp();const port=Number(process.env.PORT||3001),host=process.env.HOST||'127.0.0.1';
  app.server.listen(port,host,()=>console.log(`Trozy đang chạy tại http://${host}:${port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void app.close().then(()=>{process.exit(0);},()=>process.exit(1));});
}
