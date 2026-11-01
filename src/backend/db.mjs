import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID, scryptSync, randomBytes, timingSafeEqual, createHash, createCipheriv, createDecipheriv } from 'node:crypto';

export const COLLECTIONS = ['properties','rooms','tenants','contracts','readings','meterSubmissions','meterProfiles','services','invoices','payments','credits','deposits','transactions','issues','assets','handovers','notifications','tickets','documents','vehicles','amenities','bookings','settings','audits'];
export const id = prefix => `${prefix}_${randomUUID().replaceAll('-','').slice(0,18)}`;
export const now = () => new Date().toISOString();
export const today = () => new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Ho_Chi_Minh'});
export const hashToken = token => createHash('sha256').update(token).digest('hex');
export function passwordHash(password) { const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`; }
export function passwordMatches(password,stored) { try {const [salt,digest]=stored.split(':'); const expected=Buffer.from(digest,'hex');const actual=scryptSync(password,salt,64);return expected.length===actual.length&&timingSafeEqual(expected,actual);} catch {return false;} }
export function openStore(path='data/trozy.sqlite') {
  if(path!==':memory:')mkdirSync(dirname(resolve(path)),{recursive:true});
  let key;
  if(process.env.TROZY_DATA_KEY){if(!/^[a-fA-F0-9]{64}$/.test(process.env.TROZY_DATA_KEY))throw new Error('TROZY_DATA_KEY must contain 64 hexadecimal characters');key=Buffer.from(process.env.TROZY_DATA_KEY,'hex');}
  else if(path===':memory:')key=randomBytes(32);
  else {const keyPath=resolve(dirname(resolve(path)),'.trozy-data-key');if(!existsSync(keyPath))writeFileSync(keyPath,randomBytes(32),{flag:'wx',mode:0o600});key=readFileSync(keyPath);if(key.length!==32)throw new Error('Invalid local data encryption key');}
  const encode=row=>{const result={...row};if(result.identityNumber&&!result.identityNumber.startsWith('enc:')){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const ciphertext=Buffer.concat([cipher.update(result.identityNumber,'utf8'),cipher.final()]);result.identityNumber=`enc:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext.toString('hex')}`;}return result;};
  const decode=value=>{const row=JSON.parse(value);if(row.identityNumber?.startsWith('enc:')){const [,iv,tag,ciphertext]=row.identityNumber.split(':');const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'hex'));decipher.setAuthTag(Buffer.from(tag,'hex'));row.identityNumber=Buffer.concat([decipher.update(Buffer.from(ciphertext,'hex')),decipher.final()]).toString('utf8');}return row;};
  const db=new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE COLLATE NOCASE,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('landlord','tenant')),phone TEXT NOT NULL DEFAULT '',tenant_id TEXT,landlord_id TEXT,verified INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_tokens (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS mail_outbox (id TEXT PRIMARY KEY,email TEXT NOT NULL,kind TEXT NOT NULL,token TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL,id TEXT NOT NULL,owner_id TEXT NOT NULL REFERENCES users(id),property_id TEXT,tenant_id TEXT,data TEXT NOT NULL CHECK(json_valid(data)),PRIMARY KEY(collection,id));
    CREATE INDEX IF NOT EXISTS records_owner ON records(owner_id,collection);
    CREATE UNIQUE INDEX IF NOT EXISTS rooms_code_unique ON records(owner_id,property_id,lower(json_extract(data,'$.code'))) WHERE collection='rooms';
    CREATE UNIQUE INDEX IF NOT EXISTS invoice_period_unique ON records(owner_id,json_extract(data,'$.roomId'),json_extract(data,'$.period')) WHERE collection='invoices' AND json_extract(data,'$.status')!='cancelled';
    CREATE UNIQUE INDEX IF NOT EXISTS reading_period_unique ON records(owner_id,json_extract(data,'$.roomId'),json_extract(data,'$.period')) WHERE collection='readings';
    CREATE UNIQUE INDEX IF NOT EXISTS meter_profile_unique ON records(owner_id,json_extract(data,'$.roomId'),json_extract(data,'$.utility')) WHERE collection='meterProfiles';
    CREATE UNIQUE INDEX IF NOT EXISTS settings_property_unique ON records(owner_id,property_id) WHERE collection='settings';
    CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),uploader_id TEXT NOT NULL REFERENCES users(id),property_id TEXT,tenant_id TEXT,name TEXT NOT NULL,type TEXT NOT NULL,bytes BLOB NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);
    INSERT OR IGNORE INTO schema_migrations VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));`);
  const userColumns=db.prepare('PRAGMA table_info(users)').all().map(column=>column.name);
  if(!userColumns.includes('avatar_file_id'))db.exec('ALTER TABLE users ADD COLUMN avatar_file_id TEXT');
  if(!userColumns.includes('notification_preferences'))db.exec("ALTER TABLE users ADD COLUMN notification_preferences TEXT NOT NULL DEFAULT '{}'");
  db.exec("INSERT OR IGNORE INTO schema_migrations VALUES(2,strftime('%Y-%m-%dT%H:%M:%fZ','now'))");
  const mailColumns=db.prepare('PRAGMA table_info(mail_outbox)').all().map(column=>column.name);
  if(!mailColumns.includes('status'))db.exec("ALTER TABLE mail_outbox ADD COLUMN status TEXT NOT NULL DEFAULT 'local'");
  if(!mailColumns.includes('delivery_error'))db.exec('ALTER TABLE mail_outbox ADD COLUMN delivery_error TEXT');
  if(!mailColumns.includes('delivered_at'))db.exec('ALTER TABLE mail_outbox ADD COLUMN delivered_at TEXT');
  db.exec("INSERT OR IGNORE INTO schema_migrations VALUES(3,strftime('%Y-%m-%dT%H:%M:%fZ','now'))");
  const fileColumns=db.prepare('PRAGMA table_info(files)').all().map(column=>column.name);
  if(!fileColumns.includes('room_id'))db.exec('ALTER TABLE files ADD COLUMN room_id TEXT');
  db.exec("INSERT OR IGNORE INTO schema_migrations VALUES(4,strftime('%Y-%m-%dT%H:%M:%fZ','now'))");
  const read=db.prepare('SELECT data FROM records WHERE collection=? AND id=?');
  const all=db.prepare('SELECT data FROM records WHERE collection=? ORDER BY rowid');
  const own=db.prepare('SELECT data FROM records WHERE collection=? AND owner_id=? ORDER BY rowid');
  const write=db.prepare('INSERT INTO records(collection,id,owner_id,property_id,tenant_id,data) VALUES(?,?,?,?,?,?) ON CONFLICT(collection,id) DO UPDATE SET owner_id=excluded.owner_id,property_id=excluded.property_id,tenant_id=excluded.tenant_id,data=excluded.data');
  const store={db,
    get:(collection,key)=>{const row=read.get(collection,key);return row?decode(row.data):null;},
    list:(collection,ownerId)=> (ownerId?own.all(collection,ownerId):all.all(collection)).map(row=>decode(row.data)),
    put:(collection,row)=>{const saved={...row,updatedAt:now(),createdAt:row.createdAt||now()};write.run(collection,saved.id,saved.ownerId,saved.propertyId||null,saved.tenantId||null,JSON.stringify(encode(saved)));return saved;},
    remove:(collection,key)=>db.prepare('DELETE FROM records WHERE collection=? AND id=?').run(collection,key),
    transaction:fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}},
    close:()=>db.close()
  };
  return store;
}
export function safeUser(user) { return {id:user.id,name:user.name,email:user.email,phone:user.phone,role:user.role,tenantId:user.tenant_id||undefined,verified:!!user.verified,avatarFileId:user.avatar_file_id||undefined,notificationPreferences:{invoices:true,contracts:true,maintenance:true,general:true,...JSON.parse(user.notification_preferences||'{}')}}; }
export function createUser(store,{name,email,password,role='landlord',phone='',tenantId=null,landlordId=null,verified=false,userId=id('usr')}) {
  store.db.prepare('INSERT INTO users(id,name,email,password_hash,role,phone,tenant_id,landlord_id,verified,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(userId,name,email.toLowerCase(),passwordHash(password),role,phone,tenantId,landlordId,verified?1:0,now());
  return store.db.prepare('SELECT * FROM users WHERE id=?').get(userId);
}
