// Forgot Password (the reset link in the email): the new password must follow the same four rules as registration and
// Change Password: at least 8 characters, one uppercase letter, one number, one special character. A refused password
// leaves the reset link usable. Over real HTTP through the real router.
//
// Run with:  node --test tests/forgotPasswordRules.test.js
//
// Needs the LOCAL gaming_rewamp database. Every row the tests create is deleted afterwards. Never point it at a live
// database.

require('moment-timezone');
const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcrypt');
const express = require('express');
require('dotenv').config();
process.env.RATE_LIMIT_DISABLED = 'true';

// Nothing here may send mail.
const sendMailPath = require.resolve('../helpers/sendMail');
require.cache[sendMailPath] = { id: sendMailPath, filename: sendMailPath, loaded: true, exports: async () => {} };

const pool = require('../config/database');
const db = pool.promise();
const userService = require('../services/userService');

const stamp = Date.now();
let counter = 0;
const userIds = [];
let server;
let base;

async function makeUser(password = 'Old@12345') {
  counter += 1;
  const [r] = await db.query(
    `INSERT INTO tbl_registration (first_name, last_name, email, password, phone, pincode, state, is_eighteen, is_verified, user_status, created, status, ip_status)
     VALUES ('Reset', 'Throwaway', ?, ?, ?, '000000', 'Delhi', 1, 1, 'active', NOW(), 1, 1)`,
    [`reset-rules-${stamp}-${counter}@invalid.local`, await bcrypt.hash(password, 4), `7${String(Date.now()).slice(-8)}${counter}`.slice(0, 10)]
  );
  userIds.push(r.insertId);
  const [[user]] = await db.query('SELECT * FROM tbl_registration WHERE id = ?', [r.insertId]);
  return user;
}
const userRow = async (id) => (await db.query('SELECT * FROM tbl_registration WHERE id = ?', [id]))[0][0];
const matches = async (id, plain) => bcrypt.compare(plain, (await userRow(id)).password.replace('$2y$', '$2b$'));

async function reset(token, newPass, conPass = newPass) {
  const res = await fetch(`${base}/users/forgot-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, newPass, conPass }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/users', require('../routes/userRouter'));
  server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  for (const id of userIds) {
    await db.query('DELETE FROM tbl_password_change_attempt WHERE user_id = ?', [id]).catch(() => {});
    await db.query('DELETE FROM tbl_user_trusted_device WHERE user_id = ?', [id]).catch(() => {});
    await db.query('DELETE FROM tbl_registration WHERE id = ?', [id]);
  }
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => pool.end(resolve));
});

test('each rule on its own refuses the password, and the password stays as it was', async () => {
  const user = await makeUser();
  const token = userService.signResetToken(user);
  const weak = {
    'too short': 'Ab1!xyz',
    'no uppercase': 'abcdefg1!',
    'no number': 'Abcdefgh!',
    'no special character': 'Abcdefg12',
    'a simple number': '2345678',
    'only letters': 'abcdefgh',
  };
  for (const [why, password] of Object.entries(weak)) {
    const res = await reset(token, password);
    assert.strictEqual(res.status, 400, why);
    assert.match(res.body.msg, /8 characters.*uppercase.*number.*special/i, why);
  }
  assert.ok(await matches(user.id, 'Old@12345'), 'the old password is untouched');
});

test('a strong password is accepted and becomes the password', async () => {
  const user = await makeUser();
  const res = await reset(userService.signResetToken(user), 'Brand#New9');
  assert.strictEqual(res.status, 200);
  assert.ok(await matches(user.id, 'Brand#New9'));
  assert.ok(!(await matches(user.id, 'Old@12345')));
});

test('exactly 8 characters with all four kinds is enough', async () => {
  const user = await makeUser();
  assert.strictEqual((await reset(userService.signResetToken(user), 'Abcdef1!')).status, 200);
});

test('a refused password does not use up the link: a strong one right after works with the same link', async () => {
  const user = await makeUser();
  const token = userService.signResetToken(user);
  assert.strictEqual((await reset(token, 'weakpass')).status, 400);
  assert.strictEqual((await reset(token, 'weakpass')).status, 400);
  assert.strictEqual((await reset(token, 'Strong#Pass1')).status, 200);
  assert.ok(await matches(user.id, 'Strong#Pass1'));
});

test('once used, the link is dead (as before)', async () => {
  const user = await makeUser();
  const token = userService.signResetToken(user);
  assert.strictEqual((await reset(token, 'Strong#Pass1')).status, 200);
  const again = await reset(token, 'Another#Pass2');
  assert.strictEqual(again.status, 400);
  assert.match(again.body.msg, /invalid or expired/i);
  assert.ok(await matches(user.id, 'Strong#Pass1'));
});

test('mismatching passwords and missing fields still get their own messages', async () => {
  const user = await makeUser();
  const token = userService.signResetToken(user);
  const mismatch = await reset(token, 'Strong#Pass1', 'Strong#Pass2');
  assert.strictEqual(mismatch.status, 400);
  assert.match(mismatch.body.msg, /do not match/i);
  const missing = await reset(token, '', '');
  assert.strictEqual(missing.status, 400);
  assert.match(missing.body.msg, /required/i);
  assert.ok(await matches(user.id, 'Old@12345'));
});

test('a bad or missing link is refused even with a strong password', async () => {
  const bad = await reset('not-a-real-token', 'Strong#Pass1');
  assert.strictEqual(bad.status, 400);
  assert.match(bad.body.msg, /invalid or expired/i);
});

test('a strong reset lifts a password-change block (the block belongs to the old password)', async () => {
  const user = await makeUser();
  const attempts = require('../models/passwordChangeAttemptModel');
  const before = attempts.fingerprintOf(user.password);
  for (let i = 0; i < 3; i += 1) await attempts.registerFailure(user.id, before, 3, 1440, 60);
  assert.ok(await attempts.activeBlock(user.id, before), 'blocked before the reset');
  assert.strictEqual((await reset(userService.signResetToken(user), 'Strong#Pass1')).status, 200);
  const after = attempts.fingerprintOf((await userRow(user.id)).password);
  assert.strictEqual(await attempts.activeBlock(user.id, after), null, 'no block on the new password');
});
