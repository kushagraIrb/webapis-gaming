const db = require('../config/database');
const moment = require('moment');

class LiveBetModel {
    static async fetchHomeLiveMatches() {
        const query = `
            SELECT 
                m.id, m.encrypted_id, 
                m.team_one_name AS team_one_id, t1.team_name AS team_one_name, t1.team_logo AS team_one_logo, 
                m.team_two_name AS team_two_id, t2.team_name AS team_two_name, t2.team_logo AS team_two_logo, 
                m.match_name, m.match_date, m.match_time, 
                m.match_title, m.match_address, m.win_ratio, 
                m.max_bet, m.userBy, m.modified, m.isLive, m.status, m.isHomePage
            FROM tbl_upcoming_match AS m
            LEFT JOIN tbl_team AS t1 ON m.team_one_name = t1.id
            LEFT JOIN tbl_team AS t2 ON m.team_two_name = t2.id
            WHERE 
                m.status = 1 
                AND m.cancel = 1 
                AND m.isLive = 1
                AND m.id NOT IN (SELECT match_id FROM tbl_winner)
            ORDER BY m.id ASC;`;

        try {
            const [rows] = await db.promise().query(query);
            return rows;
        } catch (error) {
            console.error('Error fetching live matches:', error.message);
            throw new Error('Failed to fetch live matches');
        }
    }

    static async fetchUserPincode(userId) {
        const query = `
            SELECT pincode 
            FROM tbl_registration 
            WHERE id = ?
        `;
        const [result] = await db.promise().query(query, [userId]);
        return result[0];
    }
    
    static async fetchLiveMatches() {
        const query = `
            SELECT 
                m.id, m.encrypted_id,
                m.team_one_name AS team_one_id,
                t1.team_name AS team_one_name,
                t1.team_logo AS team_one_logo,
                m.team_two_name AS team_two_id,
                t2.team_name AS team_two_name,
                t2.team_logo AS team_two_logo,
                m.match_name, m.match_date, m.match_time, m.match_title, m.match_address, 
                m.win_ratio, m.max_bet, m.userBy, m.modified, m.isLive, m.status
            FROM tbl_upcoming_match AS m
            LEFT JOIN tbl_team AS t1 ON m.team_one_name = t1.id
            LEFT JOIN tbl_team AS t2 ON m.team_two_name = t2.id
            WHERE 
                m.status = 1 
                AND m.cancel = 1 
                AND m.isLive = 1
                AND m.id NOT IN (SELECT match_id FROM tbl_winner)
                AND (
                    STR_TO_DATE(
                        CONCAT(
                            m.match_date, ' ',
                            JSON_UNQUOTE(
                                JSON_EXTRACT(
                                    m.match_time,
                                    CONCAT('$[', JSON_LENGTH(m.match_time) - 1, ']')
                                )
                            )
                        ),
                        '%Y-%m-%d %H:%i'
                    ) > CONVERT_TZ(NOW(), '+00:00', '+04:30')
                )
            ORDER BY m.match_date ASC, m.match_time ASC;
        `;
    
        const [rows] = await db.promise().query(query);
        return rows;
    }
    
    static async getUserBetIds(userId, matchIds) {
        if (!matchIds.length) {
            return {};
        }
    
        // 🔥 Create placeholders (?, ?, ?, ...)
        const placeholders = matchIds.map(() => '?').join(',');
    
        const query = `
            SELECT match_id, bet_id
            FROM tbl_bet
            WHERE user_id = ?
            AND match_id IN (${placeholders})
            AND status = 1
        `;
    
        try {
            const [rows] = await db.promise().query(query, [userId, ...matchIds]);
    
            // Convert to map
            const map = {};
            for (const row of rows) {
                map[row.match_id] = row.bet_id;
            }
    
            return map;
    
        } catch (error) {
            console.error('Error fetching user bets:', error.message);
            throw new Error('Failed to fetch user bets');
        }
    }

    // static async fetchLiveMatches() {
    //     const query = `
    //         SELECT 
    //             m.id, m.encrypted_id, 
    //             m.team_one_name AS team_one_id, t1.team_name AS team_one_name, t1.team_logo AS team_one_logo, 
    //             m.team_two_name AS team_two_id, t2.team_name AS team_two_name, t2.team_logo AS team_two_logo, 
    //             m.match_name, m.match_date, m.match_time, 
    //             m.match_title, m.match_address, m.win_ratio, 
    //             m.max_bet, m.userBy, m.modified, m.isLive, m.status
    //         FROM tbl_upcoming_match AS m
    //         LEFT JOIN tbl_team AS t1 ON m.team_one_name = t1.id
    //         LEFT JOIN tbl_team AS t2 ON m.team_two_name = t2.id
    //         WHERE 
    //             m.status = 1 
    //             AND m.cancel = 1 
    //             AND m.isLive = 1
    //             AND m.id NOT IN (SELECT match_id FROM tbl_winner)
    //         ORDER BY m.match_date ASC, m.match_time ASC;
    //     `;

    //     try {
    //         const [rows] = await db.promise().query(query);
    //         return rows;
    //     } catch (error) {
    //         console.error('Error fetching live matches:', error.message);
    //         throw new Error('Failed to fetch live matches');
    //     }
    // }
    
    // static async getUserBetIds(userId, matchIds) {
    //     if (!matchIds.length) {
    //         console.log('No upcoming matches found, skipping user bet check.');
    //         return {}; // If no matches, return an empty object
    //     }

    //     const query = `
    //         SELECT match_id, bet_id
    //         FROM tbl_bet
    //         WHERE user_id = ? AND match_id IN (?) AND status = 1
    //     `;

    //     try {
    //         const [rows] = await db.promise().query(query, [userId, matchIds]);

    //         return rows.reduce((acc, bet) => {
    //             acc[bet.match_id] = bet.bet_id;
    //             return acc;
    //         }, {});
    //     } catch (error) {
    //         console.error('Error fetching user bets:', error.message);
    //         throw new Error('Failed to fetch user bets');
    //     }
    // }

    static async updateEncryptedId(id, encryptedId) {
        try {
            const query = `UPDATE tbl_upcoming_match SET encrypted_id = ? WHERE id = ?`;
            await db.promise().query(query, [encryptedId, id]);
        } catch (error) {
            console.error(`Error updating encrypted ID for match ID ${id}:`, error.message);
            throw new Error('Failed to update encrypted ID');
        }
    }

    static async fetchMatchById(encryptedMatchId) {
        const query = `
            SELECT 
                m.id, m.encrypted_id, 
                m.team_one_name AS team_one_id, t1.team_name AS team_one_name, t1.team_logo AS team_one_logo, 
                m.team_two_name AS team_two_id, t2.team_name AS team_two_name, t2.team_logo AS team_two_logo, 
                m.match_name, m.match_date, m.match_time, 
                m.match_title, m.match_address, m.win_ratio, 
                m.max_bet
            FROM tbl_upcoming_match AS m
            LEFT JOIN tbl_team AS t1 ON m.team_one_name = t1.id
            LEFT JOIN tbl_team AS t2 ON m.team_two_name = t2.id
            WHERE m.encrypted_id = ?
            LIMIT 1;
        `;

        try {
            const [rows] = await db.promise().query(query, [encryptedMatchId]);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error fetching match details:', error.message);
            throw new Error('Failed to fetch match details');
        }
    }

    static async fetchMinBetAmount() {
        const query = `
            SELECT bet_amount 
            FROM tbl_bet_amount 
            WHERE status = '1'
        `;
        const [result] = await db.promise().query(query);
        return result[0]?.bet_amount || 0;
    }
    
    static async fetchMatchStats(matchId, teamOneId, teamTwoId) {
        const query = `
            SELECT 
                COUNT(*) AS totalUsers,
    
                SUM(CASE WHEN team_id = ? THEN 1 ELSE 0 END) AS teamOneUsers,
                SUM(CASE WHEN team_id = ? THEN 1 ELSE 0 END) AS teamTwoUsers
    
            FROM tbl_bet
            WHERE match_id = ?
        `;
    
        const [rows] = await db.promise().query(query, [
            teamOneId,
            teamTwoId,
            matchId
        ]);
    
        return rows[0];
    }

    static async fetchUserBet(matchId, userId) {
        const query = `
            SELECT id AS bet_id, processing_flag
            FROM tbl_bet
            WHERE match_id = ? AND user_id = ?
            ORDER BY id DESC
            LIMIT 1
        `;

        const [rows] = await db.promise().query(query, [matchId, userId]);
        return rows.length ? rows[0] : null;
    }
    
    static async fetchTossTypes() {
        const query = `
            SELECT * 
            FROM tbl_toss_type
            ORDER BY coin_type ASC
        `;
        const [result] = await db.promise().query(query);
        return result;
    }

    static async fetchUserBets(userId, encryptedMatchId) {
        const query = `
            SELECT 
                tbl_bet.team_id, tbl_bet.amount, tbl_bet.bet_date, tbl_team.team_name, 
                tbl_upcoming_match.match_date, tbl_upcoming_match.match_time, tbl_upcoming_match.win_ratio
            FROM tbl_bet
            INNER JOIN tbl_team ON tbl_bet.team_id = tbl_team.id
            INNER JOIN tbl_upcoming_match ON tbl_bet.match_id = tbl_upcoming_match.id
            WHERE tbl_bet.user_id = ? AND tbl_bet.match_id = ? AND tbl_bet.status = 1
        `;
        const [result] = await db.promise().query(query, [userId, encryptedMatchId]);
        return result;
    }

    static async fetchUsersInTeam(matchId, teamId) {
        const query = `SELECT COUNT(toss_id) as count FROM tbl_bet WHERE status = '1' AND match_id = ? AND team_id = ?`;
        const [result] = await db.promise().query(query, [matchId, teamId]);
        return result[0].count || 0;
    }

    static async fetchTotalUsersInMatch(matchId) {
        const query = `SELECT COUNT(toss_id) as count FROM tbl_bet WHERE status = '1' AND match_id = ?`;
        const [result] = await db.promise().query(query, [matchId]);
        return result[0].count || 0;
    }

    static async getBettingStatus() {
        const query = `SELECT on_off_value FROM tbl_bet_on_off `;
        const [result] = await db.promise().query(query);
        return result[0]?.on_off_value || '1';
    }

    static async getMatchById(matchId) {
        try {
            const query = `SELECT * FROM tbl_winner WHERE match_id = ?`;
            const [result] = await db.promise().query(query, [matchId]);
            return result || null;
        } catch (error) {
            throw new Error(`Error retrieving match details: ${error.message}`);
        }
    }

    static async hasDisallowedBetsInLastWeek(userId) {
        try {
            const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const query = `SELECT COUNT(*) as count FROM tbl_withdrawal WHERE modified >= ? AND is_bet_allowed = 1 AND user_id = ?`;
            const [rows] = await db.promise().query(query, [oneWeekAgo, userId]);
            return rows[0].count > 0;
        } catch (error) {
            throw new Error(`Error checking disallowed bets: ${error.message}`);
        }
    }

    static async getMatchTime(matchId) {
        try {
            const query = `SELECT match_date,match_time FROM tbl_upcoming_match WHERE id = ?`;
            const [result] = await db.promise().query(query, [matchId]);
            return result || null;
        } catch (error) {
            throw new Error(`Error retrieving match details: ${error.message}`);
        }
    }

    static async getWinnerAnnounced(matchId) {
        try {
            const query = `SELECT match_date,match_time FROM tbl_upcoming_match WHERE id = ?`;
            const [result] = await db.promise().query(query, [matchId]);
            return result || null;
        } catch (error) {
            throw new Error(`Error retrieving match details: ${error.message}`);
        }
    }

    static async getMaxTransactionId(userId) {
        const query = `SELECT MAX(trans_id) AS max_trans_id FROM tbl_transaction_history WHERE user_id = ?`;
        const [result] = await db.promise().query(query, [userId]);
        return result ? result[0].max_trans_id : null;
    }

    static async getWalletAmountByTransactionId(transId) {
        const query = `SELECT total_amount FROM tbl_transaction_history WHERE trans_id = ?`;
        const [result] = await db.promise().query(query, [transId]);
        return result ? result[0].total_amount : 0;
    }

    static async fetchBetAmount(betId) {
        try {
            const query = `SELECT debit_amount FROM tbl_transaction_history WHERE bet_id = ? AND type = 'Debit'`;
            const [result] = await db.promise().query(query, [betId]);

            if (result.length > 0) {
                return result[0].debit_amount;
            } else {
                console.log("No matching bet found");
                return 0;
            }
        } catch (error) {
            console.error("Error fetching bet amount:", error);
            throw new Error('Database query failed');
        }
    }

    static async fetchNumberOfCancelBet(userId, matchId) {
        try {
            const query = `SELECT COUNT(bet_id) AS totalBets FROM tbl_bet WHERE user_id = ? AND match_id = ?`;
            const [result] = await db.promise().query(query, [userId, matchId]);

            return result[0].totalBets || 0;
        } catch (error) {
            console.error("Error fetching number of cancelled bets:", error.message);
            throw new Error("Failed to fetch cancelled bets count");
        }
    }

    static async CalculateBetCancelCharge(debitAmount) {
        try {
            // Fetch cancel_amount from tbl_bet_cancel_charges
            const query = `SELECT cancel_amount FROM tbl_bet_cancel_charges LIMIT 1`;
            const [result] = await db.promise().query(query);

            if (!result.length) {
                throw new Error("No cancel amount found in database.");
            }

            const cancelAmount = result[0].cancel_amount;
            const totalCharge = (cancelAmount / 100) * debitAmount; // Apply percentage formula

            return totalCharge;
        } catch (error) {
            console.error("Error fetching bet cancellation charge:", error.message);
            throw new Error("Failed to fetch cancellation charge.");
        }
    }

    static async insertRefundTransaction(refundData) {
        try {
            // Get the current time in IST
            const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

            // STEP 1: Check if transaction already exists for same user, bet, match with Cancel status
            const checkHistoryQuery = `
                SELECT trans_id 
                FROM tbl_transaction_history
                WHERE bet_id = ?
                AND user_id = ?
                AND match_id = ?
                AND t_status = 'Cancel'
                LIMIT 1
            `;

            const [historyRows] = await db.promise().query(checkHistoryQuery, [
                refundData.bet_id,
                refundData.user_id,
                refundData.match_id
            ]);

            if (historyRows.length > 0) {
                return { success: false, message: "You already cancelled this bet." };
            }

            const query = `
                INSERT INTO tbl_transaction_history 
                (bet_id, match_id, user_id, credit_amount, total_amount, cancel_charge, type, t_status, transaction_date, current_bonus_league_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            const values = [
                refundData.bet_id,
                refundData.match_id,
                refundData.user_id,
                refundData.credit_amount,
                refundData.total_amount,
                refundData.cancel_charge,
                refundData.type,
                refundData.t_status,
                istTime,
                refundData.bonus_league_id
            ];

            const [result] = await db.promise().query(query, values);

            console.log("Wallet refund transaction inserted:", result);
            return result.affectedRows > 0;
        } catch (error) {
            console.error("Error inserting refund transaction:", error);
            throw new Error('Database insertion failed');
        }
    }

    static async updateBetStatus(betId) {
        try {
            // Get the current time in IST
            const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

            const query = `UPDATE tbl_bet SET status = '0', cancel_by = 'By User', cancel_date = ? WHERE bet_id = ?`;
            const [result] = await db.promise().query(query, [istTime, betId]);
            return result.affectedRows > 0;
        } catch (error) {
            console.error("Error canceling bet:", error);
            throw new Error('Database update failed');
        }
    }

    static async getMaxBonusId(userId) {
        const query = `SELECT MAX(bonus_id) AS max_bonus_id FROM tbl_bonus_history WHERE user_id = ?`;
        const [result] = await db.promise().query(query, [userId]);
        return result ? result[0].max_bonus_id : null;
    }

    static async getBonusAmountByBonusId(bonusId) {
        const query = `SELECT total_bonus FROM tbl_bonus_history WHERE bonus_id = ?`;
        const [result] = await db.promise().query(query, [bonusId]);
        return result ? result[0].total_bonus : 0;
    }

    static async getMatchStatus(matchId) {
        const query = `SELECT cancel FROM tbl_upcoming_match WHERE id = ?`;
        const [result] = await db.promise().query(query, [matchId]);
        return result || null;
    }

    static async getBetStatus(userId, bet_id) {
        const query = `SELECT status FROM tbl_bet WHERE user_id = ? AND bet_id = ?`;
        const [result] = await db.promise().query(query, [userId, bet_id]);
        return result || null;
    }

    // static async userHasBetOnMatch(userId, matchId) {
    //     try {
    //       const query = `SELECT 1 FROM tbl_bet WHERE status = 1 AND user_id = ? AND match_id = ?`;
    //       const [result] = await db.promise().query(query, [userId, matchId]);
    //         return result.length > 0;
    //     } catch (error) {
    //       throw new Error('Error checking bet status');
    //     }
    // }

    static async userHasBetOnMatch(userId, matchId, firstMatchTime) {
        try {
            const query = `SELECT 1 FROM tbl_bet WHERE status = 1 AND user_id = ? AND match_id = ? AND bet_date < ?`;
            const [result] = await db.promise().query(query, [userId, matchId, firstMatchTime]);
            return result.length > 0;
        } catch (error) {
            throw new Error('Error checking bet status');
        }
    }

    // Create a transaction record in the tbl_transaction_history
    static async createTransaction(walletHistory) {
        try {
            // Get the current time in IST
            const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

            const query = `INSERT INTO tbl_transaction_history (d_w_id, bet_id, match_id, withdrawal_id, win_id, user_id, coin_match_id, debit_amount, total_amount, type, t_status, transaction_date, current_bonus_league_id) VALUES (0, ?, ?, 0, 0, ?, 0, ?, ?, ?, ?, ?, ?)`;
            const [result] = await db.promise().query(query, [
                walletHistory.bet_id,
                walletHistory.match_id,
                walletHistory.user_id,
                walletHistory.debit_amount,
                walletHistory.total_amount,
                walletHistory.type,
                walletHistory.t_status,
                istTime,
                walletHistory.bonus_league_id
            ]);
            return { transId: result.insertId };
        } catch (error) {
            throw new Error('Error creating transaction: ' + error.message);
        }
    }

    // Place a bet and insert the bet data into the tbl_bet table
    static async placeBet(betData) {
        try {
            // Get the current time in IST
            const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

            const query = `INSERT INTO tbl_bet (user_id, match_id, team_id, toss_id, amount, bonus_amount, wallet_amount, bet_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            const [result] = await db.promise().query(query, [
                betData.user_id,
                betData.match_id,
                betData.team_id,
                betData.toss_id,
                betData.amount,
                betData.bonus_amount,
                betData.wallet_amount,
                istTime
            ]);
            return { betId: result.insertId };  // Return the inserted bet ID along with the bet data
        } catch (error) {
            throw new Error('Error placing bet: ' + error.message);
        }
    }

    // Place a bet and insert the bet data into the tbl_bet table
    static async cancelLiveBet(betData) {
        try {
            // Get the current time in IST
            const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

            const query = `INSERT INTO tbl_bet (user_id, match_id, team_id, toss_id, amount, bonus_amount, wallet_amount, bet_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            const [result] = await db.promise().query(query, [
                betData.user_id,
                betData.match_id,
                betData.team_id,
                betData.toss_id,
                betData.amount,
                betData.bonus_amount,
                betData.wallet_amount,
                istTime
            ]);
            return { betId: result.insertId };  // Return the inserted bet ID along with the bet data
        } catch (error) {
            throw new Error('Error placing bet: ' + error.message);
        }
    }

    // Find one record by user_id and bet_id
    static async findOne(queryParams) {
        try {
            const query = `SELECT * FROM tbl_bet WHERE user_id = ? AND bet_id = ?`;
            const [result] = await db.promise().query(query, [queryParams.user_id, queryParams.bet_id]);
            return result[0] || null;
        } catch (error) {
            console.error('Error fetching bet by ID and user:', error);
            throw new Error('Error fetching bet');
        }
    }

    // Insert Report Data
    static async insertReportData(reportData) {
        try {
            // Get the current time in IST
            const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

            const query = `INSERT INTO tbl_report (bet_id, user_id, match_id, team_id, bet_amount, bet_from_bonus, bet_from_wallet, inserted_date)VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            const [result] = await db.promise().query(query,
                [
                    reportData.bet_id,
                    reportData.user_id,
                    reportData.match_id,
                    reportData.team_id,
                    reportData.bet_amount,
                    reportData.bet_from_bonus,
                    reportData.bet_from_wallet,
                    istTime
                ]);
            return { reportId: result.insertId };
        } catch (error) {
            console.error('Error inserting report data:', error);
            throw new Error('Error inserting report data');
        }
    }

    // Insert Bonus Data
    static async insertBonusData(bonusHistoryData) {
        try {
            // Get the current time in IST
            const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

            const query = `INSERT INTO tbl_bonus_history (user_id, bet_id, match_id, bonusID, debit_bonus, total_bonus, bonus_type, bonus_status, created_date)VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`;
            const [result] = await db.promise().query(query, [bonusHistoryData.user_id, bonusHistoryData.bet_id, bonusHistoryData.match_id, bonusHistoryData.debit_bonus, bonusHistoryData.total_bonus, bonusHistoryData.bonus_type, bonusHistoryData.bonus_status, istTime]);
            return { bonusId: result.insertId };
        } catch (error) {
            console.error('Error inserting bonus data:', error);
            throw new Error('Error inserting bonus data');
        }
    }

    // Find User by ID (for wallet amount)
    static async findUserById(user_id) {
        try {
            const query = `SELECT * FROM tbl_registration WHERE id = ?`;
            const [user] = await db.promise().query(query, [user_id]);
            return user[0];
        } catch (error) {
            console.error('Error fetching user:', error);
            throw new Error('Error fetching user');
        }
    }

    static async fetchExtraTimeLiveMatches() {
        const query = `SELECT id, match_name, match_date, match_time, match_title, win_ratio, max_bet FROM tbl_upcoming_match WHERE status = 1 AND cancel = 1 AND isLive = 1 AND ext_time = 1 ORDER BY match_date ASC, match_time ASC`;

        try {
            const [results] = await db.promise().query(query);
            return results;
        } catch (error) {
            console.error('Error fetching matches:', error.message);
            throw new Error('Failed to fetch matches');
        }
    }
    
    static async getMatchForUpdate(connection, matchId) {
        const [rows] = await connection.query(
            `SELECT match_date, match_time 
             FROM tbl_upcoming_match 
             WHERE id = ? 
             FOR UPDATE`,
            [matchId]
        );
    
        return rows[0];
    }
    
    static async getWalletForUpdate(connection, userId) {
        const [rows] = await connection.query(
            `SELECT total_amount 
             FROM tbl_transaction_history 
             WHERE user_id = ? ORDER BY trans_id DESC LIMIT 1 
             FOR UPDATE`,
            [userId]
        );
    
        return rows.length ? parseFloat(rows[0].total_amount) : 0;
    }
    
    static async getBonusForUpdate(connection, userId) {
        const [rows] = await connection.query(
            `SELECT total_bonus 
             FROM tbl_bonus_history 
             WHERE user_id = ? ORDER BY bonus_id DESC LIMIT 1 
             FOR UPDATE`,
            [userId]
        );
    
        return rows.length ? parseFloat(rows[0].total_bonus) : 0;
    }
    
    static async checkExistingBetForUpdate(connection, userId, matchId) {
        const [rows] = await connection.query(
            `SELECT bet_id 
             FROM tbl_bet 
             WHERE user_id = ? AND match_id = ? AND status = 1
             FOR UPDATE`,
            [userId, matchId]
        );
    
        return rows.length > 0;
    }

    static async getProcessingBet(user_id, match_id) {
        const [rows] = await db.promise().query(
            `SELECT bet_id 
            FROM tbl_bet 
            WHERE user_id = ? 
            AND match_id = ? 
            AND processing_flag = 1
            LIMIT 1`,
            [user_id, match_id]
        );

        return rows[0] || null;
    }
    
    static async insertBet(connection, data) {
        const [result] = await connection.query(
            `INSERT INTO tbl_bet 
            (user_id, match_id, team_id, toss_id, amount, bonus_amount, wallet_amount, bet_date, processing_flag) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
                data.user_id,
                data.match_id,
                data.team_value,
                data.toss_id,
                data.bet_amount,
                data.UsedBonus,
                data.walletUsed,
                data.istTime
            ]
        );
    
        return result.insertId;
    }
    
    static async insertTransaction(connection, data) {
        await connection.query(
            `INSERT INTO tbl_transaction_history (d_w_id, bet_id, match_id, withdrawal_id, win_id, user_id, coin_match_id, debit_amount, total_amount, type, t_status, transaction_date, current_bonus_league_id) VALUES (0, ?, ?, 0, 0, ?, 0, ?, ?, 'Debit', 'Bet', ?, ?)`,
            [
                data.betId,
                data.match_id,
                data.user_id,
                data.walletUsed,
                data.remainingWallet,
                data.istTime,
                data.bonus_league_id
            ]
        );
    }
    
    static async insertBonus(connection, data) {
        await connection.query(
            `INSERT INTO tbl_bonus_history (user_id, bet_id, match_id, bonusID, debit_bonus, total_bonus, bonus_type, bonus_status, created_date)VALUES (?, ?, ?, 0, ?, ?, 'Debit', 'Bet', ?)`,
            [
                data.user_id, 
                data.betId, 
                data.match_id, 
                data.UsedBonus, 
                data.bonusAmount,
                data.istTime
            ]
        );
    }

    // Inserts only if the current total_amount matches what we read under lock
    static async insertTransactionIfSufficient(connection, data) {
        const [result] = await connection.query(
            `INSERT INTO tbl_transaction_history 
            (d_w_id, bet_id, match_id, withdrawal_id, win_id, user_id, coin_match_id,
            debit_amount, total_amount, type, t_status, transaction_date, current_bonus_league_id)
            SELECT 0, ?, ?, 0, 0, ?, 0, ?, ?, 'Debit', 'Bet', ?, 0
            FROM tbl_transaction_history
            WHERE user_id = ?
            AND total_amount = ?
            ORDER BY trans_id DESC
            LIMIT 1`,
            // No FOR UPDATE needed here — row already locked by getBonusForUpdate above
            [
                data.betId,
                data.match_id,
                data.user_id,
                data.walletUsed,
                data.remainingWallet,
                data.istTime,
                data.user_id,
                data.expectedCurrentAmount  // must match exactly
            ]
        );

        if (result.affectedRows === 0) {
            throw new Error('Insufficient wallet balance');
        }
    }

    static async insertBonusIfSufficient(connection, data) {
        const [result] = await connection.query(
            `INSERT INTO tbl_bonus_history
            (user_id, bet_id, match_id, bonusID, debit_bonus, total_bonus, bonus_type, bonus_status, created_date)
            SELECT ?, ?, ?, 0, ?, ?, 'Debit', 'Bet', ?
            FROM tbl_bonus_history
            WHERE user_id = ?
            AND total_bonus = ?
            ORDER BY bonus_id DESC
            LIMIT 1`,
            [
                data.user_id,
                data.betId,
                data.match_id,
                data.UsedBonus,
                data.remainingBonus,
                data.istTime,
                data.user_id,
                data.expectedCurrentBonus
            ]
        );

        if (result.affectedRows === 0) {
            throw new Error('Insufficient bonus balance');
        }
    }
    
    static async insertReport(connection, data) {
        await connection.query(
            `INSERT INTO tbl_report 
            (bet_id, user_id, match_id, team_id, bet_amount, bet_from_bonus, bet_from_wallet, inserted_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.betId,
                data.user_id,
                data.match_id,
                data.team_value,
                data.bet_amount,
                data.UsedBonus,
                data.walletUsed,
                data.istTime
            ]
        );
    }

    static async markBetCompleted(connection, betId) {
        await connection.query(
            `UPDATE tbl_bet 
            SET processing_flag = 0 
            WHERE bet_id = ?`,
            [betId]
        );
    }

    static async markBetFailed(betId) {
        await db.promise().query(
            `UPDATE tbl_bet 
            SET processing_flag = 0 
            WHERE bet_id = ?`,
            [betId]
        );
    }
}

module.exports = LiveBetModel;