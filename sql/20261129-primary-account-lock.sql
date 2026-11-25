-- A bank account a user adds while they already have a primary account cannot be made primary for 24 hours.
-- A Super Admin can lift that for one account from the admin panel.
--
-- primary_allowed_at    the time (database clock) from which the account may be made primary.
--                       NULL = no waiting (every older account, and a user's first account).
-- primary_unlocked_by   the Super Admin who lifted the waiting early (tbl_admin id), for the record.
--
-- Safe to run twice. The user API and the admin API both work (without the rule) until it is run.
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_user_account' AND COLUMN_NAME = 'primary_allowed_at') = 0,
  'ALTER TABLE tbl_user_account ADD COLUMN primary_allowed_at DATETIME NULL', 'SELECT ''primary_allowed_at already there'' AS note');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_user_account' AND COLUMN_NAME = 'primary_unlocked_by') = 0,
  'ALTER TABLE tbl_user_account ADD COLUMN primary_unlocked_by INT NULL', 'SELECT ''primary_unlocked_by already there'' AS note');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
