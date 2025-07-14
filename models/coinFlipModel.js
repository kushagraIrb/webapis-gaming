const db = require('../config/database');
const moment = require('moment');

class CoinFlipModel {
    static async fetchCurrentMatch() {
        const query = `
            SELECT * 
            FROM tbl_upcoming_match_coinflip 
            WHERE 
                status = 1 
                AND final_result = ''
                AND cancel = 1 
                AND isLive = 1 
            LIMIT 1
        `;
    
        try {
            const [rows] = await db.promise().query(query);
            return rows[0] || null;
        } catch (error) {
            console.error('Error in fetching current coin flip match query:', error.message);
            throw new Error('Failed to fetch current coin flip match.');
        }
    }

    static async fetchMinBetAmount() {
        const query = `
            SELECT bet_amount 
            FROM tbl_bet_amount 
            ORDER BY id DESC 
            LIMIT 1
        `;
    
        try {
            const [rows] = await db.promise().query(query);
            return rows[0]?.bet_amount || null;
        } catch (error) {
            console.error('Error in fetching min bet amount:', error.message);
            throw new Error('Failed to fetch min bet amount.');
        }
    }

    static async fetchPastResults(copyof) {
        const query = `
            SELECT final_result, created
            FROM tbl_upcoming_match_coinflip 
            WHERE (copyof = ? OR id = ?) 
            AND status = 2 
            ORDER BY id DESC 
            LIMIT 20
        `;

        try {
            const [rows] = await db.promise().query(query, [copyof, copyof]);
            return rows;
        } catch (error) {
            console.error('Error fetching past results:', error.message);
            throw new Error('Failed to fetch past results.');
        }
    }
    
    static async fetchUserPastResults(user_id) {
        const query = `
            SELECT bet_amount, win_amount, inserted_date
            FROM tbl_coin_report
            WHERE status = 1 AND user_id = ?
            ORDER BY inserted_date DESC
            LIMIT 10
        `;
    
        try {
            const [rows] = await db.promise().query(query, [user_id]);
            return rows;
        } catch (error) {
            console.error('Error fetching user past results:', error.message);
            throw new Error('Failed to fetch user past results.');
        }
    }

    static async fetchUserBetHistory(user_id) {
        const query = `
            SELECT 
                b.amount, 
                b.prediction, 
                b.match_id, 
                m.final_result
            FROM tbl_coin_bet b
            JOIN tbl_upcoming_match_coinflip m ON b.match_id = m.id
            WHERE b.user_id = ?
            ORDER BY b.bet_date DESC
            LIMIT 5
        `;

        try {
            const [rows] = await db.promise().query(query, [user_id]);
            return rows;
        } catch (error) {
            console.error('Error fetching user bet history:', error.message);
            throw new Error('Failed to fetch user bet history.');
        }
    }

    static async getBettingStatus() {
        // const query = `SELECT on_off_value FROM tbl_bet_on_off `;
        const query = `SELECT * FROM tbl_website_on_off WHERE id = 1`;
        const [result] = await db.promise().query(query);
        return result[0]?.status || '1';
        // return result[0]?.on_off_value || '1';
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

    static async checkAlreadyBet(userId, matchId) {
        const query = `
            SELECT COUNT(*) AS total
            FROM tbl_coin_bet
            WHERE user_id = ? AND match_id = ? AND status = 1
        `;
    
        try {
            const [rows] = await db.promise().query(query, [userId, matchId]);
            return rows[0]?.total > 0; // returns true if bet exists
        } catch (error) {
            console.error('Error in checkAlreadyBet query:', error.message);
            throw new Error('Failed to check if user already placed bet.');
        }
    }

    // static async getMatchTime(userId, matchId) {
    //     try {
    //       const query = `
    //         SELECT 
    //           (SELECT bet_date FROM tbl_coin_bet WHERE user_id = ? ORDER BY bet_id DESC LIMIT 1) AS bet_date,
    //           match_date,
    //           match_time
    //         FROM tbl_upcoming_match_coinflip
    //         WHERE id = ?
    //       `;
    //       const [result] = await db.promise().query(query, [userId, matchId]);
    //       return result || null;
    //     } catch (error) {
    //       throw new Error(`Error retrieving match details: ${error.message}`);
    //     }
    // }

    static async getMatchTime(userId, matchId) {
        try {
            const query = `SELECT match_date, match_time FROM tbl_upcoming_match_coinflip WHERE id = ?`;
            const [result] = await db.promise().query(query, [matchId]);
            return result || null;
        } catch (error) {
            throw new Error(`Error retrieving match details: ${error.message}`);
        }
    }


    // Place a bet and insert the bet data into the tbl_bet table
    static async saveCoinBet(betData) {
        try {
            // Get the current time in IST
            const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

            const query = `INSERT INTO tbl_coin_bet (user_id, match_id, amount, bonus_amount, wallet_amount, prediction, bet_date) VALUES (?, ?, ?, ?, ?, ?, ?)`;
            const [result] = await db.promise().query(query, [
                betData.user_id,
                betData.match_id,
                betData.amount,
                betData.bonusAmount,
                betData.walletAmount,
                betData.prediction,
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
            const query = `SELECT * FROM tbl_coin_bet WHERE user_id = ? AND bet_id = ?`;
            const [result] = await db.promise().query(query, [queryParams.user_id, queryParams.bet_id]);
            return result[0] || null;
        } catch (error) {
            console.error('Error fetching bet by ID and user:', error);
            throw new Error('Error fetching bet');
        }
    }

    static async fetchThresholdAmount() {
        const query = `SELECT threshold_amount FROM tbl_betting_mail ORDER BY id DESC LIMIT 1`;
        const [rows] = await db.promise().query(query);
        return rows.length > 0 ? rows[0].threshold_amount : null;
    }
    
    static async fetchUserDetails(user_id) {
        const query = `SELECT first_name, last_name, phone FROM tbl_registration WHERE id = ?`;
        const [rows] = await db.promise().query(query, [user_id]);
        return rows.length > 0 ? rows[0] : null;
    }

    // Insert Report Data
    static async insertReportData(reportData) {
        try {
            // Get the current time in IST
            const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

            const query = `INSERT INTO tbl_coin_report (bet_id, user_id, bet_amount, bet_from_bonus, bet_from_wallet, inserted_date)VALUES (?, ?, ?, ?, ?, ?)`;
            const [result] = await db.promise().query(query, 
                [
                    reportData.bet_id, 
                    reportData.user_id,
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
    // static async insertBonusData(bonusHistoryData) {
    //     try {
    //         // Get the current time in IST
    //         const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

    //         const query = `INSERT INTO tbl_bonus_history (user_id, bet_id, match_id, bonusID, debit_bonus, total_bonus, bonus_type, bonus_status, created_date)VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`;
    //         const [result] = await db.promise().query(query, [bonusHistoryData.user_id, bonusHistoryData.bet_id, bonusHistoryData.match_id, bonusHistoryData.debit_bonus, bonusHistoryData.total_bonus, bonusHistoryData.bonus_type, bonusHistoryData.bonus_status, istTime]);
    //         return { bonusId: result.insertId };
    //     } catch (error) {
    //         console.error('Error inserting bonus data:', error);
    //         throw new Error('Error inserting bonus data');
    //     }
    // }

    static async insertBonusData(bonusHistoryData) {
        try {
          const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
      
          let query, values;
      
          if (bonusHistoryData.fromElse) {
            query = `
              INSERT INTO tbl_bonus_history 
              (user_id, bet_id, match_id, coin_match_id, bonusID, debit_bonus, total_bonus, bonus_type, bonus_status, created_date)
              VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
            `;
            values = [
              bonusHistoryData.user_id,
              bonusHistoryData.bet_id,
              bonusHistoryData.match_id,
              bonusHistoryData.match_id,
              bonusHistoryData.debit_bonus,
              bonusHistoryData.total_bonus,
              bonusHistoryData.bonus_type,
              bonusHistoryData.bonus_status,
              istTime
            ];
          } else {
            query = `
              INSERT INTO tbl_bonus_history 
              (user_id, bet_id, match_id, bonusID, debit_bonus, total_bonus, bonus_type, bonus_status, created_date)
              VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)
            `;
            values = [
              bonusHistoryData.user_id,
              bonusHistoryData.bet_id,
              bonusHistoryData.match_id,
              bonusHistoryData.debit_bonus,
              bonusHistoryData.total_bonus,
              bonusHistoryData.bonus_type,
              bonusHistoryData.bonus_status,
              istTime
            ];
          }
      
          const [result] = await db.promise().query(query, values);
          return { bonusId: result.insertId };
      
        } catch (error) {
          console.error('Error inserting bonus data:', error);
          throw new Error('Error inserting bonus data');
        }
    }      

    // Create a transaction record in the tbl_transaction_history
    static async createTransaction(walletHistory) {
        try {
            // Get the current time in IST
            const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");

            const query = `INSERT INTO tbl_transaction_history (d_w_id, bet_id, match_id, withdrawal_id, win_id, user_id, coin_match_id, debit_amount, total_amount, type, t_status, transaction_date, current_bonus_league_id) VALUES (0, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)`;
            const [result] = await db.promise().query(query, [
                walletHistory.bet_id, 
                walletHistory.match_id,
                walletHistory.user_id, 
                walletHistory.match_id,
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

    static async getEligibleMatch() {
        try {
            const istTime = moment().tz("Asia/Kolkata");
            const currentDate = istTime.format("YYYY-MM-DD");
            const currentTime = istTime.format("HH:mm:ss");
    
            const query = `
              SELECT * FROM tbl_upcoming_match_coinflip
              WHERE status = 1
              AND match_date = ?
              AND match_time <= ?
              ORDER BY id DESC
              LIMIT 1
            `;
    
            const [rows] = await db.promise().query(query, [currentDate, currentTime]);
            return rows.length ? rows[0] : null;
    
        } catch (error) {
            console.error("Error in getEligibleMatch:", error.message);
            throw error;
        }
    }
    
    static async updateMatchResult(matchId, result) {
        try {
            const query = `
              UPDATE tbl_upcoming_match_coinflip
              SET status = 2, final_result = ?
              WHERE id = ?
            `;
            const [resultSet] = await db.promise().query(query, [result, matchId]);
            return resultSet.affectedRows > 0;
        } catch (error) {
            console.error("Error in updateMatchResult:", error.message);
            throw error;
        }
    }
    
    static async getWinningUsers(matchId, result) {
        try {
            const query = `
              SELECT user_id, amount, bet_id, prediction
              FROM tbl_coin_bet
              WHERE match_id = ? AND status = 1 AND prediction = ?
            `;
            const [rows] = await db.promise().query(query, [matchId, result]);
            return rows;
        } catch (error) {
            console.error("Error in getWinningUsers:", error.message);
            throw error;
        }
    }    
    
    static async insertCoinWinner(data) {
        try {
            const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
            const query = `
              INSERT INTO tbl_coin_winner (win_ratio, match_id, team_id, userBy, win_date)
              VALUES (?, ?, 0, ?, ?)
            `;
            const [result] = await db.promise().query(query, [
                data.win_ratio,
                data.match_id,
                data.userBy,
                istTime
            ]);
            return result.insertId;
        } catch (error) {
            console.error("Error in insertCoinWinner:", error.message);
            throw error;
        }
    }
    
    static async insertTransaction(data) {
        try {
            const istTime = moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss");
            const query = `
              INSERT INTO tbl_transaction_history 
              (match_id, coin_match_id, win_id, user_id, credit_amount, total_amount, type, t_status, transaction_date)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            await db.promise().query(query, [
                data.match_id,
                data.coin_match_id,
                data.win_id,
                data.user_id,
                data.credit_amount,
                data.total_amount,
                data.type,
                data.t_status,
                istTime
            ]);
        } catch (error) {
            console.error("Error in insertTransaction:", error.message);
            throw error;
        }
    }
    
    static async updateCoinReport(betId, winAmount) {
        try {
            const query = `
              UPDATE tbl_coin_report
              SET win_amount = ?
              WHERE bet_id = ?
            `;
            await db.promise().query(query, [winAmount, betId]);
        } catch (error) {
            console.error("Error in updateCoinReport:", error.message);
            throw error;
        }
    }

    // Fetch repeatable matches
    static async getRepeatableMatches() {
        try {
            const query = `SELECT * FROM tbl_upcoming_match_coinflip WHERE \`repeat\` > 0 AND copyof = 0`;
            const [rows] = await db.promise().query(query);
            return rows;
        } catch (error) {
            console.error("Error in getRepeatableMatches:", error.message);
            throw error;
        }
    }
    
    // Fetch the last copy of a match by ID
    static async getLastCopyOfMatch(copyofId) {
        try {
            const query = `
                SELECT * FROM tbl_upcoming_match_coinflip 
                WHERE copyof = ? 
                ORDER BY id DESC 
                LIMIT 1
            `;
            const [rows] = await db.promise().query(query, [copyofId]);
            return rows[0];
        } catch (error) {
            console.error("Error in getLastCopyOfMatch:", error.message);
            throw error;
        }
    }
    
    // Create a new game from the repeatable match data
    static async createNewGame(newGameData) {
        try {
            // Get the current time in IST timezone
            const istTime = moment().tz("Asia/Kolkata");

            // Add 30 seconds to the current time
            const futureTime = istTime.clone().add(30, 'seconds');

            // Extract updated date and time
            const matchDate = futureTime.format("YYYY-MM-DD");
            const matchTime = futureTime.format("HH:mm:ss");

            // const matchDate = istTime.format("YYYY-MM-DD");
            // const matchTime = istTime.add(newGameData.repeat, 'seconds').format("HH:mm:ss");

            const query = `
                INSERT INTO tbl_upcoming_match_coinflip 
                (match_name, match_date, match_time, isHomePage, match_title, match_sub_title, 
                match_address, win_ratio, status, isLive, cancel, result, final_result, \`repeat\`, 
                userBy, modified, archive, copyof, created)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            await db.promise().query(query, [
                newGameData.match_name,
                matchDate,
                matchTime,
                newGameData.isHomePage,
                newGameData.match_title,
                newGameData.match_sub_title,
                newGameData.match_address,
                newGameData.win_ratio,
                newGameData.status,
                newGameData.isLive,
                newGameData.cancel,
                newGameData.result,
                newGameData.final_result,
                newGameData.repeat,
                newGameData.userBy,
                newGameData.modified,
                newGameData.archive,
                newGameData.copyof,
                istTime.format("YYYY-MM-DD HH:mm:ss")
            ]);
        } catch (error) {
            console.error("Error in createNewGame:", error.message);
            throw error;
        }
    }
}

module.exports = CoinFlipModel;