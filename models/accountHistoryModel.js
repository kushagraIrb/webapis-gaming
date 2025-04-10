const db = require('../config/database');

class AccountHistoryModel {
    // Fetch deposit history for a user with pagination
    static async getAccountData(userId, start, perPage) {
        let query = `SELECT ac_holder_name,account_number,ifsc,bank_name,account_type,pan_number,addhar_number,upi_id,phone_pay,g_pay,paytm,ac_id, primary_account FROM tbl_user_account WHERE user_id = ? ORDER BY ac_id DESC`;

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
        try {
            const updateOldAccount = `UPDATE tbl_user_account SET primary_account = 0 WHERE user_id = ? AND primary_account = 1`;
            await db.promise().query(updateOldAccount, [userId]);

            const query = `UPDATE tbl_user_account SET primary_account = 1 WHERE user_id = ? AND ac_id = ?`;
            await db.promise().query(query, [userId, accountId]);
        } catch (error) {
            console.error(`Error updating primary account:`, error.message);
            throw new Error('Failed to update primary account');
        }
    }
}

module.exports = AccountHistoryModel;