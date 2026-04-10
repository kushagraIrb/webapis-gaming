const db = require('../config/database');
const moment = require('moment');

class LimboModel {
    static async getUserByToken(token) {
        try {
            const query = `
                SELECT id 
                FROM tbl_registration 
                WHERE session_token = ?
            `;
            const [[result]] = await db.promise().query(query, [token]);
            return result || null;
        } catch (error) {
            console.error('Error fetching user by token:', error.message);
            throw new Error('User query failed');
        }
    }
    
    static async getUserBets(userId) {
        try {
            const query = `
                SELECT created_at, bet_amount, target_multiplier, payout, bet_multiplier 
                FROM tbl_limbo 
                WHERE user_id = ? 
                ORDER BY id DESC 
                LIMIT 10
            `;
            const [results] = await db.promise().query(query, [userId]);
            return results;
        } catch (error) {
            console.error('Error fetching user bets:', error.message);
            throw new Error('Bets query failed');
        }
    }

    static async getWalletBalance(userId) {
        try {
            const query = `SELECT total_amount FROM tbl_transaction_history WHERE user_id = ? ORDER BY transaction_date DESC LIMIT 1`;
            const [rows] = await db.promise().query(query, [userId]);
            return rows[0] ? parseFloat(rows[0].total_amount) : 0;
        } catch (error) {
            console.error('Error in getWalletBalance:', error);
            return 0;
        }
    }

    static async insertLimbo(data) {
        try {
            const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

            let query = '';
            let values = [];

            if (data.bet_type == 1) {
                query = `
                    INSERT INTO tbl_limbo (target_multiplier, win_chance, bet_amount, profit_on_win, bet_type, user_id, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `;
                values = [
                    data.target_multiplier,
                    data.win_chance,
                    data.bet_amount,
                    data.profit_on_win,
                    data.bet_type,
                    data.user_id,
                    istTime
                ];
            } else if (data.bet_type == 2) {
                query = `
                    INSERT INTO tbl_limbo (target_multiplier, win_chance, bet_amount, number_of_bets, on_wins, on_loss, stop_on_profit, stop_on_loss, bet_type, user_id, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;
                values = [
                    data.target_multiplier,
                    data.win_chance,
                    data.bet_amount,
                    data.number_of_bets,
                    data.on_wins,
                    data.on_loss,
                    data.stop_on_profit,
                    data.stop_on_loss,
                    data.bet_type,
                    data.user_id,
                    istTime
                ];
            }

            const [result] = await db.promise().query(query, values);
            return result.insertId;
        } catch (error) {
            console.error('Error in insertLimbo:', error);
            return null;
        }
    }

    static async getLatestWalletBalance(userId) {
        try {
            const query = `SELECT total_amount FROM tbl_transaction_history WHERE user_id = ? ORDER BY trans_id DESC LIMIT 1`;
            const [rows] = await db.promise().query(query, [userId]);
            return rows[0] ? parseFloat(rows[0].total_amount) : 0;
        } catch (error) {
            console.error('Error in getLatestWalletBalance:', error);
            return 0;
        }
    }

    static async insertTransaction(data) {
        try {
            const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
            const query = `
                INSERT INTO tbl_transaction_history 
                (d_w_id, limbo_id, match_id, withdrawal_id, win_id, user_id, coin_match_id, debit_amount, total_amount, type, t_status, transaction_date) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
    
            const [result] = await db.promise().query(query, [
                data.d_w_id,
                data.limbo_id,
                data.match_id,
                data.withdrawal_id,
                data.win_id,
                data.user_id,
                data.coin_match_id,
                data.bet_amount,
                data.total_amount,
                data.type,
                data.t_status,
                istTime
            ]);
    
            return result.insertId;
        } catch (error) {
            console.error('Error in insertTransaction:', error);
            return null;
        }
    }

    static async getRandomSet(excludedIds = []) {
        try {
            let excludeCondition = '';
            if (excludedIds.length > 0) {
                const placeholders = excludedIds.map(() => '?').join(',');
                excludeCondition = `WHERE id NOT IN (${placeholders})`;
            }

            const query = `
                SELECT id, game_set, count 
                FROM tbl_limbo_set 
                ${excludeCondition}
                ORDER BY RAND() 
                LIMIT 1
            `;

            const [rows] = await db.promise().query(query, excludedIds);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error in getRandomSet:', error);
            return null;
        }
    }

    static async getUsageCount(userId, setId) {
        try {
            const query = `SELECT usage_count FROM tbl_limbo_log WHERE user_id = ? AND limbo_set_id = ?`;
            const [rows] = await db.promise().query(query, [userId, setId]);
            return rows.length > 0 ? rows[0].usage_count : 0;
        } catch (error) {
            console.error('Error in getUsageCount:', error);
            return 0;
        }
    }

    static async updateUsage(userId, setId) {
        try {
            const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
            const query = `
                UPDATE tbl_limbo_log 
                SET usage_count = usage_count + 1, updated_at = ? 
                WHERE user_id = ? AND limbo_set_id = ?
            `;
            const [result] = await db.promise().query(query, [istTime, userId, setId]);
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error in updateUsage:', error);
            return false;
        }
    }

    static async insertUsage(userId, setId) {
        try {
            const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
            const query = `
                INSERT INTO tbl_limbo_log (limbo_set_id, user_id, usage_count, created_at) 
                VALUES (?, ?, 1, ?)
            `;
            const [result] = await db.promise().query(query, [setId, userId, istTime]);
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error in insertUsage:', error);
            return false;
        }
    }

    static async resetUsage(userId) {
        try {
            const query = `UPDATE tbl_limbo_log SET usage_count = 0 WHERE user_id = ?`;
            await db.promise().query(query, [userId]);
        } catch (error) {
            console.error('Error in resetUsage:', error);
        }
    }

    static async updateLimbo(data) {
        try {
            const { id, payout, bet_multiplier } = data;
            const query = `
                UPDATE tbl_limbo 
                SET payout = ?, bet_multiplier = ? 
                WHERE id = ?
            `;
            const [result] = await db.promise().query(query, [payout, bet_multiplier, id]);
            return result.affectedRows > 0;
        } catch (error) {
            console.error("Error in updateLimbo:", error);
            return false;
        }
    }

    static async autoBet(id) {
        try {
            const query = ``;
            const [results] = await db.promise().query(query, [id]);
    
            // Return the first result if found, or null if not found
            return results.length > 0 ? results[0] : null;
        } catch (error) {
            console.error('Error in saving auto bet query:', error.message);
            throw new Error('Database query failed in saving auto bet query');
        }
    }

    // 1️⃣ Get control tracker for a user
    static async getControlTracker(userId) {
        try {
            const query = `SELECT * FROM tbl_limbo_control_tracker WHERE user_id = ?`;
            const [rows] = await db.promise().query(query, [userId]);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error in getControlTracker:', error);
            return null;
        }
    }

    // 2️⃣ Update control tracker fields
    static async updateControlTracker(userId, data) {
        try {
            const setClauses = [];
            const values = [];

            for (const key in data) {
                setClauses.push(`${key} = ?`);
                values.push(data[key]);
            }
            values.push(userId);

            const query = `UPDATE tbl_limbo_control_tracker SET ${setClauses.join(', ')} WHERE user_id = ?`;
            const [result] = await db.promise().query(query, values);
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error in updateControlTracker:', error);
            return false;
        }
    }

    // 3️⃣ Reset control tracker (like CI3 reset after 7 matches)
    static async resetControlTracker(userId) {
        try {
            const query = `
                UPDATE tbl_limbo_control_tracker 
                SET match_counter = 0,
                    total_wins_in_range = 0,
                    is_under_control = 0,
                    controlled_matches = NULL,
                    threshold_reached_at = NULL
                WHERE user_id = ?
            `;
            const [result] = await db.promise().query(query, [userId]);
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error in resetControlTracker:', error);
            return false;
        }
    }

    // 4️⃣ Track win in range (1.01 ≤ target_multiplier ≤ 1.99)
    static async trackWinInRange(userId, profitOnly) {
        try {
            const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

            const query = `
                INSERT INTO tbl_limbo_control_tracker (
                    user_id, total_wins_in_range, threshold_reached_at,
                    is_under_control, match_counter, updated_at
                )
                VALUES (?, ?, ?, 0, 0, ?)
                ON DUPLICATE KEY UPDATE 
                    total_wins_in_range = total_wins_in_range + VALUES(total_wins_in_range),
                    updated_at = VALUES(updated_at),
                    is_under_control = CASE 
                        WHEN total_wins_in_range + VALUES(total_wins_in_range) >= 50000 THEN 1 
                        ELSE is_under_control 
                    END,
                    threshold_reached_at = CASE 
                        WHEN total_wins_in_range + VALUES(total_wins_in_range) >= 50000 
                            AND threshold_reached_at IS NULL 
                        THEN VALUES(threshold_reached_at) 
                        ELSE threshold_reached_at 
                    END
            `;
            const [result] = await db.promise().query(query, [
                userId, 
                profitOnly, 
                istTime, 
                istTime
            ]);
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error in trackWinInRange:', error);
            return false;
        }
    }

    static async limboBetHistory(start = 0, perPage = 5, user_id) {
        try {
            const query = `
                SELECT *
                FROM (
                    SELECT l.id AS limbo_id, l.bet_amount, l.target_multiplier, l.bet_multiplier, l.created_at,
                        CASE 
                            WHEN l.target_multiplier >= l.bet_multiplier THEN 'Loss'
                            ELSE 'Win'
                        END AS status,
                        CASE 
                            WHEN (l.payout - l.bet_amount) >= 0 THEN (l.payout - l.bet_amount)
                            ELSE 0
                        END AS win_amount,
                        COALESCE(t.total_amount, 0) AS wallet_amount
                    FROM tbl_limbo l
                    LEFT JOIN tbl_transaction_history t 
                        ON t.limbo_id = l.id AND t.user_id = l.user_id
                    WHERE l.user_id = ?
                    ORDER BY l.created_at DESC
                    LIMIT 100
                ) AS recent
                ORDER BY recent.created_at DESC
                LIMIT ?, ?;
            `;

            const [results] = await db.promise().query(query, [user_id, start, perPage]);
            return results;
        } catch (error) {
            console.error('Error fetching limbo bet history from database:', error.message);
            throw new Error('Database query failed');
        }
    }

    static async limboBetHistoryCount(user_id) {
        try {
            const query = `SELECT COUNT(*) AS total FROM tbl_limbo WHERE user_id = ?;`;
            const [[result]] = await db.promise().query(query, [user_id]);
            return result.total;
        } catch (error) {
            console.error('Error fetching limbo bet history count:', error.message);
            throw new Error('Database query failed');
        }
    }
}

module.exports = LimboModel;