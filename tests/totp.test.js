// Google Authenticator (TOTP) for the new-device login.
//
// Run with:  node --test tests/totp.test.js
//
// Needs the LOCAL gaming_rewamp database with sql/20261123-new-device-login-otp.sql,
// sql/20261125-account-otp-challenge-columns.sql and sql/20261126-totp.sql applied.
// It calls the services directly (no HTTP server), stubs the mail sender so no email is sent,
// and creates throwaway users that it deletes afterwards. Never point it at a live database.

require('moment-timezone');
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
require('dotenv').config();
process.env.RATE_LIMIT_DISABLED = 'true';
process.env.TOTP_ENC_KEY = process.env.TOTP_ENC_KEY || crypto.randomBytes(32).toString('hex');

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
const Totp = require('../services/totpService');

const originalFlag = process.env.NEW_DEVICE_OTP_ENABLED;
const createdUsers = [];

test.after(async () => {
  for (const id of createdUsers) {
    await db.query('DELETE FROM tbl_user_trusted_device WHERE user_id = ?', [id]);
    await db.query('DELETE FROM tbl_login_challenge WHERE user_id = ?', [id]);
    await db.query('DELETE FROM tbl_user_totp WHERE user_id = ?', [id]);
    await db.query('DELETE FROM tbl_user_backup_code WHERE user_id = ?', [id]);
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

async function makeUser() {
  counter += 1;
  const phone = `7${String(Date.now()).slice(-8)}${counter}`.slice(0, 10);
  const hash = await bcrypt.hash(PASSWORD, 4);
  const [ins] = await db.query(
    `INSERT INTO tbl_registration
     (first_name, last_name, email, password, phone, pincode, is_eighteen, is_verified, user_status, created, status, ip_status)
     VALUES ('TotpTest', 'Throwaway', ?, ?, ?, '000000', 1, 1, 'active', NOW(), 1, 1)`,
    [`totptest-${Date.now()}-${counter}@invalid.local`, hash, phone]
  );
  createdUsers.push(ins.insertId);
  return { id: ins.insertId, phone };
}

const makeReq = (deviceId, ip = '203.0.113.9') => ({
  headers: { 'user-agent': 'TestBrowser/1.0', ...(deviceId ? { 'x-device-id': deviceId } : {}) },
  socket: { remoteAddress: ip },
  connection: { remoteAddress: ip },
});

const login = (user, req) => userService.loginUser(req, { phone: user.phone, password: PASSWORD });

// The 6-digit code the app would show, for a step relative to now (-1, 0, +1).
const appCode = (secret, offset = 0) => Totp.hotp(decode32(secret), Totp.currentStep() + offset);
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function decode32(text) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of text.toUpperCase()) {
    value = (value << 5) | BASE32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

// Turns Authenticator on for a user; uses the previous step for the first code so later steps are free.
async function enrol(user) {
  const { secret } = await Totp.beginSetup(user.id, 'test');
  const { backupCodes } = await Totp.confirmEnable(user.id, appCode(secret, -1));
  return { secret, backupCodes };
}

test('RFC 6238 test vector', () => {
  assert.strictEqual(Totp.hotp(Buffer.from('12345678901234567890'), Math.floor(59 / 30)), '287082');
});

test('secret is stored encrypted, never in plain text', async () => {
  const user = await makeUser();
  const { secret } = await Totp.beginSetup(user.id, 'x');
  const [[row]] = await db.query('SELECT secret_enc FROM tbl_user_totp WHERE user_id = ?', [user.id]);
  assert.ok(!row.secret_enc.includes(secret));
  assert.strictEqual(Totp.decrypt(row.secret_enc), secret);
});

test('setup is not on until the first correct code; wrong code does not enable it', async () => {
  const user = await makeUser();
  const { secret } = await Totp.beginSetup(user.id, 'x');
  assert.strictEqual((await Totp.status(user.id)).enabled, false);
  await assert.rejects(Totp.confirmEnable(user.id, '000000'), (e) => e.statusCode === 400);
  assert.strictEqual((await Totp.status(user.id)).enabled, false);

  const { backupCodes } = await Totp.confirmEnable(user.id, appCode(secret, -1));
  assert.strictEqual(backupCodes.length, 8);
  assert.deepStrictEqual(await Totp.status(user.id), { enabled: true, backupCodesLeft: 8 });
  await assert.rejects(Totp.beginSetup(user.id, 'x'), (e) => e.statusCode === 409);
});

test('user without Authenticator still gets the emailed code', async () => {
  const user = await makeUser();
  const result = await login(user, makeReq());
  assert.strictEqual(result.otpRequired, true);
  assert.strictEqual(result.method, 'email');
  assert.strictEqual(sent.length, 1);
});

test('Authenticator user: new device asks for the app code, no email is sent, login completes', async () => {
  const user = await makeUser();
  const { secret } = await enrol(user);
  sent.length = 0;

  const first = await login(user, makeReq());
  assert.strictEqual(first.otpRequired, true);
  assert.strictEqual(first.method, 'totp');
  assert.strictEqual(sent.length, 0, 'no code is emailed');

  const done = await userService.completeDeviceLogin(first.challengeId, appCode(secret, 0), makeReq());
  assert.ok(done.accessToken);
  assert.match(done.deviceId, /^[a-f0-9]{64}$/);

  sent.length = 0;
  const again = await login(user, makeReq(done.deviceId));
  assert.ok(again.newAccessToken, 'a trusted device logs in directly');
});

test('an app code cannot be used twice (replay)', async () => {
  const user = await makeUser();
  const { secret } = await enrol(user);
  const code = appCode(secret, 0);

  const a = await login(user, makeReq());
  await userService.completeDeviceLogin(a.challengeId, code, makeReq());

  const b = await login(user, makeReq());
  await assert.rejects(userService.completeDeviceLogin(b.challengeId, code, makeReq()), (e) => e.statusCode === 400);
});

test('wrong codes are counted; the fifth ends the challenge even for the right code', async () => {
  const user = await makeUser();
  const { secret } = await enrol(user);
  const first = await login(user, makeReq());
  const right = appCode(secret, 0);
  const wrong = right === '123456' ? '654321' : '123456';

  for (let i = 0; i < 4; i++) {
    await assert.rejects(userService.completeDeviceLogin(first.challengeId, wrong, makeReq()), (e) => e.statusCode === 400);
  }
  await assert.rejects(userService.completeDeviceLogin(first.challengeId, wrong, makeReq()), (e) => e.restartLogin === true);
  await assert.rejects(userService.completeDeviceLogin(first.challengeId, right, makeReq()), (e) => e.restartLogin === true);
});

test('a backup code works once', async () => {
  const user = await makeUser();
  const { backupCodes } = await enrol(user);

  const a = await login(user, makeReq());
  const done = await userService.completeDeviceLogin(a.challengeId, backupCodes[0], makeReq());
  assert.ok(done.accessToken);
  assert.strictEqual((await Totp.status(user.id)).backupCodesLeft, 7);

  const b = await login(user, makeReq());
  await assert.rejects(userService.completeDeviceLogin(b.challengeId, backupCodes[0], makeReq()), (e) => e.statusCode === 400);
});

test('another user\'s backup code does not work', async () => {
  const a = await makeUser();
  const b = await makeUser();
  const { backupCodes } = await enrol(a);
  await enrol(b);

  const challenge = await login(b, makeReq());
  await assert.rejects(userService.completeDeviceLogin(challenge.challengeId, backupCodes[0], makeReq()), (e) => e.statusCode === 400);
});

test('there is nothing to resend for an Authenticator challenge', async () => {
  const user = await makeUser();
  await enrol(user);
  const first = await login(user, makeReq());
  await assert.rejects(userService.resendLoginOtp(first.challengeId), (e) => e.statusCode === 400);
});

test('a challenge for a bank account change cannot be used to log in with an app code', async () => {
  const user = await makeUser();
  const { secret } = await enrol(user);
  const challengeId = crypto.randomBytes(32).toString('hex');
  await db.query(
    `INSERT INTO tbl_login_challenge (challenge_hash, user_id, auth_method, purpose, otp_hash, last_sent_at, expires_at)
     VALUES (?, ?, 'account', 'add_account', ?, NOW(), DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
    [crypto.createHash('sha256').update(challengeId).digest('hex'), user.id, 'a'.repeat(64)]
  );
  await assert.rejects(userService.completeDeviceLogin(challengeId, appCode(secret, 0), makeReq()), (e) => e.statusCode === 400);
});

test('turning Authenticator off returns the user to the emailed code', async () => {
  const user = await makeUser();
  await enrol(user);
  await Totp.disable(user.id);
  assert.strictEqual((await Totp.status(user.id)).enabled, false);

  sent.length = 0;
  const result = await login(user, makeReq());
  assert.strictEqual(result.method, 'email');
  assert.strictEqual(sent.length, 1);
});

test('Authenticator is not used when the new-device check itself is off', async () => {
  const user = await makeUser();
  await enrol(user);
  process.env.NEW_DEVICE_OTP_ENABLED = 'false';
  const result = await login(user, makeReq());
  assert.ok(result.newAccessToken);
});

test('turning Authenticator on or off emails the owner', async () => {
  const user = await makeUser();
  const [owner] = await db.query('SELECT * FROM tbl_registration WHERE id = ?', [user.id]);
  DeviceTrust.sendAuthenticatorAlert(owner[0], makeReq(), 'on');
  DeviceTrust.sendAuthenticatorAlert(owner[0], makeReq(), 'off');
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(sent.some((m) => /turned on/.test(m.subject)));
  assert.ok(sent.some((m) => /turned off/.test(m.subject)));
});

test('email code stays until Authenticator is on: no setup step at login, the emailed code logs in', async () => {
  const user = await makeUser();
  const first = await login(user, makeReq());
  assert.strictEqual(first.method, 'email');
  const code = sent[sent.length - 1].html.match(/letter-spacing: 8px[^>]*>(\d{6})</)[1];
  const done = await userService.completeDeviceLogin(first.challengeId, code, makeReq());
  assert.ok(done.accessToken, 'a session is issued straight away');
  assert.strictEqual(done.setupRequired, undefined);
});
