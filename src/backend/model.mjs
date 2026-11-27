import {randomUUID, createHash, randomBytes, createCipheriv, createDecipheriv} from 'node:crypto';

export const COLLECTIONS = ['properties','rooms','tenants','contracts','readings','meters','meterSubmissions','meterProfiles','services','charges','invoices','payments','credits','deposits','depositSettlements','transactions','issues','assets','handovers','notifications','tickets','documents','vehicles','amenities','bookings','settings','audits','privacyRequests'];
export const id = prefix => `${prefix}_${randomUUID().replaceAll('-','').slice(0,18)}`;
export const now = () => new Date().toISOString();
export const today = () => new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Ho_Chi_Minh'});
export const hashToken = token => createHash('sha256').update(token).digest('hex');

export function safeUser(user) { return {id:user.id,name:user.name,email:user.email,pendingEmail:user.pending_email||undefined,phone:user.phone,role:user.role,tenantId:user.tenant_id||undefined,verified:!!user.verified,avatarFileId:user.avatar_file_id||undefined,notificationPreferences:{invoices:true,contracts:true,maintenance:true,general:true,...JSON.parse(user.notification_preferences||'{}')}}; }

export const auditFields={
    assets:'code name assetType roomId status warrantyDate note',
    contracts:'roomId tenantId status startDate endDate agreedEndDate rent deposit terms version acceptedVersion',
    services:'name rate unit active effectiveFrom roomIds contractIds',settings:'billingDay invoiceNote contractTerms electricMethod waterMethod electricRate waterRate electricFixedFee waterFixedFee electricPersonRate waterPersonRate effectiveFrom notificationDays anomalyThreshold bankName bankBin',
    invoices:'period status total paid rent adjustment dueDate version items',payments:'invoiceId kind status amount appliedAmount creditAmount date method',
    deposits:'contractId type amount date',depositSettlements:'contractId status depositHeld refundAmount deductionTotal excessAmount deductions',charges:'reason amount period invoiceId status',transactions:'type category amount date description'
  };

export function identityCodec(key) {
  function protectIdentity(value){
    if(!value)return value;
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
    const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
    return ['enc',iv.toString('hex'),cipher.getAuthTag().toString('hex'),ciphertext.toString('hex')].join(':');
  }
  function readIdentity(value){
    if(!value?.startsWith('enc:'))return value;
    const [,iv,tag,ciphertext]=value.split(':');
    const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'hex'));
    decipher.setAuthTag(Buffer.from(tag,'hex'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext,'hex')),decipher.final()]).toString('utf8');
  }
  function mapIdentity(row,transform){
    const result={...row};
    if(result.identityNumber)result.identityNumber=transform(result.identityNumber);
    if(row.memberProfiles)result.memberProfiles=row.memberProfiles.map(member=>mapIdentity(member,transform));
    return result;
  }
  const encode=row=>mapIdentity(row,protectIdentity);
  const decode=value=>mapIdentity(JSON.parse(value),readIdentity);
  return {encode,decode};
}
