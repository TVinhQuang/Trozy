import {fail} from './domain.mjs';
import {id,now} from './model.mjs';

const accountEligible="u.role='tenant' AND u.verified=1 AND u.tenant_id IS NULL";
const profileEmail="coalesce(json_extract(r.data,'$.email'),'')";
const availableProfile=`r.collection='tenants' AND json_extract(r.data,'$.userId') IS NULL
  AND coalesce(json_extract(r.data,'$.status'),'')<>'left' AND json_extract(r.data,'$.inviteExpiresAt')>?`;
const requestJoins=`JOIN records r ON r.collection='tenants' AND r.id=q.tenant_id AND r.owner_id=q.owner_id
  JOIN users u ON u.id=q.user_id`;
const activeRequest=`q.status='pending' AND ${availableProfile} AND ${accountEligible}
  AND json_extract(r.data,'$.inviteCode')=q.invite_code AND ${profileEmail}=q.profile_email AND u.email=q.requested_email`;
const missingCode='Mã mời không hợp lệ hoặc đã hết hạn. Hãy xin chủ trọ cấp mã mới.';
const staleRequest='Yêu cầu đã thay đổi hoặc hết hạn. Hãy tải lại và kiểm tra trạng thái.';
const inviteCode=value=>String(value||'').trim().toUpperCase();

export const expireTenantLinkRequests =
  `UPDATE tenant_link_requests SET status='expired',invite_code='',profile_email='',requested_email=''
    WHERE user_id=? AND status='pending' AND requested_email<>?
    AND EXISTS(SELECT 1 FROM users WHERE id=tenant_link_requests.user_id AND email=?)`;

export function tenantLinkRoutes({first,all,batch,revision=()=>[]}) {
  const invitation=(code,time=Date.now())=>first(`SELECT r.id,r.owner_id,${profileEmail} AS profile_email
    FROM records r WHERE ${availableProfile} AND json_extract(r.data,'$.inviteCode')=?`,[time,inviteCode(code)]);
  const accountLink=(userId,tenantId,ownerId)=>[
    `UPDATE users SET tenant_id=?,landlord_id=?,pending_invite=NULL
      WHERE id=? AND tenant_id IS NULL AND changes()=1`,[tenantId,ownerId,userId]
  ];
  async function submit(user,value,{afterVerification=false}={}) {
    const invalid=(status,message)=>{
      if(afterVerification)return {ok:true,status:'expired'};
      fail(status,message);
    };
    if(user.role!=='tenant'||!user.verified||user.tenant_id) return invalid(409,'Tài khoản không ở trạng thái chờ liên kết.');
    const code=inviteCode(value),time=Date.now();
    const tenant=code&&await invitation(code,time);
    if(!tenant)return invalid(400,missingCode);
    const uid=user.id,email=user.email,tenantId=tenant.id,ownerId=tenant.owner_id;
    if(!tenant.profile_email||tenant.profile_email.toLowerCase()===email.toLowerCase()){
      const [changed,linked]=await batch([
        [`UPDATE records AS r SET data=json_set(data,'$.userId',?,'$.email',?,'$.inviteCode',NULL,'$.inviteExpiresAt',NULL,'$.updatedAt',?)
          WHERE r.id=? AND r.owner_id=? AND ${availableProfile} AND json_extract(r.data,'$.inviteCode')=?
          AND (${profileEmail}='' OR lower(${profileEmail})=lower(?))
          AND EXISTS(SELECT 1 FROM users u WHERE u.id=? AND u.email=? AND ${accountEligible})`,
        [uid,email,now(),tenantId,ownerId,Date.now(),code,email,uid,email]],
        accountLink(uid,tenantId,ownerId),
        ...revision(ownerId)
      ]);
      if(!changed||!linked)return invalid(409,staleRequest);
      return {ok:true,status:'linked'};
    }
    const requestId=id('link');
    const [inserted]=await batch([[`INSERT INTO tenant_link_requests(id,tenant_id,owner_id,user_id,invite_code,profile_email,requested_email,status)
      SELECT ?,r.id,r.owner_id,u.id,?,${profileEmail},u.email,'pending'
      FROM records r JOIN users u ON u.id=? WHERE r.id=? AND r.owner_id=? AND ${availableProfile}
        AND json_extract(r.data,'$.inviteCode')=? AND ${profileEmail}=? AND u.email=? AND ${accountEligible}
        AND NOT EXISTS(SELECT 1 FROM tenant_link_requests q ${requestJoins} WHERE ${activeRequest}
          AND (q.tenant_id=? OR q.user_id=?))`,
      [requestId,code,uid,tenantId,ownerId,Date.now(),code,tenant.profile_email,email,Date.now(),tenantId,uid]]]);
    if(inserted)return {ok:true,status:'pending'};
    const pending=await first(`SELECT q.id FROM tenant_link_requests q ${requestJoins}
      WHERE ${activeRequest} AND q.user_id=? AND q.tenant_id=? AND q.invite_code=?`,[Date.now(),uid,tenantId,code]);
    if(pending)return {ok:true,status:'pending'};
    return invalid(409,'Đã có yêu cầu chờ duyệt hoặc mã mời đã thay đổi. Hãy kiểm tra trạng thái hoặc liên hệ chủ trọ.');
  }
  async function status(user) {
    if(user.role==='tenant'){
      if(user.tenant_id)return {status:'approved'};
      const result=await first(`SELECT CASE WHEN latest.status='pending' AND NOT EXISTS(
        SELECT 1 FROM tenant_link_requests q ${requestJoins}
        WHERE q.id=latest.id AND ${activeRequest}
      ) THEN 'expired' ELSE latest.status END AS status
        FROM tenant_link_requests latest WHERE latest.user_id=? ORDER BY latest.rowid DESC LIMIT 1`,[Date.now(),user.id]);
      return result||{status:null};
    }
    const requests=await all(`SELECT q.id,q.tenant_id AS tenantId,q.profile_email AS profileEmail,q.requested_email AS requestedEmail
      FROM tenant_link_requests q ${requestJoins} WHERE ${activeRequest} AND q.owner_id=? ORDER BY q.rowid`,[Date.now(),user.id]);
    return {requests};
  }
  async function decide(user,input) {
    if(user.role!=='landlord')fail(403,'Chỉ chủ trọ được duyệt yêu cầu liên kết.');
    if(!['approve','reject'].includes(input.decision)||typeof input.id!=='string')fail(400,'Yêu cầu hoặc quyết định không hợp lệ.');
    const request=await first('SELECT * FROM tenant_link_requests WHERE id=? AND owner_id=?',[input.id,user.id]);
    if(!request)fail(404,'Không tìm thấy yêu cầu liên kết.');
    const next=input.decision==='approve'?'approved':'rejected';
    if(request.status===next)return {ok:true,status:next};
    const approve=next==='approved';
    const [changed,...updates]=await batch([
      [`UPDATE records
        SET data=json_set(data,'$.inviteCode',NULL,'$.inviteExpiresAt',NULL,'$.updatedAt',?
          ${approve?",'$.userId',?,'$.email',?":''})
        WHERE collection='tenants' AND id=? AND owner_id=? AND EXISTS(
          SELECT 1 FROM tenant_link_requests q ${requestJoins} WHERE q.id=? AND ${activeRequest})`,
      [now(),...(approve?[request.user_id,request.requested_email]:[]),request.tenant_id,user.id,request.id,Date.now()]],
      ...(approve?[accountLink(request.user_id,request.tenant_id,user.id)]:[]),
      [`UPDATE tenant_link_requests SET status=?,invite_code='',profile_email='',requested_email=''
        WHERE id=? AND status='pending' AND changes()=1`,[next,request.id]],
      ...revision(user.id)
    ]);
    if(!changed||!updates[approve?1:0]){
      const current=await first('SELECT status FROM tenant_link_requests WHERE id=? AND owner_id=?',[request.id,user.id]);
      if(current?.status!==next)fail(409,staleRequest);
    }
    return {ok:true,status:next};
  }
  return {invitation,submit,status,decide};
}

export function sqliteTenantLinks(store) {
  return tenantLinkRoutes({
    first:(sql,params)=>store.db.prepare(sql).get(...params),
    all:(sql,params)=>store.db.prepare(sql).all(...params),
    batch:items=>store.transaction(()=>items.map(([sql,params])=>store.db.prepare(sql).run(...params).changes))
  });
}
