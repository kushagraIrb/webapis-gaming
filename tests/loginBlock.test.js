// Login block: 3 wrong-password / unknown-phone logins from one IP within 5 minutes block that IP and the
// phones tried from it for 1 hour.
//
// Run with:  node --test tests/loginBlock.test.js
//
// Needs the LOCAL gaming_rewamp database with sql/20261128-login-block.sql applied (and the auth activity
// log files). It drives the real login route over HTTP on a throwaway server, with X-Real-IP playing the
// reverse proxy, and creates throwaway users and log rows that it deletes afterwards. Never point it at a
// live database.

require('moment-timezone');
const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcrypt');
require('dotenv').config();
process.env.RATE_LIMIT_DISABLED = 'true';
process.env.NEW_DEVICE_OTP_ENABLED = 'false';

const sendMailPath = require.resolve('../helpers/sendMail');
require.cache[sendMailPath] = {
  id: sendMailPath, filename: sendMailPath, loaded: true,
  exports: async () => {},
};

const express = require('express');
const moment = require('moment-timezone');
const pool = require('../config/database');
const db = pool.promise();
const { blockedIpGuard } = require('../helpers/loginBlockGuard');
const { trustedClientIp } = require('../helpers/trustedIp');

const PASSWORD = 'Test@12345';
const WRONG = 'Wrong@12345';
const istNow = () => moment().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let server;
let base;
const users = [];
let ipCounter = 10;
const nextIp = () => `198.51.100.${++ipCounter}`; // documentation range, never a real visitor
const ips = new Set();

// A run that was killed leaves its throwaway rows behind: clear them first, so every run starts clean.
async function clearLeftovers() {
  await db.query("DELETE FROM tbl_login_block WHERE block_value LIKE '198.51.100.%' OR block_value LIKE '172.67.1.%'");
  await db.query("DELETE FROM tbl_auth_activity_log WHERE ip_address LIKE '198.51.100.%' OR ip_address = '172.67.1.1'");
  const [old] = await db.query("SELECT id, phone FROM tbl_registration WHERE first_name = 'BlockTest' AND last_name = 'Throwaway'");
  for (const row of old) {
    await db.query('DELETE FROM tbl_login_block WHERE block_value = ?', [row.phone]);
    await db.query('DELETE FROM tbl_auth_activity_log WHERE user_id = ?', [row.id]);
    await db.query('DELETE FROM tbl_registration WHERE id = ?', [row.id]);
  }
}

test.before(async () => {
  await clearLeftovers();
  const app = express();
  app.use(blockedIpGuard);
  app.use('/api/users', require('../routes/userRouter'));
  server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}/api/users`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  for (const ip of ips) {
    await db.query('DELETE FROM tbl_login_block WHERE block_value = ?', [ip]);
    await db.query('DELETE FROM tbl_auth_activity_log WHERE ip_address = ?', [ip]);
  }
  for (const user of users) {
    await db.query('DELETE FROM tbl_login_block WHERE block_value = ?', [user.phone]);
    await db.query('DELETE FROM tbl_auth_activity_log WHERE user_id = ?', [user.id]);
    await db.query('DELETE FROM tbl_registration WHERE id = ?', [user.id]);
  }
  await new Promise((resolve) => pool.end(resolve));
});

let counter = 0;
async function makeUser(overrides = {}) {
  counter += 1;
  const phone = `6${String(Date.now()).slice(-8)}${counter}`.slice(0, 10);
  const hash = await bcrypt.hash(PASSWORD, 4);
  const [ins] = await db.query(
    `INSERT INTO tbl_registration
     (first_name, last_name, email, password, phone, pincode, is_eighteen, is_verified, user_status, created, status, ip_status)
     VALUES ('BlockTest', 'Throwaway', ?, ?, ?, '000000', 1, 1, 'active', NOW(), ?, 1)`,
    [`blocktest-${Date.now()}-${counter}@invalid.local`, hash, phone, overrides.status === undefined ? 1 : overrides.status]
  );
  const user = { id: ins.insertId, phone };
  users.push(user);
  return user;
}

// A visitor from `ip`, as the reverse proxy would pass it on.
const login = async (ip, phone, password = WRONG, extra = {}) => {
  ips.add(ip);
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Real-IP': ip, ...extra },
    body: JSON.stringify({ phone, password }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const blockRows = async (value) => (await db.query('SELECT * FROM tbl_login_block WHERE block_value = ?', [value]))[0];

test('three wrong passwords block the IP and the phone; the third answer is the block', async () => {
  const user = await makeUser();
  const ip = nextIp();

  const first = await login(ip, user.phone);
  assert.strictEqual(first.status, 401);
  assert.strictEqual(first.body.attemptsLeft, 2);
  assert.match(first.body.msg, /Incorrect phone number or password! You have 2 attempts left./);
  const second = await login(ip, user.phone);
  assert.strictEqual(second.status, 401);
  assert.strictEqual(second.body.attemptsLeft, 1);
  assert.match(second.body.msg, /You have 1 attempt left./, 'singular for the last one');

  const third = await login(ip, user.phone);
  assert.strictEqual(third.status, 429);
  assert.strictEqual(third.body.blocked, true);
  assert.match(third.body.msg, /blocked for 1 hour/);
  assert.ok(third.body.retryAfterSeconds > 3500 && third.body.retryAfterSeconds <= 3600);

  const [ipRow] = await blockRows(ip);
  const [phoneRow] = await blockRows(user.phone);
  assert.strictEqual(ipRow.block_type, 'ip');
  assert.strictEqual(phoneRow.block_type, 'phone');
  assert.strictEqual(phoneRow.user_id, user.id);
  assert.strictEqual(ipRow.event_key, phoneRow.event_key, 'one event, so the admin panel can unblock both together');
  assert.strictEqual(ipRow.failed_count, 3);
});

test('once blocked, even the right password is refused, from that IP and for that phone from any IP', async () => {
  const user = await makeUser();
  const other = await makeUser();
  const ip = nextIp();
  for (let i = 0; i < 3; i++) await login(ip, user.phone);

  assert.strictEqual((await login(ip, user.phone, PASSWORD)).status, 429, 'right password, blocked phone and IP');
  assert.strictEqual((await login(ip, other.phone, PASSWORD)).status, 429, 'another phone, blocked IP');
  assert.strictEqual((await login(nextIp(), user.phone, PASSWORD)).status, 429, 'blocked phone, another IP');
  assert.strictEqual((await login(nextIp(), other.phone, PASSWORD)).status, 200, 'unrelated phone and IP are fine');
});

test('a blocked IP is refused on every route, not only on login', async () => {
  const user = await makeUser();
  const ip = nextIp();
  for (let i = 0; i < 3; i++) await login(ip, user.phone);

  const res = await fetch(`${base}/fetch-state?pincode=000000`, { headers: { 'X-Real-IP': ip } });
  assert.strictEqual(res.status, 429);
  const body = await res.json();
  assert.strictEqual(body.blocked, true);
  assert.ok(body.retryAfterSeconds > 3500 && body.retryAfterSeconds <= 3600, 'about an hour left, not a time shifted by the time zone');
  const [[row]] = await db.query("SELECT DATE_FORMAT(blocked_until, '%Y-%m-%d %H:%i:%s') AS until FROM tbl_login_block WHERE block_value = ?", [ip]);
  assert.strictEqual(body.blockedUntil, row.until, 'the time shown is the stored India time');

  const fine = await fetch(`${base}/fetch-state?pincode=000000`, { headers: { 'X-Real-IP': nextIp() } });
  assert.notStrictEqual(fine.status, 429);
});

test('every existing phone tried from the IP is blocked; a phone with no account is not', async () => {
  const a = await makeUser();
  const b = await makeUser();
  const ip = nextIp();
  await login(ip, a.phone);
  await login(ip, '5000000000'); // no account
  const last = await login(ip, b.phone);
  assert.strictEqual(last.status, 429);

  assert.strictEqual((await blockRows(a.phone)).length, 1);
  assert.strictEqual((await blockRows(b.phone)).length, 1);
  assert.strictEqual((await blockRows('5000000000')).length, 0, 'nothing to block for a phone nobody owns');
  assert.strictEqual((await blockRows(ip)).length, 1);
});

test('unknown phones count too: three of them block the IP', async () => {
  const ip = nextIp();
  assert.strictEqual((await login(ip, '5000000001')).status, 401);
  assert.strictEqual((await login(ip, '5000000002')).status, 401);
  assert.strictEqual((await login(ip, '5000000003')).status, 429);
  assert.strictEqual((await blockRows(ip)).length, 1);
});

test('a correct login resets the count', async () => {
  const user = await makeUser();
  const ip = nextIp();
  await login(ip, user.phone);
  await login(ip, user.phone);
  await sleep(1100);
  assert.strictEqual((await login(ip, user.phone, PASSWORD)).status, 200);
  await sleep(1100); // the success row is written in the background

  assert.strictEqual((await login(ip, user.phone)).status, 401);
  assert.strictEqual((await login(ip, user.phone)).status, 401, 'two more wrong tries after the good login are still allowed');
  assert.strictEqual((await blockRows(ip)).length, 0);
  assert.strictEqual((await login(ip, user.phone)).status, 429, 'the third wrong try after the good login blocks: the count really started over, it was not just switched off');
});

test('a refused blocked account and a blocked attempt do not count as wrong passwords', async () => {
  const user = await makeUser({ status: 0 });
  const ip = nextIp();
  for (let i = 0; i < 5; i++) {
    const res = await login(ip, user.phone, PASSWORD); // right password, account blocked by an admin
    assert.strictEqual(res.status, 403);
  }
  assert.strictEqual((await blockRows(ip)).length, 0);
});

test('a block ends by itself after its hour', async () => {
  const user = await makeUser();
  const ip = nextIp();
  for (let i = 0; i < 3; i++) await login(ip, user.phone);
  assert.strictEqual((await login(ip, user.phone, PASSWORD)).status, 429);

  await db.query('UPDATE tbl_login_block SET blocked_until = ? WHERE block_value IN (?, ?)',
    [moment().tz('Asia/Kolkata').subtract(1, 'minute').format('YYYY-MM-DD HH:mm:ss'), ip, user.phone]);
  await sleep(3200); // the per-process cache of the whole-site check

  assert.strictEqual((await login(ip, user.phone, PASSWORD)).status, 200);
});

test('an admin unblock restores access and the old attempts no longer count', async () => {
  const user = await makeUser();
  const ip = nextIp();
  for (let i = 0; i < 3; i++) await login(ip, user.phone);
  assert.strictEqual((await login(ip, user.phone, PASSWORD)).status, 429);

  await sleep(1100);
  await db.query('UPDATE tbl_login_block SET released_at = ?, released_by_admin_id = 1, released_by_name = ? WHERE block_value IN (?, ?)',
    [istNow(), 'Test Admin', ip, user.phone]);
  await sleep(3200);

  assert.strictEqual((await login(ip, user.phone)).status, 401, 'one wrong try after the unblock is a normal wrong try, not a new block');
  assert.strictEqual((await login(ip, user.phone)).status, 401);
  assert.strictEqual((await login(ip, user.phone)).status, 429, 'three wrong tries after the unblock block again');
});

test('a direct visitor cannot move the block onto someone else by faking CF-Connecting-IP', async () => {
  const user = await makeUser();
  const attacker = nextIp();
  const victim = nextIp();
  ips.add(victim);
  for (let i = 0; i < 3; i++) await login(attacker, user.phone, WRONG, { 'CF-Connecting-IP': victim });

  assert.strictEqual((await blockRows(attacker)).length, 1, 'the attacker is blocked by their real address');
  assert.strictEqual((await blockRows(victim)).length, 0, 'the faked address is not');
  assert.notStrictEqual((await login(victim, (await makeUser()).phone, PASSWORD)).status, 429);
});

test('behind Cloudflare the visitor is told apart from the Cloudflare edge', async () => {
  const user = await makeUser();
  const edge = '172.67.1.1'; // a Cloudflare address
  const visitorA = nextIp();
  const visitorB = nextIp();
  ips.add(edge);
  for (let i = 0; i < 3; i++) await login(edge, user.phone, WRONG, { 'CF-Connecting-IP': visitorA });

  assert.strictEqual((await blockRows(visitorA)).length, 1);
  assert.strictEqual((await blockRows(edge)).length, 0, 'the Cloudflare edge itself is never blocked');
  assert.notStrictEqual((await login(edge, (await makeUser()).phone, PASSWORD, { 'CF-Connecting-IP': visitorB })).status, 429);
});

test('an address that cannot be trusted is never blocked', async () => {
  const user = await makeUser();
  // No X-Real-IP and a loopback connection: the real address is unknown.
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.250' },
      body: JSON.stringify({ phone: user.phone, password: WRONG }),
    });
    assert.strictEqual(res.status, 401);
  }
  assert.strictEqual((await blockRows('198.51.100.250')).length, 0);
});

test('ten wrong tries sent at once still end in a block', async () => {
  const user = await makeUser();
  const ip = nextIp();
  await Promise.all(Array.from({ length: 10 }, () => login(ip, user.phone)));
  await sleep(300);

  assert.ok((await blockRows(ip)).length >= 1, 'the IP is blocked');
  assert.strictEqual((await login(ip, user.phone, PASSWORD)).status, 429);
});

test('trusted IP rules', () => {
  const req = (socket, headers = {}) => ({ socket: { remoteAddress: socket }, headers });
  assert.deepStrictEqual(trustedClientIp(req('172.67.5.5', { 'cf-connecting-ip': '203.0.113.9' })), { ip: '203.0.113.9', trusted: true });
  assert.deepStrictEqual(trustedClientIp(req('198.51.100.7', { 'cf-connecting-ip': '203.0.113.9' })), { ip: '198.51.100.7', trusted: true });
  assert.deepStrictEqual(trustedClientIp(req('127.0.0.1', { 'x-real-ip': '198.51.100.7', 'cf-connecting-ip': '203.0.113.9' })), { ip: '198.51.100.7', trusted: true });
  assert.strictEqual(trustedClientIp(req('127.0.0.1', { 'cf-connecting-ip': '203.0.113.9' })).trusted, false);
  assert.strictEqual(trustedClientIp(req('104.16.1.1')).trusted, false, 'a Cloudflare edge with no header');
  assert.strictEqual(trustedClientIp(req('2606:4700::1', { 'cf-connecting-ip': '2001:db8::5' })).ip, '2001:db8::5');
});

test('a password shorter than 6 characters gets a clear message and does not use up an attempt', async () => {
  const user = await makeUser();
  const ip = nextIp();
  for (let i = 0; i < 5; i++) {
    const res = await login(ip, user.phone, 'abc12');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.errors[0].msg, 'Password must be at least 6 characters');
  }
  assert.strictEqual((await blockRows(ip)).length, 0, 'nothing was counted');
  const next = await login(ip, user.phone);
  assert.strictEqual(next.body.attemptsLeft, 2, 'the three attempts are all still there');
});

test('the attempts left are never shown when the IP cannot be trusted', async () => {
  const user = await makeUser();
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: user.phone, password: WRONG }),
  });
  const body = await res.json();
  assert.strictEqual(res.status, 401);
  assert.strictEqual(body.attemptsLeft, undefined, 'nothing can be counted, so nothing is promised');
  assert.strictEqual(body.msg, 'Incorrect phone number or password!');
});

test('trusted IP rules when nginx sends only X-Forwarded-For (the dev server)', () => {
  const req = (socket, headers = {}) => ({ socket: { remoteAddress: socket }, headers });
  // Cloudflare in front: the visitor first, then the Cloudflare address nginx appended.
  assert.deepStrictEqual(
    trustedClientIp(req('::ffff:127.0.0.1', { 'x-forwarded-for': '203.0.113.9, 162.159.124.27', 'cf-connecting-ip': '203.0.113.9' })),
    { ip: '203.0.113.9', trusted: true }
  );
  // A direct visitor writing fake entries in front: only the end, added by nginx, counts.
  assert.deepStrictEqual(
    trustedClientIp(req('127.0.0.1', { 'x-forwarded-for': '1.2.3.4, 198.51.100.7', 'cf-connecting-ip': '203.0.113.9' })),
    { ip: '198.51.100.7', trusted: true }
  );
  // X-Real-IP, when it arrives, wins over the list.
  assert.strictEqual(trustedClientIp(req('127.0.0.1', { 'x-real-ip': '198.51.100.8', 'x-forwarded-for': '9.9.9.9, 198.51.100.7' })).ip, '198.51.100.8');
  // An end that is itself private cannot be trusted.
  assert.strictEqual(trustedClientIp(req('127.0.0.1', { 'x-forwarded-for': '198.51.100.7, 10.0.0.1', 'cf-connecting-ip': '203.0.113.9' })).trusted, false);
  assert.strictEqual(trustedClientIp(req('127.0.0.1', { 'x-forwarded-for': '' })).trusted, false);
});

test('behind Cloudflare with only X-Forwarded-For: the visitor is blocked and counted, a faked header is not', async () => {
  const user = await makeUser();
  const visitor = nextIp();
  const faked = nextIp();
  ips.add(visitor); ips.add(faked);
  const viaForwarded = async (phone, headers) => {
    const res = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ phone, password: WRONG }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const headers = { 'X-Forwarded-For': `${visitor}, 162.159.124.27`, 'CF-Connecting-IP': visitor };

  const first = await viaForwarded(user.phone, headers);
  assert.strictEqual(first.status, 401);
  assert.strictEqual(first.body.attemptsLeft, 2, 'the countdown shows when the visitor can be told');
  assert.strictEqual((await viaForwarded(user.phone, headers)).body.attemptsLeft, 1);
  assert.strictEqual((await viaForwarded(user.phone, headers)).status, 429);
  assert.strictEqual((await blockRows(visitor)).length, 1);

  // Someone talking straight to the server and naming the first visitor in the header is not that visitor.
  const other = await makeUser(); // the first phone is already blocked, so it would be refused before anything is counted
  for (let i = 0; i < 3; i++) await viaForwarded(other.phone, { 'X-Forwarded-For': `${visitor}, ${faked}`, 'CF-Connecting-IP': visitor });
  assert.strictEqual((await blockRows(visitor)).length, 1, 'the real visitor was not blocked a second time by the fake');
  assert.strictEqual((await blockRows(faked)).length, 1, 'the one who actually connected is the one blocked');
});
