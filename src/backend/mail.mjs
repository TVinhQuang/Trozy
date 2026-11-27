import {now} from './db.mjs';
export const smtpConfigured=(env=process.env)=>!!env.SMTP_HOST;
export function authMail(record,env=process.env){
  const reset=record.kind==='reset',link=new URL(env.TROZY_PUBLIC_URL||'http://127.0.0.1:5173');
  if(reset)return {from:env.SMTP_FROM,to:record.email,subject:'Trozy — Mã đặt lại mật khẩu',text:'Mã OTP đặt lại mật khẩu của bạn là '+record.token+'. Mã có hiệu lực 10 phút và chỉ sử dụng một lần.'};
  link.searchParams.set('action',reset?'reset':'verify');link.searchParams.set('token',record.token);
  return {from:env.SMTP_FROM,to:record.email,subject:reset?'Trozy — Đặt lại mật khẩu':'Trozy — Xác thực email',text:(reset?'Bạn vừa yêu cầu đặt lại mật khẩu Trozy.':record.kind==='change-email'?'Xác nhận địa chỉ email mới cho tài khoản Trozy.':'Chào mừng bạn đến Trozy. Vui lòng xác thực địa chỉ email.')+'\n\n'+link.href+'\n\nLiên kết có hiệu lực '+(reset?'1 giờ':'24 giờ')+'. Nếu bạn không gửi yêu cầu này, vui lòng bỏ qua thư.'};
}
export async function deliverAuthMail(store,record,{env=process.env,transportFactory}={}){
  if(!smtpConfigured(env))return false;
  const update=(sql,...args)=>{try{store.db.prepare(sql).run(...args);}catch{/* App may be shutting down; queued local message is preserved. */}};
  try{
    if(!env.SMTP_FROM)throw Object.assign(new Error('SMTP_FROM required'),{code:'SMTP_FROM_REQUIRED'});
    if(!!env.SMTP_USER!==!!env.SMTP_PASS)throw Object.assign(new Error('SMTP credentials incomplete'),{code:'SMTP_AUTH_INCOMPLETE'});
    const port=Number(env.SMTP_PORT||587),secure=['1','true'].includes(String(env.SMTP_SECURE).toLowerCase())||port===465;
    if(!Number.isInteger(port)||port<1||port>65535)throw Object.assign(new Error('Invalid SMTP port'),{code:'SMTP_PORT_INVALID'});
    const config={host:env.SMTP_HOST,port,secure,requireTLS:!secure&&env.SMTP_REQUIRE_TLS!=='false',tls:{rejectUnauthorized:true},auth:env.SMTP_USER?{user:env.SMTP_USER,pass:env.SMTP_PASS}:undefined,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,disableFileAccess:true,disableUrlAccess:true};
    const factory=transportFactory||((await import('nodemailer')).default.createTransport);
    const transporter=await factory(config);
    update("UPDATE mail_outbox SET status='sending',delivery_error=NULL WHERE id=?",record.id);
    try{await transporter.sendMail(authMail(record,env));}finally{transporter.close?.();}
    update("UPDATE mail_outbox SET status='sent',delivered_at=?,delivery_error=NULL WHERE id=?",now(),record.id);return true;
  }catch(error){
    update("UPDATE mail_outbox SET status='failed',delivery_error=? WHERE id=?",String(error.code||'SMTP_DELIVERY_FAILED').slice(0,80),record.id);return false;
  }
}


export function notificationMail(record,notification,file){
  return {
    from:record.from,
    to:record.email,
    subject:`Trozy — ${String(notification.title||'Thông báo mới').slice(0,140)}`,
    text:`${notification.title||'Thông báo từ Trozy'}\n\n${notification.body||''}\n\nĐăng nhập Trozy để xem chi tiết thông báo.${file?`\n\nTệp đính kèm: ${file.name}`:''}`,
    ...(file?{attachments:[{filename:file.name,content:file.bytes,contentType:file.type}]}:{})
  };
}
export async function deliverNotificationMail(store,record,notification,{env=process.env,transportFactory,file}={}){
  if(!smtpConfigured(env))return false;
  const update=(sql,...args)=>{try{store.db.prepare(sql).run(...args);}catch{/* Preserve the durable outbox if shutdown races delivery. */}};
  try{
    if(!env.SMTP_FROM)throw Object.assign(new Error('SMTP_FROM required'),{code:'SMTP_FROM_REQUIRED'});
    if(!!env.SMTP_USER!==!!env.SMTP_PASS)throw Object.assign(new Error('SMTP credentials incomplete'),{code:'SMTP_AUTH_INCOMPLETE'});
    const port=Number(env.SMTP_PORT||587),secure=['1','true'].includes(String(env.SMTP_SECURE).toLowerCase())||port===465;
    if(!Number.isInteger(port)||port<1||port>65535)throw Object.assign(new Error('Invalid SMTP port'),{code:'SMTP_PORT_INVALID'});
    const config={host:env.SMTP_HOST,port,secure,requireTLS:!secure&&env.SMTP_REQUIRE_TLS!=='false',tls:{rejectUnauthorized:true},auth:env.SMTP_USER?{user:env.SMTP_USER,pass:env.SMTP_PASS}:undefined,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,disableFileAccess:true,disableUrlAccess:true};
    const factory=transportFactory||((await import('nodemailer')).default.createTransport);
    const transporter=await factory(config);
    update("UPDATE notification_mail_outbox SET status='sending',attempts=attempts+1,last_error=NULL WHERE id=?",record.id);
    try{await transporter.sendMail(notificationMail({email:record.email,from:env.SMTP_FROM},notification,file));}finally{transporter.close?.();}
    update("UPDATE notification_mail_outbox SET status='sent',delivered_at=?,last_error=NULL WHERE id=?",now(),record.id);return true;
  }catch(error){
    update("UPDATE notification_mail_outbox SET status='failed',last_error=? WHERE id=?",String(error.code||'SMTP_DELIVERY_FAILED').slice(0,120),record.id);return false;
  }
}
