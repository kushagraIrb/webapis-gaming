const db = require('../config/database');

class winListModel {
    static async countTodayMatches() {
        const query = `SELECT COUNT(*) AS total_count FROM tbl_upcoming_match WHERE match_date = CURDATE()`;
        
        try {
            const [result] = await db.promise().query(query);
            return result[0].total_count;
        } catch (error) {
            console.error("Error counting today's matches:", error);
            throw error;
        }
    }    

    static async getUpcomingMatch(start, perPage) {
        let query = `
            SELECT 
                m.id, 
                m.encrypted_id, 
                m.match_date, 
                m.match_time, 
                m.status, 
                m.cancel,
                t1.id AS team_one_id, 
                t1.team_name AS team_one_name, 
                t1.team_logo AS team_one_logo, 
                t2.id AS team_two_id, 
                t2.team_name AS team_two_name, 
                t2.team_logo AS team_two_logo,
                w.wid AS winning_id, 
                w.team_id AS winning_team_id
            FROM tbl_upcoming_match AS m
            LEFT JOIN tbl_team AS t1 ON m.team_one_name = t1.id
            LEFT JOIN tbl_team AS t2 ON m.team_two_name = t2.id
            LEFT JOIN tbl_winner AS w ON m.id = w.match_id
            WHERE m.status = 1
            AND (
                m.match_date >= CURDATE()
                AND (
                    m.match_date > CURDATE()
                    OR (m.match_date = CURDATE() AND m.match_time > CURTIME())
                )
            )
            ORDER BY m.match_date ASC, m.match_time ASC
            LIMIT ? OFFSET ?;
        `;
        
        try {
            const [rows] = await db.promise().query(query, [perPage, start]);
            
            // Convert match_time from string to array
            return rows.map(row => ({
                ...row,
                match_time: row.match_time ? JSON.parse(row.match_time) : []
            }));
        } catch (error) {
            console.error("Error fetching upcoming matches:", error, query);
            throw error;
        }
    }
}

module.exports = winListModel;