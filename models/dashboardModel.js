const db = require('../config/database');

class DashboardModel {
    static async fetchTotalWithdrawal(userId) {
        try {
            const query = `SELECT SUM(debit_amount) AS total_withdrawals FROM tbl_transaction_history WHERE user_id = ? AND t_status IN ('Withdrawal', 'Withdrawal by Admin')`;
            const [result] = await db.promise().query(query, [userId]);
            return result[0]?.total_withdrawals || 0; // Default to 0 if no earnings found
        } catch (error) {
            throw new Error('Error fetching total withdrawal');
        }
    }

    static async fetchTotalDeposit(userId) {
        try {
            const query = `SELECT SUM(credit_amount) AS total_deposits FROM tbl_transaction_history WHERE user_id = ? AND t_status IN ('Deposit', 'Deposit by Admin')`;
            const [result] = await db.promise().query(query, [userId]);
            return result[0]?.total_deposits || 0; // Default to 0 if no earnings found
        } catch (error) {
            throw new Error('Error fetching total deposit');
        }
    }

    static async fetchTotalPlayedStats(userId) {
        try {
            const query = `
                SELECT
                COALESCE((
                    SELECT SUM(amount) FROM tbl_bet WHERE user_id = ? AND status = 1
                ), 0) AS bet_sum,
                COALESCE((
                    SELECT COUNT(*) FROM tbl_bet WHERE user_id = ? AND status = 1
                ), 0) AS bet_count,

                COALESCE((
                    SELECT SUM(amount) FROM tbl_coin_bet WHERE user_id = ? AND status = 1
                ), 0) AS coin_bet_sum,
                COALESCE((
                    SELECT COUNT(*) FROM tbl_coin_bet WHERE user_id = ? AND status = 1
                ), 0) AS coin_bet_count,

                COALESCE((
                    SELECT SUM(bet_amount) FROM tbl_limbo WHERE user_id = ?
                ), 0) AS limbo_sum,
                COALESCE((
                    SELECT COUNT(*) FROM tbl_limbo WHERE user_id = ?
                ), 0) AS limbo_count
            `;
            const [result] = await db.promise().query(query, [
                userId, userId,
                userId, userId,
                userId, userId
            ]);

            const data = result[0] || {};
            return {
                total_played_amount:
                    parseFloat(data.bet_sum) +
                    parseFloat(data.coin_bet_sum) +
                    parseFloat(data.limbo_sum),

                total_played_count:
                    parseInt(data.bet_count) +
                    parseInt(data.coin_bet_count) +
                    parseInt(data.limbo_count),
            };
        } catch (error) {
            throw new Error('Error fetching total played stats');
        }
    }

    static async fetchProfitAmount(userId) {
        try {
            const query = `SELECT SUM(credit_amount) AS total_earnings FROM tbl_transaction_history WHERE user_id = ? AND t_status = 'Win'`;
            const [result] = await db.promise().query(query, [userId]);
            return result[0]?.total_earnings || 0; // Default to 0 if no earnings found
        } catch (error) {
            throw new Error('Error fetching profit amount');
        }
    }

    static async fetchTotalBetsWin(userId) {
        try {
            const query = `SELECT COUNT(*) AS total_wins FROM tbl_transaction_history WHERE user_id = ? AND t_status = 'Win'`;
            const [result] = await db.promise().query(query, [userId]);
            return result[0]?.total_wins || 0; // Default to 0 if no earnings found
        } catch (error) {
            throw new Error('Error fetching total deposit');
        }
    }

    static async getWalletHistoryForLastNDays(userId) {
        try {
            const query = `
                SELECT DATE(t.transaction_date) AS date, 
                        t.transaction_date, 
                        t.total_amount
                FROM tbl_transaction_history t
                JOIN (
                    SELECT DATE(transaction_date) AS txn_date,
                            MAX(transaction_date) AS max_date,
                            MAX(trans_id) AS max_trans_id
                    FROM tbl_transaction_history
                    WHERE user_id = ?
                    GROUP BY DATE(transaction_date)
                    ORDER BY txn_date DESC
                    LIMIT 10
                ) latest_per_day
                    ON DATE(t.transaction_date) = latest_per_day.txn_date
                    AND t.transaction_date = latest_per_day.max_date
                    AND t.trans_id = latest_per_day.max_trans_id
                WHERE t.user_id = ?
                ORDER BY t.transaction_date ASC;
            `;

            const [rows] = await db.promise().query(query, [userId, userId]);

            return rows.map(row => ({
                balance: parseFloat(row.total_amount)
            }));
        } catch (error) {
            throw new Error('Failed to fetch latest wallet history by date.');
        }
    }

    static async fetchWinLossCounts(userId) {
        try {
            const query = `
                SELECT
                    SUM(CASE WHEN b.team_id = w.team_id THEN 1 ELSE 0 END) AS total_win,
                    SUM(CASE WHEN b.team_id != w.team_id THEN 1 ELSE 0 END) AS total_loss
                FROM
                    tbl_bet b
                INNER JOIN
                    tbl_winner w ON b.match_id = w.match_id
                WHERE
                    b.user_id = ?
                    AND b.status = 1
                    AND DATE(w.win_date) >= CURDATE() - INTERVAL 9 DAY
            `;
            const [rows] = await db.promise().query(query, [userId]);
            return rows[0] || { total_win: 0, total_loss: 0 };
        } catch (error) {
            throw new Error("Error fetching win/loss counts");
        }
    }
}

module.exports = DashboardModel;