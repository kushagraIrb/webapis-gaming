const db = require('../config/database');

class BetModel {
    // Fetch total bet count
    static async getBetCount(userId) {
        try {
            const query = `SELECT COUNT(*) as total_count FROM tbl_bet bt LEFT JOIN tbl_upcoming_match mt ON mt.id = bt.match_id LEFT JOIN tbl_team tm ON tm.id = bt.team_id LEFT JOIN tbl_toss_type ts ON ts.tid = bt.toss_id WHERE bt.user_id = ?`;
            const [rows] = await db.promise().query(query, [userId]);
            return rows[0];
        } catch (error) {
            console.error('Error fetching bet count:', error.message);
            throw new Error('Database query failed');
        }
    }

    // Fetch bet list with pagination
    static async getBetList(userId, start, perPage) {
        try {
            const query = `
                SELECT bt.bet_id, bt.match_id, bt.team_id, bt.bet_id, bt.cancel_date, bt.bet_date, bt.amount,
                       bt.cancel_by, bt.status, bt.wallet_amount, bt.bonus_amount,
                       mt.match_name, mt.match_date, mt.match_time, mt.win_ratio, mt.isLive,
                       mt.status as match_status, tm.team_name, ts.coin_type
                FROM tbl_bet bt
                LEFT JOIN tbl_upcoming_match mt ON mt.id = bt.match_id
                LEFT JOIN tbl_team tm ON tm.id = bt.team_id
                LEFT JOIN tbl_toss_type ts ON ts.tid = bt.toss_id
                WHERE bt.user_id = ? ORDER BY bt.bet_id DESC
                LIMIT ?, ?`;
            const [rows] = await db.promise().query(query, [userId, start, perPage]);
            return rows;
        } catch (error) {
            console.error('Error fetching bet list:', error.message);
            throw new Error('Database query failed');
        }
    }

    static async isMatchWinnerAnnounced(matchId) {
        try {
            // Query to check if winners exist for the given match_id
            const query = `SELECT wid FROM tbl_winner WHERE match_id = ?`;
            const [rows] = await db.promise().query(query, [matchId]);
    
            return rows;
        } catch (error) {
            console.error('Error in isMatchWinnerAnnounced model:', error.message);
            throw new Error('Failed to fetch match winner details.');
        }
    }

    static async winnerTeamByMatch(matchId, teamId) {
        try {
            // Query to check the winner team
            const query = `SELECT wid FROM tbl_winner WHERE match_id = ? AND team_id = ?`;
            const [rows] = await db.promise().query(query, [matchId, teamId]);
    
            return rows;
        } catch (error) {
            console.error('Error in isMatchWinnerAnnounced model:', error.message);
            throw new Error('Failed to fetch match winner details.');
        }
    }
}

module.exports = BetModel;