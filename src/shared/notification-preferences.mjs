// A reminder can move from upcoming to overdue. Its outbox row follows that
// transition without resending when the scheduler revisits the same event.
export function reminderMailId(notice,userId){
  return 'remmail_'+JSON.stringify([notice.id,userId,notice.phase]);
}
export const queueReminderSql=`INSERT INTO notification_mail_outbox(id,notification_id,owner_id,user_id,email,created_at) VALUES(?,?,?,?,?,?)
  ON CONFLICT(notification_id,user_id) DO UPDATE SET id=excluded.id,email=excluded.email,status='queued',attempts=0,created_at=excluded.created_at,delivered_at=NULL
  WHERE notification_mail_outbox.id<>excluded.id`;
export const noticeCategories = ['invoices','contracts','maintenance','general','support','alerts'];
export const preferenceKeys = [...noticeCategories,'emailNotifications',...noticeCategories.map(key=>'email_'+key)];

export function noticeCategory(notice) {
  if(notice.source==='utility-ai')return 'alerts';
  if(notice.id?.startsWith('rem_ticket_'))return 'support';
  return {invoice:'invoices',contract:'contracts',maintenance:'maintenance'}[notice.kind]||'general';
}

export function acceptsNotice(preferences,notice,channel) {
  const category=noticeCategory(notice);
  const enabled=preferences[category]??(['support','alerts'].includes(category)?preferences.general:undefined);
  if(channel==='email')return preferences.emailNotifications!==false&&preferences.email!==false&&(preferences['email_'+category]??enabled)!==false;
  if(notice.automatic&&category==='invoices')return true;
  return enabled!==false;
}
