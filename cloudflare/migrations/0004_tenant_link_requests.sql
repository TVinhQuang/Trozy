CREATE TABLE IF NOT EXISTS tenant_link_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL,
  profile_email TEXT NOT NULL,
  requested_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','expired'))
);
CREATE INDEX IF NOT EXISTS tenant_link_by_user ON tenant_link_requests(user_id);
CREATE INDEX IF NOT EXISTS tenant_link_by_owner ON tenant_link_requests(owner_id,status);
