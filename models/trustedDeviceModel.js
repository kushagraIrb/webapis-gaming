const db = require('../config/database');

// Tables come from sql/20261123-new-device-login-otp.sql. All time comparisons use the
// database clock (NOW()), so the API server's time zone can never skew an expiry.
class TrustedDeviceModel {
    static async isTrusted(userId, deviceHash) {
        const [rows] = await db.promise().query(
            'SELECT id FROM tbl_user_trusted_device WHERE user_id = ? AND device_hash = ? LIMIT 1',
            [userId, deviceHash]
        );
        if (!rows.length) {
            return false;
        }
        await db.promise().query('UPDATE tbl_user_trusted_device SET last_used_at = NOW() WHERE id = ?', [rows[0].id]);
        return true;
    }

    static async addTrusted(userId, deviceHash, browser, ipAddress) {
        await db.promise().query(
            `INSERT INTO tbl_user_trusted_device (user_id, device_hash, browser, ip_address, last_used_at)
             VALUES (?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE last_used_at = NOW()`,
            [userId, deviceHash, browser, ipAddress]
        );
    }

    // Used when a password changes: the user's trusted devices and pending codes stop counting.
    static async deleteAllForUser(userId) {
        await db.promise().query('DELETE FROM tbl_user_trusted_device WHERE user_id = ?', [userId]);
        await db.promise().query('DELETE FROM tbl_login_challenge WHERE user_id = ?', [userId]);
    }

    static async deleteAllExcept(userId, keepHash) {
        await db.promise().query(
            'DELETE FROM tbl_user_trusted_device WHERE user_id = ? AND device_hash <> ?',
            [userId, keepHash]
        );
        await db.promise().query('DELETE FROM tbl_login_challenge WHERE user_id = ?', [userId]);
    }

    static async createChallenge({ challengeHash, userId, method, otpHash, ipAddress, browser, validMinutes }) {
        await db.promise().query(
            'DELETE FROM tbl_login_challenge WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY)'
        );
        const [result] = await db.promise().query(
            `INSERT INTO tbl_login_challenge
             (challenge_hash, user_id, auth_method, otp_hash, last_sent_at, expires_at, ip_address, browser)
             VALUES (?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? MINUTE), ?, ?)`,
            [challengeHash, userId, method, otpHash, validMinutes, ipAddress, browser]
        );
        return result.insertId;
    }

    // Code for a bank account change. Needs sql/20261125-account-otp-challenge-columns.sql.
    // payloadHash fixes the exact details the code approves; purpose keeps it from being used
    // for a login or for another kind of change.
    static async createPurposeChallenge({ challengeHash, userId, purpose, payloadHash, otpHash, ipAddress, browser, validMinutes }) {
        await db.promise().query(
            'DELETE FROM tbl_login_challenge WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY)'
        );
        const [result] = await db.promise().query(
            `INSERT INTO tbl_login_challenge
             (challenge_hash, user_id, auth_method, purpose, payload_hash, otp_hash, last_sent_at, expires_at, ip_address, browser)
             VALUES (?, ?, 'account', ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? MINUTE), ?, ?)`,
            [challengeHash, userId, purpose, payloadHash, otpHash, validMinutes, ipAddress, browser]
        );
        return result.insertId;
    }

    static async getChallenge(challengeHash) {
        const [rows] = await db.promise().query(
            `SELECT *, (expires_at > NOW()) AS is_live, TIMESTAMPDIFF(SECOND, last_sent_at, NOW()) AS seconds_since_sent
             FROM tbl_login_challenge WHERE challenge_hash = ? LIMIT 1`,
            [challengeHash]
        );
        return rows[0] || null;
    }

    // Takes one guess out of the allowance BEFORE the code is compared, in a single statement, so a
    // burst of simultaneous guesses cannot all slip past the limit. Returns the number of guesses
    // used including this one, or null when the challenge is spent, expired or out of guesses.
    static async reserveAttempt(id, maxAttempts) {
        const [result] = await db.promise().query(
            `UPDATE tbl_login_challenge SET attempts = LAST_INSERT_ID(attempts + 1)
             WHERE id = ? AND attempts < ? AND used_at IS NULL AND expires_at > NOW()`,
            [id, maxAttempts]
        );
        return result.affectedRows === 1 ? result.insertId : null;
    }

    // True only for the one caller that actually spends the challenge, so a code works once.
    static async consume(id) {
        const [result] = await db.promise().query(
            'UPDATE tbl_login_challenge SET used_at = NOW() WHERE id = ? AND used_at IS NULL AND expires_at > NOW()',
            [id]
        );
        return result.affectedRows === 1;
    }

    static async replaceOtp(id, otpHash, validMinutes) {
        await db.promise().query(
            `UPDATE tbl_login_challenge
             SET otp_hash = ?, attempts = 0, resend_count = resend_count + 1, last_sent_at = NOW(),
                 expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)
             WHERE id = ? AND used_at IS NULL`,
            [otpHash, validMinutes, id]
        );
    }
}

module.exports = TrustedDeviceModel;
