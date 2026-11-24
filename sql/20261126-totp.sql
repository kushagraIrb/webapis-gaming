-- Google Authenticator (TOTP) for the new-device login. Needs sql/20261123-new-device-login-otp.sql
-- to have been run already. Safe to run more than once.
--
-- tbl_user_totp         one row per user who started setup. The secret is stored encrypted
--                       (AES-256-GCM, key TOTP_ENC_KEY in the API .env). enabled = 1 only after
--                       the user entered a first correct code. last_used_step blocks reuse of a code.
-- tbl_user_backup_code  single-use backup codes (hashed) for a lost phone.
-- tbl_login_challenge.second_factor  'email' (code mailed) or 'totp' (code from the app).
--
-- SUPPORT RESET (user lost the phone and has no backup codes) - after checking identity:
--   DELETE FROM tbl_user_totp WHERE user_id = <id>;
--   DELETE FROM tbl_user_backup_code WHERE user_id = <id>;
--   DELETE FROM tbl_login_challenge WHERE user_id = <id>;
-- The user then logs in with the emailed code again and can set Authenticator up anew.

CREATE TABLE IF NOT EXISTS tbl_user_totp (
  user_id         INT NOT NULL,
  secret_enc      VARCHAR(255) NOT NULL,
  enabled         TINYINT(1) NOT NULL DEFAULT 0,
  last_used_step  BIGINT NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  enabled_at      DATETIME NULL,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tbl_user_backup_code (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT NOT NULL,
  code_hash  CHAR(64) NOT NULL,
  used_at    DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_backup_user (user_id, code_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_login_challenge' AND COLUMN_NAME = 'second_factor') = 0,
  'ALTER TABLE tbl_login_challenge ADD COLUMN second_factor VARCHAR(10) NOT NULL DEFAULT ''email''', 'SELECT ''second_factor already there'' AS note');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
