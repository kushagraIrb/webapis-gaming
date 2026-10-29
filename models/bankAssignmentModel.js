const db = require('../config/database');
const moment = require('moment-timezone');

// All SQL of the Bank Account Assignment feature (tables created by gamingAdminNode/migrations/20261023-*.sql).
// Every function takes the connection it must run on, because the service runs a whole assignment inside one
// transaction under a row lock. Times are IST wall-clock strings (YYYY-MM-DD HH:mm:ss), written and compared
// as strings; DATETIME columns that are read back are formatted in SQL so no timezone conversion can creep in.

const FMT = (col) => `DATE_FORMAT(${col}, '%Y-%m-%d %H:%i:%s')`;
const ASSIGNMENT_COLS = `id, user_id, bank_id, amount, source, chain_id, tried_bank_ids, status,
    ${FMT('shown_at')} AS shown_at, ${FMT('valid_until')} AS valid_until, ${FMT('hard_until')} AS hard_until,
    ${FMT('created_at')} AS created_at`;

const DEFAULT_SETTINGS = {
    alert_users: 10,
    alert_window_minutes: 60,
    assignment_minutes: 30,
    assignment_max_minutes: 120,
    balance_percent: 20,
    min_volume_amount: 50000,
    switch_cooldown_seconds: 2,
    previous_accounts_shown: 2,
};
const SETTINGS_TTL_MS = 60 * 1000;
let settingsCache = { at: 0, value: DEFAULT_SETTINGS };

class BankAssignmentModel {
    static async getConnection() {
        return db.promise().getConnection();
    }

    // Settings from tbl_ba_setting, cached for a minute. Missing rows or table fall back to the agreed defaults.
    static async getSettings() {
        if (Date.now() - settingsCache.at < SETTINGS_TTL_MS) return settingsCache.value;
        const value = { ...DEFAULT_SETTINGS };
        try {
            const [rows] = await db.promise().query('SELECT setting_key, setting_value FROM tbl_ba_setting');
            for (const r of rows) {
                const n = Number(r.setting_value);
                if (r.setting_key in value && Number.isFinite(n)) value[r.setting_key] = n;
            }
        } catch (error) {
            if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
        }
        settingsCache = { at: Date.now(), value };
        return value;
    }

    static clearSettingsCache() {
        settingsCache = { at: 0, value: DEFAULT_SETTINGS };
    }

    // The feature is "configured" once an admin has set up at least one enabled range that has an account.
    // Until then (for example right after the migrations ran) the deposit page keeps using the old rotation.
    static async isConfigured() {
        try {
            const [rows] = await db.promise().query(
                `SELECT 1 FROM tbl_ba_range r JOIN tbl_ba_account a ON a.range_id = r.id AND a.role = 'RANGE'
                 WHERE r.status = 1 LIMIT 1`
            );
            return rows.length > 0;
        } catch (error) {
            if (error.code === 'ER_NO_SUCH_TABLE') return false;
            throw error;
        }
    }

    static async findRangeForAmount(conn, amount) {
        const [rows] = await conn.query(
            `SELECT id, name, min_amount, max_amount FROM tbl_ba_range
             WHERE status = 1 AND ? BETWEEN min_amount AND max_amount ORDER BY id LIMIT 1`,
            [amount]
        );
        return rows[0] || null;
    }

    // Serialises everybody who is being assigned an account of the same range
    static async lockRange(conn, rangeId) {
        await conn.query('SELECT id FROM tbl_ba_range WHERE id = ? FOR UPDATE', [rangeId]);
    }

    static async lockUniversal(conn) {
        await conn.query("SELECT bank_id FROM tbl_ba_account WHERE role = 'UNIVERSAL' FOR UPDATE");
    }

    // Enabled accounts of a range with today's counted total and the amounts currently held by live assignments
    static async rangeAccounts(conn, rangeId, today, now) {
        const [rows] = await conn.query(
            `SELECT a.bank_id AS bankId, a.daily_limit AS dailyLimit, UNIX_TIMESTAMP(a.last_assigned_at) AS lastAssigned
             FROM tbl_ba_account a
             JOIN tbl_bank_details b ON b.id = a.bank_id AND b.status = 1
             WHERE a.role = 'RANGE' AND a.range_id = ?`,
            [rangeId]
        );
        if (rows.length === 0) return [];
        const ids = rows.map((r) => r.bankId);
        // counted deposits of today and the amounts held by live assignments: one grouped query each (a subquery per
        // account was several times slower on a year of data)
        const [counted] = await conn.query(
            `SELECT e.bank_id AS bankId, SUM(e.amount) AS total
               FROM tbl_ba_deposit_entry e
               LEFT JOIN tbl_deposit_list d ON d.id = e.deposit_list_id
              WHERE e.bank_id IN (?) AND e.entry_date = ? AND e.state = 'COUNTED'
                AND (d.id IS NULL OR (d.fake_deposit = 0 AND d.status <> 2))
              GROUP BY e.bank_id`,
            [ids, today]
        );
        const [held] = await conn.query(
            `SELECT h.bank_id AS bankId, SUM(h.amount) AS total
               FROM tbl_ba_assignment h
              WHERE h.bank_id IN (?) AND h.status = 'LIVE' AND h.valid_until > ?
              GROUP BY h.bank_id`,
            [ids, now]
        );
        const countedBy = Object.fromEntries(counted.map((r) => [r.bankId, Number(r.total)]));
        const heldBy = Object.fromEntries(held.map((r) => [r.bankId, Number(r.total)]));
        return rows.map((r) => ({
            bankId: r.bankId,
            dailyLimit: r.dailyLimit == null ? null : Number(r.dailyLimit),
            lastAssignedAt: r.lastAssigned == null ? null : Number(r.lastAssigned),
            dayTotal: (countedBy[r.bankId] || 0) + (heldBy[r.bankId] || 0),
        }));
    }

    static async universalAccounts(conn) {
        const [rows] = await conn.query(
            `SELECT a.bank_id AS bankId, UNIX_TIMESTAMP(a.last_assigned_at) AS lastAssigned
             FROM tbl_ba_account a JOIN tbl_bank_details b ON b.id = a.bank_id AND b.status = 1
             WHERE a.role = 'UNIVERSAL'`
        );
        return rows.map((r) => ({ bankId: r.bankId, lastAssignedAt: r.lastAssigned == null ? null : Number(r.lastAssigned) }));
    }

    // How an account is set up and whether it can be used for this amount right now (a paused account still counts
    // as usable here: a user who already holds it keeps it)
    static async getAccountState(conn, bankId) {
        const [rows] = await conn.query(
            `SELECT b.id AS bankId, b.status AS bankStatus, a.role, a.range_id AS rangeId, a.daily_limit AS dailyLimit,
                    r.status AS rangeStatus, r.min_amount AS minAmount, r.max_amount AS maxAmount
             FROM tbl_bank_details b
             LEFT JOIN tbl_ba_account a ON a.bank_id = b.id
             LEFT JOIN tbl_ba_range r ON r.id = a.range_id
             WHERE b.id = ?`,
            [bankId]
        );
        return rows[0] || null;
    }

    static async getBank(conn, bankId) {
        const [rows] = await conn.query('SELECT * FROM tbl_bank_details WHERE id = ?', [bankId]);
        return rows[0] || null;
    }

    static async getBanks(conn, bankIds) {
        if (!bankIds.length) return [];
        const [rows] = await conn.query('SELECT * FROM tbl_bank_details WHERE id IN (?)', [bankIds]);
        return rows;
    }

    // ── assignments ─────────────────────────────────────────────────────────────

    static async findLiveAssignment(conn, userId, now, lock = false) {
        const [rows] = await conn.query(
            `SELECT ${ASSIGNMENT_COLS} FROM tbl_ba_assignment
             WHERE user_id = ? AND status = 'LIVE' AND valid_until > ? AND hard_until > ?
             ORDER BY id DESC LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`,
            [userId, now, now]
        );
        return rows[0] || null;
    }

    static async getAssignment(conn, id, userId, lock = false) {
        const [rows] = await conn.query(
            `SELECT ${ASSIGNMENT_COLS} FROM tbl_ba_assignment WHERE id = ? AND user_id = ? ${lock ? 'FOR UPDATE' : ''}`,
            [id, userId]
        );
        return rows[0] || null;
    }

    // Marks this user's assignments whose time has run out as EXPIRED (they are only ever "live" while valid)
    static async expireStale(conn, userId, now) {
        await conn.query(
            "UPDATE tbl_ba_assignment SET status = 'EXPIRED' WHERE user_id = ? AND status = 'LIVE' AND (valid_until <= ? OR hard_until <= ?)",
            [userId, now, now]
        );
    }

    static async insertAssignment(conn, a) {
        const [result] = await conn.query(
            `INSERT INTO tbl_ba_assignment
               (user_id, bank_id, amount, source, chain_id, tried_bank_ids, status, shown_at, last_seen_at, valid_until, hard_until, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 'LIVE', ?, ?, ?, ?, ?)`,
            [a.userId, a.bankId, a.amount, a.source, a.chainId || null, a.tried || null, a.shownAt || null, a.now, a.validUntil, a.hardUntil, a.now]
        );
        if (!a.chainId) await conn.query('UPDATE tbl_ba_assignment SET chain_id = id WHERE id = ?', [result.insertId]);
        // milliseconds, so a burst of users within one second still rotates fairly. Stamped now (we hold the locks), not
        // when the request started, and GREATEST so a slow request can never move it back.
        const stamp = moment().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss.SSS');
        await conn.query(
            'UPDATE tbl_ba_account SET last_assigned_at = GREATEST(COALESCE(last_assigned_at, ?), ?) WHERE bank_id = ?',
            [stamp, stamp, a.bankId]
        );
        return result.insertId;
    }

    static async setAssignmentStatus(conn, id, status) {
        await conn.query('UPDATE tbl_ba_assignment SET status = ? WHERE id = ?', [status, id]);
    }

    static async touchAssignment(conn, id, { now, validUntil, amount }) {
        await conn.query(
            'UPDATE tbl_ba_assignment SET last_seen_at = ?, valid_until = ?, amount = ? WHERE id = ?',
            [now, validUntil, amount, id]
        );
    }

    static async markShown(conn, id, now, validUntil) {
        await conn.query(
            'UPDATE tbl_ba_assignment SET shown_at = COALESCE(shown_at, ?), last_seen_at = ?, valid_until = ? WHERE id = ?',
            [now, now, validUntil, id]
        );
    }

    // Accounts this user has actually seen (Step 2 loaded), newest first, one row per account
    static async shownBankIds(conn, userId, scan = 30) {
        const [rows] = await conn.query(
            `SELECT bank_id, MAX(shown_at) AS last_shown FROM tbl_ba_assignment
             WHERE user_id = ? AND shown_at IS NOT NULL GROUP BY bank_id ORDER BY last_shown DESC LIMIT ?`,
            [userId, scan]
        );
        return rows.map((r) => r.bank_id);
    }

    static async insertIssueReport(conn, { userId, bankId, assignmentId, amount, reason, now }) {
        await conn.query(
            `INSERT INTO tbl_ba_issue_report (user_id, bank_id, assignment_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, bankId, assignmentId, amount, reason, now]
        );
    }

    // ── "unable to pay" alerts ───────────────────────────────────────────────────

    // Different users who reported this account since `since` (IST string)
    // `strictlyAfter`: the bound is the moment the last alert was dealt with, so reports made in that same second
    // belong to the old alert
    static async countReporters(bankId, since, strictlyAfter = false) {
        const [[row]] = await db.promise().query(
            `SELECT COUNT(DISTINCT user_id) AS n FROM tbl_ba_issue_report WHERE bank_id = ? AND created_at ${strictlyAfter ? '>' : '>='} ?`,
            [bankId, since]
        );
        return Number(row.n);
    }

    // When the last alert of this account was dealt with (reports before that no longer count toward a new alert)
    static async lastResolvedAt(bankId) {
        const [[row]] = await db.promise().query(
            "SELECT DATE_FORMAT(MAX(resolved_at), '%Y-%m-%d %H:%i:%s') AS at FROM tbl_ba_alert WHERE bank_id = ? AND status = 'RESOLVED'",
            [bankId]
        );
        return row && row.at ? row.at : null;
    }

    // The open alert of an account and how many admins were told about it
    static async openAlertNotices(bankId) {
        const [[row]] = await db.promise().query(
            `SELECT al.id, (SELECT COUNT(*) FROM tbl_ba_alert_notice n WHERE n.alert_id = al.id) AS told
               FROM tbl_ba_alert al WHERE al.bank_id = ? AND al.status = 'OPEN' LIMIT 1`,
            [bankId]
        );
        return row ? { id: row.id, told: Number(row.told) } : null;
    }

    // Opens the alert unless one is already open for the account (the unique key guarantees one). Returns the new
    // alert id, or null when it was already open (its user count is refreshed).
    static async openAlert(bankId, userCount, now) {
        const pool = db.promise();
        const [res] = await pool.query(
            "INSERT IGNORE INTO tbl_ba_alert (bank_id, open_bank_id, status, user_count, opened_at) VALUES (?, ?, 'OPEN', ?, ?)",
            [bankId, bankId, userCount, now]
        );
        if (res.affectedRows === 1) return res.insertId;
        await pool.query("UPDATE tbl_ba_alert SET user_count = ? WHERE bank_id = ? AND status = 'OPEN'", [userCount, bankId]);
        return null;
    }

    // ── deposit link ────────────────────────────────────────────────────────────

    static async recordDepositEntry(conn, { depositListId, userId, bankId, assignmentId, amount, entryDate, flagged, flagReason, now }) {
        await conn.query(
            `INSERT INTO tbl_ba_deposit_entry
               (deposit_list_id, user_id, bank_id, assignment_id, amount, entry_date, state, flagged, flag_reason, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'COUNTED', ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)`,
            [depositListId, userId, bankId, assignmentId, amount, entryDate, flagged ? 1 : 0, flagReason || null, now, now]
        );
        await conn.query(
            'UPDATE tbl_deposit_list SET bank_id = ?, assignment_id = ?, bank_changed_flag = ? WHERE id = ?',
            [bankId, assignmentId, flagged ? 1 : 0, depositListId]
        );
    }
}

module.exports = BankAssignmentModel;
