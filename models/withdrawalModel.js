const db = require('../config/database');
const moment = require('moment');

class WithdrawalModel {
    // Get last withdrawal Date for a user
    static async fetchLastWithdrawalDateById(userId) {
        const query = `SELECT withdrawal_date FROM tbl_withdrawal WHERE user_id = ? AND status = 1 ORDER BY withdrawal_date DESC LIMIT 1`;
    
        try {
            const [rows] = await db.promise().query(query, [userId]);
    
            if (!rows.length) return null; // No withdrawal found
    
            // Convert UTC to local time using Moment.js
            const withdrawalDate = moment(rows[0].withdrawal_date).format("YYYY-MM-DD HH:mm:ss");
    
            return withdrawalDate;
        } catch (error) {
            console.error("Error in finding recent withdrawals:", error.message);
            throw error;
        }
    } 

    // Save withdrawal data to the database
    static async saveWithdrawal(withdrawalData) {
        // Get the current time in IST
        const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

        const query = `INSERT INTO tbl_withdrawal (user_id, bank_name, account_number, ifsc, holder_name, pan_number, account_type, addhar_number, upi_id, phone_pay, g_pay, paytm, withdrawal_amount, withdrawal_option, withdrawal_text, modified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        try {
            const result = await db.promise().query(query, [
                withdrawalData.userId,
                withdrawalData.bank,
                withdrawalData.account,
                withdrawalData.ifsc,
                withdrawalData.holderName,
                withdrawalData.panNumber,
                withdrawalData.accountType,
                withdrawalData.aadharNumber,
                withdrawalData.upiId,
                withdrawalData.phonePay,
                withdrawalData.gPay,
                withdrawalData.paytm,
                withdrawalData.withdrawalAmount,
                withdrawalData.withdrawalOption,
                withdrawalData.withdrawalText,
                istTime
            ]);
            return result[0]; // Return the insert result
        } catch (error) {
            console.error("Error in saving withdrawal data:", error.message);
            throw error;
        }
    }

    // Find recent approved withdrawals (within 24 hours)
    // static async findRecentWithdrawals(userId, twentyFourHoursAgo) {
    //     const query = `SELECT * FROM tbl_withdrawal WHERE user_id = ? AND status = 1 AND withdrawal_date >= `;

    //     try {
    //         const [rows] = await db.promise().query(query, [userId, twentyFourHoursAgo]);
    //         return rows;
    //     } catch (error) {
    //         console.error("Error in finding recent withdrawals:", error.message);
    //         throw error;
    //     }
    // }

    // Find pending withdrawal request for a user
    static async findPendingWithdrawal(userId) {
        const query = `SELECT * FROM tbl_withdrawal WHERE user_id = ? AND status = '0'`;

        try {
            const [rows] = await db.promise().query(query, [userId]);
            return rows[0]; // Return the first pending withdrawal
        } catch (error) {
            console.error("Error in finding pending withdrawal:", error.message);
            throw error;
        }
    }

    static async findPrimaryAccount(userId) {
        const query = `SELECT * FROM tbl_user_account WHERE user_id = ? AND primary_account = 1 LIMIT 1`;

        try {
            const [rows] = await db.promise().query(query, [userId]);
            return rows[0] || null; // return the primary account if exists
        } catch (error) {
            console.error("Error finding primary account:", error.message);
            throw new Error("Failed to fetch primary account");
        }
    }

    // Fetch withdrawal button status
    static async withdrawalButtonStatus() {
        const query = `SELECT * FROM tbl_with_button`;

        try {
            const [rows] = await db.promise().query(query);
            return rows;
        } catch (error) {
            console.error('Error fetching withdrawal data:', error.message);
            throw error;
        }
    }

    // Fetch withdrawal data based on page & perPage
    static async getWithdrawals(userId, perPage, page) {
        const query = `SELECT id, transactionID, screen_short, account_number, ifsc, withdrawal_amount, status, modified, cancelBy, cancel_reason 
                    FROM tbl_withdrawal 
                    WHERE user_id = ? 
                    ORDER BY id DESC 
                    LIMIT ? OFFSET ?`;

        try {
            const offset = (page - 1) * perPage; // Moved offset calculation here
            const [rows] = await db.promise().query(query, [userId, perPage, offset]);
            return rows;
        } catch (error) {
            console.error('Error fetching withdrawal data:', error.message);
            throw error;
        }
    }

    // Get total count of withdrawal records
    static async getWithdrawalCount(userId) {
        const query = `SELECT COUNT(*) AS total FROM tbl_withdrawal WHERE user_id = ?`;

        try {
            const [[result]] = await db.promise().query(query, [userId]);
            return result.total;
        } catch (error) {
            console.error('Error fetching withdrawal count:', error.message);
            throw error;
        }
    }

    // Get withdrawal by ID
    static async getWithdrawalById(withdrawalId) {
        const query = `SELECT in_process FROM tbl_withdrawal WHERE id = ?`;
        try {
            const [rows] = await db.promise().query(query, [withdrawalId]);
            return rows[0] || null;
        } catch (error) {
            console.error('Error fetching withdrawal by ID:', error.message);
            throw error;
        }
    }

    // Update withdrawal status
    static async updateWithdrawalStatus(withdrawalId, userId, updateData) {
        const query = `UPDATE tbl_withdrawal SET status = ?, cancelBy = ? WHERE id = ? AND user_id = ?`;
        try {
            const [result] = await db.promise().query(query, [
                updateData.status,
                updateData.cancelBy,
                withdrawalId,
                userId
            ]);
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error updating withdrawal status:', error.message);
            throw error;
        }
    }

    // Fetch withdrawal data
    static async fetchFastWithdrawalDetails() {
        const query = `SELECT amount, charge, duration, status FROM tbl_fast_withdrawal`;

        try {
            const [rows] = await db.promise().query(query);
            return rows[0];
        } catch (error) {
            console.error('Error fetching withdrawal data:', error.message);
            throw error;
        }
    }

    // Fetch the count of slots
    static async fetchSlotCount(timeMinusDuration) {
        const query = `SELECT COUNT(*) as slot FROM tbl_withdrawal WHERE modified >= ?  AND status = '0' AND fast_withdrawal = 1`;
        try {
            const [rows] = await db.promise().query(query, [timeMinusDuration]);
            return rows[0].slot;
        } catch (error) {
            console.error('Error fetching slot count:', error.message);
            throw error;
        }
    }

    // Fetch the last modified timestamp for the user's fast withdrawal request
    static async fetchDurationTimer(userId) {
        const query = `SELECT modified FROM tbl_withdrawal WHERE user_id = ? AND fast_withdrawal = 1 AND status = '0' ORDER BY id DESC LIMIT 1`;
        try {
            const [rows] = await db.promise().query(query, [userId]);
            return rows.length > 0 ? rows[0].modified : null; // Return null if no records found
        } catch (error) {
            console.error('Error fetching user last fast withdrawal:', error.message);
            throw error;
        }
    }

    // Save fast withdrawal data to the database
    static async saveFastWithdrawal(withdrawalData) {
        // Get the current time in IST
        const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
      
        const query = `INSERT INTO tbl_withdrawal (user_id, bank_name, account_number, ifsc, holder_name, pan_number, account_type, addhar_number, upi_id, phone_pay, g_pay, paytm, withdrawal_amount, charge_percent, withdrawal_option, withdrawal_text, fast_withdrawal, modified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1,?)`;

        try {
            const result = await db.promise().query(query, [
                withdrawalData.userId,
                withdrawalData.bank,
                withdrawalData.account,
                withdrawalData.ifsc,
                withdrawalData.holderName,
                withdrawalData.panNumber,
                withdrawalData.accountType,
                withdrawalData.aadharNumber,
                withdrawalData.upiId,
                withdrawalData.phonePay,
                withdrawalData.gPay,
                withdrawalData.paytm,
                withdrawalData.withdrawalAmount,
                withdrawalData.chargePercent,
                withdrawalData.withdrawalOption,
                withdrawalData.withdrawalText,
                istTime
            ]);
            return result[0]; // Return the insert result
        } catch (error) {
            console.error("Error in saving withdrawal data:", error.message);
            throw error;
        }
    }
}

module.exports = WithdrawalModel;