import {openOwnerStore} from './store.mjs';
import {deliverMail,mailConfigured} from './mail.mjs';
import {randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
import {audit,fail} from '../backend/domain.mjs';
import {hashToken,id,now,safeUser} from '../backend/model.mjs';
import {expireTenantLinkRequests,tenantLinkRoutes} from '../backend/tenant-link.mjs';

const COOKIE='trozy_session';
const encoder=new TextEncoder();
const dummy='pbkdf2:100000:'+ '00'.repeat(16)+':'+ '00'.repeat(32);
const normalizeEmail=value=>String(value??'').trim().toLowerCase();
const statement=(env,sql,...params)=>env.DB.prepare(sql).bind(...params);
function workerTenantLinks(env){
  return tenantLinkRoutes({
    first:(sql,params)=>statement(env,sql,...params).first(),
    all:async(sql,params)=>(await statement(env,sql,...params).all()).results,
    batch:async items=>(await env.DB.batch(items.map(([sql,params])=>statement(env,sql,...params)))).map(result=>result.meta.changes),
    revision:ownerId=>[[`INSERT INTO owner_revisions(owner_id,version) SELECT ?,1 WHERE changes()=1
      ON CONFLICT(owner_id) DO UPDATE SET version=version+1`,[ownerId]]]
  });
}
function checkEmail(email) {
  if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400,'Địa chỉ email không hợp lệ.');
}
function checkPassword(value) {
  if(typeof value!=='string'||value.length<8||value.length>128) fail(400,'Mật khẩu cần từ 8 đến 128 ký tự.');
}
export async function passwordDigest(value,salt=randomBytes(16).toString('hex')) {
  const material=await crypto.subtle.importKey('raw',encoder.encode(value),'PBKDF2',false,['deriveBits']);
  const key=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:Buffer.from(salt,'hex'),iterations:100000},material,256);
  return 'pbkdf2:100000:'+salt+':'+Buffer.from(key).toString('hex');
}
async function matches(value,stored=dummy) {
  if(!/^pbkdf2:100000:[a-f\d]{32}:[a-f\d]{64}$/.test(stored)||typeof value!=='string'||value.length>128) return false;
  return timingSafeEqual(Buffer.from(await passwordDigest(value,stored.split(':')[2])),Buffer.from(stored));
}
export function sessionToken(request) {
  return request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
}
export function sessionUser(env,request) {
  return statement(env,'SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?',hashToken(sessionToken(request)),Date.now()).first();
}
export async function limit(env,bucket,max,windowMs=60000) {
  const time=Date.now();
  const row=await statement(env,`INSERT INTO request_limits(bucket,hits,expires_at) VALUES(?,1,?)
    ON CONFLICT(bucket) DO UPDATE SET hits=CASE WHEN expires_at<=? THEN 1 ELSE hits+1 END,
    expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING hits`,
    hashToken(bucket),time+windowMs,time,time).first();
  if(row.hits>max) fail(429,'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau.');
}
function cookie(value,maxAge) {
  return COOKIE+'='+value+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+maxAge;
}
function requireMail(env) {
  if(!mailConfigured(env)) fail(503,'Dịch vụ gửi email chưa được cấu hình trên bản cloud.');
}
async function issue(env,request,user,kind,target=user.email) {
  requireMail(env);
  const reset=kind==='reset',raw=reset?String(randomInt(100000,1000000)):randomBytes(32).toString('hex');
  const digest=hashToken(reset?user.id+':reset:'+target+':'+raw:raw);
  await env.DB.batch([statement(env,'DELETE FROM auth_tokens WHERE user_id=? AND kind=?',user.id,kind),
    statement(env,'INSERT INTO auth_tokens(token_hash,user_id,kind,expires_at,target_email) VALUES(?,?,?,?,?)',
      digest,user.id,kind,Date.now()+(reset?600000:86400000),target)]);
  const link=new URL('/',request.url);
  link.searchParams.set('action','verify'); link.searchParams.set('token',raw);
  await deliverMail(env,'auth',{to:target,kind,...(reset?{otp:raw}:{url:link.href})});
}

const dayMs=86400000;
// An old, unfinished landlord registration can be completed by the verified mailbox owner.
const establishedAccount="(verified=1 OR role!='landlord' OR landlord_id IS NOT NULL OR tenant_id IS NOT NULL)";

async function deliverLandlordLink(env,email,origin) {
  const time=Date.now();
  const token=randomBytes(32).toString('hex'),digest=hashToken(token);
  // A single claim covers both the interactive request and the scheduled retry.
  const claim=await statement(env,`UPDATE landlord_signups SET token_hash=?,expires_at=?,next_send_at=?
    WHERE email=? AND next_send_at<=? AND requested_at>? AND NOT EXISTS (SELECT 1 FROM users WHERE email=? AND ${establishedAccount})`,
    digest,time+dayMs,time+900000,email,time,time-7*dayMs,email).run();
  if(!claim.meta.changes) return;
  const url=new URL('/',origin);
  url.searchParams.set('action','create-landlord');
  url.hash=new URLSearchParams({token}).toString();
  try {
    await deliverMail(env,'auth',{to:email,kind:'landlord-signup',url:url.href,subject:'Trozy — Tạo tài khoản chủ trọ',
      text:'Mở liên kết sau trong vòng 24 giờ để đặt mật khẩu và tạo tài khoản chủ trọ. Nếu bạn không yêu cầu đăng ký, hãy bỏ qua thư này.\n\n'+url.href});
  } catch {
    // Keep the request due for a later attempt without logging the address or link.
    return;
  }
  await statement(env,'UPDATE landlord_signups SET next_send_at=NULL WHERE email=? AND token_hash=?',email,digest).run();
}

export async function processLandlordSignups(env) {
  const time=Date.now();
  await statement(env,`DELETE FROM landlord_signups WHERE requested_at<=?
    OR (next_send_at IS NOT NULL AND email IN (SELECT email FROM users WHERE ${establishedAccount}))`,time-7*dayMs).run();
  if(!mailConfigured(env)||!env.TROZY_PUBLIC_URL) return;
  const due=await statement(env,'SELECT email FROM landlord_signups WHERE next_send_at<=? ORDER BY next_send_at LIMIT 5',time).all();
  for(const row of due.results) await deliverLandlordLink(env,row.email,env.TROZY_PUBLIC_URL);
}

import {preferenceKeys} from '../shared/notification-preferences.mjs';

export async function authRoute(env,request,path,input,user,json) {
  const ip=request.headers.get('CF-Connecting-IP')||'local';
  const email=normalizeEmail(input.email);
  if(path==='/auth/me'&&request.method==='GET') {
    if(!user) fail(401,'Vui lòng đăng nhập.');
    return json({user:safeUser(user)});
  }
  if(request.method==='POST'&&path==='/auth/login') {
    await limit(env,'login:'+ip,40,900000);
    const row=await statement(env,'SELECT * FROM users WHERE email=?',email).first();
    if(!await matches(input.password,row?.password_hash)||!row) fail(401,'Email hoặc mật khẩu không đúng.');
    if(!row.verified) fail(403,'Hãy xác thực email trước khi đăng nhập.');
    const token=randomBytes(32).toString('hex');
    await statement(env,'INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',hashToken(token),row.id,Date.now()+604800000).run();
    return json({user:safeUser(row)},200,{'Set-Cookie':cookie(token,604800)});
  }
  if(request.method==='POST'&&path==='/auth/logout') {
    if(input.allDevices===true){
      if(!user)fail(401,'Vui lòng đăng nhập.');
      await statement(env,'DELETE FROM sessions WHERE user_id=?',user.id).run();
    }else await statement(env,'DELETE FROM sessions WHERE token_hash=?',hashToken(sessionToken(request))).run();
    return json({ok:true},200,{'Set-Cookie':cookie('',0)});
  }
  if(request.method==='POST'&&path==='/auth/landlord-signup') {
    checkEmail(email);
    await limit(env,'landlord-signup:'+ip,10,900000);
    const time=Date.now();
    await statement(env,`INSERT INTO landlord_signups(email,requested_at,next_send_at)
      SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM users WHERE email=? AND ${establishedAccount})
      ON CONFLICT(email) DO UPDATE SET requested_at=excluded.requested_at,next_send_at=excluded.next_send_at
      WHERE landlord_signups.requested_at<=? AND (landlord_signups.next_send_at IS NULL OR landlord_signups.next_send_at<=?)`,
      email,time,time,email,time-600000,time).run();
    const available=mailConfigured(env);
    if(available) await deliverLandlordLink(env,email,env.TROZY_PUBLIC_URL||new URL(request.url).origin);
    return json({delivery:available?'email':'pending',message:available
      ?'Nếu email chưa có tài khoản, Trozy sẽ gửi liên kết để bạn hoàn tất đăng ký. Hãy kiểm tra cả mục thư rác.'
      :'Trozy đã ghi nhận yêu cầu. Khi dịch vụ email hoạt động, bạn sẽ nhận được liên kết để hoàn tất đăng ký. Yêu cầu được giữ trong 7 ngày.'},202);
  }
  if(request.method==='POST'&&path==='/auth/landlord-activate') {
    await limit(env,'landlord-activate:'+ip,20,900000);
    const token=String(input.token||'');
    if(!/^[0-9a-f]{64}$/.test(token)) fail(400,'Liên kết không hợp lệ hoặc đã hết hạn.');
    const digest=hashToken(token),time=Date.now();
    const pending=await statement(env,'SELECT email FROM landlord_signups WHERE token_hash=? AND expires_at>?',digest,time).first();
    if(!pending) fail(400,'Liên kết không hợp lệ hoặc đã hết hạn.');
    const name=String(input.name||'').trim(),phone=String(input.phone||'').trim();
    if(name.length<2||name.length>150||!phone||phone.length>30||![true,'on'].includes(input.consent)) fail(400,'Kiểm tra họ tên, số điện thoại và xác nhận đồng ý xử lý dữ liệu.');
    checkPassword(input.password);
    const timestamp=now(),password=await passwordDigest(input.password);
    const result=await env.DB.batch([
      statement(env,`INSERT INTO users(id,name,email,password_hash,role,phone,verified,created_at,consented_at)
        SELECT ?,?,email,?,'landlord',?,1,?,? FROM landlord_signups WHERE token_hash=? AND expires_at>?
        ON CONFLICT(email) DO UPDATE SET name=excluded.name,phone=excluded.phone,password_hash=excluded.password_hash,
          verified=1,consented_at=excluded.consented_at WHERE NOT ${establishedAccount}`,id('usr'),name,password,phone,timestamp,timestamp,digest,Date.now()),
      statement(env,'DELETE FROM landlord_signups WHERE token_hash=?',digest),
    ]);
    if(!result[0].meta.changes) fail(409,'Liên kết đã được sử dụng hoặc email đã có tài khoản. Hãy đăng nhập.');
    return json({email:pending.email},201);
  }
  if(request.method==='POST'&&path==='/auth/register') {
    requireMail(env); await limit(env,'register:'+ip,10,900000); checkEmail(email); checkPassword(input.password);
    const name=String(input.name||'').trim(),phone=String(input.phone||'').trim();
    if(!['landlord','tenant'].includes(input.role)||name.length<2||name.length>150||!phone||phone.length>30||![true,'on'].includes(input.consent)) fail(400,'Kiểm tra thông tin đăng ký và xác nhận đồng ý xử lý dữ liệu.');
    const uid=id('usr'),invitation=String(input.inviteCode||'').trim().toUpperCase();
    if(input.role==='tenant'&&invitation&&!await workerTenantLinks(env).invitation(invitation))fail(400,'Mã mời không hợp lệ hoặc đã hết hạn.');
    await statement(env,`INSERT INTO users(id,name,email,password_hash,role,phone,created_at,consented_at,pending_invite)
      VALUES(?,?,?,?,?,?,?,?,?)`,uid,name,email,await passwordDigest(input.password),input.role,phone,now(),now(),input.role==='tenant'?invitation||null:null).run();
    await issue(env,request,{id:uid,email},'verify');
    return json({delivery:'email',message:'Vui lòng kiểm tra email xác thực.'},201);
  }
  if(request.method==='POST'&&['/auth/forgot-password','/auth/resend-registration','/auth/resend-verification'].includes(path)) {
    requireMail(env); await limit(env,path+ip,6,900000);
    const reset=path==='/auth/forgot-password', personal=path==='/auth/resend-verification';
    if(personal&&!user) fail(401,'Vui lòng đăng nhập.');
    if(!personal) checkEmail(email);
    if(path==='/auth/resend-registration' && await statement(env,'SELECT 1 FROM landlord_signups WHERE email=? AND requested_at>?',email,Date.now()-7*dayMs).first()){
      const time=Date.now();
      await statement(env,`UPDATE landlord_signups SET requested_at=?,next_send_at=?
        WHERE email=? AND requested_at<=? AND (next_send_at IS NULL OR next_send_at<=?)`,time,time,email,time-600000,time).run();
      await deliverLandlordLink(env,email,env.TROZY_PUBLIC_URL||new URL(request.url).origin);
      return json({delivery:'email',message:'Nếu tài khoản phù hợp, bạn sẽ nhận được email.'});
    }
    const row=personal?user:await statement(env,'SELECT * FROM users WHERE email=? AND verified=?',email,reset?1:0).first();
    if(row && (reset||!row.verified||row.pending_email)) await issue(env,request,row,reset?'reset':row.pending_email?'change-email':'verify',row.pending_email&&!reset?row.pending_email:row.email);
    return json({delivery:'email',message:'Nếu tài khoản phù hợp, bạn sẽ nhận được email.'});
  }
  if(request.method==='POST'&&path==='/auth/verify-email') {
    const digest=hashToken(String(input.token||''));
    const row=await statement(env,`SELECT u.*,t.kind,t.target_email FROM auth_tokens t JOIN users u ON u.id=t.user_id
      WHERE token_hash=? AND expires_at>? AND kind IN ('verify','change-email')`,digest,Date.now()).first();
    if(!row||row.target_email!==(row.kind==='verify'?row.email:row.pending_email)) fail(400,'Liên kết không hợp lệ hoặc đã hết hạn.');
    const result=await env.DB.batch([
      statement(env,`UPDATE users SET verified=1,email=?,pending_email=NULL,pending_invite=NULL WHERE id=? AND (CASE WHEN ?='verify' THEN email ELSE pending_email END)=? AND EXISTS
        (SELECT 1 FROM auth_tokens WHERE token_hash=? AND expires_at>?)`,row.target_email,row.id,row.kind,row.target_email,digest,Date.now()),
      ...(row.tenant_id?[
        statement(env,`UPDATE records SET data=json_set(data,'$.email',?) WHERE collection='tenants' AND id=? AND owner_id=?
          AND EXISTS(SELECT 1 FROM users WHERE id=? AND email=?)`,row.target_email,row.tenant_id,row.landlord_id,row.id,row.target_email),
        statement(env,'INSERT INTO owner_revisions(owner_id,version) VALUES(?,1) ON CONFLICT(owner_id) DO UPDATE SET version=version+1',row.landlord_id)
      ]:[]),
      ...(row.kind==='change-email'?[statement(env,expireTenantLinkRequests,row.id,row.target_email,row.target_email)]:[]),
      statement(env,'DELETE FROM auth_tokens WHERE token_hash=?',digest)]);
    if(!result[0].meta.changes) fail(400,'Liên kết đã dùng.');
    const link=row.kind==='verify'&&row.pending_invite
      ?await workerTenantLinks(env).submit({...row,verified:1},row.pending_invite,{afterVerification:true}):null;
    return json({ok:true,message:'Email đã được xác thực.',...(link?{linkStatus:link.status}:{})});
  }
  if(request.method==='POST'&&path==='/auth/verify-reset-otp') {
    await limit(env,'otp:'+ip,20,900000);
    const token=await statement(env,`SELECT t.* FROM auth_tokens t JOIN users u ON u.id=t.user_id
      WHERE u.email=? AND u.verified=1 AND t.target_email=u.email AND t.kind='reset' AND expires_at>? AND attempts<5`,email,Date.now()).first();
    if(!token) fail(400,'Mã OTP không hợp lệ hoặc đã hết hạn.');
    if(token.token_hash!==hashToken(token.user_id+':reset:'+email+':'+String(input.otp))) {
      await statement(env,'UPDATE auth_tokens SET attempts=attempts+1 WHERE token_hash=?',token.token_hash).run(); fail(400,'Mã OTP không hợp lệ.');
    }
    const grant=randomBytes(32).toString('hex');
    const result=await statement(env,"UPDATE auth_tokens SET token_hash=?,kind='reset-grant',expires_at=? WHERE token_hash=? AND attempts<5 AND expires_at>?",hashToken(grant),Date.now()+600000,token.token_hash,Date.now()).run();
    if(!result.meta.changes) fail(400,'Mã OTP đã dùng.');
    return json({resetToken:grant});
  }
  if(request.method==='POST'&&path==='/auth/reset-password') {
    await limit(env,'reset:'+ip,10,900000); checkPassword(input.password);
    if(input.password!==input.confirmation) fail(400,'Xác nhận mật khẩu chưa khớp.');
    const token=hashToken(String(input.token||'')),time=Date.now();
    const grant="SELECT t.user_id FROM auth_tokens t JOIN users u ON u.id=t.user_id WHERE token_hash=? AND kind='reset-grant' AND expires_at>? AND u.email=t.target_email";
    const result=await env.DB.batch([statement(env,'UPDATE users SET password_hash=? WHERE id IN ('+grant+')',await passwordDigest(input.password),token,time),
      statement(env,'DELETE FROM sessions WHERE user_id IN ('+grant+')',token,time),
      statement(env,"DELETE FROM auth_tokens WHERE kind IN ('reset-grant','reset') AND user_id IN ("+grant+')',token,time)]);
    if(!result[0].meta.changes) fail(400,'Phiên đặt lại mật khẩu đã hết hạn.');
    return json({ok:true});
  }
  if(!user) fail(401,'Vui lòng đăng nhập.');
  if(request.method==='POST'&&path==='/auth/link-tenant') {
    await limit(env,'link:'+user.id,8,900000);
    return json(await workerTenantLinks(env).submit(user,input.inviteCode));
  }
  if(path==='/auth/tenant-link-requests'){
    if(request.method==='GET')return json(await workerTenantLinks(env).status(user));
    if(request.method==='POST')return json(await workerTenantLinks(env).decide(user,input));
  }
  if(request.method==='POST'&&path==='/auth/change-password') {
    await limit(env,'password:'+user.id,8,900000); checkPassword(input.password);
    if(input.password!==input.confirmation) fail(400,'Xác nhận mật khẩu chưa khớp.');
    if(!await matches(input.currentPassword,user.password_hash)) fail(403,'Mật khẩu hiện tại không đúng.');
    const token=randomBytes(32).toString('hex'), digest=await passwordDigest(input.password);
    const result=await env.DB.batch([statement(env,'UPDATE users SET password_hash=? WHERE id=? AND password_hash=?',digest,user.id,user.password_hash),
      statement(env,'DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE id=? AND password_hash=?)',user.id,digest),
      statement(env,"DELETE FROM auth_tokens WHERE kind IN ('reset','reset-grant') AND user_id IN (SELECT id FROM users WHERE id=? AND password_hash=?)",user.id,digest),
      statement(env,'INSERT INTO sessions(token_hash,user_id,expires_at) SELECT ?,id,? FROM users WHERE id=? AND password_hash=?',hashToken(token),Date.now()+604800000,user.id,digest)]);
    if(!result[0].meta.changes) fail(409,'Tài khoản đã thay đổi.');
    return json({ok:true},200,{'Set-Cookie':cookie(token,604800)});
  }
  if(request.method==='PATCH'&&path==='/auth/profile') {
    const name=String(input.name??user.name).trim(), phone=String(input.phone??user.phone).trim();
    if(name.length<2||name.length>150||phone.length>30) fail(400,'Thông tin liên hệ không hợp lệ.');
    const avatar=input.avatarFileId===undefined?user.avatar_file_id:input.avatarFileId||null;
    if(avatar && !await statement(env,"SELECT id FROM files WHERE id=? AND uploader_id=? AND raster_type IS NOT NULL AND purpose='attachment' AND state='ready'",avatar,user.id).first()) fail(403,'Ảnh đại diện không hợp lệ.');
    const prefs=safeUser(user).notificationPreferences;
    for(const [key,value] of Object.entries(input.notificationPreferences||{})){
      if(!preferenceKeys.includes(key)||typeof value!=='boolean') fail(400,'Tùy chọn không hợp lệ.');
      prefs[key]=value;
    }
    const target=input.cancelEmailChange?null:input.email===undefined?user.pending_email:email===user.email?null:email;
    const sendChange=target&&(target!==user.pending_email||input.resendEmailChange===true);
    if(sendChange){
      checkEmail(target);requireMail(env);
      await limit(env,'change-email:'+user.id,8,900000);
      if(await statement(env,'SELECT id FROM users WHERE email=? AND id!=?',target,user.id).first())fail(409,'Địa chỉ email đã được sử dụng.');
    }
    const store=await openOwnerStore(env,user,{includeFiles:false});
    if(user.tenant_id){
      const tenant=store.get('tenants',user.tenant_id);
      if(tenant)store.put('tenants',{...tenant,name,phone});
    }
    if(user.role==='landlord'||user.landlord_id)audit(store,user,'profile','users',{id:user.id});
    const updates=[statement(env,'UPDATE users SET name=?,phone=?,avatar_file_id=?,notification_preferences=?,pending_email=? WHERE id=?',name,phone,avatar,JSON.stringify(prefs),target,user.id)];
    if(target!==user.pending_email)updates.push(statement(env,"DELETE FROM auth_tokens WHERE user_id=? AND kind='change-email'",user.id));
    await store.commit(updates);
    if(sendChange) await issue(env,request,user,'change-email',target);
    return json({user:safeUser(await statement(env,'SELECT * FROM users WHERE id=?',user.id).first())});
  }
  fail(404,'Không tìm thấy chức năng tài khoản.');
}
