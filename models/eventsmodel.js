const db = require('../config/database');

class eventsModel {
    static async eventsList(start = null, perPage = null) {
        try {
            let query = `SELECT * FROM tbl_events WHERE status = 1`;
            const params = [];

            // Add pagination logic if start and perPage are provided
            if (start !== null && perPage !== null) {
                query += ` LIMIT ?, ?`;
                params.push(start, perPage);
            }

            const [results] = await db.promise().query(query, params);
            return results;
        } catch (error) {
            console.error('Error fetching events from database:', error.message);
            throw new Error('Database query failed');
        }
    }

    // Get the total count of events
    static async getEventsCount() {
        try {
            const query = `SELECT COUNT(*) AS total FROM tbl_events WHERE status = 1`;
            const [[result]] = await db.promise().query(query);
            return result.total;
        } catch (error) {
            console.error('Error fetching event count:', error.message);
            throw new Error('Database query failed');
        }
    }

    static async eventsDetails(id) {
        try {
            const query = `SELECT * FROM tbl_events WHERE id = ? AND status = 1`;
            const [results] = await db.promise().query(query, [id]);
    
            // Return the first result if found, or null if not found
            return results.length > 0 ? results[0] : null;
        } catch (error) {
            console.error('Error fetching event details from database:', error.message);
            throw new Error('Database query failed');
        }
    }    
}

module.exports = eventsModel;