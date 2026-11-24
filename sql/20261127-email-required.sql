-- Users without an email must add and verify one (login, bank account changes, withdrawal), and an
-- admin can change a user's email without a code. Safe to run more than once.
--
-- tbl_email_verify   one row per "add my email" attempt: the code mailed to the NEW address (stored
--                    hashed, single use, expires, dies after too many wrong guesses).
-- tbl_user_email_log every email set or changed: who did it ('user' after a verified code, 'admin'
--                    without one), the old and new address, and for an admin which admin.
-- tbl_login_challenge.second_factor also takes 'emailsetup' (a login waiting for the user's email);
-- the column is VARCHAR(10) already (sql/20261126-totp.sql), so nothing to change there.
--
-- Read who changed an email:
--   SELECT * FROM tbl_user_email_log WHERE user_id = <id> ORDER BY id DESC;

CREATE TABLE IF NOT EXISTS tbl_email_verify (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  verify_hash   CHAR(64) NOT NULL,
  user_id       INT NOT NULL,
  new_email     VARCHAR(255) NOT NULL,
  otp_hash      CHAR(64) NOT NULL,
  attempts      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  resend_count  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_sent_at  DATETIME NOT NULL,
  expires_at    DATETIME NOT NULL,
  used_at       DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email_verify_hash (verify_hash),
  KEY idx_email_verify_user (user_id),
  KEY idx_email_verify_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
