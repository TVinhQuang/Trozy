-- Core business constraints match the SQLite application. File bytes live exclusively in private KV.
CREATE TABLE users (id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE COLLATE NOCASE,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('landlord','tenant')),phone TEXT NOT NULL DEFAULT '',tenant_id TEXT,landlord_id TEXT,verified INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL, consented_at TEXT, pending_invite TEXT, pending_email TEXT, avatar_file_id TEXT, notification_preferences TEXT NOT NULL DEFAULT '{}');

CREATE TABLE access_events (id TEXT PRIMARY KEY,ownerId TEXT NOT NULL,propertyId TEXT,actorId TEXT NOT NULL,actorName TEXT NOT NULL,createdAt TEXT NOT NULL,resource TEXT NOT NULL,recordId TEXT NOT NULL,action TEXT NOT NULL,outcome TEXT NOT NULL);

CREATE TABLE sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);

CREATE TABLE auth_tokens (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL,expires_at INTEGER NOT NULL, target_email TEXT, attempts INTEGER NOT NULL DEFAULT 0);

CREATE TABLE mail_outbox (id TEXT PRIMARY KEY,email TEXT NOT NULL,kind TEXT NOT NULL,token TEXT NOT NULL,created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'local', delivery_error TEXT, delivered_at TEXT);

CREATE TABLE notification_mail_outbox (id TEXT PRIMARY KEY,notification_id TEXT NOT NULL,owner_id TEXT NOT NULL,user_id TEXT NOT NULL,email TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,created_at TEXT NOT NULL,delivered_at TEXT,UNIQUE(notification_id,user_id));

CREATE TABLE records (collection TEXT NOT NULL,id TEXT NOT NULL,owner_id TEXT NOT NULL REFERENCES users(id),property_id TEXT,tenant_id TEXT,data TEXT NOT NULL CHECK(json_valid(data)),PRIMARY KEY(collection,id));

CREATE INDEX access_events_by_property ON access_events(ownerId,propertyId,createdAt);

CREATE INDEX notification_mail_queue ON notification_mail_outbox(status,created_at);

CREATE INDEX records_owner ON records(owner_id,collection);

CREATE UNIQUE INDEX rooms_code_unique ON records(owner_id,property_id,lower(json_extract(data,'$.code'))) WHERE collection='rooms';

CREATE UNIQUE INDEX reading_period_unique ON records(owner_id,json_extract(data,'$.roomId'),json_extract(data,'$.period')) WHERE collection='readings';

CREATE UNIQUE INDEX meter_profile_unique ON records(owner_id,json_extract(data,'$.roomId'),json_extract(data,'$.utility')) WHERE collection='meterProfiles';

CREATE UNIQUE INDEX meter_code_unique ON records(owner_id,property_id,lower(json_extract(data,'$.code'))) WHERE collection='meters';

CREATE UNIQUE INDEX settings_property_unique ON records(owner_id,property_id) WHERE collection='settings';

CREATE UNIQUE INDEX invoice_periodic_bill ON records(owner_id,json_extract(data,'$.roomId'),json_extract(data,'$.period')) WHERE collection='invoices' AND json_extract(data,'$.status')!='cancelled' AND json_extract(data,'$.settlementId') IS NULL AND COALESCE(json_extract(data,'$.finalInvoice'),0)=0;

CREATE UNIQUE INDEX invoice_final_bill ON records(owner_id,json_extract(data,'$.contractId')) WHERE collection='invoices' AND json_extract(data,'$.finalInvoice')=1 AND json_extract(data,'$.status')!='cancelled';

CREATE UNIQUE INDEX invoice_settlement ON records(owner_id,json_extract(data,'$.settlementId')) WHERE collection='invoices' AND json_extract(data,'$.settlementId') IS NOT NULL AND json_extract(data,'$.status')!='cancelled';
CREATE TABLE files(
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), uploader_id TEXT NOT NULL REFERENCES users(id),
  property_id TEXT, tenant_id TEXT, room_id TEXT, name TEXT NOT NULL, type TEXT NOT NULL,
  raster_type TEXT, content_hash TEXT NOT NULL, size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 5242880),
  purpose TEXT NOT NULL CHECK(purpose IN ('meter','attachment')), created_at TEXT NOT NULL,
  expires_at INTEGER, state TEXT NOT NULL CHECK(state IN ('pending','ready')),
  CHECK((purpose='meter' AND expires_at IS NOT NULL) OR (purpose='attachment' AND expires_at IS NULL))
);
CREATE INDEX files_owner ON files(owner_id);
CREATE INDEX files_pending ON files(state,created_at);
CREATE INDEX files_expiration ON files(expires_at) WHERE expires_at IS NOT NULL;

-- A failed compare-and-swap aborts the entire atomic D1 batch.
CREATE TABLE owner_revisions(owner_id TEXT PRIMARY KEY REFERENCES users(id),
  version INTEGER NOT NULL CONSTRAINT revision_conflict CHECK(version >= 0));

CREATE TABLE request_limits(bucket TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX request_limits_expiration ON request_limits(expires_at);
