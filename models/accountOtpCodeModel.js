const db = require('../config/database');

// Bank account codes (add, delete, set primary) live in otp_verified, next to the signup codes.
// They are told apart by `purpose` (signup rows have none) and have no email or phone, so the
// signup lookup by email and phone can never match them. The code is stored exactly as it was
// sent, readable in the table and in the email. Columns: sql/20261126-otp-verified-account-columns.sql
//
// Every time comparison uses the database clock (NOW()), so the API server's time zone cannot skew it.
const ACCOUNT_OTP_TYPE = 2; // signup codes are type 1

class AccountOtpCodeModel {
    static async create({ userId, purpose, otp, payloadHash }) {
        await db.promise().query(
            'DELETE FROM otp_verified WHERE purpose IS NOT NULL AND last_sent_at < DATE_SUB(NOW(), INTERVAL 1 DAY)'
        );
        const [result] = await db.promise().query(
            `INSERT INTO otp_verified (user_id, purpose, otp, otp_type, payload_hash, last_sent_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [userId, purpose, otp, ACCOUNT_OTP_TYPE, payloadHash]
        );
        return result.insertId;
    }

    static async get(id, validMinutes) {
        const [rows] = await db.promise().query(
            `SELECT id, user_id, purpose, otp, payload_hash, attempts, resend_count, used_at,
                    (last_sent_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)) AS is_live,
                    TIMESTAMPDIFF(SECOND, last_sent_at, NOW()) AS seconds_since_sent
             FROM otp_verified WHERE id = ? AND purpose IS NOT NULL LIMIT 1`,
            [validMinutes, id]
        );
        return rows[0] || null;
    }

    // Takes one guess out of the allowance BEFORE the code is compared, in a single statement, so a
    // burst of simultaneous guesses cannot all slip past the limit. Returns the number of guesses
    // used including this one, or null when the code is spent, expired or out of guesses.
    static async reserveAttempt(id, maxAttempts, validMinutes) {
        const [result] = await db.promise().query(
            `UPDATE otp_verified SET attempts = LAST_INSERT_ID(attempts + 1)
             WHERE id = ? AND purpose IS NOT NULL AND attempts < ? AND used_at IS NULL
               AND last_sent_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
            [id, maxAttempts, validMinutes]
        );
        return result.affectedRows === 1 ? result.insertId : null;
    }

    // True only for the one caller that actually spends the code, so a code works once.
    static async consume(id, validMinutes) {
        const [result] = await db.promise().query(
            `UPDATE otp_verified SET used_at = NOW()
             WHERE id = ? AND purpose IS NOT NULL AND used_at IS NULL
               AND last_sent_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
            [id, validMinutes]
        );
        return result.affectedRows === 1;
    }

    static async replaceCode(id, otp) {
        await db.promise().query(
            `UPDATE otp_verified
             SET otp = ?, attempts = 0, resend_count = resend_count + 1, last_sent_at = NOW()
             WHERE id = ? AND purpose IS NOT NULL AND used_at IS NULL`,
            [otp, id]
        );
    }
}

module.exports = AccountOtpCodeModel;
