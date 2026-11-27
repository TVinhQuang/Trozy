ALTER TABLE notification_mail_outbox ADD COLUMN claimed_at INTEGER;
CREATE TABLE scheduled_work (name TEXT PRIMARY KEY, cursor TEXT NOT NULL);
