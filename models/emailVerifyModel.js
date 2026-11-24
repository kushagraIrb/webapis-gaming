const db = require('../config/database');

// Tables come from sql/20261127-email-required.sql. Time comparisons use the database clock.
class EmailVerifyModel {
    static async create({ verifyHash, userId, newEmail, otpHash, validMinutes }) {
        await db.promise().query('DELETE FROM tbl_email_verify WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY)');
        // Only one live attempt per key: asking again with another address replaces the old one.
        await db.promise().query('DELETE FROM tbl_email_verify WHERE verify_hash = ?', [verifyHash]);
        const [result] = await db.promise().query(
            `INSERT INTO tbl_email_verify (verify_hash, user_id, new_email, otp_hash, last_sent_at, expires_at)
             VALUES (?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
            [verifyHash, userId, newEmail, otpHash, validMinutes]
        );
        return result.insertId;
    }

    static async get(verifyHash) {
        const [rows] = await db.promise().query(
            `SELECT *, (expires_at > NOW()) AS is_live, TIMESTAMPDIFF(SECOND, last_sent_at, NOW()) AS seconds_since_sent
             FROM tbl_email_verify WHERE verify_hash = ? LIMIT 1`,
            [verifyHash]
        );
        return rows[0] || null;
    }

    // How many codes this user asked for in the last hour (stops mailing strangers in bulk).
    static async sentLastHour(userId) {
        const [rows] = await db.promise().query(
            'SELECT COUNT(*) AS n FROM tbl_email_verify WHERE user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)',
            [userId]
        );
        return rows[0].n;
    }

    // Takes one guess before the code is compared, in a single statement (like the login code).
    static async reserveAttempt(id, maxAttempts) {
        const [result] = await db.promise().query(
            `UPDATE tbl_email_verify SET attempts = LAST_INSERT_ID(attempts + 1)
             WHERE id = ? AND attempts < ? AND used_at IS NULL AND expires_at > NOW()`,
            [id, maxAttempts]
        );
        return result.affectedRows === 1 ? result.insertId : null;
    }

    static async consume(id) {
        const [result] = await db.promise().query(
            'UPDATE tbl_email_verify SET used_at = NOW() WHERE id = ? AND used_at IS NULL AND expires_at > NOW()',
            [id]
        );
        return result.affectedRows === 1;
    }

    static async replaceOtp(id, otpHash, validMinutes) {
        await db.promise().query(
            `UPDATE tbl_email_verify
             SET otp_hash = ?, attempts = 0, resend_count = resend_count + 1, last_sent_at = NOW(),
                 expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)
             WHERE id = ? AND used_at IS NULL`,
            [otpHash, validMinutes, id]
        );
    }

    // Sets the email only while the account still has none, and only if nobody else holds it, in one
    // statement, so two parallel requests cannot both win. Returns true when it was set.
    static async setEmailIfEmpty(userId, email) {
        const [result] = await db.promise().query(
            `UPDATE tbl_registration SET email = ?
             WHERE id = ? AND (email IS NULL OR TRIM(email) = '')
               AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM tbl_registration WHERE LOWER(email) = LOWER(?) AND id <> ?) t)`,
            [email, userId, email, userId]
        );
        return result.affectedRows === 1;
    }

    static async logChange({ userId, oldEmail, newEmail, changedBy, ip }) {
        await db.promise().query(
            'INSERT INTO tbl_user_email_log (user_id, old_email, new_email, changed_by, ip_address) VALUES (?, ?, ?, ?, ?)',
            [userId, oldEmail || null, newEmail, changedBy, ip || null]
        );
    }
}

module.exports = EmailVerifyModel;
