// Security regression tests from the 2026-11 user-panel audit.
//
// Run with:  node --test tests/security-regression.test.js
// (same runner the project already uses -- see tests/bankAssignmentRank.test.js)
//
// Requirements to run this file:
//   - The API must be running locally against the LOCAL gaming_rewamp database
//     (e.g. `node app.js` with a .env pointing at localhost). NEVER point this
//     file at a production database or a production API URL -- it creates and
//     deletes throwaway rows and sends unauthenticated/forged requests.
//   - Set API_BASE_URL if the local API isn't on the default http://localhost:3005.
//
// Every test creates its own throwaway tbl_registration row (and whatever
// ledger/bet/ticket/transfer rows it needs) and deletes all of it in a
// `finally` block, whether the test passes or fails. Nothing here touches a
// real user.
//
// WHAT "PASS" MEANS HERE: each test encodes the SECURE behavior the finding
// says is missing. As of the audit, most of these are expected to FAIL (the
// vulnerability reproduces). A fix should make the corresponding test pass;
// a future change that makes one of these start failing again is a real
// regression of a previously-reported finding, not a flaky test.

require('moment-timezone'); // patches the shared `moment` instance before any
                            // model below does a plain `require('moment')`,
                            // exactly as needed when calling services directly
                            // instead of going through the HTTP server.

const test = require('node:test');
const assert = require('node:assert');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3005';
const JWT_SECRET = process.env.JWT_SECRET;

let db;

test.before(async () => {
  db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gaming_rewamp',
  });
});

test.after(async () => {
  await db.end();
});

const nowSql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

// Creates one throwaway, clearly-marked test user and a matching JWT whose
// session_token is set on the row (so authToken.js's single-device check
// passes). Returns {userId, token, cleanup()}.
async function makeTestUser(emailTag) {
  const [ins] = await db.query(
    `INSERT INTO tbl_registration
     (first_name, last_name, email, password, phone, pincode, is_eighteen, is_verified, user_status, created, status, ip_status)
     VALUES ('AuditProbe','Throwaway',?,'x',?,'000000',1,1,'active',?,1,1)`,
    [`audit-regtest-${emailTag}@invalid.local`, `9${String(Date.now()).slice(-9)}`, nowSql()]
  );
  const userId = ins.insertId;
  const token = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '1h' });
  await db.query('UPDATE tbl_registration SET session_token=? WHERE id=?', [token, userId]);

  const cleanupTables = [
    'tbl_transaction_history', 'tbl_trans_bonus_his', 'tbl_withdrawal',
    'tbl_coin_bet', 'tbl_support_ticket', 'tbl_transfer_requests', 'tbl_user_account',
    'tbl_deposit_list',
  ];
  const cleanup = async (extra = []) => {
    for (const t of cleanupTables) {
      await db.query(`DELETE FROM ${t} WHERE user_id=?`, [userId]).catch(() => {});
    }
    await db.query('DELETE FROM tbl_support_ticket WHERE userBy=?', [userId]).catch(() => {});
    for (const fn of extra) await fn();
    await db.query('DELETE FROM tbl_registration WHERE id=?', [userId]);
  };
  return { userId, token, cleanup };
}

// Coin Flip only accepts bets from accounts older than 7 days with Rs 5,000 of approved
// deposits (CoinFlipService.getEligibility), so coin-flip tests need an eligible user.
async function makeCoinFlipEligible(userId) {
  await db.query('UPDATE tbl_registration SET created = DATE_SUB(NOW(), INTERVAL 10 DAY) WHERE id=?', [userId]);
  await db.query('INSERT INTO tbl_deposit_list (user_id, deposit_amount_step1, status, verified) VALUES (?, 5000, 1, 1)', [userId]);
}

// ── F-001: an unauthenticated request must not be able to rename a user ──
test('F-001: PUT /api/users/update-name is rejected with no auth token', async () => {
  const { userId, cleanup } = await makeTestUser('f001');
  try {
    const resp = await fetch(`${API_BASE_URL}/api/users/update-name`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, first_name: 'Hijacked' }),
    });
    assert.notStrictEqual(resp.status, 200,
      'update-name must require authentication; it must not accept an unauthenticated request');
  } finally {
    await cleanup();
  }
});

// ── F-003: a crafted login phone value must not surface a raw SQL error ──
test('F-003: POST /api/users/login does not leak a raw SQL error for a quote in phone', async () => {
  const resp = await fetch(`${API_BASE_URL}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: "8923894749'", password: 'aaaaaa' }),
  });
  const body = await resp.text();
  assert.notStrictEqual(resp.status, 500,
    'a single quote in `phone` must be handled as ordinary input, not reach the SQL string unescaped');
  assert.ok(!/sql syntax/i.test(body) && !/mariadb/i.test(body),
    'the response must never contain a raw database error message');
});

// ── F-004: password reset must require a real, single-use token ──
test('F-004: POST /api/users/forgot-password needs a valid single-use reset token', async () => {
  const { userId, cleanup } = await makeTestUser('f004');
  const email = 'audit-regtest-f004@invalid.local';
  const forgot = (body) => fetch(`${API_BASE_URL}/api/users/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPass: 'Reset#12345', conPass: 'Reset#12345', ...body }),
  });
  try {
    let resp = await forgot({ email });
    assert.notStrictEqual(resp.status, 200, 'an email alone must not be enough to reset a password');

    resp = await forgot({ token: Buffer.from(email).toString('base64') });
    assert.notStrictEqual(resp.status, 200, 'a guessable base64(email) token must be rejected');

    const [unchanged] = await db.query('SELECT password FROM tbl_registration WHERE id=?', [userId]);
    assert.strictEqual(unchanged[0].password, 'x', 'rejected requests must not change the password');

    const userService = require('../services/userService');
    const [rows] = await db.query('SELECT * FROM tbl_registration WHERE id=?', [userId]);
    const token = userService.signResetToken(rows[0]);

    resp = await forgot({ token });
    assert.strictEqual(resp.status, 200, 'a genuine reset token must still work');

    resp = await forgot({ token });
    assert.notStrictEqual(resp.status, 200, 'the same reset token must not work a second time');
  } finally {
    await cleanup();
  }
});

// ── F-005: a logged-in user must not be able to close another user's ticket ──
test("F-005a: PUT /api/ticket/close-ticket/:id cannot close another user's ticket", async () => {
  const { userId, token, cleanup } = await makeTestUser('f005a');
  const [victim] = await db.query(
    "SELECT id FROM tbl_registration WHERE id != ? ORDER BY id LIMIT 1", [userId]
  );
  const victimId = victim[0].id;
  const [ticketIns] = await db.query(
    `INSERT INTO tbl_support_ticket (token_no, issues, remarks, status, userBy, modified)
     VALUES ('REGTEST-TKT', 1, 'regression test - throwaway', 'Open', ?, NOW())`,
    [victimId]
  );
  const ticketId = ticketIns.insertId;
  try {
    const resp = await fetch(`${API_BASE_URL}/api/ticket/close-ticket/${ticketId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    const [after] = await db.query('SELECT status FROM tbl_support_ticket WHERE id=?', [ticketId]);
    assert.notStrictEqual(after[0].status, 'Close',
      "closing another user's ticket must be refused, not silently succeed");
  } finally {
    await db.query('DELETE FROM tbl_support_ticket WHERE id=?', [ticketId]);
    await cleanup();
  }
});

// ── F-005b: a logged-in user must not be able to cancel another user's match-id transfer ──
test("F-005b: POST /api/match-id/cancel-req cannot cancel another user's transfer request", async () => {
  const { userId, token, cleanup } = await makeTestUser('f005b');
  const [victim] = await db.query(
    "SELECT id FROM tbl_registration WHERE id != ? ORDER BY id LIMIT 1", [userId]
  );
  const victimId = victim[0].id;
  const [transferIns] = await db.query(
    `INSERT INTO tbl_transfer_requests (user_id, site_id, transfer_mode, amount, status, in_process, created_at)
     VALUES (?, 1, 'app_to_id', 100.00, 'pending', 0, NOW())`,
    [victimId]
  );
  const transferId = transferIns.insertId;
  try {
    await fetch(`${API_BASE_URL}/api/match-id/cancel-req`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ transfer_id: transferId, rejection_reason: 'regression test' }),
    });
    const [after] = await db.query('SELECT status FROM tbl_transfer_requests WHERE id=?', [transferId]);
    assert.strictEqual(after[0].status, 'pending',
      "cancelling another user's transfer request must be refused, not silently succeed");
  } finally {
    await db.query('DELETE FROM tbl_transfer_requests WHERE id=?', [transferId]);
    await cleanup();
  }
});

// ── F-010: a deposit must not be instantly credited/approved on submission ──
test('F-010: POST /api/deposit/save does not instantly approve+credit an unverified deposit', async () => {
  const { userId, token, cleanup } = await makeTestUser('f010');
  try {
    const form = new FormData();
    const fakeDepositId = 'REGTEST-DEP-' + Date.now();
    form.append('deposit_id', fakeDepositId);
    form.append('deposit_amount_step1', '500');
    form.append('deposit_date', nowSql());
    form.append('bank_owner_name', 'Regression Test');
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    );
    form.append('screenshot', new Blob([png], { type: 'image/png' }), 'probe.png');

    await fetch(`${API_BASE_URL}/api/deposit/save`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    const [depRows] = await db.query('SELECT status FROM tbl_deposit_list WHERE user_id=?', [userId]);
    const [ledger] = await db.query('SELECT COUNT(*) n FROM tbl_transaction_history WHERE user_id=?', [userId]);

    assert.ok(
      depRows.length === 0 || Number(depRows[0].status) !== 1,
      'a freshly submitted deposit must not already be status=approved before any verification'
    );
    assert.strictEqual(Number(ledger[0].n), 0,
      "the wallet must not be credited before the deposit is verified -- an unverified screenshot must not move real balance");
  } finally {
    await db.query('DELETE FROM tbl_deposit_list WHERE user_id=?', [userId]);
    await cleanup();
  }
});

// ── F-011: withdrawal sufficiency must be checked against the server's own ledger ──
test('F-011: a withdrawal request for more than the real balance is rejected even if walletAmount is forged', async () => {
  const withdrawalService = require('../services/withdrawalService');
  const { userId, cleanup } = await makeTestUser('f011');
  await db.query(
    `INSERT INTO tbl_transaction_history (user_id, credit_amount, total_amount, type, t_status, transaction_date)
     VALUES (?, 1000.00, 1000.00, 'Credit', 'Deposit', ?)`, [userId, nowSql()]
  );
  await db.query(
    `INSERT INTO tbl_transaction_history (user_id, debit_amount, total_amount, type, t_status, transaction_date)
     VALUES (?, 800.00, 200.00, 'Debit', 'Bet', ?)`, [userId, nowSql()]
  ); // real balance: Rs 200.00
  // handleWithdrawal also requires a primary bank account on file -- without one it is
  // correctly rejected for an unrelated reason, which would make this test pass for the
  // wrong reason. Add one so the ONLY thing left to reject on is the forged amount.
  await db.query(
    `INSERT INTO tbl_user_account (user_id, bank_name, account_number, ifsc, ac_holder_name, account_type, upi_id, phone_pay, g_pay, paytm, primary_account, modified)
     VALUES (?, 'Test Bank', '0000000000', 'TEST0000000', 'Test', 'savings', 'test@upi', '9000000000', '9000000000', '9000000000', 1, ?)`,
    [userId, nowSql()]
  );
  try {
    const result = await withdrawalService.handleWithdrawal({
      userId, withdrawalAmount: 5000, walletAmount: 5000, // forged -- real balance is only 200
      withdrawalOption: 'bank', withdrawalText: 'regression test',
      bank: 'Test', account: '0', ifsc: 'TEST0', holderName: 'Test',
      panNumber: null, accountType: 'savings', aadharNumber: null,
      upiId: null, phonePay: null, gPay: null, paytm: null,
    });
    assert.strictEqual(result.status, false,
      'a withdrawal request for Rs 5000 against a real balance of Rs 200 must be rejected, ' +
      'regardless of what walletAmount the client claims');
  } finally {
    await db.query('DELETE FROM tbl_withdrawal WHERE user_id=?', [userId]);
    await cleanup();
  }
});

// ── F-017: a bonus pool must not be claimable twice via concurrent requests ──
test('F-017: two simultaneous bonus claims cannot together exceed the available pool', async () => {
  const { userId, token, cleanup } = await makeTestUser('f017');
  await db.query(
    `INSERT INTO tbl_transaction_history (user_id, credit_amount, total_amount, type, t_status, transaction_date)
     VALUES (?, 100.00, 100.00, 'Credit', 'Deposit', ?)`, [userId, nowSql()]
  );
  await db.query(
    `INSERT INTO tbl_trans_bonus_his (user_id, credit_bonus, total_bonus, type, t_status, created_at)
     VALUES (?, 30.00, 30.00, 'Credit', 'Promotion', ?)`, [userId, nowSql()]
  );
  try {
    const claim = () => fetch(`${API_BASE_URL}/api/bonus/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ bonus_amount: 30 }),
    }).then(r => r.json());

    const [r1, r2] = await Promise.all([claim(), claim()]);
    const successes = [r1, r2].filter(r => r.status === true).length;
    assert.ok(successes <= 1,
      `a Rs 30 bonus pool must allow at most one Rs 30 claim to succeed; ${successes} of 2 simultaneous claims succeeded`);
  } finally {
    await cleanup();
  }
});

// ── F-019: simultaneous live bets on two matches must not exceed the real balance ──
test('F-019: two simultaneous live bets on different matches cannot together exceed the real balance', async () => {
  const { userId, token, cleanup } = await makeTestUser('f019');
  await db.query(
    `INSERT INTO tbl_transaction_history (user_id, credit_amount, total_amount, type, t_status, transaction_date)
     VALUES (?, 100.00, 100.00, 'Credit', 'Deposit', ?)`, [userId, nowSql()]
  );
  const [src] = await db.query('SELECT * FROM tbl_upcoming_match ORDER BY id DESC LIMIT 1');
  const matchIds = [];
  for (let i = 0; i < 2; i++) {
    const row = { ...src[0] };
    delete row.id;
    row.match_date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    row.match_time = JSON.stringify(['10:00', '12:00']);
    if ('cancel' in row) row.cancel = 1;
    const cols = Object.keys(row);
    const [ins] = await db.query(
      `INSERT INTO tbl_upcoming_match (${cols.map(c => '`' + c + '`').join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      cols.map(c => row[c])
    );
    matchIds.push(ins.insertId);
  }
  try {
    const placeBet = (matchId) => fetch(`${API_BASE_URL}/api/live-bet/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ match_id: matchId, minimum_betamount: 10, team_value: 1, toss_id: 1, bet_amount: 100 }),
    }).then(r => r.status);

    const statuses = await Promise.all(matchIds.map(placeBet));
    assert.strictEqual(statuses.filter(s => s === 200).length, 1,
      `a Rs 100 balance must allow exactly one Rs 100 live bet; statuses were ${JSON.stringify(statuses)}`);
    const [bets] = await db.query('SELECT COUNT(*) AS n FROM tbl_bet WHERE user_id=?', [userId]);
    assert.strictEqual(bets[0].n, 1, 'exactly one bet row must exist');
    const [debits] = await db.query("SELECT COUNT(*) AS n FROM tbl_transaction_history WHERE user_id=? AND type='Debit'", [userId]);
    assert.strictEqual(debits[0].n, 1, 'exactly one wallet debit must be recorded');
  } finally {
    await db.query('DELETE FROM tbl_bet WHERE user_id=?', [userId]);
    await db.query('DELETE FROM tbl_report WHERE user_id=?', [userId]).catch(() => {});
    await db.query('DELETE FROM tbl_bonus_history WHERE user_id=?', [userId]).catch(() => {});
    for (const id of matchIds) await db.query('DELETE FROM tbl_upcoming_match WHERE id=?', [id]);
    await cleanup();
  }
});

// A future-dated copy of an existing live match, so live bets are accepted in tests.
async function cloneFutureMatch() {
  const [src] = await db.query('SELECT * FROM tbl_upcoming_match ORDER BY id DESC LIMIT 1');
  const row = { ...src[0] };
  delete row.id;
  row.match_date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  row.match_time = JSON.stringify(['10:00', '12:00']);
  if ('cancel' in row) row.cancel = 1;
  const cols = Object.keys(row);
  const [ins] = await db.query(
    `INSERT INTO tbl_upcoming_match (${cols.map(c => '`' + c + '`').join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    cols.map(c => row[c])
  );
  return ins.insertId;
}
const authJson = (token) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });
const liveBalance = async (userId) => {
  const [r] = await db.query('SELECT total_amount a FROM tbl_transaction_history WHERE user_id=? ORDER BY trans_id DESC LIMIT 1', [userId]);
  return Number(r[0]?.a ?? 0);
};
const liveBonus = async (userId) => {
  const [r] = await db.query('SELECT total_bonus a FROM tbl_bonus_history WHERE user_id=? ORDER BY bonus_id DESC LIMIT 1', [userId]);
  return Number(r[0]?.a ?? 0);
};
async function dropLiveRows(userIds, matchIds) {
  for (const u of userIds) {
    for (const t of ['tbl_bet', 'tbl_report', 'tbl_bonus_history']) await db.query(`DELETE FROM ${t} WHERE user_id=?`, [u]).catch(() => {});
  }
  for (const m of matchIds) await db.query('DELETE FROM tbl_upcoming_match WHERE id=?', [m]);
}

// ── F-020: only the owner can cancel a live bet, and only once ──
test("F-020: another user cannot cancel a live bet; the owner is refunded exactly once", async () => {
  const owner = await makeTestUser('f020o');
  const other = await makeTestUser('f020x');
  for (const u of [owner, other]) {
    await db.query(`INSERT INTO tbl_transaction_history (user_id, credit_amount, total_amount, type, t_status, transaction_date) VALUES (?, 100, 100, 'Credit', 'Deposit', ?)`, [u.userId, nowSql()]);
  }
  const matchId = await cloneFutureMatch();
  try {
    const place = await fetch(`${API_BASE_URL}/api/live-bet/save`, {
      method: 'POST', headers: authJson(owner.token),
      body: JSON.stringify({ match_id: matchId, minimum_betamount: 10, team_value: 1, toss_id: 1, bet_amount: 40 }),
    });
    assert.strictEqual(place.status, 200, 'the owner must be able to place the bet');
    const [bet] = await db.query('SELECT bet_id FROM tbl_bet WHERE user_id=? AND match_id=?', [owner.userId, matchId]);
    const cancel = (u) => fetch(`${API_BASE_URL}/api/live-bet/cancel`, {
      method: 'POST', headers: authJson(u.token), body: JSON.stringify({ bet_id: bet[0].bet_id, match_id: matchId }),
    });

    const stranger = await cancel(other);
    assert.notStrictEqual(stranger.status, 200, "a different user must not be able to cancel someone else's bet");
    const [still] = await db.query('SELECT status FROM tbl_bet WHERE bet_id=?', [bet[0].bet_id]);
    assert.strictEqual(Number(still[0].status), 1, "the owner's bet must still be active");
    assert.strictEqual(await liveBalance(owner.userId), 60, "the owner's balance must be untouched by the attempt");

    assert.strictEqual((await cancel(owner)).status, 200, 'the owner must be able to cancel their own bet');
    assert.strictEqual(await liveBalance(owner.userId), 100, 'the owner must get the full stake back');
    const again = await cancel(owner);
    assert.notStrictEqual(again.status, 200, 'a second cancel must be refused');
    assert.strictEqual(await liveBalance(owner.userId), 100, 'a second cancel must not refund again');
  } finally {
    await dropLiveRows([owner.userId, other.userId], [matchId]);
    await owner.cleanup();
    await other.cleanup();
  }
});

// ── F-023: only the ticket owner can reply inside a ticket ──
test("F-023: a user cannot post a reply into another user's ticket", async () => {
  const owner = await makeTestUser('f023o');
  const other = await makeTestUser('f023x');
  const token_no = 'REGTEST-F023';
  await db.query(
    `INSERT INTO tbl_support_ticket (token_no, issues, remarks, status, userBy, modified) VALUES (?, 1, 'throwaway', 'Open', ?, NOW())`,
    [token_no, owner.userId]
  );
  const reply = (u, text) => {
    const fd = new FormData();
    fd.append('token_no', token_no); fd.append('issues_id', '1'); fd.append('status', 'Open'); fd.append('editor', text);
    return fetch(`${API_BASE_URL}/api/ticket/reply`, { method: 'POST', headers: { Authorization: `Bearer ${u.token}` }, body: fd });
  };
  try {
    const stranger = await reply(other, 'reply from a different user');
    assert.notStrictEqual(stranger.status, 201, "a different user must not be able to reply into someone else's ticket");
    const [rows] = await db.query('SELECT userBy FROM tbl_support_ticket WHERE token_no=? AND userBy=?', [token_no, other.userId]);
    assert.strictEqual(rows.length, 0, 'no row from the other user may exist in the thread');
    assert.strictEqual((await reply(owner, 'reply from the owner')).status, 201, 'the owner must still be able to reply');
  } finally {
    await db.query('DELETE FROM tbl_support_ticket WHERE token_no=?', [token_no]);
    await owner.cleanup();
    await other.cleanup();
  }
});

// ── F-025: the upload folder must not come from the request ──
test('F-025: a subFolder that climbs out of uploads/ does not create or write outside it', async () => {
  const fs = require('fs');
  const path = require('path');
  const { userId, token, cleanup } = await makeTestUser('f025');
  const token_no = 'REGTEST-F025';
  await db.query(
    `INSERT INTO tbl_support_ticket (token_no, issues, remarks, status, userBy, modified) VALUES (?, 1, 'throwaway', 'Open', ?, NOW())`,
    [token_no, userId]
  );
  const outside = path.join(__dirname, '..', 'audit_traversal_regtest');
  try {
    const fd = new FormData();
    fd.append('subFolder', '../audit_traversal_regtest');
    fd.append('token_no', token_no); fd.append('issues_id', '1'); fd.append('status', 'Open'); fd.append('editor', 'traversal check');
    fd.append('attachment', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'probe.html.png');
    await fetch(`${API_BASE_URL}/api/ticket/reply`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
    assert.ok(!fs.existsSync(outside), 'no folder may be created outside the uploads directory');
  } finally {
    if (fs.existsSync(outside)) fs.rmSync(outside, { recursive: true, force: true });
    const [att] = await db.query('SELECT attachment FROM tbl_support_ticket WHERE token_no=? AND attachment IS NOT NULL', [token_no]);
    for (const a of att) fs.rmSync(path.join(__dirname, '..', 'uploads', 'common', a.attachment), { force: true });
    await db.query('DELETE FROM tbl_support_ticket WHERE token_no=?', [token_no]);
    await cleanup();
  }
});

// ── F-002: the notification image upload needs a login and accepts images only ──
test('F-002: POST /api/notifications/gaming-notif-img needs a login and rejects non-images', async () => {
  const fs = require('fs');
  const path = require('path');
  const { token, cleanup } = await makeTestUser('f002');
  const upload = (headers, blob, name) => {
    const fd = new FormData();
    fd.append('notification_image', blob, name);
    return fetch(`${API_BASE_URL}/api/notifications/gaming-notif-img`, { method: 'POST', headers, body: fd });
  };
  const html = new Blob(['<script>1</script>'], { type: 'text/html' });
  const png = new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' });
  let savedFile = null;
  try {
    assert.notStrictEqual((await upload({}, png, 'a.png')).status, 200, 'an upload with no login must be refused');
    assert.notStrictEqual((await upload({ Authorization: `Bearer ${token}` }, html, 'a.html')).status, 200, 'a non-image must be refused');
    const ok = await upload({ Authorization: `Bearer ${token}` }, png, 'a.png');
    assert.strictEqual(ok.status, 200, 'a logged-in image upload must still work');
    savedFile = (await ok.json()).filePath.split('/').pop();
  } finally {
    if (savedFile) fs.rmSync(path.join(__dirname, '..', 'uploads', 'notification', savedFile), { force: true });
    await cleanup();
  }
});

// ── F-006: logging out must end the session ──
test('F-006: the access token stops working after logout', async () => {
  const { token, cleanup } = await makeTestUser('f006');
  try {
    const details = () => fetch(`${API_BASE_URL}/api/users/details`, { method: 'POST', headers: authJson(token), body: '{}' });
    assert.strictEqual((await details()).status, 200, 'the token must work before logout');
    const out = await fetch(`${API_BASE_URL}/api/users/logout`, { headers: authJson(token) });
    assert.strictEqual(out.status, 200, 'logout must succeed');
    assert.notStrictEqual((await details()).status, 200, 'the same access token must be refused after logout');
  } finally {
    await cleanup();
  }
});

// ── F-007: an OTP expires and locks after wrong guesses ──
test('F-007: an OTP expires after 5 minutes and locks after 5 wrong guesses', async () => {
  const userModel = require('../models/userModel');
  const [cols] = await db.query("SHOW COLUMNS FROM otp_verified WHERE Field IN ('created_at', 'attempts')");
  assert.strictEqual(cols.length, 2, 'run sql/20261110-otp-expiry-and-attempts.sql on this database first');
  const email = 'audit-regtest-f007@invalid.local';
  const phone = '9000000007';
  const addOtp = (otp, minutesAgo) => db.query(
    'INSERT INTO otp_verified (email, phone, otp, otp_type, created_at) VALUES (?, ?, ?, 1, DATE_SUB(NOW(), INTERVAL ? MINUTE))',
    [email, phone, otp, minutesAgo]
  );
  try {
    await addOtp('1234', 0);
    assert.strictEqual(await userModel.checkOtp(email, phone, '1234'), true, 'a fresh, correct code must be accepted');
    assert.strictEqual(await userModel.checkOtp(email, phone, '9999'), false, 'a wrong code must be refused');

    await addOtp('4321', 6);
    assert.strictEqual(await userModel.checkOtp(email, phone, '4321'), false, 'a code older than 5 minutes must be refused even if correct');

    await addOtp('5555', 0);
    for (let i = 0; i < 5; i++) assert.strictEqual(await userModel.checkOtp(email, phone, '0000'), false);
    assert.strictEqual(await userModel.checkOtp(email, phone, '5555'), false, 'after 5 wrong guesses even the correct code must be refused');

    await addOtp('6666', 4);
    assert.strictEqual(await userModel.checkOtp(email, phone, '6666'), true, 'a 4-minute-old code is still valid');
  } finally {
    await db.query('DELETE FROM otp_verified WHERE email=?', [email]);
  }
});

// ── F-014: sensitive endpoints are rate limited ──
test('F-014: login and OTP requests are rate limited per account', async () => {
  assert.notStrictEqual(String(process.env.RATE_LIMIT_DISABLED).toLowerCase(), 'true', 'run this test without RATE_LIMIT_DISABLED');
  const express = require('express');
  const limits = require('../helpers/rateLimiters');
  const app = express();
  app.use(express.json());
  app.post('/login', limits.loginPerAccount, (req, res) => res.json({ ok: true }));
  app.post('/otp', limits.otpPerTarget, (req, res) => res.json({ ok: true }));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const hit = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.status);
  try {
    for (let i = 0; i < 10; i++) assert.strictEqual(await hit('/login', { phone: '9111111111' }), 200, `attempt ${i + 1} is within the limit`);
    assert.strictEqual(await hit('/login', { phone: '9111111111' }), 429, 'the 11th attempt on one account must be refused');
    assert.strictEqual(await hit('/login', { phone: '9222222222' }), 200, 'another account from the same IP is not blocked');
    for (let i = 0; i < 5; i++) assert.strictEqual(await hit('/otp', { email: 'a@invalid.local' }), 200);
    assert.strictEqual(await hit('/otp', { email: 'a@invalid.local' }), 429, 'the 6th OTP request for one email must be refused');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// ── F-022: the minimum bet is the server's own setting ──
test('F-022: a live bet below the server minimum is refused even if the client sends a lower minimum', async (t) => {
  const [cfg] = await db.query("SELECT bet_amount FROM tbl_bet_amount WHERE status = '1' LIMIT 1");
  const min = Number(cfg[0]?.bet_amount || 0);
  if (!(min > 1)) return t.skip('no server minimum above 1 is configured');
  const { userId, token, cleanup } = await makeTestUser('f022');
  await db.query(`INSERT INTO tbl_transaction_history (user_id, credit_amount, total_amount, type, t_status, transaction_date) VALUES (?, 500, 500, 'Credit', 'Deposit', ?)`, [userId, nowSql()]);
  const matchId = await cloneFutureMatch();
  const bet = (amount, forgedMin) => fetch(`${API_BASE_URL}/api/live-bet/save`, {
    method: 'POST', headers: authJson(token),
    body: JSON.stringify({ match_id: matchId, minimum_betamount: forgedMin, team_value: 1, toss_id: 1, bet_amount: amount }),
  }).then(r => r.status);
  try {
    assert.notStrictEqual(await bet(min - 1, 0), 200, 'a bet below the minimum must be refused with a forged minimum of 0');
    assert.notStrictEqual(await bet(min - 1, -1000), 200, 'a bet below the minimum must be refused with a forged negative minimum');
    assert.notStrictEqual(await bet(-5, -1000), 200, 'a negative bet must be refused');
    const [none] = await db.query('SELECT COUNT(*) AS n FROM tbl_bet WHERE user_id=?', [userId]);
    assert.strictEqual(none[0].n, 0, 'no bet row may exist after the refused bets');
    assert.strictEqual(await bet(min, 0), 200, 'a bet at exactly the minimum must be accepted');
  } finally {
    await dropLiveRows([userId], [matchId]);
    await cleanup();
  }
});

// ── F-024: change-primary only works on the caller's own account ──
test("F-024: change-primary with someone else's account id leaves the caller's primary account alone", async () => {
  const me = await makeTestUser('f024me');
  const other = await makeTestUser('f024ot');
  const addAccount = async (uid, primary) => (await db.query(
    `INSERT INTO tbl_user_account (user_id, bank_name, account_number, ifsc, ac_holder_name, account_type, upi_id, phone_pay, g_pay, paytm, primary_account, modified)
     VALUES (?, 'Test Bank', '0000000000', 'TEST0000000', 'Test', 'savings', 'test@upi', '9000000000', '9000000000', '9000000000', ?, ?)`,
    [uid, primary, nowSql()]
  ))[0].insertId;
  const mine1 = await addAccount(me.userId, 1);
  const mine2 = await addAccount(me.userId, 0);
  const theirs = await addAccount(other.userId, 0);
  const change = (id) => fetch(`${API_BASE_URL}/api/account/change-primary`, { method: 'POST', headers: authJson(me.token), body: JSON.stringify({ account_id: id }) });
  const primaryOf = async (uid) => (await db.query('SELECT ac_id FROM tbl_user_account WHERE user_id=? AND primary_account=1', [uid]))[0].map(r => r.ac_id);
  try {
    const bad = await change(theirs);
    assert.notStrictEqual(bad.status, 200, "another user's account id must be refused");
    assert.deepStrictEqual(await primaryOf(me.userId), [mine1], "the caller's own primary account must be untouched");
    assert.deepStrictEqual(await primaryOf(other.userId), [], "the other user's accounts must be untouched");
    assert.strictEqual((await change(mine2)).status, 200, "switching to the caller's own other account must work");
    assert.deepStrictEqual(await primaryOf(me.userId), [mine2], 'exactly one primary account after the switch');
  } finally {
    await me.cleanup();
    await other.cleanup();
  }
});

// ── F-028: registering with a referral code must not crash after the account is created ──
test('F-028: registration with a referral code succeeds and records the referral', async () => {
  const userService = require('../services/userService');
  const stamp = String(Date.now()).slice(-8);
  const phones = [`7${stamp}0`, `7${stamp}1`, `7${stamp}2`];
  const emails = ['audit-regtest-f028a@invalid.local', 'audit-regtest-f028b@invalid.local', 'audit-regtest-f028c@invalid.local'];
  const referrer = await makeTestUser('f028ref');
  await db.query('UPDATE tbl_registration SET referral_code=? WHERE id=?', ['GHREGTEST028', referrer.userId]);
  const [bonusCfg] = await db.query('SELECT id, bonus_amount FROM tbl_referral_bonus WHERE status = 1 ORDER BY id LIMIT 1');
  const originalAmount = bonusCfg[0].bonus_amount;
  const [couponIns] = await db.query(
    `INSERT INTO tbl_coupon_code (code, price, status, is_delete, addedby, is_admin, modified) VALUES ('REGTEST028', 40, 1, 1, 1, 1, NOW())`
  );
  const signUp = (i, referralCode) => userService.registerUser({
    first_name: 'Audit', last_name: 'Referral', email: emails[i], password: 'Reg#Test123', phone: phones[i],
    pincode: '110001', is_eighteen: 1, is_referral: 1, refer_to: referralCode,
  }, '127.0.0.1');
  const idOf = async (email) => (await db.query('SELECT id FROM tbl_registration WHERE email=?', [email]))[0][0]?.id;
  try {
    await db.query('UPDATE tbl_referral_bonus SET bonus_amount = 25 WHERE id = ?', [bonusCfg[0].id]);

    await signUp(0, 'GHREGTEST028');
    const userA = await idOf(emails[0]);
    assert.ok(userA, 'the account must exist');
    const [histA] = await db.query('SELECT COUNT(*) AS n FROM tbl_referral_history WHERE referal_uid=?', [userA]);
    assert.ok(histA[0].n >= 1, 'a user-referral must be recorded in tbl_referral_history');
    const [bonusA] = await db.query('SELECT COUNT(*) AS n FROM tbl_bonus_history WHERE user_id IN (?, ?)', [userA, referrer.userId]);
    assert.ok(bonusA[0].n >= 1, 'a referral bonus row must be written');

    await signUp(1, 'REGTEST028');
    const userB = await idOf(emails[1]);
    assert.ok(userB, 'signup with an admin coupon code must succeed');
    const [bonusB] = await db.query('SELECT credit_bonus FROM tbl_bonus_history WHERE user_id=? ORDER BY bonus_id DESC LIMIT 1', [userB]);
    assert.strictEqual(Number(bonusB[0]?.credit_bonus), 40, 'the coupon value must be credited');

    await signUp(2, 'NO-SUCH-CODE');
    assert.ok(await idOf(emails[2]), 'signup with an unknown referral code must still succeed');
  } finally {
    await db.query('UPDATE tbl_referral_bonus SET bonus_amount = ? WHERE id = ?', [originalAmount, bonusCfg[0].id]);
    await db.query('DELETE FROM tbl_coupon_code WHERE id=?', [couponIns.insertId]);
    for (const email of emails) {
      const id = await idOf(email);
      if (!id) continue;
      await db.query('DELETE FROM tbl_referral_history WHERE referal_uid=? OR referto_uid=?', [id, id]);
      await db.query('DELETE FROM tbl_bonus_history WHERE user_id=?', [id]);
      await db.query('DELETE FROM tbl_registration WHERE id=?', [id]);
    }
    await db.query('DELETE FROM tbl_referral_history WHERE referto_uid=?', [referrer.userId]);
    await db.query('DELETE FROM tbl_bonus_history WHERE user_id=?', [referrer.userId]);
    await referrer.cleanup();
  }
});

// ── F-016: no framework header, no public API docs page ──
test('F-016: responses do not advertise Express and /api-docs is not served', async () => {
  const res = await fetch(`${API_BASE_URL}/api/blogs?page=1&perPage=1`);
  assert.strictEqual(res.headers.get('x-powered-by'), null, 'the X-Powered-By header must be absent');
  assert.strictEqual(res.status, 200, 'normal API calls must still work');
  assert.strictEqual(res.headers.get('access-control-allow-origin'), '*', 'CORS is unchanged on purpose');
  for (const url of ['/api-docs', '/api-docs/', '/api-docs/swagger-ui-init.js']) {
    const docs = await fetch(`${API_BASE_URL}${url}`);
    assert.strictEqual(docs.status, 404, `${url} must no longer be served`);
  }
});

// ── F-031: the mail connection verifies the server certificate and does not log the conversation ──
test('F-031: SMTP uses certificate verification and has no debug logging', async () => {
  const nodemailer = require('nodemailer');
  const original = nodemailer.createTransport;
  const saved = process.env.SMTP_ALLOW_SELF_SIGNED;
  let options = null;
  nodemailer.createTransport = (opts) => { options = opts; return { verify: async () => true, sendMail: async () => ({}) }; };
  try {
    delete process.env.SMTP_ALLOW_SELF_SIGNED;
    await require('../helpers/sendMail')('audit@invalid.local', 'subject', '<p>x</p>');
    assert.ok(options, 'the transport must have been created');
    assert.strictEqual(options.tls.rejectUnauthorized, true, 'certificates must be verified by default');
    assert.ok(!options.debug && !options.logger, 'SMTP debug logging must be off');
    process.env.SMTP_ALLOW_SELF_SIGNED = 'true';
    await require('../helpers/sendMail')('audit@invalid.local', 'subject', '<p>x</p>');
    assert.strictEqual(options.tls.rejectUnauthorized, false, 'the explicit self-signed switch still works');
  } finally {
    nodemailer.createTransport = original;
    if (saved === undefined) delete process.env.SMTP_ALLOW_SELF_SIGNED; else process.env.SMTP_ALLOW_SELF_SIGNED = saved;
  }
});

// ── F-032: page size is capped on list endpoints ──
test('F-032: a huge perPage cannot pull a whole table', async () => {
  const { token, cleanup } = await makeTestUser('f032');
  try {
    let res = await (await fetch(`${API_BASE_URL}/api/with-proof/latest-records?page=1&perPage=100000`)).json();
    assert.ok(res.data.length <= 75, `the public proof list must never return more than 75 rows (got ${res.data.length})`);
    assert.ok(res.perPage <= 75, 'the reported page size must be capped');
    res = await (await fetch(`${API_BASE_URL}/api/with-proof/latest-records?page=1000&perPage=50`)).json();
    assert.strictEqual(res.data.length, 0, 'pages beyond the 75th row must be empty');
    const bad = await fetch(`${API_BASE_URL}/api/with-proof/latest-records?page=abc&perPage=xyz`);
    assert.strictEqual(bad.status, 200, 'non-numeric paging values must fall back to defaults, not crash');

    res = await (await fetch(`${API_BASE_URL}/api/blogs?page=1&perPage=100000`)).json();
    assert.ok(res.perPage <= 100, 'public lists are capped at 100 per page');
    res = await (await fetch(`${API_BASE_URL}/api/withdrawal/history?page=1&perPage=100000`, { headers: authJson(token) })).json();
    assert.ok(res.perPage <= 100, 'logged-in lists are capped at 100 per page');
    res = await (await fetch(`${API_BASE_URL}/api/deposit/history?page=1&perPage=100000`, { headers: authJson(token) })).json();
    assert.strictEqual(res.perPage, 1000, 'deposit history keeps its higher cap of 1000 (the deposit screen asks for 1000)');
    res = await (await fetch(`${API_BASE_URL}/api/blogs?page=1&perPage=6`)).json();
    assert.strictEqual(res.perPage, 6, 'a normal page size is passed through unchanged');
  } finally {
    await cleanup();
  }
});

// ── F-033: contact-form text is escaped in the email, and the form is rate limited ──
test('F-033: contact form text is escaped in the email and submissions are rate limited', async () => {
  const nodemailer = require('nodemailer');
  const original = nodemailer.createTransport;
  let mail = null;
  nodemailer.createTransport = () => ({ verify: async () => true, sendMail: async (m) => { mail = m; return {}; } });
  try {
    const contactUsService = require('../services/contactUsService');
    await contactUsService.sendEmail({
      contact_name: '<b>Bob</b>', contact_email: 'x@y.z"><a href="https://evil.example">', contact_phone: '1',
      contact_message: '<script>alert(1)</script>\nsecond line',
    });
    assert.ok(mail, 'an email must have been built');
    const html = String(mail.html);
    assert.ok(!/<script/i.test(html) && !/<b>Bob/.test(html) && !/<a href=/i.test(html), 'visitor-supplied markup must not appear as markup');
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && html.includes('&lt;b&gt;Bob&lt;/b&gt;'), 'it must appear as escaped text');
    assert.ok(html.includes('second line'), 'ordinary text is kept');
  } finally {
    nodemailer.createTransport = original;
  }

  assert.notStrictEqual(String(process.env.RATE_LIMIT_DISABLED).toLowerCase(), 'true', 'run this test without RATE_LIMIT_DISABLED');
  const express = require('express');
  const limits = require('../helpers/rateLimiters');
  const app = express();
  app.post('/contact', limits.contactForm, (req, res) => res.json({ ok: true }));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  try {
    const hit = () => fetch(`http://127.0.0.1:${server.address().port}/contact`, { method: 'POST' }).then(r => r.status);
    for (let i = 0; i < 5; i++) assert.strictEqual(await hit(), 200);
    assert.strictEqual(await hit(), 429, 'the 6th contact submission within an hour must be refused');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// ── F-018: a user must not be able to bet more than their real balance via concurrent bets ──
test('F-018: two simultaneous coin-flip bets on one match cannot together exceed the real balance', async () => {
  const { userId, token, cleanup } = await makeTestUser('f018');
  await makeCoinFlipEligible(userId);
  await db.query(
    `INSERT INTO tbl_transaction_history (user_id, credit_amount, total_amount, type, t_status, transaction_date)
     VALUES (?, 100.00, 100.00, 'Credit', 'Deposit', ?)`, [userId, nowSql()]
  );
  const future = new Date(Date.now() + 40000);
  const [matchIns] = await db.query(
    `INSERT INTO tbl_upcoming_match_coinflip
     (match_name, match_date, match_time, isHomePage, win_ratio, status, isLive, cancel, result, \`repeat\`, userBy, modified, archive, copyof, winner_generated)
     VALUES ('Regression Test Match', ?, ?, 0, '90', 1, 0, 1, 'Automatic', 0, ?, ?, '0', 0, 0)`,
    [future.toISOString().slice(0, 10), future.toTimeString().slice(0, 8), userId, nowSql()]
  );
  const matchId = matchIns.insertId;
  try {
    const placeBet = () => fetch(`${API_BASE_URL}/api/coin-flip/save-bet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ match_id: matchId, prediction: 'Head', minimum_betamount: 10, bet_amount: 100 }),
    }).then(r => r.json());

    const [r1, r2] = await Promise.all([placeBet(), placeBet()]);
    const successes = [r1, r2].filter(r => r.message === 'Coin Flip bet placed successfully!').length;
    assert.strictEqual(successes, 1,
      `a Rs 100 balance must allow exactly one Rs 100 bet to succeed on this match; ${successes} of 2 simultaneous bets succeeded`);

    const [bets] = await db.query('SELECT COUNT(*) AS n FROM tbl_coin_bet WHERE user_id=? AND match_id=?', [userId, matchId]);
    assert.strictEqual(bets[0].n, 1, 'exactly one bet row must exist');
    const [debits] = await db.query(
      "SELECT COUNT(*) AS n, MIN(total_amount) AS bal FROM tbl_transaction_history WHERE user_id=? AND type='Debit'", [userId]);
    assert.strictEqual(debits[0].n, 1, 'exactly one wallet debit must be recorded');
    assert.strictEqual(Number(debits[0].bal), 0, 'the ledger balance after the bet must be 0');
  } finally {
    await db.query('DELETE FROM tbl_coin_bet WHERE user_id=?', [userId]);
    await db.query('DELETE FROM tbl_upcoming_match_coinflip WHERE id=?', [matchId]);
    await cleanup();
  }
});
