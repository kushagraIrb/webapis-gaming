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
