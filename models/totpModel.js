const db = require('../config/database');

// Tables come from sql/20261126-totp.sql.
class TotpModel {
    static async get(userId) {
        const [rows] = await db.promise().query(
            'SELECT user_id, secret_enc, enabled, last_used_step FROM tbl_user_totp WHERE user_id = ? LIMIT 1',
            [userId]
        );
        return rows[0] || null;
    }

    // True only when TOTP is fully set up. A missing table (migration not run) means "off".
    static async isEnabled(userId) {
        try {
            const [rows] = await db.promise().query(
                'SELECT 1 FROM tbl_user_totp WHERE user_id = ? AND enabled = 1 LIMIT 1',
                [userId]
            );
            return rows.length > 0;
        } catch (error) {
            if (error.code === 'ER_NO_SUCH_TABLE') return false;
            throw error;
        }
    }

    // Starts (or restarts) setup. Refuses to overwrite a secret that is already enabled.
    static async saveSetupSecret(userId, secretEnc) {
        const [result] = await db.promise().query(
            `INSERT INTO tbl_user_totp (user_id, secret_enc, enabled, last_used_step)
             VALUES (?, ?, 0, 0)
             ON DUPLICATE KEY UPDATE secret_enc = IF(enabled = 1, secret_enc, VALUES(secret_enc)),
                                     last_used_step = IF(enabled = 1, last_used_step, 0)`,
            [userId, secretEnc]
        );
        return result;
    }

    static async enable(userId) {
        const [result] = await db.promise().query(
            'UPDATE tbl_user_totp SET enabled = 1, enabled_at = NOW() WHERE user_id = ? AND enabled = 0',
            [userId]
        );
        return result.affectedRows === 1;
    }

    // Moves the used step forward in one statement, so the same code (or an older one) cannot
    // be used twice, even by two parallel requests. True only for the caller that wins.
    static async claimStep(userId, step) {
        const [result] = await db.promise().query(
            'UPDATE tbl_user_totp SET last_used_step = ? WHERE user_id = ? AND last_used_step < ?',
            [step, userId, step]
        );
        return result.affectedRows === 1;
    }

    static async remove(userId) {
        await db.promise().query('DELETE FROM tbl_user_totp WHERE user_id = ?', [userId]);
        await db.promise().query('DELETE FROM tbl_user_backup_code WHERE user_id = ?', [userId]);
    }

    static async replaceBackupCodes(userId, codeHashes) {
        await db.promise().query('DELETE FROM tbl_user_backup_code WHERE user_id = ?', [userId]);
        for (const hash of codeHashes) {
            await db.promise().query(
                'INSERT INTO tbl_user_backup_code (user_id, code_hash) VALUES (?, ?)',
                [userId, hash]
            );
        }
    }

    // True only for the caller that actually spends the code.
    static async consumeBackupCode(userId, codeHash) {
        const [result] = await db.promise().query(
            `UPDATE tbl_user_backup_code SET used_at = NOW()
             WHERE user_id = ? AND code_hash = ? AND used_at IS NULL LIMIT 1`,
            [userId, codeHash]
        );
        return result.affectedRows === 1;
    }

    static async backupCodesLeft(userId) {
        const [rows] = await db.promise().query(
            'SELECT COUNT(*) AS n FROM tbl_user_backup_code WHERE user_id = ? AND used_at IS NULL',
            [userId]
        );
        return rows[0].n;
    }
}

module.exports = TotpModel;
