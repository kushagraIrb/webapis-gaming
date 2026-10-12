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
    
    // A transfer to / from a Match ID is saved with one of two texts: the plain
    // "TRANSFER FROM APP TO ID" (CI3 admin, Add Deposit / Withdrawal) or, from
    // the Node admin's transfer approvals, that text followed by the site name,
    // e.g. "TRANSFER FROM APP TO ID(Site Name)". Both count: a reason matches
    // when it is exactly the plain text or starts with it.
    static async checkAdminTransferBypass(userId, transId) {
        const APP_TO_ID = 'TRANSFER FROM APP TO ID';
        const ID_TO_APP = 'TRANSFER FROM ID TO APP';
        const matches = (reasons, text) => reasons === text || String(reasons || '').startsWith(text);

        const query = `
            SELECT t.t_status, wd.reasons
            FROM tbl_transaction_history t
            JOIN tbl_with_dep wd ON wd.tid = t.d_w_id
            WHERE t.user_id = ?
            AND t.trans_id > ?
            AND (
                (t.t_status = 'Withdrawal by Admin' AND (wd.reasons = ? OR wd.reasons LIKE ?))
                OR
                (t.t_status = 'Deposit by Admin' AND (wd.reasons = ? OR wd.reasons LIKE ?))
            )
        `;

        try {
            const [rows] = await db.promise().query(query, [
                userId, transId,
                APP_TO_ID, `${APP_TO_ID}%`,
                ID_TO_APP, `${ID_TO_APP}%`,
            ]);

            let hasWithdrawal = false;
            let hasDeposit = false;

            rows.forEach(row => {
                if (row.t_status === 'Withdrawal by Admin' && matches(row.reasons, APP_TO_ID)) {
                    hasWithdrawal = true;
                }
                if (row.t_status === 'Deposit by Admin' && matches(row.reasons, ID_TO_APP)) {
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