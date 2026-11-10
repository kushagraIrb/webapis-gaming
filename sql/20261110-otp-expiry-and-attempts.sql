-- OTP expiry and wrong-guess limit (audit finding F-007).
-- otp_verified is a small InnoDB table; this runs in well under a second.
-- The application starts enforcing both as soon as the columns exist.
ALTER TABLE otp_verified
  ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN attempts INT NOT NULL DEFAULT 0;

-- Codes issued before this migration have no real timestamp: treat them as expired.
UPDATE otp_verified SET created_at = '2000-01-01 00:00:00';
