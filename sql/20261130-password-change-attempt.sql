-- Change password: the user must type their old password. 3 wrong old passwords block changing the password
-- for 24 hours. This table holds the count and the block. Safe to run more than once. Take a backup first.
--
-- One row per user who has typed a wrong old password:
--   failed_count     wrong old passwords so far (reset after a successful change, after the block ends, or
--                    when the last wrong one was more than 24 hours ago)
--   blocked_until    set when the 3rd wrong one is typed; changing the password is refused until then
--   last_failed_at   when the last wrong one was typed
--   pwd_fingerprint  a short fingerprint of the password the attempts were made against. When the password
--                    changes by any route (the user, "Forgot password", or an admin setting one) the old row no
--                    longer matches and is dropped, so a new password always starts with a clean count.
-- Times are India time, like the rest of the app. Nothing needs cleaning: a finished block just stops matching.
--
-- Without this table the old password is still checked, but there is no 3-attempt block.
--
-- Look at it by hand with:
--   SELECT user_id, failed_count, blocked_until, last_failed_at FROM tbl_password_change_attempt ORDER BY last_failed_at DESC LIMIT 20;
-- Release a user early with:
--   DELETE FROM tbl_password_change_attempt WHERE user_id = 12345;
CREATE TABLE IF NOT EXISTS tbl_password_change_attempt (
  user_id          INT NOT NULL,
  pwd_fingerprint  CHAR(16) NOT NULL,
  failed_count     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  blocked_until    DATETIME NULL,
  last_failed_at   DATETIME NULL,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
