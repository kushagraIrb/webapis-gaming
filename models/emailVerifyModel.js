const db = require('../config/database');

// The code mailed to a NEW email address (for a user who has none) lives in the existing otp_verified
// table, next to the signup and bank account codes, told apart by purpose = 'email_setup'. The address
// being verified is kept in its `email` column, the attempt's key (a hash) in payload_hash, and the code
// is stored as it was sent. These rows have no phone, so the signup lookup (email AND phone) can never
// match them, and the bank account code checks require a different purpose. Columns come from
// sql/20261126-otp-verified-account-columns.sql; tbl_user_email_pwd_log from sql/20261127-email-required.sql and sql/20261201-user-email-pwd-log.sql (run the second one first).
//
// Time comparisons use the database clock (NOW()).
const PURPOSE = 'email_setup';
const OTP_TYPE = 1; // otp_type: 1 = sent to an email, 2 = sent to a phone

class EmailVerifyModel {
    static async create({ keyHash, userId, newEmail, otp }) {
        await db.promise().query(
            'DELETE FROM otp_verified WHERE purpose IS NOT NULL AND last_sent_at < DATE_SUB(NOW(), INTERVAL 1 DAY)'
        );
        // Only one live attempt per key: asking again with another address replaces the old one.
        await db.promise().query('DELETE FROM otp_verified WHERE purpose = ? AND payload_hash = ?', [PURPOSE, keyHash]);
        const [result] = await db.promise().query(
            `INSERT INTO otp_verified (user_id, purpose, otp, otp_type, email, payload_hash, last_sent_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [userId, PURPOSE, otp, OTP_TYPE, newEmail, keyHash]
        );
        return result.insertId;
    }

    static async get(keyHash, validMinutes) {
        const [rows] = await db.promise().query(
            `SELECT id, user_id, email AS new_email, otp, attempts, resend_count, used_at,
                    (last_sent_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)) AS is_live,
                    TIMESTAMPDIFF(SECOND, last_sent_at, NOW()) AS seconds_since_sent
             FROM otp_verified WHERE purpose = ? AND payload_hash = ? LIMIT 1`,
            [validMinutes, PURPOSE, keyHash]
        );
        return rows[0] || null;
    }

    // How many codes this user asked for in the last hour (stops mailing strangers in bulk).
    static async sentLastHour(userId) {
        const [rows] = await db.promise().query(
            `SELECT COUNT(*) AS n FROM otp_verified
             WHERE user_id = ? AND purpose = ? AND last_sent_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
            [userId, PURPOSE]
        );
        return rows[0].n;
    }

    // Takes one guess before the code is compared, in a single statement (like the bank account code).
    static async reserveAttempt(id, maxAttempts, validMinutes) {
        const [result] = await db.promise().query(
            `UPDATE otp_verified SET attempts = LAST_INSERT_ID(attempts + 1)
             WHERE id = ? AND purpose = ? AND attempts < ? AND used_at IS NULL
               AND last_sent_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
            [id, PURPOSE, maxAttempts, validMinutes]
        );
        return result.affectedRows === 1 ? result.insertId : null;
    }

    static async consume(id, validMinutes) {
        const [result] = await db.promise().query(
            `UPDATE otp_verified SET used_at = NOW()
             WHERE id = ? AND purpose = ? AND used_at IS NULL
               AND last_sent_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
            [id, PURPOSE, validMinutes]
        );
        return result.affectedRows === 1;
    }

    static async replaceCode(id, otp) {
        await db.promise().query(
            `UPDATE otp_verified
             SET otp = ?, attempts = 0, resend_count = resend_count + 1, last_sent_at = NOW()
             WHERE id = ? AND purpose = ? AND used_at IS NULL`,
            [otp, id, PURPOSE]
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
            "INSERT INTO tbl_user_email_pwd_log (user_id, change_type, old_email, new_email, changed_by, ip_address) VALUES (?, 'email', ?, ?, ?, ?)",
            [userId, oldEmail || null, newEmail, changedBy, ip || null]
        );
    }
}

module.exports = EmailVerifyModel;
