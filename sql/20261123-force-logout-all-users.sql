-- ONE-TIME RELEASE STEP for the new-device login check. Do NOT run this while testing.
--
-- Run it only after the new API and user panel are live and NEW_DEVICE_OTP_ENABLED=true,
-- at an agreed quiet time. Every user is logged out once; their next login is from an
-- unknown device, so they enter the email OTP once, and that browser is then trusted.
-- Old stolen tokens stop working because the session_token no longer matches.
UPDATE tbl_registration SET session_token = NULL, refresh_token = NULL;
