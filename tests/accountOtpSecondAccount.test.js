// With SINGLE_ACCOUNT_ONLY=false (set on the dev server to test adding accounts) a user who
// already has an account can add another one, and the bank account OTP covers it.
// tests/accountOtp.test.js covers the default (rule on) behaviour.
//
// Run with:  node --test tests/accountOtpSecondAccount.test.js
// Needs the LOCAL gaming_rewamp database with the login OTP and account OTP SQL files applied.
// The mail sender is stubbed and every row the tests create is deleted afterwards.

require('moment-timezone');
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
require('dotenv').config();
process.env.RATE_LIMIT_DISABLED = 'true';
process.env.SINGLE_ACCOUNT_ONLY = 'false'; // read when models/userModel.js loads, so set before any require of it

const sent = [];
const sendMailPath = require.resolve('../helpers/sendMail');
require.cache[sendMailPath] = {
  id: sendMailPath, filename: sendMailPath, loaded: true,
  exports: async (to, subject, html) => { sent.push({ to, subject, html }); },
};

const express = require('express');
const pool = require('../config/database');
const db = pool.promise();

const originalAccountFlag = process.env.ACCOUNT_OTP_ENABLED;
const created = [];
let server;
let base;

test.before(async () => {
  const app = express();
  app.use('/api/users', require('../routes/userRouter'));
  server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  for (const id of created) {
    await db.query('DELETE FROM tbl_user_account WHERE user_id = ?', [id]);
    await db.query('DELETE FROM tbl_account_activity_log WHERE user_id = ?', [id]);
    await db.query('DELETE FROM tbl_login_challenge WHERE user_id = ?', [id]);
    await db.query('DELETE FROM tbl_registration WHERE id = ?', [id]);
  }
  process.env.ACCOUNT_OTP_ENABLED = originalAccountFlag;
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => pool.end(resolve));
});

test.beforeEach(() => { sent.length = 0; });

let counter = 0;
async function userWithOneAccount() {
  counter += 1;
  const [ins] = await db.query(
    `INSERT INTO tbl_registration (first_name, last_name, email, password, phone, pincode, state, is_eighteen, is_verified, user_status, created, status, ip_status)
     VALUES ('SecondAcct', 'Throwaway', ?, 'x', ?, '000000', 'Delhi', 1, 1, 'active', NOW(), 1, 1)`,
    [`second-acct-${Date.now()}-${counter}@invalid.local`, `2${String(Date.now()).slice(-8)}${counter}`.slice(0, 10)]
  );
  const id = ins.insertId;
  created.push(id);
  const token = jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  await db.query('UPDATE tbl_registration SET session_token = ? WHERE id = ?', [token, id]);
  const [acc] = await db.query(
    `INSERT INTO tbl_user_account (user_id, bank_name, account_number, ifsc, ac_holder_name, account_type, upi_id, phone_pay, g_pay, paytm, primary_account, modified)
     VALUES (?, 'First Bank', '1111222233334444', 'FIRST000001', 'Holder', 'Current', 'first@okhdfc', '9000000001', '9000000001', '9000000001', 1, NOW())`,
    [id]
  );
  return { id, token, firstAccount: acc.insertId };
}

const form = () => ({
  holder_name: 'Second Holder', account: '9876543210987654', ifsc_code: 'SECOND00001', bank_name: 'Second Bank',
  account_type: 'Current', addhar_number: '', upi_id: 'second.one@oksbi', phone_pay: '9111111111', g_pay: '9111111111', paytm: '9111111111',
});

const add = async (user, body) => {
  const res = await fetch(`${base}/users/add-account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const lastCode = () => {
  const mail = [...sent].reverse().find((m) => /Confirm your bank account change/.test(m.subject));
  return mail && (mail.html.match(/letter-spacing: 8px[^>]*>(\d{6})</) || [])[1];
};
const rows = async (uid) => (await db.query('SELECT ac_id, primary_account, is_soft_deleted, upi_id FROM tbl_user_account WHERE user_id = ? ORDER BY ac_id', [uid]))[0];

test('rule lifted, switch off: a second account is saved straight away and becomes the primary one', async () => {
  process.env.ACCOUNT_OTP_ENABLED = 'false';
  const user = await userWithOneAccount();
  const res = await add(user, form());
  assert.strictEqual(res.status, 200);
  const all = await rows(user.id);
  assert.strictEqual(all.length, 2);
  assert.strictEqual(all.find((r) => r.ac_id === user.firstAccount).primary_account, 0);
  assert.strictEqual(all.find((r) => r.upi_id === 'second.one@oksbi').primary_account, 1);
});

test('rule lifted, switch on: a user with an account gets a code, nothing is saved until the right code, then it becomes primary', async () => {
  process.env.ACCOUNT_OTP_ENABLED = 'true';
  const user = await userWithOneAccount();

  const first = await add(user, form());
  assert.strictEqual(first.status, 202, 'a code is sent instead of the "already have an account" refusal');
  assert.strictEqual((await rows(user.id)).length, 1, 'nothing is saved yet');

  const wrong = await add(user, { ...form(), challengeId: first.json.challengeId, otp: lastCode() === '000000' ? '111111' : '000000' });
  assert.strictEqual(wrong.status, 400);
  assert.strictEqual((await rows(user.id)).length, 1);

  const ok = await add(user, { ...form(), challengeId: first.json.challengeId, otp: lastCode() });
  assert.strictEqual(ok.status, 200);
  const all = await rows(user.id);
  assert.strictEqual(all.length, 2);
  assert.strictEqual(all.find((r) => r.upi_id === 'second.one@oksbi').primary_account, 1);
  assert.strictEqual(all.find((r) => r.ac_id === user.firstAccount).primary_account, 0);
  assert.ok(sent.some((m) => /Your bank account was changed/.test(m.subject)), 'the alert email is sent');
});

test('rule lifted: a code cannot be used to add details other than the ones it was sent for', async () => {
  process.env.ACCOUNT_OTP_ENABLED = 'true';
  const user = await userWithOneAccount();
  const first = await add(user, form());
  const swapped = await add(user, { ...form(), upi_id: 'attacker@oksbi', challengeId: first.json.challengeId, otp: lastCode() });
  assert.strictEqual(swapped.status, 400);
  assert.strictEqual((await rows(user.id)).length, 1);
});
