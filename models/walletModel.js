const db = require('../config/database');

class walletModel {
    static async getArchiveFilterYears(userId) {
        const query = `
            SELECT DISTINCT YEAR(t.transaction_date) AS archive_year
            FROM tbl_archive_trans_his t
            WHERE t.user_id = ?
              AND t.transaction_date IS NOT NULL
            ORDER BY archive_year DESC
        `;
        const [rows] = await db.promise().query(query, [userId]);
        return rows
            .map((row) => row.archive_year)
            .filter((year) => year !== null);
    }

    // Fetch wallet history for a user with pagination
    static async getWalletHistory(userId, start, perPage) {
        let query = `
            SELECT t.transaction_id, t.d_w_id, t.bet_id, t.win_id, t.coin_match_id, 
                   t.credit_amount, t.debit_amount, t.total_amount, t.type, t.t_status, 
                   t.transaction_date, t.cancel_charge, t.charge_amt_cut, 
                   m.match_title, m.match_date, m.match_time, m.win_ratio, 
                   b.bet_date,
                   wd.reasons AS reason
            FROM tbl_transaction_history AS t
            LEFT JOIN tbl_upcoming_match AS m ON t.match_id = m.id
            LEFT JOIN tbl_bet AS b ON t.bet_id = b.bet_id
            LEFT JOIN tbl_with_dep AS wd ON t.d_w_id = wd.tid
            WHERE t.user_id = ?
            ORDER BY t.trans_id DESC
        `;
    
        // Add pagination if required
        let params = [userId];
        if (perPage !== null && start !== null) {
            query += ` LIMIT ?, ?`;
            params.push(start, perPage);
        }
    
        const [rows] = await db.promise().query(query, params);
    
        // Convert `match_time` and `win_ratio` from string to array
        return rows.map(row => ({
            ...row,
            match_time: row.match_time ? JSON.parse(row.match_time) : [],
            win_ratio: row.win_ratio ? JSON.parse(row.win_ratio) : []
        }));
    }

    static async getArchiveWalletHistory(userId, year, start, perPage) {
        let query = `
            SELECT t.transaction_id, t.d_w_id, t.bet_id, t.win_id, t.coin_match_id, 
                   t.credit_amount, t.debit_amount, t.total_amount, t.type, t.t_status, 
                   t.transaction_date, t.cancel_charge, t.charge_amt_cut, 
                   m.match_title, m.match_date, m.match_time, m.win_ratio, 
                   b.bet_date,
                   wd.reasons AS reason
            FROM tbl_archive_trans_his AS t
            LEFT JOIN tbl_upcoming_match AS m ON t.match_id = m.id
            LEFT JOIN tbl_bet AS b ON t.bet_id = b.bet_id
            LEFT JOIN tbl_with_dep AS wd ON t.d_w_id = wd.tid
            WHERE t.user_id = ? AND YEAR(t.transaction_date) = ?
            ORDER BY t.trans_id DESC
        `;

        const params = [userId, year];
        if (perPage !== null && start !== null) {
            query += ` LIMIT ?, ?`;
            params.push(start, perPage);
        }

        const [rows] = await db.promise().query(query, params);

        return rows.map(row => ({
            ...row,
            match_time: row.match_time ? JSON.parse(row.match_time) : [],
            win_ratio: row.win_ratio ? JSON.parse(row.win_ratio) : []
        }));
    }

    // Count total wallet history records for a user
    static async countWalletHistory(userId) {
        const query = `
            SELECT COUNT(*) AS total_count 
            FROM tbl_transaction_history
            WHERE user_id = ?
        `;
        const [result] = await db.promise().query(query, [userId]);
        return result[0].total_count;
    }

    static async countArchiveWalletHistory(userId, year) {
        const query = `
            SELECT COUNT(*) AS total_count 
            FROM tbl_archive_trans_his
            WHERE user_id = ? AND YEAR(transaction_date) = ?
        `;
        const [result] = await db.promise().query(query, [userId, year]);
        return result[0].total_count;
    }

    // Get total wallet amount for a user
    static async getTotalWalletAmount(userId) {
        const query = `SELECT total_amount FROM tbl_transaction_history WHERE user_id = ? ORDER BY trans_id DESC LIMIT 1`;
        const [result] = await db.promise().query(query, [userId]);
        return result.length > 0 ? result[0].total_amount : 0;
    }
}

module.exports = walletModel;
