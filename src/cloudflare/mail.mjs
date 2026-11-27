import {fail} from '../backend/domain.mjs';
import {id,now} from '../backend/model.mjs';

export function mailConfigured(env) {
  return Boolean(env.MAILER?.fetch || (env.BREVO_API_KEY && env.MAIL_FROM));
}

export async function deliverMail(env, kind, message) {
  let response;
  if (env.MAILER?.fetch) {
    response = await env.MAILER.fetch('https://mail.internal/' + kind, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(message),
    });
  } else {
    if (!mailConfigured(env)) fail(503,'Dịch vụ gửi email chưa được cấu hình trên bản cloud.');
    const reset = message.kind === 'reset';
    const subject = message.subject || (reset ? 'Trozy — Mã đặt lại mật khẩu' : 'Trozy — Xác thực email');
    const text = message.text || (reset ? 'Mã OTP của bạn là ' + message.otp + '. Mã có hiệu lực 10 phút.'
      : 'Mở liên kết sau để xác thực địa chỉ email của bạn trong 24 giờ.\n\n' + message.url);
    response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method:'POST', headers:{'Content-Type':'application/json','api-key':env.BREVO_API_KEY},
      body:JSON.stringify({sender:{name:'Trozy',email:env.MAIL_FROM},to:[{email:message.to}],subject,textContent:text,
        ...(message.attachment ? {attachment:[message.attachment]} : {})}),
    });
  }
  if (!response.ok) fail(503,'Gửi email chưa thành công. Vui lòng thử lại.');
}

import {acceptsNotice,queueReminderSql,reminderMailId} from '../shared/notification-preferences.mjs';

export function queueNotification(env, notification, recipients) {
  return recipients.filter(person=>person.email && person.enabled).map(person=>
    env.DB.prepare('INSERT OR IGNORE INTO notification_mail_outbox(id,notification_id,owner_id,user_id,email,created_at) VALUES(?,?,?,?,?,?)')
      .bind(id('nmail'),notification.id,notification.ownerId,person.userId,person.email,now()));
}

export function queueAutomaticReminders(env,store,owner){
  if(!mailConfigured(env))return [];
  const writes=[];
  for(const notice of store.list('notifications',owner).filter(n=>n.automatic&&n.phase&&n.mailQueuedPhase!==n.phase)){
    const tenant=notice.tenantId&&store.get('tenants',notice.tenantId);
    for(const account of [store.account(owner),tenant?.userId&&store.account(tenant.userId)]){
      if(!account?.email||account.id!==owner&&(account.landlord_id!==owner||account.tenant_id!==notice.tenantId))continue;
      if(!acceptsNotice(JSON.parse(account.notification_preferences||'{}'),notice,'email'))continue;
      writes.push(env.DB.prepare(queueReminderSql).bind(reminderMailId(notice,account.id),notice.id,owner,account.id,account.email,now()));
    }
    store.put('notifications',{...notice,mailQueuedPhase:notice.phase});
  }
  return writes;
}
export async function deliverQueuedNotifications(env) {
  if (!mailConfigured(env)) return;
  // A claim expires after an interrupted invocation. Recheck the recipient and
  // preference at dispatch so account changes never forward private notices.
  const due = await env.DB.prepare(`SELECT q.*,r.data,u.email AS current_email,u.tenant_id,u.notification_preferences,t.data AS tenant_data
    FROM notification_mail_outbox q LEFT JOIN records r ON r.collection='notifications' AND r.id=q.notification_id AND r.owner_id=q.owner_id
    LEFT JOIN users u ON u.id=q.user_id AND u.verified=1 AND (u.landlord_id=q.owner_id OR (u.role='landlord' AND u.id=q.owner_id))
    LEFT JOIN records t ON t.owner_id=q.owner_id AND t.collection='tenants' AND t.id=u.tenant_id
    WHERE q.attempts<3 AND (q.status IN ('queued','failed') OR (q.status='sending' AND q.claimed_at<unixepoch()-600))
    ORDER BY q.created_at LIMIT 3`).all();
  for (const item of due.results) {
    const claim = await env.DB.prepare(`UPDATE notification_mail_outbox SET status='sending',attempts=attempts+1,claimed_at=unixepoch()
      WHERE id=? AND attempts=? AND status=?`).bind(item.id,item.attempts,item.status).run();
    if (!claim.meta.changes) continue;
    let status='skipped';
    try {
      const prefs=JSON.parse(item.notification_preferences || '{}');
      const notice=item.data&&JSON.parse(item.data);
      const tenant=item.tenant_data&&JSON.parse(item.tenant_data);
      const authorized=item.user_id===item.owner_id||tenant?.userId===item.user_id&&
        (notice?.tenantId?notice.tenantId===tenant.id:tenant.status==='active'&&tenant.propertyId===notice?.propertyId&&
          (!notice.roomIds?.length||notice.roomIds.includes(tenant.roomId))&&(!notice.roomId||notice.roomId===tenant.roomId));
      const samePhase=!notice?.automatic||item.id===reminderMailId(notice,item.user_id);
      if (notice && authorized && samePhase && item.current_email===item.email && acceptsNotice(prefs,notice,'email')) {
        const message={to:item.email,subject:notice.title,text:notice.body,id:item.id};
        if(notice.fileId){
          const file=await env.DB.prepare("SELECT id,name FROM files WHERE id=? AND owner_id=? AND purpose='attachment' AND state='ready'")
            .bind(notice.fileId,item.owner_id).first();
          if(!file)throw Error('Attachment unavailable');
          const bytes=await env.FILES.get(file.id,'arrayBuffer');
          if(!bytes)throw Error('Attachment syncing');
          message.attachment={name:file.name,content:Buffer.from(bytes).toString('base64')};
        }
        await deliverMail(env,'notification',message);
        status='sent';
      }
    } catch {status='failed';}
    await env.DB.prepare('UPDATE notification_mail_outbox SET status=?,delivered_at=? WHERE id=? AND attempts=?')
      .bind(status,status==='sent'?now():null,item.id,item.attempts+1).run();
  }
}
