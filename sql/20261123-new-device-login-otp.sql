-- New-device login check: an unrecognised browser or device must enter an OTP sent to the
-- account email before it is logged in. Works on MySQL 5.7 and MariaDB (plain statements).
--
-- 1) tbl_user_trusted_device: one row per user and browser that has passed the OTP.
--    Only a SHA-256 hash of the device id is stored; the browser keeps the real value.
-- 2) tbl_login_challenge: one row per pending login. The OTP is stored hashed (HMAC) and
--    is single use, expires, and dies after too many wrong guesses.
--
-- The application only uses these tables when NEW_DEVICE_OTP_ENABLED=true in the API .env,
-- so this file can be run before the code is switched on.

CREATE TABLE IF NOT EXISTS tbl_user_trusted_device (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       INT NOT NULL,
  device_hash   CHAR(64) NOT NULL,
  browser       VARCHAR(255) NULL,
  ip_address    VARCHAR(45) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at  DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_device (user_id, device_hash),
  KEY idx_trusted_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tbl_login_challenge (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  challenge_hash  CHAR(64) NOT NULL,
  user_id         INT NOT NULL,
  auth_method     VARCHAR(10) NOT NULL,
  otp_hash        CHAR(64) NOT NULL,
  attempts        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  resend_count    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  last_sent_at    DATETIME NOT NULL,
  expires_at      DATETIME NOT NULL,
  used_at         DATETIME NULL,
  ip_address      VARCHAR(45) NULL,
  browser         VARCHAR(255) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_challenge_hash (challenge_hash),
  KEY idx_challenge_user (user_id),
  KEY idx_challenge_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
