const crypto = require('crypto');
const moment = require('moment-timezone');
const db = require('../config/database');

// Table from sql/20261130-password-change-attempt.sql. Times are India time strings made here, like the rest of
// the app (the database driver shifts DATETIME columns by the time zone setting, so every time read back is
// formatted by MySQL into plain text). Without the table everything here does nothing: the old password is
// still checked by the caller, there is just no 3-attempt block.
const FORMAT = 'YYYY-MM-DD HH:mm:ss';
const ist = (addMinutes = 0) => moment().tz('Asia/Kolkata').add(addMinutes, 'minutes').format(FORMAT);

const missingTable = (error) => error && error.code === 'ER_NO_SUCH_TABLE';

class PasswordChangeAttemptModel {
    // A short fingerprint of the saved password hash. The attempts belong to one password: when it changes by any
    // route the fingerprint no longer matches and the old row is dropped.
    static fingerprintOf(passwordHash) {
        return crypto.createHash('sha256').update(String(passwordHash || '')).digest('hex').slice(0, 16);
    }

    // When the block ends (India time text) if this user is blocked now, otherwise null.
    static async activeBlock(userId, fingerprint) {
        try {
            await db.promise().query(
                'DELETE FROM tbl_password_change_attempt WHERE user_id = ? AND pwd_fingerprint <> ?',
                [userId, fingerprint]
            );
            const [rows] = await db.promise().query(
                `SELECT DATE_FORMAT(blocked_until, '%Y-%m-%d %H:%i:%s') AS blocked_until
                 FROM tbl_password_change_attempt
                 WHERE user_id = ? AND blocked_until IS NOT NULL AND blocked_until > ?`,
                [userId, ist(0)]
            );
            return rows[0] ? rows[0].blocked_until : null;
        } catch (error) {
            if (missingTable(error)) return null;
            throw error;
        }
    }

    // Counts one wrong old password. The count is taken in a single statement, so a burst of parallel guesses
    // cannot slip past the limit. Returns { count, blockedUntil, counted } (blockedUntil is set once the limit is
    // reached; counted is false for a guess that arrived just after another one started the block and was not
    // counted), or null when the table does not exist.
    static async registerFailure(userId, fingerprint, maxAttempts, blockMinutes, windowMinutes) {
        try {
            const now = ist(0);
            const blockUntil = ist(blockMinutes);

            await db.promise().query(
                `INSERT INTO tbl_password_change_attempt (user_id, pwd_fingerprint, failed_count)
                 VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE user_id = user_id`,
                [userId, fingerprint]
            );
            // Forget a finished block, and wrong passwords that were typed more than a window ago.
            await db.promise().query(
                `UPDATE tbl_password_change_attempt SET failed_count = 0, blocked_until = NULL
                 WHERE user_id = ?
                   AND ((blocked_until IS NOT NULL AND blocked_until <= ?)
                     OR (blocked_until IS NULL AND last_failed_at IS NOT NULL AND last_failed_at <= ?))`,
                [userId, now, ist(-windowMinutes)]
            );
            // blocked_until is set first on purpose: it sees the count as it was before this guess.
            const [result] = await db.promise().query(
                `UPDATE tbl_password_change_attempt
                 SET blocked_until = IF(failed_count + 1 >= ?, ?, blocked_until),
                     failed_count = LAST_INSERT_ID(failed_count + 1),
                     last_failed_at = ?
                 WHERE user_id = ? AND (blocked_until IS NULL OR blocked_until <= ?)`,
                [maxAttempts, blockUntil, now, userId, now]
            );

            if (result.affectedRows !== 1) {
                // Another request blocked this user a moment ago.
                return { count: maxAttempts, blockedUntil: await this.activeBlock(userId, fingerprint), counted: false };
            }
            const count = result.insertId;
            return { count, blockedUntil: count >= maxAttempts ? blockUntil : null, counted: true };
        } catch (error) {
            if (missingTable(error)) return null;
            throw error;
        }
    }

    // After the password was changed.
    static async clear(userId) {
        try {
            await db.promise().query('DELETE FROM tbl_password_change_attempt WHERE user_id = ?', [userId]);
        } catch (error) {
            if (!missingTable(error)) throw error;
        }
    }
}

module.exports = PasswordChangeAttemptModel;
