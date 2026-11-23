-- Login and signup activity log: one row per successful login or signup with the IP address,
-- the visitor's location and the browser. Works on MySQL 5.7 and MariaDB (plain statements).
--
-- country / state / city are filled from the visitor-location headers Cloudflare adds to each
-- request (turn on "Add visitor location headers" under Rules > Settings > Managed Transforms;
-- without it only the country code arrives). Any of the three can be NULL when it is not known,
-- and the log row is still written.
--
-- The application keeps working if this table does not exist yet (it just skips the log).

CREATE TABLE IF NOT EXISTS tbl_auth_activity_log (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       INT NOT NULL,
  event_type    ENUM('login','signup') NOT NULL,
  auth_method   VARCHAR(15) NOT NULL DEFAULT 'password' COMMENT 'password | google | otp (new-device code)',
  ip_address    VARCHAR(45) NULL,
  country       VARCHAR(100) NULL COMMENT 'Cloudflare country code, for example IN',
  state         VARCHAR(100) NULL,
  city          VARCHAR(100) NULL,
  browser       VARCHAR(512) NULL COMMENT 'User-Agent header',
  created_at    DATETIME NOT NULL COMMENT 'IST, like the rest of the app',
  PRIMARY KEY (id),
  KEY idx_auth_log_user (user_id, created_at),
  KEY idx_auth_log_ip (ip_address),
  KEY idx_auth_log_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
