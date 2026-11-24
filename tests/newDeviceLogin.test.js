// New-device login check (email OTP for a browser the account has not used before).
//
// Run with:  node --test tests/newDeviceLogin.test.js
//
// Needs the LOCAL gaming_rewamp database with sql/20261123-new-device-login-otp.sql applied.
// It calls the services directly (no HTTP server), stubs the mail sender so no email is sent,
// and creates throwaway users that it deletes afterwards. Never point it at a live database.

require('moment-timezone');
const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcrypt');
require('dotenv').config();
process.env.RATE_LIMIT_DISABLED = 'true'; // the HTTP test makes several logins from one IP

// helpers/sendMail exits the process when SMTP settings are missing and would send real mail
// otherwise, so the tests replace it before any service loads it.
const sent = [];
const sendMailPath = require.resolve('../helpers/sendMail');
require.cache[sendMailPath] = {
  id: sendMailPath, filename: sendMailPath, loaded: true,
  exports: async (to, subject, html) => { sent.push({ to, subject, html }); },
};

const pool = require('../config/database');
const db = pool.promise();
const userService = require('../services/userService');
const DeviceTrust = require('../services/deviceTrustService');

const originalFlag = process.env.NEW_DEVICE_OTP_ENABLED;
const createdUsers = [];

test.after(async () => {
  for (const id of createdUsers) {
    await db.query('DELETE FROM tbl_user_trusted_device WHERE user_id = ?', [id]);
    await db.query('DELETE FROM tbl_login_challenge WHERE user_id = ?', [id]);
    await db.query('DELETE FROM tbl_registration WHERE id = ?', [id]);
  }
  process.env.NEW_DEVICE_OTP_ENABLED = originalFlag;
  await new Promise((resolve) => pool.end(resolve));
});

test.beforeEach(() => {
  process.env.NEW_DEVICE_OTP_ENABLED = 'true';
  sent.length = 0;
});

const PASSWORD = 'Test@12345';
let counter = 0;

async function makeUser(overrides = {}) {
  counter += 1;
  const phone = `8${String(Date.now()).slice(-8)}${counter}`.slice(0, 10);
  const email = overrides.email === undefined ? `devicetest-${Date.now()}-${counter}@invalid.local` : overrides.email;
  const hash = await bcrypt.hash(PASSWORD, 4);
  const [ins] = await db.query(
    `INSERT INTO tbl_registration
     (first_name, last_name, email, password, phone, pincode, is_eighteen, is_verified, user_status, created, status, ip_status)
     VALUES ('DeviceTest', 'Throwaway', ?, ?, ?, '000000', 1, 1, 'active', NOW(), ?, 1)`,
    [email, hash, phone, overrides.status === undefined ? 1 : overrides.status]
  );
  createdUsers.push(ins.insertId);
  return { id: ins.insertId, phone };
}

const makeReq = (deviceId, ip = '203.0.113.7') => ({
  headers: { 'user-agent': 'TestBrowser/1.0', ...(deviceId ? { 'x-device-id': deviceId } : {}) },
  socket: { remoteAddress: ip },
  connection: { remoteAddress: ip },
});

const login = (user, req) => userService.loginUser(req, { phone: user.phone, password: PASSWORD });
const lastCode = () => {
  const match = sent[sent.length - 1].html.match(/letter-spacing: 8px[^>]*>(\d{6})</);
  return match && match[1];
};
const sessionToken = async (id) => (await db.query('SELECT session_token FROM tbl_registration WHERE id = ?', [id]))[0][0].session_token;

test('feature off: login works exactly as before, no OTP', async () => {
  process.env.NEW_DEVICE_OTP_ENABLED = 'false';
  const user = await makeUser();
  const result = await login(user, makeReq());
  assert.ok(result.newAccessToken, 'a session is issued');
  assert.strictEqual(result.otpRequired, undefined);
  assert.strictEqual(sent.length, 0);
});

test('new device: no session is issued, the old session survives, a 6-digit code is emailed', async () => {
  const user = await makeUser();
  await db.query("UPDATE tbl_registration SET session_token = 'existing-session' WHERE id = ?", [user.id]);

  const result = await login(user, makeReq());

  assert.strictEqual(result.otpRequired, true);
  assert.match(result.challengeId, /^[a-f0-9]{64}$/);
  assert.strictEqual(result.newAccessToken, undefined);
  assert.strictEqual(await sessionToken(user.id), 'existing-session', 'the real user is not logged out by someone else\'s attempt');
  assert.strictEqual(sent.length, 1);
  assert.match(lastCode(), /^\d{6}$/);
  assert.ok(!result.maskedEmail.includes('devicetest'), 'the email is masked');
});

test('login emails show only the IP address and a short browser name', async () => {
  const user = await makeUser();
  const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36 Edg/157.0.0.0';
  const req = makeReq(undefined, '203.0.113.50');
  req.headers['user-agent'] = chrome;

  const first = await login(user, req);
  const codeMail = sent[sent.length - 1].html;
  assert.ok(codeMail.includes('IP address: 203.0.113.50') && codeMail.includes('Browser: Edge on Windows'), 'code email: IP and short browser name');
  assert.ok(!codeMail.includes('Mozilla') && !codeMail.includes('AppleWebKit'), 'no raw browser text in the code email');

  await userService.completeDeviceLogin(first.challengeId, lastCode(), req);
  let alert;
  for (let i = 0; i < 60 && !alert; i++) {
    alert = sent.find((m) => /New device login/.test(m.subject));
    if (!alert) await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok(alert, 'the alert email is sent');
  assert.ok(alert.html.includes('IP address: 203.0.113.50') && alert.html.includes('Browser: Edge on Windows'), 'alert email: IP and short browser name');
  assert.ok(!alert.html.includes('Mozilla'), 'no raw browser text in the alert email');
  const [[stored]] = await db.query('SELECT browser FROM tbl_login_challenge WHERE user_id = ? ORDER BY id DESC LIMIT 1', [user.id]);
  assert.strictEqual(stored.browser, chrome, 'the full browser text is still stored in the table');
});

test('correct code: session issued, device trusted, next login skips the OTP, code is single use', async () => {
  const user = await makeUser();
  const first = await login(user, makeReq());
  const code = lastCode();

  const done = await userService.completeDeviceLogin(first.challengeId, code, makeReq());
  assert.ok(done.accessToken);
  assert.match(done.deviceId, /^[a-f0-9]{64}$/);
  assert.strictEqual(await sessionToken(user.id), done.accessToken);
  assert.ok(sent.some((m) => /New device login/.test(m.subject)), 'the new-device alert is emailed');

  await assert.rejects(
    userService.completeDeviceLogin(first.challengeId, code, makeReq()),
    (e) => e.statusCode === 400 && e.restartLogin === true
  );

  sent.length = 0;
  const again = await login(user, makeReq(done.deviceId));
  assert.ok(again.newAccessToken, 'a trusted device logs in directly');
  assert.strictEqual(sent.length, 0);
});

test('another user\'s device id does not make this device trusted', async () => {
  const userA = await makeUser();
  const userB = await makeUser();
  const a = await login(userA, makeReq());
  const { deviceId } = await userService.completeDeviceLogin(a.challengeId, lastCode(), makeReq());

  const b = await login(userB, makeReq(deviceId));
  assert.strictEqual(b.otpRequired, true);
});

test('wrong codes are counted and the fifth kills the challenge, even for the right code', async () => {
  const user = await makeUser();
  const first = await login(user, makeReq());
  const right = lastCode();
  const wrong = right === '123456' ? '654321' : '123456';

  await assert.rejects(userService.completeDeviceLogin(first.challengeId, wrong, makeReq()), /4 attempts left/);
  for (let i = 0; i < 3; i++) {
    await assert.rejects(userService.completeDeviceLogin(first.challengeId, wrong, makeReq()), /Incorrect code/);
  }
  await assert.rejects(
    userService.completeDeviceLogin(first.challengeId, wrong, makeReq()),
    (e) => e.restartLogin === true
  );
  await assert.rejects(
    userService.completeDeviceLogin(first.challengeId, right, makeReq()),
    (e) => e.restartLogin === true,
    'the right code no longer works after too many wrong ones'
  );
});

test('a burst of simultaneous wrong guesses is capped at 5 evaluations', async () => {
  const user = await makeUser();
  const first = await login(user, makeReq());
  const right = lastCode();
  const guesses = Array.from({ length: 40 }, (_, i) => String(300000 + i * 7)).filter((g) => g !== right);

  const outcomes = await Promise.all(guesses.map((g) =>
    userService.completeDeviceLogin(first.challengeId, g, makeReq()).then(() => 'ok', (e) => (/Incorrect code/.test(e.message) ? 'evaluated' : 'rejected'))
  ));

  assert.ok(outcomes.filter((o) => o === 'evaluated').length <= 4, 'at most 4 "incorrect" answers plus the final kill');
  const [[row]] = await db.query('SELECT attempts FROM tbl_login_challenge WHERE user_id = ?', [user.id]);
  assert.strictEqual(row.attempts, 5, 'exactly 5 guesses were counted, never more');
  await assert.rejects(userService.completeDeviceLogin(first.challengeId, right, makeReq()), (e) => e.restartLogin === true);
});

test('an expired challenge is refused', async () => {
  const user = await makeUser();
  const first = await login(user, makeReq());
  await db.query('UPDATE tbl_login_challenge SET expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE user_id = ?', [user.id]);

  await assert.rejects(
    userService.completeDeviceLogin(first.challengeId, lastCode(), makeReq()),
    (e) => e.restartLogin === true
  );
});

test('bad input is rejected before touching the database', async () => {
  await assert.rejects(userService.completeDeviceLogin('nope', '123456', makeReq()), /6-digit/);
  await assert.rejects(userService.completeDeviceLogin('a'.repeat(64), '12', makeReq()), /6-digit/);
  await assert.rejects(userService.completeDeviceLogin('a'.repeat(64), '123456', makeReq()), (e) => e.restartLogin === true);
});

test('resend: too soon is refused, then a new code replaces the old one, and resends are capped', async () => {
  const user = await makeUser();
  const first = await login(user, makeReq());
  const oldCode = lastCode();

  await assert.rejects(userService.resendLoginOtp(first.challengeId), (e) => e.statusCode === 429);

  await db.query('UPDATE tbl_login_challenge SET last_sent_at = DATE_SUB(NOW(), INTERVAL 2 MINUTE) WHERE user_id = ?', [user.id]);
  await userService.resendLoginOtp(first.challengeId);
  const newCode = lastCode();
  assert.strictEqual(sent.length, 2);

  if (newCode !== oldCode) {
    await assert.rejects(userService.completeDeviceLogin(first.challengeId, oldCode, makeReq()), /Incorrect code/);
  }

  for (let i = 0; i < 2; i++) {
    await db.query('UPDATE tbl_login_challenge SET last_sent_at = DATE_SUB(NOW(), INTERVAL 2 MINUTE) WHERE user_id = ?', [user.id]);
    await userService.resendLoginOtp(first.challengeId);
  }
  await db.query('UPDATE tbl_login_challenge SET last_sent_at = DATE_SUB(NOW(), INTERVAL 2 MINUTE) WHERE user_id = ?', [user.id]);
  await assert.rejects(userService.resendLoginOtp(first.challengeId), (e) => e.restartLogin === true);
});

test('Google login uses the same check and finishes as a Google login', async () => {
  const user = await makeUser();
  const [[row]] = await db.query('SELECT * FROM tbl_registration WHERE id = ?', [user.id]);

  const pending = await userService.issueGoogleSession(row, makeReq());
  assert.strictEqual(pending.otpRequired, true);
  assert.strictEqual(pending.accessToken, undefined);

  const done = await userService.completeDeviceLogin(pending.challengeId, lastCode(), makeReq());
  assert.strictEqual(done.msg, 'Google login successful!');

  const trusted = await userService.issueGoogleSession(row, makeReq(done.deviceId));
  assert.ok(trusted.accessToken, 'the trusted browser logs in with Google directly');
});

test('registration trusts the registering browser; a different browser still needs the OTP', async () => {
  const user = await makeUser();
  const deviceId = await DeviceTrust.trustNewDevice(user.id, makeReq());
  assert.match(deviceId, /^[a-f0-9]{64}$/);

  assert.ok((await login(user, makeReq(deviceId))).newAccessToken);
  assert.strictEqual((await login(user, makeReq())).otpRequired, true);
});

test('password reset clears every trusted device; a self password change keeps only the current one', async () => {
  const user = await makeUser();
  const keep = await DeviceTrust.trustNewDevice(user.id, makeReq());
  const other = await DeviceTrust.trustNewDevice(user.id, makeReq());

  await userService.changeUserPassword('New@Pass123', user.id, makeReq(keep));
  const [rows] = await db.query('SELECT COUNT(*) AS n FROM tbl_user_trusted_device WHERE user_id = ?', [user.id]);
  assert.strictEqual(rows[0].n, 1, 'only the browser the password was changed on stays trusted');

  await DeviceTrust.clearAllForUser(user.id);
  const [after] = await db.query('SELECT COUNT(*) AS n FROM tbl_user_trusted_device WHERE user_id = ?', [user.id]);
  assert.strictEqual(after[0].n, 0);
  assert.ok(other);
});

test('a user blocked after the code was sent cannot finish the login', async () => {
  const user = await makeUser();
  const first = await login(user, makeReq());
  await db.query('UPDATE tbl_registration SET status = 0 WHERE id = ?', [user.id]);

  await assert.rejects(
    userService.completeDeviceLogin(first.challengeId, lastCode(), makeReq()),
    (e) => e.statusCode === 403
  );
});

test('an account with no email cannot get a session from an unknown device', async () => {
  const user = await makeUser({ email: '' });
  await assert.rejects(login(user, makeReq()), (e) => e.statusCode === 403);
});

test('HTTP: 202 with a challenge, then verify-otp returns the session and device id', async () => {
  const express = require('express');
  const app = express();
  app.use('/api/users', require('../routes/userRouter'));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/users`;
  const post = (path, body, headers = {}) =>
    fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

  try {
    const user = await makeUser();
    const loginRes = await post('/login', { phone: user.phone, password: PASSWORD });
    const pending = await loginRes.json();
    assert.strictEqual(loginRes.status, 202);
    assert.strictEqual(pending.otpRequired, true);
    assert.match(pending.challengeId, /^[a-f0-9]{64}$/);
    assert.strictEqual(pending.newAccessToken, undefined);
    assert.strictEqual(loginRes.headers.get('set-cookie'), null, 'no refresh token is set before the OTP');

    const wrong = await post('/login/verify-otp', { challengeId: pending.challengeId, otp: lastCode() === '000000' ? '111111' : '000000' });
    assert.strictEqual(wrong.status, 400);

    const verified = await post('/login/verify-otp', { challengeId: pending.challengeId, otp: lastCode() });
    const session = await verified.json();
    assert.strictEqual(verified.status, 200);
    assert.ok(session.newAccessToken && session.accessToken);
    assert.match(session.deviceId, /^[a-f0-9]{64}$/);
    assert.match(verified.headers.get('set-cookie') || '', /refreshToken=/);

    const trusted = await post('/login', { phone: user.phone, password: PASSWORD }, { 'X-Device-Id': session.deviceId });
    assert.strictEqual(trusted.status, 200);
    assert.ok((await trusted.json()).newAccessToken);

    const garbage = await post('/login/verify-otp', { challengeId: { $ne: 1 }, otp: ['1'] });
    assert.strictEqual(garbage.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('device ids that are not 64 hex characters are ignored', async () => {
  const user = await makeUser();
  const result = await login(user, makeReq('not-a-device-id'));
  assert.strictEqual(result.otpRequired, true);
});

test('masked email shows the first letter and the last three letters of the name', () => {
  assert.strictEqual(DeviceTrust.maskEmail('saket@gmail.com'), 's*ket@gmail.com');
  assert.strictEqual(DeviceTrust.maskEmail('saketsingh6996@gmail.com'), 's******996@gmail.com');
  assert.strictEqual(DeviceTrust.maskEmail('abc@x.com'), 'a**@x.com', 'a short name is not shown almost whole');
  assert.strictEqual(DeviceTrust.maskEmail('nodomain'), '***');
});
