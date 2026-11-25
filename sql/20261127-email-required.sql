-- Users without an email must add and verify one (login, bank account changes, withdrawal), and an
-- admin can change a user's email without a code. Safe to run more than once.
--
-- The code mailed to the NEW address is kept in the existing otp_verified table (purpose 'email_setup',
-- the address in its email column), exactly like the bank account codes: run
-- sql/20261126-otp-verified-account-columns.sql first. No new table is needed for it.
--
-- tbl_user_email_log every email set or changed: who did it ('user' after a verified code, 'admin'
--                    without one), the old and new address, and for an admin which admin.
-- tbl_login_challenge.second_factor 'emailsetup' marks a login waiting for the user's email. The column
-- is added below if sql/20261126-totp.sql has not already added it (same definition, safe either way).
-- Emails are at most 50 characters (tbl_registration.email is VARCHAR(50)).
--
-- Read who changed an email:
--   SELECT * FROM tbl_user_email_log WHERE user_id = <id> ORDER BY id DESC;

CREATE TABLE IF NOT EXISTS tbl_user_email_log (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT NOT NULL,
  old_email   VARCHAR(255) NULL,
  new_email   VARCHAR(255) NOT NULL,
  changed_by  VARCHAR(10) NOT NULL,          -- 'user' (verified with a code) or 'admin' (no code)
  admin_id    INT NULL,
  admin_name  VARCHAR(100) NULL,
  ip_address  VARCHAR(45) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_email_log_user (user_id),
  KEY idx_email_log_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_login_challenge' AND COLUMN_NAME = 'second_factor') = 0,
  'ALTER TABLE tbl_login_challenge ADD COLUMN second_factor VARCHAR(10) NOT NULL DEFAULT ''email''', 'SELECT ''second_factor already there'' AS note');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
