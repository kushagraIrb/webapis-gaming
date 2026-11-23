// An invalid refresh token must answer 401 (the caller's problem), not 500 (a server error).
//
// Run with:  node --test tests/refreshToken.test.js
// Needs the LOCAL gaming_rewamp database. Creates one throwaway user and deletes it afterwards.

require('moment-timezone');
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
require('dotenv').config();
process.env.RATE_LIMIT_DISABLED = 'true';

// helpers/sendMail exits the process when SMTP settings are missing, so it is replaced first.
const sendMailPath = require.resolve('../helpers/sendMail');
require.cache[sendMailPath] = { id: sendMailPath, filename: sendMailPath, loaded: true, exports: async () => {} };

const pool = require('../config/database');
const db = pool.promise();
const userService = require('../services/userService');

let userId;

test.before(async () => {
  const [ins] = await db.query(
    `INSERT INTO tbl_registration (first_name, last_name, email, password, phone, pincode, is_eighteen, is_verified, user_status, created, status, ip_status)
     VALUES ('RefreshTest', 'Throwaway', 'refresh-test@invalid.local', 'x', ?, '000000', 1, 1, 'active', NOW(), 1, 1)`,
    ['4' + String(Date.now()).slice(-9)]
  );
  userId = ins.insertId;
});

test.after(async () => {
  await db.query('DELETE FROM tbl_registration WHERE id = ?', [userId]);
  await new Promise((resolve) => pool.end(resolve));
});

const rejected401 = (e) => e.statusCode === 401 && e.message === 'Invalid refresh token.';

test('a garbage refresh token is 401', async () => {
  await assert.rejects(userService.regenerateAccessToken('not-a-token'), rejected401);
});

test('an expired refresh token is 401', async () => {
  const expired = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: -10 });
  await assert.rejects(userService.regenerateAccessToken(expired), rejected401);
});

test('a refresh token the database no longer holds (force logout) is 401', async () => {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  await db.query('UPDATE tbl_registration SET refresh_token = ? WHERE id = ?', [token, userId]);
  const fresh = await userService.regenerateAccessToken(token);
  assert.ok(fresh.accessToken, 'a stored refresh token still works');

  await db.query('UPDATE tbl_registration SET session_token = NULL, refresh_token = NULL WHERE id = ?', [userId]);
  await assert.rejects(userService.regenerateAccessToken(token), rejected401);
});

test('a token signed with another secret is 401', async () => {
  const forged = jwt.sign({ id: userId }, 'some-other-secret', { expiresIn: '1h' });
  await assert.rejects(userService.regenerateAccessToken(forged), rejected401);
});
