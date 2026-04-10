const db = require("../config/database");

class TransactionHistoryModel {
    // Get the last deposit transaction for a user
    static async getLastDeposit(userId) {
        const query = `SELECT trans_id, credit_amount FROM tbl_transaction_history WHERE user_id = ? AND t_status = 'Deposit' ORDER BY trans_id DESC LIMIT 1`;

        try {
            const [rows] = await db.promise().query(query, [userId]);
            
            if (rows.length === 0) {
                // Return default values if no deposit is found
                return { trans_id: null, credit_amount: 0 };
            }

            return rows[0]; // Return the latest deposit transaction
        } catch (error) {
            console.error("Error in getting last deposit:", error.message);
            throw error;
        }
    }

    // Get the total debit amount after the last deposit
    static async getTotalDebitsSince(userId, transId) {
        const query = `SELECT SUM(debit_amount) AS totalDebit FROM tbl_transaction_history WHERE user_id = ? AND t_status = 'Bet' AND trans_id > ?`;

        try {
            const [rows] = await db.promise().query(query, [userId, transId]);
            return rows[0]?.totalDebit || 0; // Return the total debit amount
        } catch (error) {
            console.error("Error in getting total debits:", error.message);
            throw error;
        }
    }

    // Get the total credit amount after the last deposit
    static async getTotalCreditsSince(userId, transId) {
        const query = `SELECT SUM(credit_amount) AS totalCredit FROM tbl_transaction_history WHERE user_id = ? AND t_status = 'Cancel' AND trans_id > ?`;

        try {
            const [rows] = await db.promise().query(query, [userId, transId]);
            return rows[0]?.totalCredit || 0; // Return the total credit amount
        } catch (error) {
            console.error("Error in getting total credits:", error.message);
            throw error;
        }
    }
    
    static async checkAdminTransferBypass(userId, transId) {
        const query = `
            SELECT t.t_status, wd.reasons
            FROM tbl_transaction_history t
            JOIN tbl_with_dep wd ON wd.tid = t.d_w_id
            WHERE t.user_id = ?
            AND t.trans_id > ?
            AND (
                (t.t_status = 'Withdrawal by Admin' AND wd.reasons = 'TRANSFER FROM APP TO ID')
                OR
                (t.t_status = 'Deposit by Admin' AND wd.reasons = 'TRANSFER FROM ID TO APP')
            )
        `;
    
        try {
            const [rows] = await db.promise().query(query, [userId, transId]);
    
            let hasWithdrawal = false;
            let hasDeposit = false;
    
            rows.forEach(row => {
                if (row.t_status === 'Withdrawal by Admin' && row.reasons === 'TRANSFER FROM APP TO ID') {
                    hasWithdrawal = true;
                }
                if (row.t_status === 'Deposit by Admin' && row.reasons === 'TRANSFER FROM ID TO APP') {
                    hasDeposit = true;
                }
            });
    console.log('hasWithdrawal: ',hasWithdrawal,' hasDeposit: ',hasDeposit);
            return hasWithdrawal && hasDeposit;
    
        } catch (error) {
            console.error("Error in checkAdminTransferBypass:", error.message);
            throw error;
        }
    }
}

module.exports = TransactionHistoryModel;