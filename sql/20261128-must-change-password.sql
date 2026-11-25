-- When an admin sets a user's password the user is logged out everywhere and, at the next login, has to
-- choose a password of their own before anything else works. This flag remembers that.
--
--   1 = the password was set by an admin: only change-password, details and logout are allowed
--   0 = normal (also set back to 0 when the user changes or resets their password)
--
-- Safe to run twice. The user API and the admin API both work (without the feature) until it is run.
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_registration' AND COLUMN_NAME = 'must_change_password') = 0,
  'ALTER TABLE tbl_registration ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0', 'SELECT ''must_change_password already there'' AS note');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
