const crypto = require('crypto');
const moment = require('moment-timezone');
const db = require('../config/database');

// Table from sql/20261128-login-block.sql. The database driver turns DATETIME columns into JavaScript dates
// shifted by the time zone setting (config/database.js), so every time read back here is formatted by
// MySQL into a plain 'YYYY-MM-DD HH:mm:ss' string instead. Times are India time strings made here, like the rest of the app
// (and like tbl_auth_activity_log.created_at, which the failed attempts are counted from), so they always
// compare with each other whatever the database's own time zone is.
const FORMAT = 'YYYY-MM-DD HH:mm:ss';
const ist = (addMinutes = 0) => moment().tz('Asia/Kolkata').add(addMinutes, 'minutes').format(FORMAT);

// Only these failures count: a wrong password, or a phone that has no account. A refused blocked account,
// a wrong emailed code and a blocked attempt itself do not.
const COUNTED_REASONS = ['wrong_password', 'unknown_phone'];

class LoginBlockModel {
    static now() {
        return ist(0);
    }

    static minutesFromNow(minutes) {
        return ist(minutes);
    }

    // The active block that applies to this IP or this phone, longest first. Either may be null.
    static async findActive(ip, phone) {
        const clauses = [];
        const params = [ist(0)];
        if (ip) { clauses.push("(block_type = 'ip' AND block_value = ?)"); params.push(ip); }
        if (phone) { clauses.push("(block_type = 'phone' AND block_value = ?)"); params.push(phone); }
        if (!clauses.length) return null;
        const [rows] = await db.promise().query(
            `SELECT id, block_type, block_value, DATE_FORMAT(blocked_until, '%Y-%m-%d %H:%i:%s') AS blocked_until
             FROM tbl_login_block
             WHERE released_at IS NULL AND blocked_until > ? AND (${clauses.join(' OR ')})
             ORDER BY blocked_until DESC LIMIT 1`,
            params
        );
        return rows[0] || null;
    }

    // When the count for this IP starts over: the later of the window start, the IP's last good login and
    // the last time an admin unblocked it. Attempts before that do not count.
    static async countStart(ip, windowMinutes) {
        const [success] = await db.promise().query(
            "SELECT DATE_FORMAT(MAX(created_at), '%Y-%m-%d %H:%i:%s') AS t FROM tbl_auth_activity_log WHERE ip_address = ? AND event_type = 'login' AND status = 'success'",
            [ip]
        );
        const [released] = await db.promise().query(
            "SELECT DATE_FORMAT(MAX(released_at), '%Y-%m-%d %H:%i:%s') AS t FROM tbl_login_block WHERE block_type = 'ip' AND block_value = ?",
            [ip]
        );
        return [ist(-windowMinutes), success[0].t, released[0].t].filter(Boolean).sort().pop();
    }

    // The counted failed attempts from this IP since `since`: how many, and which phones were typed.
    static async recentFailures(ip, since) {
        const [rows] = await db.promise().query(
            `SELECT phone_entered FROM tbl_auth_activity_log
             WHERE ip_address = ? AND event_type = 'login' AND status = 'failed' AND auth_method = 'password'
               AND fail_reason IN (?) AND created_at > ?
             ORDER BY id DESC LIMIT 100`,
            [ip, COUNTED_REASONS, since]
        );
        const phones = [...new Set(rows.map((row) => row.phone_entered).filter(Boolean))];
        return { count: rows.length, phones };
    }

    // The accounts behind the phones that were typed (a phone with no account has nothing to block).
    static async accountsForPhones(phones) {
        if (!phones.length) return [];
        const [rows] = await db.promise().query('SELECT id, phone FROM tbl_registration WHERE phone IN (?)', [phones]);
        return rows;
    }

    // One row for the IP and one per account phone, all ending at the same time and sharing one event key.
    static async createBlock({ ip, accounts, failedCount, untilText }) {
        const eventKey = crypto.randomUUID();
        const blockedAt = ist(0);
        const insert = (type, value, userId) => db.promise().query(
            `INSERT INTO tbl_login_block (event_key, block_type, block_value, user_id, failed_count, blocked_at, blocked_until)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [eventKey, type, value, userId, failedCount, blockedAt, untilText]
        );
        await insert('ip', ip, null);
        for (const account of accounts) {
            await insert('phone', String(account.phone), account.id);
        }
        return { eventKey, blockedUntil: untilText };
    }
}

LoginBlockModel.COUNTED_REASONS = COUNTED_REASONS;
module.exports = LoginBlockModel;
