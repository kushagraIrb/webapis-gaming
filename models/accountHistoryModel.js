const db = require('../config/database');

class AccountHistoryModel {
    // Fetch deposit history for a user with pagination
    static async getAccountData(userId, start, perPage) {
        let query = `SELECT ac_holder_name,account_number,ifsc,bank_name,account_type,pan_number,addhar_number,upi_id,phone_pay,g_pay,paytm,ac_id, primary_account FROM tbl_user_account WHERE is_soft_deleted = 0 AND user_id = ? ORDER BY ac_id DESC`;

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
            const [own] = await connection.query(
                `SELECT ac_id FROM tbl_user_account
                 WHERE user_id = ? AND ac_id = ? AND (is_soft_deleted = 0 OR is_soft_deleted IS NULL)
                 FOR UPDATE`,
                [userId, accountId]
            );
            if (!own.length) {
                throw fail('Account not found.', 404);
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
                WHERE user_id = ? AND primary_account = 1 
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