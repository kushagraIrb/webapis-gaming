// Password rules where a user sets a NEW password: at registration, and when an admin has set the user's password
// and the user is forced to choose their own. The rules: at least 8 characters, one uppercase letter, one number and
// one special character. Logging in is NOT held to them: existing accounts keep working with the password they have.
// Over real HTTP through the real router.
//
// Run with:  node --test tests/passwordRegistration.test.js
//
// Needs the LOCAL gaming_rewamp database with sql/20261128-must-change-password.sql and
// sql/20261130-password-change-attempt.sql applied. Every row the tests create is deleted afterwards.
// Never point it at a live database.

require('moment-timezone');
const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const express = require('express');
require('dotenv').config();
process.env.RATE_LIMIT_DISABLED = 'true';
process.env.NEW_DEVICE_OTP_ENABLED = 'false'; // a login should simply work here

// Nothing here may send mail.
const sendMailPath = require.resolve('../helpers/sendMail');
require.cache[sendMailPath] = { id: sendMailPath, filename: sendMailPath, loaded: true, exports: async () => {} };

const pool = require('../config/database');
const db = pool.promise();
const userModel = require('../models/userModel');

const stamp = Date.now();
let counter = 0;
const emails = [];
const userIds = [];
let server;
let base;

test.before(async () => {
  const app = express();
  app.use('/api/users', require('../routes/userRouter'));
  server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  for (const email of emails) {
    const [rows] = await db.query('SELECT id FROM tbl_registration WHERE email = ?', [email]);
    for (const { id } of rows) userIds.push(id);
    await db.query('DELETE FROM otp_verified WHERE email = ?', [email]);
  }
  for (const id of userIds) {
    await db.query('DELETE FROM tbl_password_change_attempt WHERE user_id = ?', [id]).catch(() => {});
    await db.query('DELETE FROM tbl_auth_activity_log WHERE user_id = ?', [id]);
    await db.query('DELETE FROM tbl_user_trusted_device WHERE user_id = ?', [id]);
    await db.query('DELETE FROM tbl_login_challenge WHERE user_id = ?', [id]);
    await db.query('DELETE FROM tbl_registration WHERE id = ?', [id]);
  }
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => pool.end(resolve));
});

async function post(path, body, token) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'PwdRegTest/1.0', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  let json = null; try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

// A registration the way the site sends it: the OTP was asked for first (saved in otp_verified).
async function register(password, over = {}) {
  counter += 1;
  const email = over.email || `reg-${stamp}-${counter}@invalid.local`;
  const phone = over.phone || `3${String(Date.now()).slice(-8)}${counter}`.slice(0, 10);
  emails.push(email);
  await userModel.saveOtp(email, phone, '1234');
  const res = await post('/users/register', {
    first_name: 'RegTest', last_name: 'Throwaway', phone, email, pincode: '110001',
    password, is_eighteen: 1, otp: '1234', ...over.body,
  });
  return { ...res, email, phone };
}
const userByEmail = async (email) => (await db.query('SELECT * FROM tbl_registration WHERE email = ?', [email]))[0][0];

const RULE_MESSAGE = 'Password must be at least 8 characters and include one uppercase letter, one number and one special character.';

test('a password that meets all four rules registers the account', async () => {
  const res = await register('Abcdef1!');
  assert.strictEqual(res.status, 200, JSON.stringify(res.json));
  assert.ok(res.json.accessToken);
  const row = await userByEmail(res.email);
  assert.ok(row, 'the account exists');
  assert.ok(await bcrypt.compare('Abcdef1!', row.password.replace('$2y$', '$2b$')));
});

test('every rule is enforced at registration, and nothing is created', async () => {
  const weak = ['Ab1!xyz', 'abcdefg1!', 'ABCDEFGH', 'Abcdefgh!', 'Abcdefg12', 'Abcdef 1', 'password', '123456', 'qweqweqwe', '      ', ''];
  for (const password of weak) {
    const res = await register(password);
    assert.strictEqual(res.status, 400, JSON.stringify(password));
    assert.ok(res.json.errors.some((e) => e.msg === RULE_MESSAGE), JSON.stringify(password));
    assert.strictEqual(await userByEmail(res.email), undefined, `no account for ${JSON.stringify(password)}`);
  }
});

test('a password that is not text is refused cleanly', async () => {
  for (const password of [undefined, null, 12345678, ['Abcdef1!'], { a: 'Abcdef1!' }]) {
    const res = await register(password);
    assert.ok(res.status === 400, `${JSON.stringify(password)}: status ${res.status}`);
    assert.strictEqual(await userByEmail(res.email), undefined);
  }
});

test('a refused password does not use up the OTP: the right one can be sent again', async () => {
  const first = await register('weak');
  assert.strictEqual(first.status, 400);
  // same email and phone, same OTP, a good password now
  const second = await post('/users/register', {
    first_name: 'RegTest', phone: first.phone, email: first.email, pincode: '110001',
    password: 'Strong@123', is_eighteen: 1, otp: '1234',
  });
  assert.strictEqual(second.status, 200, JSON.stringify(second.json));
});

test('exactly 8 characters, other special characters, spaces and long passwords are accepted', async () => {
  for (const password of ['Abcdef1!', 'Zz9#zzzz', 'Pass word1!', 'Ünï9code#x', `A1!${'x'.repeat(40)}`]) {
    const res = await register(password);
    assert.strictEqual(res.status, 200, JSON.stringify(password));
  }
});

test('the other registration checks still apply (OTP, required fields)', async () => {
  const noOtp = await register('Strong@123', { body: { otp: '9999' } });
  assert.strictEqual(noOtp.status, 400);
  assert.match(noOtp.json.msg, /Invalid OTP/);
  const noEmail = await register('Strong@123', { body: { email: '' } });
  assert.strictEqual(noEmail.status, 400);
});

test('logging in is not held to the new rules: an existing account with a short, simple password still logs in', async () => {
  counter += 1;
  const phone = `2${String(Date.now()).slice(-8)}${counter}`.slice(0, 10);
  const [ins] = await db.query(
    `INSERT INTO tbl_registration (first_name, last_name, email, password, phone, pincode, state, is_eighteen, is_verified, user_status, created, status, ip_status)
     VALUES ('OldTimer', 'Throwaway', ?, ?, ?, '000000', 'Delhi', 1, 1, 'active', NOW(), 1, 1)`,
    [`old-${stamp}-${counter}@invalid.local`, await bcrypt.hash('abcdef', 4), phone]
  );
  userIds.push(ins.insertId);
  const login = await post('/users/login', { phone, password: 'abcdef' });
  assert.strictEqual(login.status, 200, JSON.stringify(login.json));
  assert.ok(login.json.newAccessToken);
});

test('after an admin sets a user\'s password: login works, nothing else does until they choose their own with the rules, then everything works', async (t) => {
  const [cols] = await db.query("SHOW COLUMNS FROM tbl_registration LIKE 'must_change_password'");
  if (!cols.length) return t.skip('must_change_password column is not in the local database');

  // The user as the admin panel leaves them: a temporary password and the flag on.
  const given = 'Given@1234';
  counter += 1;
  const phone = `1${String(Date.now()).slice(-8)}${counter}`.slice(0, 10);
  const [ins] = await db.query(
    `INSERT INTO tbl_registration (first_name, last_name, email, password, phone, pincode, state, is_eighteen, is_verified, user_status, created, status, ip_status, must_change_password)
     VALUES ('AdminSet', 'Throwaway', ?, ?, ?, '000000', 'Delhi', 1, 1, 'active', NOW(), 1, 1, 1)`,
    [`adminset-${stamp}-${counter}@invalid.local`, await bcrypt.hash(given, 4), phone]
  );
  userIds.push(ins.insertId);

  // 1. They can log in with the password they were given.
  const login = await post('/users/login', { phone, password: given });
  assert.strictEqual(login.status, 200, JSON.stringify(login.json));
  const token = login.json.newAccessToken;

  // 2. Nothing but change-password, details and logout works.
  const blocked = await post('/users/edit-profile', { first_name: 'X', last_name: 'Y' }, token);
  assert.strictEqual(blocked.status, 403);
  assert.strictEqual(blocked.json.mustChangePassword, true);
  const details = await post('/users/details', {}, token);
  assert.strictEqual(details.status, 200);
  assert.strictEqual(details.json.must_change_password === 1 || details.json.mustChangePassword === true || details.json.must_change_password === true, true, 'the site is told what to show');

  // 3. A weak new password is refused, one that repeats the given password is refused too.
  for (const weak of ['short', 'alllowercase1!', 'NoNumbers!!']) {
    const res = await post('/users/change-password', { current_password: given, password: weak, conf_password: weak }, token);
    assert.strictEqual(res.status, 400, weak);
    assert.ok(res.json.errors.some((e) => e.msg === RULE_MESSAGE), weak);
  }
  const same = await post('/users/change-password', { current_password: given, password: given, conf_password: given }, token);
  assert.strictEqual(same.status, 400);
  assert.strictEqual(same.json.msg, 'Please choose a new password, different from the one you were given.');

  // 4. Their own strong password is accepted. The flag is cleared and every session ends.
  const ok = await post('/users/change-password', { current_password: given, password: 'Mine@98765', conf_password: 'Mine@98765' }, token);
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.json));
  const [[row]] = await db.query('SELECT must_change_password, session_token FROM tbl_registration WHERE id = ?', [ins.insertId]);
  assert.strictEqual(row.must_change_password, 0);
  assert.strictEqual(row.session_token, null);

  // 5. Next login with the new password: everything works.
  const again = await post('/users/login', { phone, password: 'Mine@98765' });
  assert.strictEqual(again.status, 200);
  const edit = await post('/users/edit-profile', { first_name: 'Free', last_name: 'Now' }, again.json.newAccessToken);
  assert.notStrictEqual(edit.status, 403, 'no longer held back');
  assert.ok(!(edit.json && edit.json.mustChangePassword));
});

test('the same rules apply to the Change Password and registration messages', async () => {
  // one source of truth: the message the two endpoints give is identical
  const reg = await register('weak');
  assert.ok(reg.json.errors.some((e) => e.msg === RULE_MESSAGE));
  assert.strictEqual(require('../helpers/passwordRules').MESSAGE, RULE_MESSAGE);
});
