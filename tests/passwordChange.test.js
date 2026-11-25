// Change password: the old password has to be typed, 3 wrong ones block changing the password for 24 hours, and
// the new password has to have at least 8 characters, one uppercase letter, one number and one special character.
// Over real HTTP through the real router.
//
// Run with:  node --test tests/passwordChange.test.js
//
// Needs the LOCAL gaming_rewamp database with sql/20261130-password-change-attempt.sql applied.
// Every row the tests create is deleted afterwards. Never point it at a live database.

require('moment-timezone');
const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const express = require('express');
require('dotenv').config();
process.env.RATE_LIMIT_DISABLED = 'true';

// Nothing in these flows should send mail; if it does, it must not reach a real server.
const sendMailPath = require.resolve('../helpers/sendMail');
require.cache[sendMailPath] = { id: sendMailPath, filename: sendMailPath, loaded: true, exports: async () => {} };

const pool = require('../config/database');
const db = pool.promise();

const OLD = 'Old@1234';
const NEW = 'New@5678';
const created = [];
let counter = 0;
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
    await db.query('DELETE FROM tbl_password_change_attempt WHERE user_id = ?', [id]).catch(() => {});
    await db.query('DELETE FROM tbl_auth_activity_log WHERE user_id = ?', [id]);
    await db.query('DELETE FROM tbl_user_trusted_device WHERE user_id = ?', [id]);
    await db.query('DELETE FROM tbl_login_challenge WHERE user_id = ?', [id]);
    await db.query('DELETE FROM tbl_registration WHERE id = ?', [id]);
  }
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => pool.end(resolve));
});

async function makeUser(password = OLD) {
  counter += 1;
  const hash = await bcrypt.hash(password, 4);
  const [ins] = await db.query(
    `INSERT INTO tbl_registration (first_name, last_name, email, password, phone, pincode, state, is_eighteen, is_verified, user_status, created, status, ip_status)
     VALUES ('PwdTest', 'Throwaway', ?, ?, ?, '000000', 'Delhi', 1, 1, 'active', NOW(), 1, 1)`,
    [`pwd-${Date.now()}-${counter}@invalid.local`, hash, `4${String(Date.now()).slice(-8)}${counter}`.slice(0, 10)]
  );
  const id = ins.insertId;
  created.push(id);
  const token = jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  await db.query('UPDATE tbl_registration SET session_token = ? WHERE id = ?', [token, id]);
  return { id, token };
}

async function change(user, body, headers = {}) {
  const res = await fetch(`${base}/users/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}`, 'User-Agent': 'PwdTest/1.0', ...headers },
    body: JSON.stringify(body),
  });
  let json = null; try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}
const attempt = (user, current, password = NEW, conf = password, headers = {}) => change(user, { current_password: current, password, conf_password: conf }, headers);
// A password change ends every session, so a user who changed it has to log in again to try once more.
const signIn = async (user) => {
  user.token = jwt.sign({ id: user.id, n: Date.now() }, process.env.JWT_SECRET, { expiresIn: '1h' });
  await db.query('UPDATE tbl_registration SET session_token = ? WHERE id = ?', [user.token, user.id]);
};
const hashOf = async (id) => (await db.query('SELECT password FROM tbl_registration WHERE id = ?', [id]))[0][0].password;
const passwordIs = async (id, plain) => bcrypt.compare(plain, await hashOf(id));
const rowOf = async (id) => (await db.query('SELECT * FROM tbl_password_change_attempt WHERE user_id = ?', [id]))[0][0];
const waitFor = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  for (;;) {
    const value = await fn();
    if (value && (!Array.isArray(value) || value.length)) return value;
    if (Date.now() > end) return value;
    await new Promise((r) => setTimeout(r, 50));
  }
};
const hasMustChange = async () => (await db.query("SHOW COLUMNS FROM tbl_registration LIKE 'must_change_password'"))[0].length > 0;

test('the right old password and a valid new one change the password', async () => {
  const user = await makeUser();
  const res = await attempt(user, OLD);
  assert.strictEqual(res.status, 200);
  assert.ok(await passwordIs(user.id, NEW));
  assert.ok(!(await passwordIs(user.id, OLD)));
  assert.strictEqual(await rowOf(user.id), undefined, 'no attempt row is left');
});

test('the old password is required: missing, empty or not text is refused and nothing changes', async () => {
  const user = await makeUser();
  for (const current of [undefined, '', null, 12345678, ['Old@1234'], { a: 1 }]) {
    const body = { password: NEW, conf_password: NEW };
    if (current !== undefined) body.current_password = current;
    const res = await change(user, body);
    assert.strictEqual(res.status, 400, JSON.stringify(current));
    assert.ok(res.json.errors.some((e) => e.msg === 'Old password is required'), JSON.stringify(current));
  }
  assert.ok(await passwordIs(user.id, OLD));
  assert.strictEqual(await rowOf(user.id), undefined, 'a missing old password is not counted as a wrong guess');
});

test('a wrong old password is refused and says how many attempts are left; the 3rd blocks', async () => {
  const user = await makeUser();
  const first = await attempt(user, 'Wrong@111');
  assert.strictEqual(first.status, 400);
  assert.strictEqual(first.json.msg, 'Old password is incorrect. 2 attempts left.');
  const second = await attempt(user, 'Wrong@222');
  assert.strictEqual(second.status, 400);
  assert.strictEqual(second.json.msg, 'Old password is incorrect. 1 attempt left.');

  const third = await attempt(user, 'Wrong@333');
  assert.strictEqual(third.status, 429);
  assert.match(third.json.msg, /^Too many wrong attempts\. You can change your password again after \d{2} \w{3} \d{4}, \d{2}:\d{2} (AM|PM) \(IST\)\.$/);
  assert.match(third.json.blockedUntil, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

  assert.ok(await passwordIs(user.id, OLD), 'the password is unchanged');
  const row = await rowOf(user.id);
  assert.strictEqual(row.failed_count, 3);
  assert.ok(row.blocked_until);
});

test('the block lasts 24 hours', async () => {
  const user = await makeUser();
  for (const wrong of ['Wrong@111', 'Wrong@222', 'Wrong@333']) await attempt(user, wrong);
  const [[{ hours }]] = await db.query(
    'SELECT TIMESTAMPDIFF(MINUTE, last_failed_at, blocked_until) / 60 AS hours FROM tbl_password_change_attempt WHERE user_id = ?', [user.id]
  );
  assert.strictEqual(Number(hours), 24);
});

test('while blocked even the right old password is refused, and so is every further try', async () => {
  const user = await makeUser();
  for (const wrong of ['Wrong@111', 'Wrong@222', 'Wrong@333']) await attempt(user, wrong);

  for (const current of [OLD, 'Wrong@444']) {
    const res = await attempt(user, current);
    assert.strictEqual(res.status, 429);
    assert.match(res.json.msg, /Too many wrong attempts/);
  }
  assert.ok(await passwordIs(user.id, OLD));
  assert.strictEqual((await rowOf(user.id)).failed_count, 3, 'a blocked try is not counted again');
});

test('after the block ends, the right old password works again and the count starts again', async () => {
  const user = await makeUser();
  for (const wrong of ['Wrong@111', 'Wrong@222', 'Wrong@333']) await attempt(user, wrong);
  await db.query("UPDATE tbl_password_change_attempt SET blocked_until = DATE_SUB(blocked_until, INTERVAL 25 HOUR), last_failed_at = DATE_SUB(last_failed_at, INTERVAL 25 HOUR) WHERE user_id = ?", [user.id]);

  const wrongAgain = await attempt(user, 'Wrong@555');
  assert.strictEqual(wrongAgain.status, 400);
  assert.strictEqual(wrongAgain.json.msg, 'Old password is incorrect. 2 attempts left.', 'a new count, not blocked again at once');

  const ok = await attempt(user, OLD);
  assert.strictEqual(ok.status, 200);
  assert.ok(await passwordIs(user.id, NEW));
});

test('a successful change clears the count', async () => {
  const user = await makeUser();
  await attempt(user, 'Wrong@111');
  await attempt(user, 'Wrong@222');
  assert.strictEqual((await rowOf(user.id)).failed_count, 2);
  assert.strictEqual((await attempt(user, OLD)).status, 200);
  assert.strictEqual(await rowOf(user.id), undefined);

  // the new password is the old one now, and the count is fresh
  await signIn(user);
  const again = await attempt(user, 'Wrong@999', 'Third@9999');
  assert.strictEqual(again.json.msg, 'Old password is incorrect. 2 attempts left.');
});

test('wrong passwords typed more than 24 hours ago are forgotten', async () => {
  const user = await makeUser();
  await attempt(user, 'Wrong@111');
  await attempt(user, 'Wrong@222');
  await db.query('UPDATE tbl_password_change_attempt SET last_failed_at = DATE_SUB(last_failed_at, INTERVAL 25 HOUR) WHERE user_id = ?', [user.id]);
  const res = await attempt(user, 'Wrong@333');
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.json.msg, 'Old password is incorrect. 2 attempts left.');
});

test('when the password is changed another way (Forgot password, an admin), the count and the block are gone', async () => {
  const user = await makeUser();
  for (const wrong of ['Wrong@111', 'Wrong@222', 'Wrong@333']) await attempt(user, wrong);
  assert.strictEqual((await attempt(user, OLD)).status, 429);

  // someone sets a new password directly (as the reset link or the admin panel does)
  const other = 'Reset@4321';
  await db.query('UPDATE tbl_registration SET password = ? WHERE id = ?', [await bcrypt.hash(other, 4), user.id]);

  const ok = await attempt(user, other, 'Final@7777');
  assert.strictEqual(ok.status, 200, 'not blocked any more');
  assert.ok(await passwordIs(user.id, 'Final@7777'));
});

test('one user\'s block does not touch another user', async () => {
  const blocked = await makeUser();
  const free = await makeUser();
  for (const wrong of ['Wrong@111', 'Wrong@222', 'Wrong@333']) await attempt(blocked, wrong);
  assert.strictEqual((await attempt(blocked, OLD)).status, 429);
  assert.strictEqual((await attempt(free, OLD)).status, 200);
});

test('simultaneous wrong guesses are counted exactly: 2 get "incorrect", everything else is blocked', async () => {
  const user = await makeUser();
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => attempt(user, `Wrong@${1000 + i}`)));
  assert.strictEqual(results.filter((r) => r.status === 400).length, 2);
  assert.strictEqual(results.filter((r) => r.status === 429).length, 18);
  assert.strictEqual((await rowOf(user.id)).failed_count, 3);
  assert.ok(await passwordIs(user.id, OLD));
});

test('each rule of the new password is checked, before the old password and without counting a guess', async () => {
  const user = await makeUser();
  const weak = ['Ab1!xyz', 'abcdefg1!', 'ABCDEFGH', 'Abcdefgh!', 'Abcdefg12', 'Abcdef 1', 'longlonglong', '12345678', ''];
  for (const password of weak) {
    const res = await change(user, { current_password: 'Wrong@111', password, conf_password: password });
    assert.strictEqual(res.status, 400, JSON.stringify(password));
    assert.ok(
      res.json.errors.some((e) => e.msg === 'Password must be at least 8 characters and include one uppercase letter, one number and one special character.'),
      JSON.stringify(password)
    );
  }
  assert.strictEqual(await rowOf(user.id), undefined, 'a weak new password never counts as a wrong old password');
  assert.ok(await passwordIs(user.id, OLD));
});

test('passwords that meet the rules are accepted: exactly 8, other special characters, long ones', async () => {
  for (const password of ['Abcdef1!', 'Zz9#zzzz', 'Pass word1!', 'Ünï9code#x', `A1!${'x'.repeat(40)}`]) {
    const user = await makeUser();
    const res = await attempt(user, OLD, password);
    assert.strictEqual(res.status, 200, JSON.stringify(password));
    assert.ok(await passwordIs(user.id, password));
  }
});

test('the confirmation has to match', async () => {
  const user = await makeUser();
  const res = await attempt(user, OLD, NEW, 'New@5679');
  assert.strictEqual(res.status, 400);
  assert.ok(res.json.errors.some((e) => e.msg === 'Passwords do not match'));
  assert.ok(await passwordIs(user.id, OLD));
});

test('the new password must differ from the old one', async () => {
  const user = await makeUser();
  const res = await attempt(user, OLD, OLD);
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.json.msg, 'The new password must be different from the old password.');
  assert.ok(await passwordIs(user.id, OLD));
  assert.strictEqual(await rowOf(user.id), undefined, 'typing the right old password is not a wrong guess');
});

test('without a token nothing happens', async () => {
  const res = await fetch(`${base}/users/change-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: OLD, password: NEW, conf_password: NEW }),
  });
  assert.ok(res.status === 401 || res.status === 403);
});

test('wrong tries and the change itself are written to the activity log', async () => {
  const user = await makeUser();
  const here = { 'CF-Connecting-IP': '198.51.100.77' };
  await attempt(user, 'Wrong@111', NEW, NEW, here);
  await attempt(user, OLD, NEW, NEW, here);
  const rows = await waitFor(async () => {
    const [r] = await db.query("SELECT status, fail_reason, details FROM tbl_auth_activity_log WHERE user_id = ? AND event_type = 'profile_update' ORDER BY id", [user.id]);
    return r.length >= 2 ? r : null;
  });
  assert.ok(rows.some((r) => r.status === 'failed' && r.fail_reason === 'wrong_old_password' && /wrong old password \(1 of 3\)/.test(r.details)));
  assert.ok(rows.some((r) => r.status === 'success' && r.details === 'password changed'));
  assert.ok(!JSON.stringify(rows).includes('Wrong@111') && !JSON.stringify(rows).includes(OLD), 'no password is written to the log');
});

test('without the table the old password is still checked, there is just no block', async () => {
  const user = await makeUser();
  await db.query('RENAME TABLE tbl_password_change_attempt TO tbl_password_change_attempt_bak');
  try {
    for (let i = 0; i < 5; i += 1) {
      const res = await attempt(user, `Wrong@${i}${i}${i}`);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.json.msg, 'Old password is incorrect.');
    }
    assert.strictEqual((await attempt(user, OLD)).status, 200);
  } finally {
    await db.query('RENAME TABLE tbl_password_change_attempt_bak TO tbl_password_change_attempt');
  }
});

test('a user whose password an admin set can change it with that password, and not to the same one', async (t) => {
  if (!(await hasMustChange())) return t.skip('must_change_password column is not in the local database');
  const user = await makeUser('Given@1234');
  await db.query('UPDATE tbl_registration SET must_change_password = 1 WHERE id = ?', [user.id]);

  const same = await attempt(user, 'Given@1234', 'Given@1234');
  assert.strictEqual(same.status, 400);
  assert.strictEqual(same.json.msg, 'Please choose a new password, different from the one you were given.');

  const wrong = await attempt(user, 'Nope@1234');
  assert.strictEqual(wrong.status, 400);
  assert.match(wrong.json.msg, /Old password is incorrect/);

  const ok = await attempt(user, 'Given@1234', 'Mine@98765');
  assert.strictEqual(ok.status, 200);
  const [[row]] = await db.query('SELECT must_change_password FROM tbl_registration WHERE id = ?', [user.id]);
  assert.strictEqual(row.must_change_password, 0);
});
