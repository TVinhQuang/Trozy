-- Store only the requested email until its owner completes registration.
CREATE TABLE landlord_signups (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  requested_at INTEGER NOT NULL,
  next_send_at INTEGER,
  token_hash TEXT UNIQUE,
  expires_at INTEGER
);
CREATE INDEX landlord_signups_due ON landlord_signups(next_send_at);
CREATE INDEX landlord_signups_age ON landlord_signups(requested_at);
