ALTER TABLE tbl_registration
  ADD COLUMN google_id VARCHAR(255) NULL,
  ADD COLUMN auth_provider VARCHAR(20) NOT NULL DEFAULT 'local',
  ADD UNIQUE KEY uq_tbl_registration_google_id (google_id);
