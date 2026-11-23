-- Profile changes go in tbl_auth_activity_log too (run after the two earlier auth-activity-log files):
--   event_type  now also takes 'profile_update'
--   details     what was changed, for example "name, image"
-- The IP address, location, browser and time are saved the same way as for a login.

ALTER TABLE tbl_auth_activity_log
  MODIFY event_type ENUM('login','signup','profile_update') NOT NULL,
  ADD COLUMN details VARCHAR(255) NULL AFTER auth_method;
