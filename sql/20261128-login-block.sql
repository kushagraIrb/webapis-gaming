-- Login block: 3 wrong-password / unknown-phone logins from one IP within 5 minutes block that IP (the whole
-- site) and every existing phone number tried from it for 1 hour. An admin can unblock early from the
-- admin panel (Blocked users > Login blocks). Safe to run more than once.
--
-- No counter table is needed: the failed attempts are counted from tbl_auth_activity_log, which already
-- holds the IP, the phone typed (phone_entered) and the reason (fail_reason) of every failed login. Run the
-- three tbl_auth_activity_log files (20261123, 20261124, 20261125) first.
--
-- tbl_login_block  one row per blocked IP and one per blocked phone. The rows made by one event share
--                  event_key, so the admin panel can show them together and unblock both at once.
--   block_type     'ip' or 'phone'
--   block_value    the IP address, or the phone number as saved on the account
--   user_id        the account of a blocked phone (empty for an IP)
--   failed_count   how many failed attempts caused the block
--   blocked_at, blocked_until   when it started and when it ends (India time, like the rest of the app)
--   released_at, released_by_admin_id, released_by_name   filled when an admin unblocks it early
--
-- A block is active while released_at is empty and blocked_until is in the future. Nothing needs cleaning:
-- an ended block simply stops matching. After an unblock the attempts made before it no longer count.
--
-- Look at the blocks by hand with:
--   SELECT id, block_type, block_value, failed_count, blocked_at, blocked_until, released_at, released_by_name
--   FROM tbl_login_block ORDER BY id DESC LIMIT 20;
CREATE TABLE IF NOT EXISTS tbl_login_block (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_key             CHAR(36) NOT NULL,
  block_type            ENUM('ip','phone') NOT NULL,
  block_value           VARCHAR(45) NOT NULL,
  user_id               INT NULL,
  failed_count          TINYINT UNSIGNED NOT NULL DEFAULT 0,
  blocked_at            DATETIME NOT NULL,
  blocked_until         DATETIME NOT NULL,
  released_at           DATETIME NULL,
  released_by_admin_id  INT NULL,
  released_by_name      VARCHAR(100) NULL,
  PRIMARY KEY (id),
  KEY idx_login_block_lookup (block_type, block_value, blocked_until),
  KEY idx_login_block_event (event_key),
  KEY idx_login_block_created (blocked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
