const db = require('../config/database');
const moment = require('moment');

class DepositModel {
    // Fetch deposit history for a user with pagination
    static async getDepositHistory(userId, start, perPage) {
        let query = `SELECT  deposit_id, deposit_screenshot, deposit_amount_step1 AS deposit_amount, status, approved_date AS created_date FROM tbl_deposit_list WHERE user_id = ? AND status = 1 UNION SELECT  deposit_id, deposit_screenshot, deposit_amount_step1 AS deposit_amount, status, created_date FROM tbl_deposit_log WHERE user_id = ? AND status = 2 ORDER BY created_date DESC`;

        // Add pagination if required
        if (perPage !== null && start !== null) {
            query += ` LIMIT ?, ?`;
            const [rows] = await db.promise().query(query, [userId, userId, start, perPage]);
            return rows;
        }

        // Fetch all data if no pagination
        const [rows] = await db.promise().query(query, [userId, userId]);
        return rows;
    }

    // Get total count of deposits for a user
    static async getDepositCount(userId) {
        let query = `SELECT COUNT(*) AS total 
                    FROM tbl_deposit_list WHERE user_id = ? AND status = 1 
                    UNION 
                    SELECT COUNT(*) AS total 
                    FROM tbl_deposit_log WHERE user_id = ? AND status = 2`;

        const [[result]] = await db.promise().query(query, [userId, userId]);
        return result.total;
    }

    // Fetch Admin Bank Account based on the deposit amount
    static async fetchBankAccountByValue(depositAmount) {
        try {
            // Initial query to find a matching bank account
            let query = `SELECT * FROM tbl_bank_details WHERE ? BETWEEN min_value AND max_value AND status = 1 AND chosen_flag = 0 ORDER BY id ASC LIMIT 1`;
            
            const [rows] = await db.promise().query(query, [parseFloat(depositAmount)]);

            let data = rows[0];

            // If no matching bank account is found, reset chosen_flag and try again
            if (!data) {
                const resetQuery = `UPDATE tbl_bank_details SET chosen_flag = 0 WHERE ? BETWEEN min_value AND max_value`;
                await db.promise().query(resetQuery, [parseFloat(depositAmount)]);

                // Retry the query after resetting chosen_flag
                const [retryRows] = await db.promise().query(query, [parseFloat(depositAmount)]);
                data = retryRows[0];

                // If a matching bank account is found after resetting, update its chosen_flag
                if (data) {
                    const updateQuery = `UPDATE tbl_bank_details SET chosen_flag = 1 WHERE id = ?`;
                    await db.promise().query(updateQuery, [data.id]);
                }
            } else {
                // If a matching bank account is found on the first attempt, update its chosen_flag
                const updateQuery = `UPDATE tbl_bank_details SET chosen_flag = 1 WHERE id = ?`;
                await db.promise().query(updateQuery, [data.id]);
            }

            return data;
        } catch (error) {
            console.error('Error fetching bank account by value:', error.message);
            throw new Error('Failed to fetch bank account');
        }
    }

    // Check if deposit ID exists with status 1
    static async getDepositById(depositId) {
        const query = `SELECT deposit_id FROM tbl_deposit_list WHERE deposit_id = ? AND status = 1`;
        try {
            const [rows] = await db.promise().query(query, [depositId]);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error fetching deposit ID:', error.message);
            throw new Error('Failed to fetch deposit data from the database');
        }
    }

    // Save deposit
    static async saveDeposit(data) {
        // Get the current time in IST
        const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

        const query = `INSERT INTO tbl_deposit_list (deposit_id, deposit_amount, deposit_amount_step1, deposit_date, deposit_screenshot, bank_owner_name, status, user_id, approved_date) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`;
        const values = [
            data.deposit_id,
            data.deposit_amount,
            data.deposit_amount_step1,
            data.deposit_date,
            data.deposit_screenshot,
            data.bank_owner_name,
            data.userId,
            istTime
        ];

        try {
            const [result] = await db.promise().query(query, values);
            return result;
        } catch (error) {
            console.error('Error saving deposit:', error.message);
            throw new Error('Failed to save deposit data to the database');
        }
    }

    // Get user available balance
    static async getUserAvailableBalance(userId) {
        const query = `SELECT total_amount FROM tbl_transaction_history WHERE user_id = ? ORDER BY trans_id DESC LIMIT 1`;
        try {
            const [rows] = await db.promise().query(query, [userId]);
            return rows.length > 0 ? rows[0].total_amount : 0;
        } catch (error) {
            console.error('Error fetching user balance:', error.message);
            throw new Error('Failed to fetch user balance from the database');
        }
    }

    // Save transaction history
    static async saveTransactionHistory(data) {
        // Get the current time in IST
        const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

        const query = `INSERT INTO tbl_transaction_history (transaction_pk, transaction_id, user_id, credit_amount, total_amount, type, t_status, transaction_date, current_bonus_league_id) VALUES (?, ?, ?, ?, ?, 'Credit', 'Deposit', ?, ?)`;
        const values = [
            data.transaction_pk,
            data.transaction_id,
            data.userId,
            data.credit_amount,
            data.total_amount,
            istTime,
            data.bonus_league_id
        ];

        try {
            const [result] = await db.promise().query(query, values);
            return result;
        } catch (error) {
            console.error('Error saving transaction history:', error.message);
            throw new Error('Failed to save transaction history to the database');
        }
    }

    // Update user highlight row
    static async updateUserHighlight(userId) {
        const query = `UPDATE tbl_registration SET highlight_row = 0 WHERE id = ?`;
        try {
            const [result] = await db.promise().query(query, [userId]);
            return result;
        } catch (error) {
            console.error('Error updating user highlight row:', error.message);
            throw new Error('Failed to update user highlight row in the database');
        }
    }

    // Save deposit log
    static async insertDepositLog(data) {
        // Get the current time in IST
        const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
        
        const query = `INSERT INTO tbl_deposit_log (deposit_id, deposit_amount, deposit_amount_step1, deposit_date, ss_time_frame, deposit_screenshot, user_id, status, created_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const values = [
            data.deposit_id,
            data.deposit_amount,
            data.deposit_amount_step1,
            data.deposit_date,
            data.ss_time_frame,
            data.deposit_screenshot,
            data.userId,
            data.status,
            istTime
        ];

        try {
            const [result] = await db.promise().query(query, values);
            return result;
        } catch (error) {
            console.error('Error saving deposit:', error.message);
            throw new Error('Failed to save deposit data to the database');
        }
    }
}

module.exports = DepositModel;