// Bank account OTP (add, delete, set primary) and its activity log, over real HTTP through the
// real routers.
//
// Run with:  node --test tests/accountOtp.test.js
//
// Needs the LOCAL gaming_rewamp database with sql/20261123-new-device-login-otp.sql,
// sql/20261125-account-otp-challenge-columns.sql and sql/20261125-account-activity-log.sql applied.
// The mail sender is stubbed (nothing is sent) and every row the tests create is deleted afterwards.
// Never point it at a live database.

require('moment-timezone');
const test = require('node:test');
const assert = require('node:assert');
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
const userService = require('../services/userService');
const DeviceTrust = require('../services/deviceTrustService');

const originalFlags = { account: process.env.ACCOUNT_OTP_ENABLED, device: process.env.NEW_DEVICE_OTP_ENABLED };
const created = [];
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
    await db.query('DELETE FROM tbl_account_activity_log WHERE user_id = ?', [id]);
    await db.query('DELETE FROM tbl_login_challenge WHERE user_id = ?', [id]);
    await db.query('DELETE FROM tbl_registration WHERE id = ?', [id]);
  }
  process.env.ACCOUNT_OTP_ENABLED = originalFlags.account;
  process.env.NEW_DEVICE_OTP_ENABLED = originalFlags.device;
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => pool.end(resolve));
});

test.beforeEach(() => {
  process.env.ACCOUNT_OTP_ENABLED = 'true';
  process.env.NEW_DEVICE_OTP_ENABLED = 'true';
  sent.length = 0;
});

let counter = 0;
async function makeUser({ email, firstName = 'AcctOtpTest' } = {}) {
  counter += 1;
  const mail = email === undefined ? `acct-otp-${Date.now()}-${counter}@invalid.local` : email;
  const [ins] = await db.query(
    `INSERT INTO tbl_registration (first_name, last_name, email, password, phone, pincode, state, is_eighteen, is_verified, user_status, created, status, ip_status)
     VALUES (?, 'Throwaway', ?, 'x', ?, '000000', 'Delhi', 1, 1, 'active', NOW(), 1, 1)`,
    [firstName, mail, `3${String(Date.now()).slice(-8)}${counter}`.slice(0, 10)]
  );
  const id = ins.insertId;
  created.push(id);
  const token = jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  await db.query('UPDATE tbl_registration SET session_token = ? WHERE id = ?', [token, id]);
  return { id, token };
}

async function giveAccount(userId, { upi = 'first.user@okhdfc', number = '1234567890123456', primary = 1 } = {}) {
  const [r] = await db.query(
    `INSERT INTO tbl_user_account (user_id, bank_name, account_number, ifsc, ac_holder_name, account_type, upi_id, phone_pay, g_pay, paytm, primary_account, modified)
     VALUES (?, 'Test Bank', ?, 'TEST0001234', 'Holder', 'Savings', ?, '9000000001', '9000000001', '9000000001', ?, NOW())`,
    [userId, number, upi, primary]
  );
  return r.insertId;
}

const form = (over = {}) => ({
  holder_name: 'Test Holder', account: '9876543210987654', ifsc_code: 'TEST0004321', bank_name: 'Other Bank',
  account_type: 'Savings', addhar_number: '', upi_id: 'new.person@oksbi', phone_pay: '9111111111', g_pay: '9111111111', paytm: '9111111111',
  ...over,
});

const GEO = { 'CF-Connecting-IP': '203.0.113.9', 'CF-IPCountry': 'IN', 'CF-Region': 'Maharashtra', 'CF-IPCity': 'Pune', 'User-Agent': 'AcctTestBrowser/2.0' };

async function call(user, method, path, body, headers = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null; try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

const lastCode = () => {
  const mail = [...sent].reverse().find((m) => /Confirm your bank account change/.test(m.subject));
  const match = mail && mail.html.match(/letter-spacing: 8px[^>]*>(\d{6})</);
  return match && match[1];
};
// Alert emails go out after the response, so one can land after the next test has cleared `sent`.
// "No code sent" checks therefore look only at code emails.
const codeMails = () => sent.filter((m) => /Confirm your bank account change/.test(m.subject));
const wrongOf = (code) => (code === '111111' ? '222222' : '111111');
const accountRows = async (userId) => (await db.query('SELECT * FROM tbl_user_account WHERE user_id = ? ORDER BY ac_id', [userId]))[0];
const waitFor = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  for (;;) {
    const value = await fn();
    if (value && (!Array.isArray(value) || value.length)) return value;
    if (Date.now() > end) return value;
    await new Promise((r) => setTimeout(r, 50));
  }
};
const logRows = (userId) => waitFor(async () => (await db.query('SELECT * FROM tbl_account_activity_log WHERE user_id = ? ORDER BY id', [userId]))[0]);

test('switch off: the account is saved straight away, no code, no mail, but the log is still written', async () => {
  process.env.ACCOUNT_OTP_ENABLED = 'false';
  const user = await makeUser();
  const res = await call(user, 'POST', '/users/add-account', form(), GEO);
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await accountRows(user.id)).length, 1);
  assert.strictEqual(codeMails().length, 0);
  const rows = await logRows(user.id);
  assert.strictEqual(rows[0].step, 'completed');
  assert.strictEqual(rows[0].ip_address, '203.0.113.9');
});

test('add: first call sends a code and saves nothing; the code email never shows a full account number', async () => {
  const user = await makeUser();
  const res = await call(user, 'POST', '/users/add-account', form(), GEO);

  assert.strictEqual(res.status, 202);
  assert.strictEqual(res.json.otpRequired, true);
  assert.match(res.json.challengeId, /^[a-f0-9]{64}$/);
  assert.strictEqual((await accountRows(user.id)).length, 0, 'nothing is saved before the right code');
  assert.match(lastCode(), /^\d{6}$/);
  const html = sent[sent.length - 1].html;
  assert.ok(html.includes('ne***@oksbi') && html.includes('A/c ****7654'), 'masked hint is shown');
  assert.ok(!html.includes('9876543210987654') && !html.includes('new.person'), 'no full number or UPI in the email');
  assert.ok(html.includes('Pune, Maharashtra, IN') && html.includes('203.0.113.9'), 'location and IP are in the email');
});

test('add: wrong code, then the right code saves it, sends an alert, and logs IP, location and browser', async () => {
  const user = await makeUser();
  const first = await call(user, 'POST', '/users/add-account', form(), GEO);
  const right = lastCode();

  const wrong = await call(user, 'POST', '/users/add-account', { ...form(), challengeId: first.json.challengeId, otp: wrongOf(right) }, GEO);
  assert.strictEqual(wrong.status, 400);
  assert.match(wrong.json.message, /4 attempts left/);
  assert.strictEqual((await accountRows(user.id)).length, 0);

  const ok = await call(user, 'POST', '/users/add-account', { ...form(), challengeId: first.json.challengeId, otp: right }, GEO);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual((await accountRows(user.id)).length, 1);
  assert.ok(sent.some((m) => /Your bank account was changed/.test(m.subject)), 'alert email is sent');

  const rows = await waitFor(async () => {
    const r = await logRows(user.id);
    return r.length >= 3 ? r : null;
  });
  assert.deepStrictEqual(rows.map((r) => `${r.step}:${r.status}`), ['otp_sent:success', 'otp_failed:failed', 'completed:success']);
  const done = rows[2];
  assert.strictEqual(done.action, 'add_account');
  assert.strictEqual(done.ip_address, '203.0.113.9');
  assert.strictEqual(done.country, 'IN');
  assert.strictEqual(done.state, 'Maharashtra');
  assert.strictEqual(done.city, 'Pune');
  assert.strictEqual(done.state_source, 'cloudflare');
  assert.strictEqual(done.browser, 'AcctTestBrowser/2.0');
  assert.ok(done.ac_id, 'the saved account is referenced');
  assert.ok(!JSON.stringify(rows).includes('9876543210987654'), 'the log holds no full account number');
});

test('log: without Cloudflare state the profile state is used', async () => {
  const user = await makeUser();
  await call(user, 'POST', '/users/add-account', form(), { 'User-Agent': 'NoGeo/1.0' });
  const rows = await logRows(user.id);
  assert.strictEqual(rows[0].state, 'Delhi');
  assert.strictEqual(rows[0].state_source, 'profile');
  assert.strictEqual(rows[0].city, null);
});

test('add: a code cannot approve different details, and is spent either way', async () => {
  const user = await makeUser();
  const first = await call(user, 'POST', '/users/add-account', form(), GEO);
  const code = lastCode();

  const swapped = await call(user, 'POST', '/users/add-account', { ...form({ upi_id: 'attacker@oksbi' }), challengeId: first.json.challengeId, otp: code }, GEO);
  assert.strictEqual(swapped.status, 400);
  assert.strictEqual(swapped.json.restartOtp, true);
  assert.strictEqual((await accountRows(user.id)).length, 0);

  const again = await call(user, 'POST', '/users/add-account', { ...form(), challengeId: first.json.challengeId, otp: code }, GEO);
  assert.strictEqual(again.status, 400, 'the spent code cannot be used for the original details either');
  assert.strictEqual((await accountRows(user.id)).length, 0);
});

test('add: a used code cannot be used again', async () => {
  const user = await makeUser();
  const first = await call(user, 'POST', '/users/add-account', form(), GEO);
  const code = lastCode();
  await call(user, 'POST', '/users/add-account', { ...form(), challengeId: first.json.challengeId, otp: code }, GEO);
  await db.query('UPDATE tbl_user_account SET is_soft_deleted = 1 WHERE user_id = ?', [user.id]);
  const again = await call(user, 'POST', '/users/add-account', { ...form(), challengeId: first.json.challengeId, otp: code }, GEO);
  assert.strictEqual(again.status, 400);
  assert.strictEqual(again.json.restartOtp, true);
});

test('another user\'s code, and codes for another purpose, are refused', async () => {
  const owner = await makeUser();
  const thief = await makeUser();
  const first = await call(owner, 'POST', '/users/add-account', form(), GEO);
  const code = lastCode();

  const stolen = await call(thief, 'POST', '/users/add-account', { ...form(), challengeId: first.json.challengeId, otp: code }, GEO);
  assert.strictEqual(stolen.status, 400);
  assert.strictEqual((await accountRows(thief.id)).length, 0);

  // An add-account code used to delete an account is refused too.
  const acId = await giveAccount(owner.id, { primary: 0 });
  const wrongPurpose = await call(owner, 'POST', '/account/soft-delete', { account_id: acId, challengeId: first.json.challengeId, otp: code }, GEO);
  assert.strictEqual(wrongPurpose.status, 400);
  assert.strictEqual((await accountRows(owner.id)).find((r) => r.ac_id === acId).is_soft_deleted, 0);
});

test('a login code cannot approve a bank account change, and an account code cannot log in', async () => {
  const user = await makeUser();
  const [[row]] = await db.query('SELECT * FROM tbl_registration WHERE id = ?', [user.id]);

  const loginGate = await DeviceTrust.gate(row, { headers: { 'user-agent': 'x' }, socket: { remoteAddress: '1.1.1.1' } }, 'password');
  const loginMail = sent[sent.length - 1].html.match(/letter-spacing: 8px[^>]*>(\d{6})</)[1];
  const viaAccount = await call(user, 'POST', '/users/add-account', { ...form(), challengeId: loginGate.challengeId, otp: loginMail }, GEO);
  assert.strictEqual(viaAccount.status, 400);
  assert.strictEqual((await accountRows(user.id)).length, 0);

  const acctStart = await call(user, 'POST', '/users/add-account', form(), GEO);
  await assert.rejects(
    userService.completeDeviceLogin(acctStart.json.challengeId, lastCode(), { headers: { 'user-agent': 'x' }, socket: { remoteAddress: '1.1.1.1' } }),
    (e) => e.restartLogin === true
  );
});

test('a burst of 40 simultaneous wrong guesses is capped at 5', async () => {
  const user = await makeUser();
  const first = await call(user, 'POST', '/users/add-account', form(), GEO);
  const right = lastCode();
  const guesses = Array.from({ length: 40 }, (_, i) => String(300000 + i * 7)).filter((g) => g !== right);

  await Promise.all(guesses.map((g) => call(user, 'POST', '/users/add-account', { ...form(), challengeId: first.json.challengeId, otp: g }, GEO)));

  const [[row]] = await db.query('SELECT attempts FROM tbl_login_challenge WHERE user_id = ?', [user.id]);
  assert.strictEqual(row.attempts, 5);
  const late = await call(user, 'POST', '/users/add-account', { ...form(), challengeId: first.json.challengeId, otp: right }, GEO);
  assert.strictEqual(late.status, 400);
  assert.strictEqual((await accountRows(user.id)).length, 0);
});

test('resend: too soon is 429, then a new code replaces the old one', async () => {
  const user = await makeUser();
  const first = await call(user, 'POST', '/users/add-account', form(), GEO);
  const oldCode = lastCode();

  assert.strictEqual((await call(user, 'POST', '/account/otp/resend', { challengeId: first.json.challengeId }, GEO)).status, 429);

  await db.query('UPDATE tbl_login_challenge SET last_sent_at = DATE_SUB(NOW(), INTERVAL 2 MINUTE) WHERE user_id = ?', [user.id]);
  const resent = await call(user, 'POST', '/account/otp/resend', { challengeId: first.json.challengeId }, GEO);
  assert.strictEqual(resent.status, 200);
  const newCode = lastCode();
  if (newCode !== oldCode) {
    const old = await call(user, 'POST', '/users/add-account', { ...form(), challengeId: first.json.challengeId, otp: oldCode }, GEO);
    assert.match(old.json.message, /Incorrect code/);
  }
  const ok = await call(user, 'POST', '/users/add-account', { ...form(), challengeId: first.json.challengeId, otp: newCode }, GEO);
  assert.strictEqual(ok.status, 200);

  const stranger = await makeUser();
  assert.strictEqual((await call(stranger, 'POST', '/account/otp/resend', { challengeId: first.json.challengeId }, GEO)).status, 400);
});

test('add: an expired code is refused', async () => {
  const user = await makeUser();
  const first = await call(user, 'POST', '/users/add-account', form(), GEO);
  await db.query('UPDATE tbl_login_challenge SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE user_id = ?', [user.id]);
  const res = await call(user, 'POST', '/users/add-account', { ...form(), challengeId: first.json.challengeId, otp: lastCode() }, GEO);
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.json.restartOtp, true);
});

test('add: junk input is refused cleanly and does not burn the real code', async () => {
  const user = await makeUser();
  const first = await call(user, 'POST', '/users/add-account', form(), GEO);
  for (const bad of [{ challengeId: { $ne: 1 }, otp: ['1'] }, { challengeId: 'x', otp: '123456' }, { challengeId: first.json.challengeId, otp: 'abcdef' }]) {
    const res = await call(user, 'POST', '/users/add-account', { ...form(), ...bad }, GEO);
    assert.ok(res.status >= 400 && res.status < 500, `status ${res.status}`);
  }
  const [[row]] = await db.query('SELECT attempts FROM tbl_login_challenge WHERE user_id = ?', [user.id]);
  assert.strictEqual(row.attempts, 0);
  const ok = await call(user, 'POST', '/users/add-account', { ...form(), challengeId: first.json.challengeId, otp: lastCode() }, GEO);
  assert.strictEqual(ok.status, 200);
});

test('add: a user who already has an account can add another, with a code (the one-account rule is lifted)', async () => {
  const user = await makeUser();
  await giveAccount(user.id);
  const first = await call(user, 'POST', '/users/add-account', form(), GEO);
  assert.strictEqual(first.status, 202);
  assert.strictEqual(codeMails().length, 1);
  assert.strictEqual((await accountRows(user.id)).length, 1, 'nothing is saved before the code');
  const ok = await call(user, 'POST', '/users/add-account', { ...form(), challengeId: first.json.challengeId, otp: lastCode() }, GEO);
  assert.strictEqual(ok.status, 200);
  const rows = await accountRows(user.id);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows.filter((r) => r.primary_account === 1).length, 1, 'only one primary account');
});

test('delete: first call sends a code and deletes nothing; the right code deletes; a primary account is refused up front', async () => {
  const user = await makeUser();
  const primary = await giveAccount(user.id, { primary: 1, upi: 'main@okhdfc' });
  const extra = await giveAccount(user.id, { primary: 0, upi: 'extra@okicici', number: '5555666677778888' });

  const refused = await call(user, 'POST', '/account/soft-delete', { account_id: primary }, GEO);
  assert.strictEqual(refused.status, 400);
  assert.strictEqual(codeMails().length, 0, 'no code is sent for a primary account');

  const first = await call(user, 'POST', '/account/soft-delete', { account_id: extra }, GEO);
  assert.strictEqual(first.status, 202);
  assert.strictEqual((await accountRows(user.id)).find((r) => r.ac_id === extra).is_soft_deleted, 0);
  assert.ok(sent[sent.length - 1].html.includes('ex***@okicici'));

  const other = await call(user, 'POST', '/account/soft-delete', { account_id: primary, challengeId: first.json.challengeId, otp: lastCode() }, GEO);
  assert.strictEqual(other.status, 400, 'a code for one account does not delete another');

  const first2 = await call(user, 'POST', '/account/soft-delete', { account_id: extra }, GEO);
  const ok = await call(user, 'POST', '/account/soft-delete', { account_id: extra, challengeId: first2.json.challengeId, otp: lastCode() }, GEO);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual((await accountRows(user.id)).find((r) => r.ac_id === extra).is_soft_deleted, 1);

  const rows = await waitFor(async () => {
    const r = await logRows(user.id);
    return r.some((x) => x.step === 'completed') ? r : null;
  });
  assert.ok(rows.some((r) => r.action === 'delete_account' && r.step === 'completed' && r.ac_id === extra));
});

test('set primary: first call sends a code and changes nothing; the right code changes it', async () => {
  const user = await makeUser();
  const first = await giveAccount(user.id, { primary: 1 });
  const second = await giveAccount(user.id, { primary: 0, upi: 'second@okaxis' });

  const start = await call(user, 'POST', '/account/change-primary', { account_id: second }, GEO);
  assert.strictEqual(start.status, 202);
  assert.strictEqual((await accountRows(user.id)).find((r) => r.ac_id === first).primary_account, 1);

  const ok = await call(user, 'POST', '/account/change-primary', { account_id: second, challengeId: start.json.challengeId, otp: lastCode() }, GEO);
  assert.strictEqual(ok.status, 200);
  const rows = await accountRows(user.id);
  assert.strictEqual(rows.find((r) => r.ac_id === second).primary_account, 1);
  assert.strictEqual(rows.find((r) => r.ac_id === first).primary_account, 0);

  const missing = await call(user, 'POST', '/account/change-primary', { account_id: 999999999 }, GEO);
  assert.strictEqual(missing.status, 404);
});

test('an account that is not yours cannot get a code', async () => {
  const owner = await makeUser();
  const stranger = await makeUser();
  const acId = await giveAccount(owner.id, { primary: 0 });
  const res = await call(stranger, 'POST', '/account/soft-delete', { account_id: acId }, GEO);
  assert.ok(res.status === 404 || res.status === 400);
  assert.strictEqual(codeMails().length, 0);
});

test('a user with no email cannot be sent a code (and nothing is saved)', async () => {
  const user = await makeUser({ email: '' });
  const res = await call(user, 'POST', '/users/add-account', form(), GEO);
  assert.strictEqual(res.status, 403);
  assert.strictEqual((await accountRows(user.id)).length, 0);
});

test('the code email escapes HTML in the name', async () => {
  const user = await makeUser({ firstName: '<script>alert(1)</script>' });
  await call(user, 'POST', '/users/add-account', form(), { ...GEO, 'User-Agent': '"><img src=x onerror=alert(2)>' });
  const html = sent[sent.length - 1].html;
  assert.ok(!html.includes('<script>') && !html.includes('<img src=x'));
});

test('add: values longer than the column sizes, or not text, are refused before any code is emailed', async () => {
  const user = await makeUser();
  const tooLong = [
    { account: '9'.repeat(26) },
    { ifsc_code: 'I'.repeat(26) },
    { holder_name: 'h'.repeat(201) },
    { bank_name: 'b'.repeat(101) },
    { upi_id: `${'u'.repeat(150)}@okhdfc` },
    { paytm: '9'.repeat(151) },
  ];
  for (const bad of tooLong) {
    const res = await call(user, 'POST', '/users/add-account', form(bad), GEO);
    assert.strictEqual(res.status, 400, `${Object.keys(bad)[0]} too long: status ${res.status}`);
  }
  for (const bad of [{ holder_name: { a: 1 } }, { holder_name: ['x'] }, { account: 123456789012 }, { upi_id: null }]) {
    const res = await call(user, 'POST', '/users/add-account', form(bad), GEO);
    assert.strictEqual(res.status, 400, `${JSON.stringify(bad)}: status ${res.status}`);
  }
  assert.strictEqual(codeMails().length, 0, 'no code is emailed for details that cannot be saved');
  assert.strictEqual((await accountRows(user.id)).length, 0);

  const exactlyMax = await call(user, 'POST', '/users/add-account', form({ account: '9'.repeat(25), holder_name: 'h'.repeat(200) }), GEO);
  assert.strictEqual(exactlyMax.status, 202, 'values exactly at the column size are fine');
});

test('delete and set primary: an account_id that is not a whole number is refused with 400, switch on or off', async () => {
  for (const flag of ['true', 'false']) {
    process.env.ACCOUNT_OTP_ENABLED = flag;
    sent.length = 0;
    const user = await makeUser();
    const low = await giveAccount(user.id, { primary: 0, upi: 'low@okaxis', number: '2222333344445555' });
    const high = await giveAccount(user.id, { primary: 1, upi: 'high@okhdfc' });

    for (const bad of [{ ac_id: 1 }, [low], { 0: 1 }, 'abc', '1 OR 1=1', -5, 0, 1.5, true]) {
      for (const path of ['/account/soft-delete', '/account/change-primary']) {
        const res = await call(user, 'POST', path, { account_id: bad }, GEO);
        assert.strictEqual(res.status, 400, `flag ${flag} ${path} ${JSON.stringify(bad)}: status ${res.status}`);
      }
    }
    const rows = await accountRows(user.id);
    assert.ok(rows.every((r) => r.is_soft_deleted === 0), 'nothing was deleted');
    assert.strictEqual(rows.find((r) => r.ac_id === high).primary_account, 1, 'the primary account is untouched');
    assert.strictEqual(codeMails().length, 0, 'no code is emailed for a bad id');
  }
});

test('delete and set primary: an account number that does not exist is a 404, not a 500', async () => {
  for (const flag of ['true', 'false']) {
    process.env.ACCOUNT_OTP_ENABLED = flag;
    const user = await makeUser();
    await giveAccount(user.id, { primary: 1 });
    for (const path of ['/account/soft-delete', '/account/change-primary']) {
      const res = await call(user, 'POST', path, { account_id: 987654321 }, GEO);
      assert.strictEqual(res.status, 404, `flag ${flag} ${path}: status ${res.status}`);
    }
  }
});

test('a numeric string account_id still works', async () => {
  process.env.ACCOUNT_OTP_ENABLED = 'false';
  const user = await makeUser();
  await giveAccount(user.id, { primary: 1 });
  const extra = await giveAccount(user.id, { primary: 0, upi: 'extra@okicici' });
  const res = await call(user, 'POST', '/account/soft-delete', { account_id: String(extra) }, GEO);
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await accountRows(user.id)).find((r) => r.ac_id === extra).is_soft_deleted, 1);
});
