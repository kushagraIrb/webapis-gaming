-- Bank account activity log: one row per step of adding, deleting or changing the primary bank
-- account (code sent, wrong code, completed) with the IP address, the visitor's location and the
-- browser. Works on MySQL 5.7 and MariaDB (plain statements) and is safe to run twice.
--
-- country / state / city come from the visitor-location headers Cloudflare adds to each request,
-- the same as sql/20261123-auth-activity-log.sql. Any of them can be NULL when not known.
-- account_hint is a masked hint such as ab***@okhdfc or A/c ****1234, never a full number.
--
-- The application keeps working if this table does not exist yet (it just skips the log).

CREATE TABLE IF NOT EXISTS tbl_account_activity_log (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       INT NOT NULL,
  action        VARCHAR(20) NOT NULL COMMENT 'add_account | delete_account | set_primary',
  step          VARCHAR(20) NOT NULL COMMENT 'otp_sent | otp_failed | completed',
  status        VARCHAR(10) NOT NULL DEFAULT 'success' COMMENT 'success | failed',
  fail_reason   VARCHAR(100) NULL,
  ac_id         INT NULL COMMENT 'tbl_user_account.ac_id the action refers to',
  account_hint  VARCHAR(100) NULL,
  ip_address    VARCHAR(45) NULL,
  country       VARCHAR(100) NULL COMMENT 'Cloudflare country code, for example IN',
  state         VARCHAR(100) NULL,
  state_source  VARCHAR(12) NULL COMMENT 'cloudflare, or profile when Cloudflare sent none',
  city          VARCHAR(100) NULL,
  browser       VARCHAR(512) NULL COMMENT 'User-Agent header',
  created_at    DATETIME NOT NULL COMMENT 'IST, like the rest of the app',
  PRIMARY KEY (id),
  KEY idx_account_log_user (user_id, created_at),
  KEY idx_account_log_ip (ip_address),
  KEY idx_account_log_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
