-- Bank account OTP: the same table that holds login codes also holds the codes for adding,
-- deleting and changing the primary bank account. Run this ONCE (MySQL 5.7 has no
-- "ADD COLUMN IF NOT EXISTS", so a second run says the column already exists; that is harmless).
--
--   purpose       login | add_account | delete_account | set_primary
--                 A code only works for the purpose it was issued for; existing rows stay 'login'.
--   payload_hash  fingerprint of the exact account details (or account id) the code was issued
--                 for, so a code cannot be reused to approve different details.
--
-- Needs sql/20261123-new-device-login-otp.sql to have been run already.

ALTER TABLE tbl_login_challenge
  ADD COLUMN purpose VARCHAR(20) NOT NULL DEFAULT 'login' AFTER auth_method,
  ADD COLUMN payload_hash CHAR(64) NULL AFTER purpose;
