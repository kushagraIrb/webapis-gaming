-- tbl_user_email_log becomes tbl_user_email_pwd_log and now also records the password an admin sets for a user.
-- Safe to run more than once, and it works whether or not the old table exists. Take a backup first.
-- Run it BEFORE the user API and the admin API that use the new name are deployed.
--
--   1. The old table is renamed (its rows stay). On a server that never had it, the new table is created.
--   2. change_type tells the two kinds of row apart: 'email' (every row that was already there) or 'password'
--      (an admin set the user's password).
--   3. new_email may be empty now, because a password row has no email.
--   4. A view with the old name, tbl_user_email_log, shows the email rows and accepts inserts, so the old code
--      keeps working until the new code is live. Drop it afterwards with:  DROP VIEW tbl_user_email_log;
--
-- A password row holds: user_id, change_type 'password', changed_by 'admin', admin_id, admin_name, ip_address and
-- created_at (India time). old_email and new_email are empty. The password itself is never stored, not even its hash.
-- (Passwords the user changes themselves are in tbl_auth_activity_log, event_type 'profile_update'.)
--
-- Read it by hand:
--   SELECT * FROM tbl_user_email_pwd_log WHERE user_id = <id> ORDER BY id DESC;
--   SELECT * FROM tbl_user_email_pwd_log WHERE change_type = 'password' ORDER BY id DESC LIMIT 50;

-- 1. rename the old table (only when the new one is not there yet)
SET @s = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_user_email_log' AND TABLE_TYPE = 'BASE TABLE') = 1
  AND (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_user_email_pwd_log') = 0,
  'RENAME TABLE tbl_user_email_log TO tbl_user_email_pwd_log', 'SELECT ''no rename needed'' AS note');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- a server that never had the old table gets the new one
CREATE TABLE IF NOT EXISTS tbl_user_email_pwd_log (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT NOT NULL,
  change_type VARCHAR(10) NOT NULL DEFAULT 'email',   -- 'email' or 'password'
  old_email   VARCHAR(255) NULL,
  new_email   VARCHAR(255) NULL,
  changed_by  VARCHAR(10) NOT NULL,                   -- 'user' (verified with a code) or 'admin'
  admin_id    INT NULL,
  admin_name  VARCHAR(100) NULL,
  ip_address  VARCHAR(45) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_email_log_user (user_id),
  KEY idx_email_log_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. the change_type column (the renamed table does not have it yet)
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_user_email_pwd_log' AND COLUMN_NAME = 'change_type') = 0,
  'ALTER TABLE tbl_user_email_pwd_log ADD COLUMN change_type VARCHAR(10) NOT NULL DEFAULT ''email'' AFTER user_id',
  'SELECT ''change_type already there'' AS note');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 3. a password row has no email
ALTER TABLE tbl_user_email_pwd_log MODIFY new_email VARCHAR(255) NULL;

-- 4. the old name, for code that has not been updated yet (not created if a real table still has that name)
SET @s = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_user_email_log' AND TABLE_TYPE = 'BASE TABLE') = 0,
  'CREATE OR REPLACE VIEW tbl_user_email_log AS SELECT id, user_id, old_email, new_email, changed_by, admin_id, admin_name, ip_address, created_at FROM tbl_user_email_pwd_log WHERE change_type = ''email''',
  'SELECT ''a table still has the old name, view not created'' AS note');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
