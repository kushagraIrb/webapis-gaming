-- Adds failed logins to tbl_auth_activity_log (run after 20261123-auth-activity-log.sql):
--   status        success | failed (existing rows are all successes)
--   fail_reason   why a login failed, for example wrong_password or unknown_phone
--   phone_entered the phone typed on a failed password login (never the password)
--   state_source  where `state` came from: cloudflare, or profile (the state on the user's
--                 registration, used when Cloudflare does not send one)
-- user_id can now be empty: a failed login for a phone that has no account has no user.

ALTER TABLE tbl_auth_activity_log
  MODIFY user_id INT NULL,
  ADD COLUMN status        ENUM('success','failed') NOT NULL DEFAULT 'success' AFTER event_type,
  ADD COLUMN fail_reason   VARCHAR(100) NULL AFTER status,
  ADD COLUMN phone_entered VARCHAR(20) NULL AFTER fail_reason,
  ADD COLUMN state_source  VARCHAR(12) NULL AFTER state,
  ADD KEY idx_auth_log_status (status, created_at);
