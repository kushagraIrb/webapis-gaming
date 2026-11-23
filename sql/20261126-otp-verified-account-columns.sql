-- Bank account OTP codes are kept in the existing otp_verified table (next to the signup codes)
-- and the account activity goes into the existing tbl_auth_activity_log, so no new table is needed.
-- This file adds the columns otp_verified is missing. Each one is added only if it is not there
-- yet, so the file is safe to run twice. Works on MySQL 5.7 and MariaDB. Take a backup first.
--
--   user_id        the logged-in user the code was sent to (signup rows leave it empty)
--   purpose        add_account | delete_account | set_primary (signup rows leave it empty)
--   payload_hash   fingerprint of the exact account details the code approves
--   used_at        when the code was used; a code works once
--   resend_count   how many times a new code was asked for
--   last_sent_at   when the code was last sent; a code expires 10 minutes after it
--   attempts       wrong guesses so far (already there if 20261110-otp-expiry-and-attempts.sql ran)
--
-- The code itself is stored as it was sent (not hashed), so it can be read in this table and checked
-- by hand. Bank account rows have no email or phone, so the signup check, which looks a code up by
-- email and phone, can never match them.
--
-- Look at the codes by hand with:
--   SELECT id, user_id, purpose, otp, attempts, resend_count, used_at, last_sent_at
--   FROM otp_verified WHERE purpose IS NOT NULL ORDER BY id DESC LIMIT 20;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'otp_verified' AND COLUMN_NAME = 'user_id') = 0,
  'ALTER TABLE otp_verified ADD COLUMN user_id INT NULL', 'SELECT ''user_id already there'' AS note');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'otp_verified' AND COLUMN_NAME = 'purpose') = 0,
  'ALTER TABLE otp_verified ADD COLUMN purpose VARCHAR(20) NULL', 'SELECT ''purpose already there'' AS note');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'otp_verified' AND COLUMN_NAME = 'payload_hash') = 0,
  'ALTER TABLE otp_verified ADD COLUMN payload_hash CHAR(64) NULL', 'SELECT ''payload_hash already there'' AS note');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'otp_verified' AND COLUMN_NAME = 'used_at') = 0,
  'ALTER TABLE otp_verified ADD COLUMN used_at DATETIME NULL', 'SELECT ''used_at already there'' AS note');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'otp_verified' AND COLUMN_NAME = 'resend_count') = 0,
  'ALTER TABLE otp_verified ADD COLUMN resend_count TINYINT UNSIGNED NOT NULL DEFAULT 0', 'SELECT ''resend_count already there'' AS note');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'otp_verified' AND COLUMN_NAME = 'last_sent_at') = 0,
  'ALTER TABLE otp_verified ADD COLUMN last_sent_at DATETIME NULL', 'SELECT ''last_sent_at already there'' AS note');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'otp_verified' AND COLUMN_NAME = 'attempts') = 0,
  'ALTER TABLE otp_verified ADD COLUMN attempts INT NOT NULL DEFAULT 0', 'SELECT ''attempts already there'' AS note');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'otp_verified' AND INDEX_NAME = 'idx_otp_user_purpose') = 0,
  'ALTER TABLE otp_verified ADD KEY idx_otp_user_purpose (user_id, purpose)', 'SELECT ''index already there'' AS note');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
