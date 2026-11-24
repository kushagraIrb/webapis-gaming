const db = require('../config/database');
const primaryLock = require('../helpers/primaryLock');

class AccountHistoryModel {
    // Fetch deposit history for a user with pagination
    static async getAccountData(userId, start, perPage) {
        // Minutes until a newly added account may be made primary (null when it may be now).
        const lockColumn = (await primaryLock.columnReady())
            ? ', IF(primary_allowed_at > NOW(), CEIL(TIMESTAMPDIFF(SECOND, NOW(), primary_allowed_at) / 60), NULL) AS primary_unlock_minutes'
            : '';
        let query = `SELECT ac_holder_name,account_number,ifsc,bank_name,account_type,pan_number,addhar_number,upi_id,phone_pay,g_pay,paytm,ac_id, primary_account${lockColumn} FROM tbl_user_account WHERE is_soft_deleted = 0 AND user_id = ? ORDER BY ac_id DESC`;

        // Add pagination if required
        if (perPage !== null && start !== null) {
            query += ` LIMIT ?, ?`;
            const [rows] = await db.promise().query(query, [userId, start, perPage]);
            return rows;
        }

        // Fetch all data if no pagination
        const [rows] = await db.promise().query(query, [userId]);
        return rows;
    }

    // Fetch total count of accounts for pagination
    static async getAccountCount(userId) {
        let query = `SELECT COUNT(*) AS total 
                    FROM tbl_user_account 
                    WHERE user_id = ?`;

        const [result] = await db.promise().query(query, [userId]);
        return result[0].total;
    }

    // Update Primary Account
    static async changePrimaryAccount(userId, accountId) {
        const fail = (message, statusCode) => {
            const err = new Error(message);
            err.statusCode = statusCode;
            return err;
        };

        const connection = await db.promise().getConnection();
        try {
            await connection.beginTransaction();

            // The account must be one of the caller's own, still-active accounts.
            const lockOn = await primaryLock.columnReady();
            const [own] = await connection.query(
                `SELECT ac_id${lockOn ? ', GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), primary_allowed_at)) AS lock_seconds' : ''}
                 FROM tbl_user_account
                 WHERE user_id = ? AND ac_id = ? AND (is_soft_deleted = 0 OR is_soft_deleted IS NULL)
                 FOR UPDATE`,
                [userId, accountId]
            );
            if (!own.length) {
                throw fail('Account not found.', 404);
            }
            if (lockOn && own[0].lock_seconds > 0) {
                throw primaryLock.lockedError(own[0].lock_seconds);
            }

            const [pending] = await connection.query(
                `SELECT COUNT(*) AS pendingCount FROM tbl_withdrawal WHERE user_id = ? AND status = '0'`,
                [userId]
            );
            if (pending[0].pendingCount > 0) {
                throw fail('You cannot change your primary account while a withdrawal request is pending.', 400);
            }

            await connection.query(
                `UPDATE tbl_user_account SET primary_account = 0 WHERE user_id = ? AND primary_account = 1`,
                [userId]
            );
            const [set] = await connection.query(
                `UPDATE tbl_user_account SET primary_account = 1 WHERE user_id = ? AND ac_id = ?`,
                [userId, accountId]
            );
            if (set.affectedRows !== 1) {
                throw fail('Failed to update primary account', 500);
            }

            await connection.commit();
        } catch (error) {
            try { await connection.rollback(); } catch (_) { /* connection already gone */ }
            console.error(`Error updating primary account:`, error.message);
            throw error.statusCode ? error : new Error('Failed to update primary account');
        } finally {
            connection.release();
        }
    }


    static async getAccountById(userId, accountId) {
        try {
            const [rows] = await db.promise().query(
                `SELECT ac_id, user_id, primary_account, is_soft_deleted 
                 FROM tbl_user_account 
                 WHERE user_id = ? AND ac_id = ?`,
                [userId, accountId]
            );
            return rows.length ? rows[0] : null;
        } catch (error) {
            console.error('Error fetching account by ID:', error.message);
            throw error;
        }
    }


    // Fields used for the masked hint in the bank account OTP email and the activity log.
    static async getAccountHintFields(userId, accountId) {
        const [rows] = await db.promise().query(
            'SELECT upi_id, account_number FROM tbl_user_account WHERE user_id = ? AND ac_id = ? LIMIT 1',
            [userId, accountId]
        );
        return rows[0] || null;
    }

    // Read-only copy of the checks changePrimaryAccount makes, so a bank account OTP is not sent
    // for a change that would be refused. changePrimaryAccount still makes the real checks.
    static async assertCanMakePrimary(userId, accountId) {
        const fail = (message, statusCode) => {
            const err = new Error(message);
            err.statusCode = statusCode;
            return err;
        };

        const lockOn = await primaryLock.columnReady();
        const [own] = await db.promise().query(
            `SELECT ac_id${lockOn ? ', GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), primary_allowed_at)) AS lock_seconds' : ''}
             FROM tbl_user_account
             WHERE user_id = ? AND ac_id = ? AND (is_soft_deleted = 0 OR is_soft_deleted IS NULL)`,
            [userId, accountId]
        );
        if (!own.length) {
            throw fail('Account not found.', 404);
        }
        if (lockOn && own[0].lock_seconds > 0) {
            throw primaryLock.lockedError(own[0].lock_seconds);
        }

        const [pending] = await db.promise().query(
            `SELECT COUNT(*) AS pendingCount FROM tbl_withdrawal WHERE user_id = ? AND status = '0'`,
            [userId]
        );
        if (pending[0].pendingCount > 0) {
            throw fail('You cannot change your primary account while a withdrawal request is pending.', 400);
        }
    }

    static async softDeleteAccount(userId, accountId) {
        try {
            const [result] = await db.promise().query(
                `UPDATE tbl_user_account 
                 SET is_soft_deleted = 1 
                 WHERE user_id = ? AND ac_id = ?`,
                [userId, accountId]
            );
            return result;
        } catch (error) {
            console.error('Error performing soft delete:', error.message);
            throw error;
        }
    }

    //function to get the primary account details
    static async getPrimaryAccount(userId) {
        try {
            const query = `
                SELECT * 
                FROM tbl_user_account 
                WHERE user_id = ? AND primary_account = 1 AND is_soft_deleted = 0
                ORDER BY ac_id DESC
                LIMIT 1
            `;
            const [rows] = await db.promise().query(query, [userId]);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error(`Error fetching primary account:`, error.message);
            throw new Error('Failed to fetch primary account');
        }
    }


    //function ends here
}

module.exports = AccountHistoryModel;