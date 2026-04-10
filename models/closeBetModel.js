const db = require('../config/database');

class closeBetModel {
    // Fetch all today's matches without LIMIT
    static async getAllTodayMatches() {
        try {
            const query = `
                SELECT m.id, t1.team_name AS team_one_name, t2.team_name AS team_two_name, 
                       m.match_name, m.match_date, m.match_time, m.match_title, m.match_address, 
                       m.win_ratio, m.max_bet, m.userBy, m.modified, m.isLive, m.status
                FROM tbl_upcoming_match AS m
                LEFT JOIN tbl_team AS t1 ON m.team_one_name = t1.id
                LEFT JOIN tbl_team AS t2 ON m.team_two_name = t2.id
                WHERE m.status = 1 
                    AND m.cancel = 1 
                    AND m.isLive = 1 
                    AND m.match_date = CURDATE()
                ORDER BY m.match_time ASC
            `;

            const [results] = await db.promise().query(query);
            return results;
        } catch (error) {
            console.error('Error fetching match data from the database:', error.message);
            throw new Error('Database query failed');
        }
    }
}

module.exports = closeBetModel;
