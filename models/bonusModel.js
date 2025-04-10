const db = require('../config/database');
const moment = require('moment-timezone');

class BetModel {
    // Fetch total bonus count
    static async getBonusCount(userId) {
        try {
            const query = `SELECT COUNT(*) as total_count FROM tbl_trans_bonus_his WHERE user_id = ?`;
            const [rows] = await db.promise().query(query, [userId]);
            return rows[0];
        } catch (error) {
            console.error('Error fetching bonus count:', error.message);
            throw new Error('Database query failed');
        }
    }

    // Fetch bonus list with pagination
    static async getBonusList(userId, start, perPage) {
        try {
            const query = `SELECT tb.match_id, tb.credit_bonus, tb.debit_bonus, tb.created_at, tb.t_status, um.match_title FROM tbl_trans_bonus_his tb LEFT JOIN tbl_upcoming_match um ON um.id = tb.match_id WHERE tb.user_id = ? ORDER BY tb.id DESC LIMIT ?, ?`;
            const [rows] = await db.promise().query(query, [userId, start, perPage]);
            return rows;
        } catch (error) {
            console.error('Error fetching bonus list:', error.message);
            throw new Error('Database query failed');
        }
    }

    // Fetch bonus league
    static async getBonusLeague(userId) {
        try {
            const query = `
                SELECT 
                    bl1.league_name AS current_league, 
                    bl2.league_name AS next_league, 
                    bl3.league_name AS previous_league
                FROM tbl_registration AS r
                JOIN tbl_bonus_league AS bl1 ON r.bonus_league_id = bl1.id
                LEFT JOIN tbl_bonus_league AS bl2 ON bl1.id + 1 = bl2.id
                LEFT JOIN tbl_bonus_league AS bl3 ON bl1.id - 1 = bl3.id
                WHERE r.id = ?;
            `;
            const [rows] = await db.promise().query(query, [userId]);
            return rows.length ? rows[0] : null;
        } catch (error) {
            console.error('Error fetching bonus list:', error.message);
            throw new Error('Database query failed');
        }
    }

    // Fetch current progress
    static async getCurrentProgress(userId) {
        try {
            // Query to fetch total deposit and total bet
            const progressQuery = `
                SELECT 
                    (SELECT COALESCE(SUM(deposit_amount_step1), 0) 
                    FROM tbl_deposit_list 
                    WHERE user_id = ? AND verified = 1 AND fake_deposit = 0) AS totalDeposit,
                    
                    (SELECT COALESCE(SUM(amount), 0) 
                    FROM tbl_bet 
                    WHERE user_id = ? 
                    AND status = 1 
                    AND match_id IN (SELECT match_id FROM tbl_winner)) AS totalBet;
            `;
    
            const [progressRows] = await db.promise().query(progressQuery, [userId, userId]);
            const totalDeposit = progressRows[0]?.totalDeposit || 0;
            const totalBet = progressRows[0]?.totalBet || 0;
    
            // Fetch match_id and team_id from tbl_bet for the given userId
            const betQuery = `SELECT match_id, team_id FROM tbl_bet WHERE user_id = ?`;
            const [betRows] = await db.promise().query(betQuery, [userId]);

            if (betRows.length === 0) {
                return { totalDeposit, totalBet, winCount: 0 };
            }

            // Extract match_id and team_id pairs
            const matchTeamPairs = betRows.map(row => `(${row.match_id}, ${row.team_id})`).join(',');

            // If no valid bets, return zero winCount
            if (!matchTeamPairs) {
                return { totalDeposit, totalBet, winCount: 0 };
            }

            // Query to count number of wins based on match_id and team_id
            const winCountQuery = `SELECT COUNT(*) AS winCount FROM tbl_winner WHERE (match_id, team_id) IN (${matchTeamPairs});`;

            const [winCountRows] = await db.promise().query(winCountQuery);
            const winCount = winCountRows.length ? winCountRows[0].winCount : 0;
    
            // Query to calculate weekly bet amount
            const weeklyBetQuery = `
                SELECT COALESCE(SUM(amount), 0) AS weekly_bet_amount 
                FROM tbl_bet 
                WHERE user_id = ? 
                AND status = 1 
                AND consider_for_bonus = 1 
                AND match_id IN (SELECT match_id FROM tbl_winner) 
                AND YEARWEEK(bet_date, 1) = YEARWEEK(NOW(), 1);
            `;
    
            const [weeklyBetRows] = await db.promise().query(weeklyBetQuery, [userId]);
            const weeklyBetAmount = weeklyBetRows[0]?.weekly_bet_amount || 0;
    
            // Fetch bonus_league_id from tbl_registration
            const bonusLeagueQuery = `SELECT bonus_league_id FROM tbl_registration WHERE id = ?`;
            const [bonusLeagueRows] = await db.promise().query(bonusLeagueQuery, [userId]);
            const bonusLeagueId = bonusLeagueRows.length ? bonusLeagueRows[0].bonus_league_id : null;
    
            let reward = 0, totalBetPerWeek = 0;
            if (bonusLeagueId) {
                // Fetch max_bonus_per_week and total_bet_per_week from tbl_bonus_league
                const bonusDetailsQuery = `
                    SELECT max_bonus_per_week AS reward, total_bet_per_week 
                    FROM tbl_bonus_league 
                    WHERE id = ?;
                `;
                const [bonusDetailsRows] = await db.promise().query(bonusDetailsQuery, [bonusLeagueId]);
    
                if (bonusDetailsRows.length) {
                    reward = bonusDetailsRows[0].reward || 0;
                    totalBetPerWeek = bonusDetailsRows[0].total_bet_per_week || 0;
                }
            }
    
            return { totalDeposit, totalBet, winCount, weeklyBetAmount, reward, totalBetPerWeek };
        } catch (error) {
            console.error('Error fetching current progress:', error.message);
            throw new Error('Database query failed');
        }
    }
    
    // Fetch remaining progress
    static async getRemainingProgress(userId, totalDeposit, totalBet) {
        try {
            // Fetch bonus_league_id, deposit_amount, and bet_amount in a single query using JOIN
            const query = `SELECT bl.deposit_amount, bl.bet_amount FROM tbl_bonus_league bl JOIN tbl_registration r ON r.bonus_league_id = bl.id WHERE r.id = ?`;
            
            const [result] = await db.promise().query(query, [userId]);
    
            if (!result.length) {
                return { deposit_amount: 0, bet_amount: 0, remainingDeposit: 0, remainingBet: 0, bonusLeagueId: null };
            }
    
            const { deposit_amount, bet_amount } = result[0];
    
            // Calculate remaining deposit and bet amounts
            return {
                deposit_amount: deposit_amount,
                bet_amount: bet_amount,
                remainingDeposit: Math.max(deposit_amount - totalDeposit, 0),
                remainingBet: Math.max(bet_amount - totalBet, 0)
            };
        } catch (error) {
            console.error('Error fetching remaining progress:', error.message);
            throw new Error('Database query failed');
        }
    }

    static async fetchAvailableBonus(userId) {
        try {
            const query = `SELECT COALESCE(total_bonus, 0) AS total_bonus FROM tbl_trans_bonus_his WHERE user_id = ? ORDER BY id DESC LIMIT 1`;
            const [rows] = await db.promise().query(query, [userId]);
            return rows.length ? parseFloat(rows[0].total_bonus) : 0;
        } catch (error) {
            console.error('Error fetching available bonus:', error.message);
            throw new Error('Database query failed');
        }
    }
    
    static async insertBonusTransaction(userId, bonusAmount, walletAmount) {
        try {
            // Get the current time in IST
            const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

            const query = `INSERT INTO tbl_transaction_history (user_id, credit_amount, total_amount, type, t_status, transaction_date) VALUES (?, ?, ?, 'Credit', 'Claim Bonus', ?)`;
            const [result] = await db.promise().query(query, [userId, bonusAmount, walletAmount + bonusAmount, istTime]);
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error inserting bonus transaction:', error.message);
            throw new Error('Database insertion failed');
        }
    }
    
    static async updateBonusBalance(userId, bonusAmount, lastTotalBonus) {
        try {
            // Get the current time in IST
            const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

            const newTotalBonus = Math.max(lastTotalBonus - bonusAmount, 0);
            const queryInsert = `
                INSERT INTO tbl_trans_bonus_his (user_id, debit_bonus, total_bonus, type, t_status, created_at) 
                VALUES (?, ?, ?, 'Debit', 'Withdrawal', ?)
            `;
            const [result] = await db.promise().query(queryInsert, [userId, bonusAmount, newTotalBonus, istTime]);
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Error updating bonus balance:', error.message);
            throw new Error('Database update failed');
        }
    }
}

module.exports = BetModel;