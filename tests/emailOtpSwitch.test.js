// The EMAIL_OTP_ENABLED switch: one line that turns every OTP email off. With it off nothing is
// emailed, the code is still created and checked as usual, and the server returns it as `devOtp`
// so the screen can fill it in. Over real HTTP through the real routers.
//
// Run with:  node --test tests/emailOtpSwitch.test.js
//
// Needs the LOCAL gaming_rewamp database with the login OTP, account OTP and email setup SQL applied.
// The mail sender is stubbed (nothing is sent) and every row the tests create is deleted afterwards.
// Never point it at a live database.

require('moment-timezone');
const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
process.env.RATE_LIMIT_DISABLED = 'true';

const sent = [];
const sendMailPath = require.resolve('../helpers/sendMail');
require.cache[sendMailPath] = {
  id: sendMailPath, filename: sendMailPath, loaded: true,
  exports: async (to, subject, html) => { sent.push({ to, subject, html }); },
};

const express = require('express');
const pool = require('../config/database');
const db = pool.promise();

const original = {
  switch: process.env.EMAIL_OTP_ENABLED,
  device: process.env.NEW_DEVICE_OTP_ENABLED,
  account: process.env.ACCOUNT_OTP_ENABLED,
};
const created = [];
const registrationTargets = [];
const PASSWORD = 'Test@12345';
const stamp = Date.now();
let counter = 0;
let server;
let base;

test.before(async () => {
  const app = express();
  app.use('/api/users', require('../routes/userRouter'));
  app.use('/api/account', require('../routes/accountsHistoryRouter'));
  server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(async () => {
  for (const id of created) {
    await db.query('DELETE FROM tbl_user_account WHERE user_id = ?', [id]);
    await db.query('DELETE FROM tbl_auth_activity_log WHERE user_id = ?', [id]);
    await db.query('DELETE FROM tbl_user_email_pwd_log WHERE user_id = ?', [id]).catch(() => {});
    await db.query('DELETE FROM otp_verified WHERE user_id = ?', [id]);
    await db.query('DELETE FROM tbl_user_trusted_device WHERE user_id = ?', [id]);
    await db.query('DELETE FROM tbl_login_challenge WHERE user_id = ?', [id]);
    await db.query('DELETE FROM tbl_registration WHERE id = ?', [id]);
  }
  for (const { email, phone } of registrationTargets) {
    await db.query('DELETE FROM otp_verified WHERE email = ? AND phone = ?', [email, phone]);
  }
  for (const [key, value] of Object.entries({ EMAIL_OTP_ENABLED: original.switch, NEW_DEVICE_OTP_ENABLED: original.device, ACCOUNT_OTP_ENABLED: original.account })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => pool.end(resolve));
});

test.beforeEach(() => {
  delete process.env.EMAIL_OTP_ENABLED;
  process.env.NEW_DEVICE_OTP_ENABLED = 'true';
  process.env.ACCOUNT_OTP_ENABLED = 'true';
  sent.length = 0;
});

async function makeUser({ email } = {}) {
  counter += 1;
  const mail = email === undefined ? `sw-${stamp}-${counter}@invalid.local` : email;
  const phone = `6${String(Date.now()).slice(-8)}${counter}`.slice(0, 10);
  const hash = await bcrypt.hash(PASSWORD, 4);
  const [ins] = await db.query(
    `INSERT INTO tbl_registration (first_name, last_name, email, password, phone, pincode, state, is_eighteen, is_verified, user_status, created, status, ip_status)
     VALUES ('SwitchTest', 'Throwaway', ?, ?, ?, '000000', 'Delhi', 1, 1, 'active', NOW(), 1, 1)`,
    [mail, hash, phone]
  );
  const id = ins.insertId;
  created.push(id);
  const token = jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  await db.query('UPDATE tbl_registration SET session_token = ? WHERE id = ?', [token, id]);
  return { id, phone, token, email: mail };
}

async function post(path, body, token) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'SwitchTest/1.0', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  let json = null; try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json, headers: res.headers };
}

const form = (over = {}) => ({
  holder_name: 'Test Holder', account: '9876543210987654', ifsc_code: 'TEST0004321', bank_name: 'Other Bank',
  account_type: 'Savings', addhar_number: '', upi_id: 'new.person@oksbi', phone_pay: '9111111111', g_pay: '9111111111', paytm: '9111111111',
  ...over,
});
const codeFromMail = () => {
  const m = [...sent].reverse().map((x) => x.html.match(/letter-spacing: 8px[^>]*>(\d{6})</)).find(Boolean);
  return m && m[1];
};
const wrongOf = (code) => (code === '111111' ? '222222' : '111111');
const accountRows = async (userId) => (await db.query('SELECT * FROM tbl_user_account WHERE user_id = ? ORDER BY ac_id', [userId]))[0];
const giveAccount = async (userId, { primary = 1, upi = 'seed@okhdfc', number = '1234567890123456' } = {}) => (await db.query(
  `INSERT INTO tbl_user_account (user_id, bank_name, account_number, ifsc, ac_holder_name, account_type, upi_id, phone_pay, g_pay, paytm, primary_account, modified)
   VALUES (?, 'Seed Bank', ?, 'SEED0000001', 'Holder', 'Savings', ?, '9000000001', '9000000001', '9000000001', ?, NOW())`,
  [userId, number, upi, primary]
))[0].insertId;

// ---------------------------------------------------------------- switch on (default)

test('switch on, or not set: emails are sent and no code is ever put in an answer', async () => {
  for (const value of [undefined, 'true', 'TRUE', '', 'yes', '1']) {
    if (value === undefined) delete process.env.EMAIL_OTP_ENABLED; else process.env.EMAIL_OTP_ENABLED = value;
    sent.length = 0;

    const user = await makeUser();
    const login = await post('/users/login', { phone: user.phone, password: PASSWORD });
    assert.strictEqual(login.status, 202, `value ${JSON.stringify(value)}`);
    assert.strictEqual(login.json.devOtp, undefined, 'login: no code in the answer');
    assert.strictEqual(sent.length, 1, 'login: the code email is sent');

    const add = await post('/users/add-account', form(), user.token);
    assert.strictEqual(add.status, 202);
    assert.strictEqual(add.json.devOtp, undefined, 'bank account: no code in the answer');
    assert.ok(codeFromMail(), 'bank account: the code email is sent');
  }
});

test('switch on: registration sends the email and returns no code', async () => {
  const email = `sw-reg-on-${stamp}@invalid.local`;
  const phone = `5${String(Date.now()).slice(-9)}`;
  registrationTargets.push({ email, phone });
  const res = await post('/users/send-otp', { email, phone, name: 'Reg Test' });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json.devOtp, undefined);
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].to, email);
});

// ---------------------------------------------------------------- switch off

test('switch off: new-device login sends no email, returns the code, and the code logs in', async () => {
  process.env.EMAIL_OTP_ENABLED = 'false';
  const user = await makeUser();

  const login = await post('/users/login', { phone: user.phone, password: PASSWORD });
  assert.strictEqual(login.status, 202);
  assert.match(login.json.devOtp, /^\d{6}$/);
  assert.strictEqual(sent.length, 0, 'nothing is emailed');
  assert.strictEqual(login.headers.get('set-cookie'), null, 'still no session before the code');

  const wrong = await post('/users/login/verify-otp', { challengeId: login.json.challengeId, otp: wrongOf(login.json.devOtp) });
  assert.strictEqual(wrong.status, 400, 'the code is still really checked');
  assert.match(wrong.json.msg, /4 attempts left/);
  assert.strictEqual(wrong.json.devOtp, undefined, 'no code on an answer that sent nothing');

  const ok = await post('/users/login/verify-otp', { challengeId: login.json.challengeId, otp: login.json.devOtp });
  assert.strictEqual(ok.status, 200);
  assert.ok(ok.json.newAccessToken && ok.json.deviceId);
  assert.strictEqual(sent.length, 0, 'the new-device alert email is not sent either');

  const again = await post('/users/login/verify-otp', { challengeId: login.json.challengeId, otp: login.json.devOtp });
  assert.strictEqual(again.status, 400, 'a code still works only once');

  const trusted = await fetch(`${base}/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Id': ok.json.deviceId },
    body: JSON.stringify({ phone: user.phone, password: PASSWORD }),
  });
  const trustedBody = await trusted.json();
  assert.strictEqual(trusted.status, 200);
  assert.strictEqual(trustedBody.devOtp, undefined, 'a trusted browser gets no code at all');
});

test('switch off: login resend returns the new code and sends nothing', async () => {
  process.env.EMAIL_OTP_ENABLED = 'false';
  const user = await makeUser();
  const login = await post('/users/login', { phone: user.phone, password: PASSWORD });
  await db.query('UPDATE tbl_login_challenge SET last_sent_at = DATE_SUB(NOW(), INTERVAL 2 MINUTE) WHERE user_id = ?', [user.id]);

  const resend = await post('/users/login/resend-otp', { challengeId: login.json.challengeId });
  assert.strictEqual(resend.status, 200);
  assert.match(resend.json.devOtp, /^\d{6}$/);
  assert.strictEqual(sent.length, 0);

  const ok = await post('/users/login/verify-otp', { challengeId: login.json.challengeId, otp: resend.json.devOtp });
  assert.strictEqual(ok.status, 200);
});

test('switch off: bank account add, delete and set primary return the code, send nothing, and complete', async () => {
  process.env.EMAIL_OTP_ENABLED = 'false';
  const user = await makeUser();

  // add
  const first = await post('/users/add-account', form(), user.token);
  assert.strictEqual(first.status, 202);
  assert.match(first.json.devOtp, /^\d{6}$/);
  assert.strictEqual((await accountRows(user.id)).length, 0, 'nothing is saved before the code');
  const added = await post('/users/add-account', { ...form(), challengeId: first.json.challengeId, otp: first.json.devOtp }, user.token);
  assert.strictEqual(added.status, 200);
  assert.strictEqual((await accountRows(user.id)).length, 1);

  // set primary and delete on two more accounts
  const extra = await giveAccount(user.id, { primary: 0, upi: 'extra@okicici', number: '5555666677778888' });
  const prim = await post('/account/change-primary', { account_id: extra }, user.token);
  assert.strictEqual(prim.status, 202);
  assert.match(prim.json.devOtp, /^\d{6}$/);
  assert.strictEqual((await post('/account/change-primary', { account_id: extra, challengeId: prim.json.challengeId, otp: prim.json.devOtp }, user.token)).status, 200);

  const third = await giveAccount(user.id, { primary: 0, upi: 'third@okaxis', number: '7777888899990000' });
  const del = await post('/account/soft-delete', { account_id: third }, user.token);
  assert.strictEqual(del.status, 202);
  assert.match(del.json.devOtp, /^\d{6}$/);
  const wrong = await post('/account/soft-delete', { account_id: third, challengeId: del.json.challengeId, otp: wrongOf(del.json.devOtp) }, user.token);
  assert.strictEqual(wrong.status, 400);
  assert.strictEqual((await post('/account/soft-delete', { account_id: third, challengeId: del.json.challengeId, otp: del.json.devOtp }, user.token)).status, 200);

  // resend
  const again = await post('/users/add-account', form({ upi_id: 'another@oksbi', account: '1111222233334444' }), user.token);
  assert.strictEqual(again.status, 202);
  await db.query('UPDATE otp_verified SET last_sent_at = DATE_SUB(NOW(), INTERVAL 2 MINUTE) WHERE user_id = ? AND purpose IS NOT NULL', [user.id]);
  const resend = await post('/account/otp/resend', { challengeId: again.json.challengeId }, user.token);
  assert.strictEqual(resend.status, 200);
  assert.match(resend.json.devOtp, /^\d{6}$/);

  assert.strictEqual(sent.length, 0, 'no code email and no "bank account changed" alert');
});

test('switch off: registration returns a 4-digit code that matches the stored one, and sends nothing', async () => {
  process.env.EMAIL_OTP_ENABLED = 'false';
  const email = `sw-reg-off-${stamp}@invalid.local`;
  const phone = `4${String(Date.now()).slice(-9)}`;
  registrationTargets.push({ email, phone });

  const res = await post('/users/send-otp', { email, phone, name: 'Reg Test' });
  assert.strictEqual(res.status, 200);
  assert.match(String(res.json.devOtp), /^\d{4}$/);
  assert.strictEqual(sent.length, 0);

  const [[row]] = await db.query('SELECT otp FROM otp_verified WHERE email = ? AND phone = ? ORDER BY id DESC LIMIT 1', [email, phone]);
  assert.strictEqual(String(row.otp), String(res.json.devOtp), 'the returned code is the stored code');
});

test('switch off: email setup (logged in) returns the code, sends nothing, and confirming saves the email', async () => {
  process.env.EMAIL_OTP_ENABLED = 'false';
  const user = await makeUser({ email: '' });
  const address = `sw-setup-${stamp}@invalid.local`;

  const start = await post('/users/email-setup/send', { email: address }, user.token);
  assert.strictEqual(start.status, 200);
  assert.match(start.json.devOtp, /^\d{6}$/);
  assert.strictEqual(sent.length, 0);

  const wrong = await post('/users/email-setup/confirm', { verifyId: start.json.verifyId, otp: wrongOf(start.json.devOtp) }, user.token);
  assert.strictEqual(wrong.status, 400);

  const confirm = await post('/users/email-setup/confirm', { verifyId: start.json.verifyId, otp: start.json.devOtp }, user.token);
  assert.strictEqual(confirm.status, 200);
  const [[saved]] = await db.query('SELECT email FROM tbl_registration WHERE id = ?', [user.id]);
  assert.strictEqual(saved.email, address);
});

test('switch off: the value is read every time, with spaces and any letter case', async () => {
  for (const value of ['false', 'FALSE', ' False ']) {
    process.env.EMAIL_OTP_ENABLED = value;
    sent.length = 0;
    const user = await makeUser();
    const login = await post('/users/login', { phone: user.phone, password: PASSWORD });
    assert.match(login.json.devOtp, /^\d{6}$/, `value ${JSON.stringify(value)}`);
    assert.strictEqual(sent.length, 0);
  }
  // and back on, without restarting anything
  process.env.EMAIL_OTP_ENABLED = 'true';
  const user = await makeUser();
  const login = await post('/users/login', { phone: user.phone, password: PASSWORD });
  assert.strictEqual(login.json.devOtp, undefined);
  assert.strictEqual(sent.length, 1);
});

test('switch off: other answers are untouched (errors, trusted login, normal pages carry no devOtp)', async () => {
  process.env.EMAIL_OTP_ENABLED = 'false';
  const bad = await post('/users/login', { phone: '0000000000', password: 'wrong' });
  assert.ok(bad.status >= 400 && bad.status < 500);
  assert.strictEqual(bad.json && bad.json.devOtp, undefined);

  const user = await makeUser();
  const refused = await post('/users/add-account', form({ account: '9'.repeat(26) }), user.token);
  assert.strictEqual(refused.status, 400);
  assert.strictEqual(refused.json && refused.json.devOtp, undefined, 'a refused request sent no code, so none is returned');
  assert.strictEqual(sent.length, 0);
});
